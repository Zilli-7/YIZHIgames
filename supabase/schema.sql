create table if not exists public.game_scores (
  user_id uuid not null references auth.users (id) on delete cascade,
  game_id text not null check (game_id in ('snake', 'heshu', 'game2048-4', 'game2048-5', 'game2048-6')),
  nickname text not null check (char_length(nickname) between 1 and 20),
  best_score integer not null check (best_score > 0 and best_score <= 1000000000),
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

alter table public.game_scores enable row level security;

drop policy if exists "Anyone can read leaderboard" on public.game_scores;
create policy "Anyone can read leaderboard"
  on public.game_scores for select
  using (true);

revoke insert, update, delete on public.game_scores from anon, authenticated;
grant select on public.game_scores to anon, authenticated;

create or replace function public.submit_game_score(
  p_game_id text,
  p_score integer,
  p_nickname text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  safe_nickname text := left(trim(coalesce(p_nickname, '玩家')), 20);
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_game_id not in ('snake', 'heshu', 'game2048-4', 'game2048-5', 'game2048-6') then
    raise exception 'Unsupported game';
  end if;
  if p_score is null or p_score <= 0 or p_score > 1000000000 then
    raise exception 'Invalid score';
  end if;
  if safe_nickname = '' then
    safe_nickname := '玩家';
  end if;

  insert into public.game_scores (user_id, game_id, nickname, best_score)
  values (current_user_id, p_game_id, safe_nickname, p_score)
  on conflict (user_id, game_id) do update
    set best_score = greatest(public.game_scores.best_score, excluded.best_score),
        nickname = excluded.nickname,
        updated_at = case
          when excluded.best_score > public.game_scores.best_score then now()
          else public.game_scores.updated_at
        end;
end;
$$;

revoke all on function public.submit_game_score(text, integer, text) from public, anon;
grant execute on function public.submit_game_score(text, integer, text) to authenticated;
