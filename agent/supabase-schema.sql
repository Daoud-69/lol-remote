-- One row per app account, extending Supabase's built-in auth.users table.
-- subscription_tier/expires_at/features are only ever written by the admin
-- dashboard (using the service_role key, which bypasses RLS) — a logged-in
-- user can read their own row but never modify their own subscription.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  subscription_tier text not null default 'free' check (subscription_tier in ('free', 'monthly', 'yearly')),
  subscription_expires_at timestamptz,
  features jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Auto-creates a profiles row the moment someone signs up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
