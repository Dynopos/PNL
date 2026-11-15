-- Test-only stand-in for the parts of Supabase's platform the migrations rely on.
-- Never apply this to a real Supabase project.

create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

-- Same lookup order as Supabase's auth.uid(): legacy per-claim GUC, then the JSON claims PostgREST sets.
create function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;

grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;

-- Supabase grants table privileges to both API roles by default; mirror that so the
-- migrations' own revokes are what keep anon out.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
