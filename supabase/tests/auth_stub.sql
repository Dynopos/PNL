-- Test-only stand-in for the parts of Supabase's platform the migration relies on.
-- Never apply this to a real Supabase project.

create role anon nologin;
create role authenticated nologin;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

create function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;

-- Supabase grants table privileges to both API roles by default; mirror that so the
-- migration's own revokes are what keep anon out.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
