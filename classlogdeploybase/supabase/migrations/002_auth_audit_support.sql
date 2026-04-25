-- ClassLog auth/audit support tables.
--
-- This migration creates locked-down tables that cl_authenticate, cl_change_password,
-- teacher-management RPCs, and settings RPCs should write to. The current repository
-- does not include the existing RPC definitions, so wire these inserts into those
-- functions in the Supabase SQL editor/migration where they are defined.

create table if not exists public.cl_auth_attempts (
    id bigserial primary key,
    username text,
    client_key text,
    ok boolean not null default false,
    reason text,
    created_at timestamptz not null default now()
);

create index if not exists cl_auth_attempts_lookup_idx
    on public.cl_auth_attempts (username, client_key, created_at desc);

create table if not exists public.cl_audit_log (
    id bigserial primary key,
    actor_teacher_id bigint,
    actor_username text,
    action text not null,
    target_type text,
    target_id text,
    ok boolean not null default true,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists cl_audit_log_action_created_idx
    on public.cl_audit_log (action, created_at desc);

alter table public.cl_auth_attempts enable row level security;
alter table public.cl_audit_log enable row level security;

revoke all on public.cl_auth_attempts from anon, authenticated;
revoke all on public.cl_audit_log from anon, authenticated;

create or replace function public.cl_recent_failed_auth_count(
    p_username text,
    p_client_key text,
    p_window_minutes integer default 15
)
returns integer
language sql
security definer
set search_path = public
as $$
    select count(*)::integer
      from public.cl_auth_attempts
     where ok = false
       and created_at > now() - make_interval(mins => greatest(1, least(coalesce(p_window_minutes, 15), 120)))
       and (
            lower(username) = lower(coalesce(p_username, ''))
            or client_key = coalesce(p_client_key, '')
       )
$$;

create or replace function public.cl_record_auth_attempt(
    p_username text,
    p_client_key text,
    p_ok boolean,
    p_reason text default null
)
returns void
language sql
security definer
set search_path = public
as $$
    insert into public.cl_auth_attempts(username, client_key, ok, reason)
    values (lower(nullif(trim(coalesce(p_username, '')), '')), nullif(trim(coalesce(p_client_key, '')), ''), coalesce(p_ok, false), p_reason)
$$;

create or replace function public.cl_audit_event(
    p_action text,
    p_actor_teacher_id bigint default null,
    p_actor_username text default null,
    p_target_type text default null,
    p_target_id text default null,
    p_ok boolean default true,
    p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
    insert into public.cl_audit_log(actor_teacher_id, actor_username, action, target_type, target_id, ok, metadata)
    values (p_actor_teacher_id, p_actor_username, p_action, p_target_type, p_target_id, coalesce(p_ok, true), coalesce(p_metadata, '{}'::jsonb))
$$;

grant execute on function public.cl_recent_failed_auth_count(text, text, integer) to anon;
grant execute on function public.cl_record_auth_attempt(text, text, boolean, text) to anon;
grant execute on function public.cl_audit_event(text, bigint, text, text, text, boolean, jsonb) to anon;
