-- ClassLog parent link hardening
-- Applies a stable share-link -> short-lived parent-session exchange layer.
--
-- Assumptions:
-- - Existing RPC cl_get_parent_link(p_token text, p_class_name text) returns json/jsonb
--   with { ok: true, parent_token: "..." } when the teacher may share that class.
-- - Existing RPC cl_get_parent_view(p_parent_token text, p_subject_id text) returns
--   the current parent payload with { ok: true, ... }.

create extension if not exists pgcrypto;

create table if not exists public.cl_parent_links (
    id uuid primary key default gen_random_uuid(),
    class_name text not null,
    link_code_hash text not null unique,
    legacy_parent_token text not null,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    last_used_at timestamptz,
    expires_at timestamptz,
    revoked_at timestamptz
);

create index if not exists cl_parent_links_class_active_idx
    on public.cl_parent_links (class_name, active);

create table if not exists public.cl_parent_sessions (
    id uuid primary key default gen_random_uuid(),
    parent_link_id uuid not null references public.cl_parent_links(id) on delete cascade,
    session_token_hash text not null unique,
    legacy_parent_token text not null,
    created_at timestamptz not null default now(),
    last_used_at timestamptz,
    expires_at timestamptz not null
);

create index if not exists cl_parent_sessions_expires_idx
    on public.cl_parent_sessions (expires_at);

create table if not exists public.cl_parent_access_logs (
    id bigserial primary key,
    parent_link_id uuid references public.cl_parent_links(id) on delete set null,
    event_type text not null,
    ok boolean not null default false,
    reason text,
    created_at timestamptz not null default now()
);

alter table public.cl_parent_links enable row level security;
alter table public.cl_parent_sessions enable row level security;
alter table public.cl_parent_access_logs enable row level security;

revoke all on public.cl_parent_links from anon, authenticated;
revoke all on public.cl_parent_sessions from anon, authenticated;
revoke all on public.cl_parent_access_logs from anon, authenticated;

create or replace function public.cl_token_hash(p_value text)
returns text
language sql
immutable
as $$
    select encode(digest(coalesce(p_value, ''), 'sha256'), 'hex')
$$;

create or replace function public.cl_random_url_token(p_prefix text default 'cl')
returns text
language sql
volatile
as $$
    select p_prefix || '_' ||
        translate(
            rtrim(encode(gen_random_bytes(24), 'base64'), '='),
            '+/',
            '-_'
        )
$$;

