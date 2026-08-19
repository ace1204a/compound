-- ============================================================
-- Coach spend cap. Run this ONCE in Supabase → SQL Editor.
--
-- Without this table the coach function refuses to spend anything,
-- which is deliberate: a bug, a stuck retry loop or a stolen token
-- should never be able to run up an API bill.
-- ============================================================

create table if not exists public.coach_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  calls   integer not null default 0,
  in_tok  bigint  not null default 0,
  out_tok bigint  not null default 0,
  usd     numeric(10, 5) not null default 0,
  primary key (user_id, day)
);

alter table public.coach_usage enable row level security;

-- You may READ your own usage (so the app can show "12/25 today").
-- Nobody may write it from the browser — only the edge function,
-- which uses the service role key and bypasses RLS.
drop policy if exists "read own usage" on public.coach_usage;
create policy "read own usage" on public.coach_usage
  for select using (auth.uid() = user_id);

-- Atomic increment. Called by the edge function after each reply, so
-- two messages sent at once can't both read "0" and overwrite.
create or replace function public.coach_usage_add(
  p_user uuid, p_day date, p_usd numeric, p_in bigint, p_out bigint
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.coach_usage (user_id, day, calls, in_tok, out_tok, usd)
  values (p_user, p_day, 1, p_in, p_out, p_usd)
  on conflict (user_id, day) do update set
    calls   = coach_usage.calls   + 1,
    in_tok  = coach_usage.in_tok  + excluded.in_tok,
    out_tok = coach_usage.out_tok + excluded.out_tok,
    usd     = coach_usage.usd     + excluded.usd;
$$;

revoke all on function public.coach_usage_add(uuid, date, numeric, bigint, bigint) from public, anon, authenticated;
