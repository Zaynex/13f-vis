-- Supabase Auth: user data tables
-- Run in Supabase SQL Editor after creating the Supabase project

create table user_tracked_institutions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  institution_cik text not null,
  created_at timestamptz default now(),
  unique(user_id, institution_cik)
);

create table user_alerts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  cusip text not null,
  threshold_pct numeric(6,2) not null,
  created_at timestamptz default now()
);

alter table user_tracked_institutions enable row level security;
create policy "Users manage own tracked institutions"
  on user_tracked_institutions for all using (auth.uid() = user_id);

alter table user_alerts enable row level security;
create policy "Users manage own alerts"
  on user_alerts for all using (auth.uid() = user_id);
