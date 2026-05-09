-- Update parent viewing sessions from 10 minutes to 30 minutes.
-- Safe to run after 001_parent_link_sessions.sql; it only replaces the RPC.

create or replace function public.cl_parent_exchange_link(
    p_link_code text,
    p_ttl_minutes integer default 30
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

    v_ttl := make_interval(mins => greatest(1, least(coalesce(p_ttl_minutes, 30), 60)));
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

grant execute on function public.cl_parent_exchange_link(text, integer) to anon;