create or replace function public.cl_get_parent_link_v2(
    p_token text,
    p_class_name text,
    p_rotate boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_legacy jsonb;
    v_parent_token text;
    v_link_code text;
begin
    if nullif(trim(coalesce(p_token, '')), '') is null then
        return jsonb_build_object('ok', false, 'reason', 'unauthorized');
    end if;

    if nullif(trim(coalesce(p_class_name, '')), '') is null then
        return jsonb_build_object('ok', false, 'reason', 'invalid_class');
    end if;

    v_legacy := public.cl_get_parent_link(p_token, p_class_name)::jsonb;
    if coalesce((v_legacy->>'ok')::boolean, false) is not true then
        return jsonb_build_object('ok', false, 'reason', coalesce(v_legacy->>'reason', 'forbidden'));
    end if;

    v_parent_token := v_legacy->>'parent_token';
    if nullif(v_parent_token, '') is null then
        return jsonb_build_object('ok', false, 'reason', 'missing_parent_token');
    end if;

    if p_rotate then
        update public.cl_parent_links
           set active = false,
               revoked_at = now()
         where class_name = p_class_name
           and active = true;
    end if;

    v_link_code := public.cl_random_url_token('clpl');

    insert into public.cl_parent_links (
        class_name,
        link_code_hash,
        legacy_parent_token,
        active
    )
    values (
        p_class_name,
        public.cl_token_hash(v_link_code),
        v_parent_token,
        true
    );

    return jsonb_build_object(
        'ok', true,
        'link_code', v_link_code,
        'class_name', p_class_name
    );
exception
    when undefined_function then
        return jsonb_build_object('ok', false, 'reason', 'missing_legacy_rpc');
    when others then
        return jsonb_build_object('ok', false, 'reason', 'server_error');
end;
$$;

create or replace function public.cl_parent_exchange_link(
    p_link_code text,
    p_ttl_minutes integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_link public.cl_parent_links%rowtype;
    v_session_token text;
    v_ttl interval;
    v_recent_failures integer;
begin
    if nullif(trim(coalesce(p_link_code, '')), '') is null then
        return jsonb_build_object('ok', false, 'reason', 'missing_link');
    end if;

    select count(*)
      into v_recent_failures
      from public.cl_parent_access_logs
     where event_type = 'exchange'
       and ok = false
       and created_at > now() - interval '10 minutes';

    if v_recent_failures > 100 then
        insert into public.cl_parent_access_logs(event_type, ok, reason)
        values ('exchange', false, 'rate_limited');
        return jsonb_build_object('ok', false, 'reason', 'rate_limited');
    end if;

    select *
      into v_link
      from public.cl_parent_links
     where link_code_hash = public.cl_token_hash(p_link_code)
       and active = true
       and (expires_at is null or expires_at > now())
     limit 1;

    if not found then
        insert into public.cl_parent_access_logs(event_type, ok, reason)
        values ('exchange', false, 'invalid_or_revoked');
        return jsonb_build_object('ok', false, 'reason', 'invalid_or_revoked');
    end if;

    v_ttl := make_interval(mins => greatest(1, least(coalesce(p_ttl_minutes, 10), 60)));
    v_session_token := public.cl_random_url_token('clps');

    insert into public.cl_parent_sessions (
        parent_link_id,
        session_token_hash,
        legacy_parent_token,
        expires_at
    )
    values (
        v_link.id,
        public.cl_token_hash(v_session_token),
        v_link.legacy_parent_token,
        now() + v_ttl
    );

    update public.cl_parent_links
       set last_used_at = now()
     where id = v_link.id;

    insert into public.cl_parent_access_logs(parent_link_id, event_type, ok)
    values (v_link.id, 'exchange', true);

    return jsonb_build_object(
        'ok', true,
        'session_token', v_session_token,
        'expires_at', now() + v_ttl
    );
end;
$$;

create or replace function public.cl_get_parent_view_v2(
    p_session_token text,
    p_subject_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_session public.cl_parent_sessions%rowtype;
    v_payload jsonb;
begin
    if nullif(trim(coalesce(p_session_token, '')), '') is null then
        return jsonb_build_object('ok', false, 'reason', 'missing_session');
    end if;

    select s.*
      into v_session
      from public.cl_parent_sessions s
      join public.cl_parent_links l on l.id = s.parent_link_id
     where s.session_token_hash = public.cl_token_hash(p_session_token)
       and s.expires_at > now()
       and l.active = true
     limit 1;

    if not found then
        return jsonb_build_object('ok', false, 'reason', 'expired_or_invalid_session');
    end if;

    v_payload := public.cl_get_parent_view(v_session.legacy_parent_token, p_subject_id)::jsonb;

    update public.cl_parent_sessions
       set last_used_at = now()
     where id = v_session.id;

    insert into public.cl_parent_access_logs(parent_link_id, event_type, ok, reason)
    values (
        v_session.parent_link_id,
        'view',
        coalesce((v_payload->>'ok')::boolean, false),
        case when coalesce((v_payload->>'ok')::boolean, false) then null else coalesce(v_payload->>'reason', 'view_failed') end
    );

    return v_payload || jsonb_build_object('session_expires_at', v_session.expires_at);
exception
    when undefined_function then
        return jsonb_build_object('ok', false, 'reason', 'missing_legacy_rpc');
    when others then
        return jsonb_build_object('ok', false, 'reason', 'server_error');
end;
$$;

create or replace function public.cl_revoke_parent_links_v2(
    p_token text,
    p_class_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_legacy jsonb;
begin
    if nullif(trim(coalesce(p_token, '')), '') is null then
        return jsonb_build_object('ok', false, 'reason', 'unauthorized');
    end if;

    v_legacy := public.cl_get_parent_link(p_token, p_class_name)::jsonb;
    if coalesce((v_legacy->>'ok')::boolean, false) is not true then
        return jsonb_build_object('ok', false, 'reason', coalesce(v_legacy->>'reason', 'forbidden'));
    end if;

    update public.cl_parent_links
       set active = false,
           revoked_at = now()
     where class_name = p_class_name
       and active = true;

    return jsonb_build_object('ok', true);
exception
    when undefined_function then
        return jsonb_build_object('ok', false, 'reason', 'missing_legacy_rpc');
    when others then
        return jsonb_build_object('ok', false, 'reason', 'server_error');
end;
$$;

grant execute on function public.cl_get_parent_link_v2(text, text, boolean) to anon;
grant execute on function public.cl_parent_exchange_link(text, integer) to anon;
grant execute on function public.cl_get_parent_view_v2(text, text) to anon;
grant execute on function public.cl_revoke_parent_links_v2(text, text) to anon;
