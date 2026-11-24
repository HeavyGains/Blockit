-- Blockit online scoreboard. Paste into Supabase: SQL Editor > New query > Run.
-- Anyone with the app can read scores and add new ones; nobody can change or
-- delete them (no update/delete policies).

create table public.scores (
  id bigint generated always as identity primary key,
  player text not null check (char_length(player) between 1 and 12),
  mode text not null constraint scores_mode_check check (mode ~ '^[a-z][a-z-]{0,31}$'),
  score integer not null check (score > 0 and score < 10000000),
  day date,
  created_at timestamptz not null default now()
);

alter table public.scores enable row level security;
create policy "anyone can read scores" on public.scores for select using (true);
create policy "anyone can add scores" on public.scores for insert with check (true);
grant select, insert on public.scores to anon;

-- Best score per player and mode, for the scoreboard.
create view public.best_scores with (security_invoker = true) as
  select player, mode, max(score) as best from public.scores group by player, mode;
grant select on public.best_scores to anon;

-- Upgrade (Nov 2026, a Daily Duel for every mode): if your table was made with
-- the old list of modes, run this once so new modes are accepted:
--   alter table public.scores drop constraint if exists scores_mode_check;
--   alter table public.scores add constraint scores_mode_check check (mode ~ '^[a-z][a-z-]{0,31}$');
