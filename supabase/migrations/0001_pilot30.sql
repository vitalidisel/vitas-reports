-- PILOT30 schema. All objects are prefixed p30_ so they never collide with the VITAS reports tables.
-- Run in the Supabase SQL editor (or `supabase db push`). Idempotent where practical.

create extension if not exists pgcrypto;

create table if not exists p30_profiles (
  owner_id   uuid primary key references auth.users(id) on delete cascade,
  timezone   text not null default 'Asia/Jerusalem',
  created_at timestamptz not null default now()
);

create table if not exists p30_pilots (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade,
  status         text not null default 'active' check (status in ('active','ended','archived')),
  start_date     date not null,
  duration_days  int  not null default 30 check (duration_days between 1 and 366),
  mode           text not null check (mode in ('paper','manual-real','demo')),
  config         jsonb not null,
  config_version int  not null default 1,
  created_at     timestamptz not null default now(),
  ended_at       timestamptz
);
create index if not exists p30_pilots_owner_idx on p30_pilots(owner_id, status);

create table if not exists p30_pilot_configs (
  id         uuid primary key default gen_random_uuid(),
  pilot_id   uuid not null references p30_pilots(id) on delete cascade,
  version    int  not null,
  config     jsonb not null,
  reason     text,
  created_at timestamptz not null default now(),
  unique (pilot_id, version)
);

create table if not exists p30_pilot_days (
  id          uuid primary key default gen_random_uuid(),
  pilot_id    uuid not null references p30_pilots(id) on delete cascade,
  local_date  date not null,
  day_number  int  not null,
  status      text not null default 'open',
  ticket_id   uuid,
  reason      text,
  scan        jsonb,
  updated_at  timestamptz not null default now(),
  unique (pilot_id, local_date)
);

create table if not exists p30_leagues (
  key          text primary key,
  name         text not null,
  name_he      text,
  country      text,
  season       int,
  provider_ids jsonb not null default '{}'::jsonb,
  data_mode    text not null default 'live' check (data_mode in ('live','demo'))
);

create table if not exists p30_teams (
  id           text primary key,
  name         text not null,
  name_he      text,
  league_key   text references p30_leagues(key),
  provider_ids jsonb not null default '{}'::jsonb,
  data_mode    text not null default 'live' check (data_mode in ('live','demo'))
);

create table if not exists p30_fixtures (
  id                text primary key,
  league_key        text not null references p30_leagues(key),
  season            int,
  home_team_id      text not null references p30_teams(id),
  away_team_id      text not null references p30_teams(id),
  kickoff_utc       timestamptz not null,
  local_date        date not null,
  status            text not null,
  ft_home           int,
  ft_away           int,
  source            text not null,
  source_updated_at timestamptz,
  fetched_at        timestamptz not null default now(),
  mapping_verified  boolean not null default false,
  lineups           jsonb,
  data_mode         text not null default 'live' check (data_mode in ('live','demo')),
  updated_at        timestamptz not null default now()
);
create index if not exists p30_fixtures_kickoff_idx on p30_fixtures(kickoff_utc);
create index if not exists p30_fixtures_local_date_idx on p30_fixtures(local_date, league_key);
create index if not exists p30_fixtures_team_idx on p30_fixtures(home_team_id, away_team_id);

create table if not exists p30_provider_mappings (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null,
  entity_type  text not null,
  external_id  text not null,
  internal_id  text not null,
  verification text not null default 'unverified' check (verification in ('unverified','auto','verified','rejected')),
  meta         jsonb,
  unique (provider, entity_type, external_id)
);

create table if not exists p30_quote_snapshots (
  id                uuid primary key default gen_random_uuid(),
  fixture_id        text not null references p30_fixtures(id),
  bookmaker         text not null,
  market            text not null,
  line              numeric(6,2),
  selection         text not null,
  odds              numeric(12,6) not null,
  status            text not null default 'active',
  source            text not null,
  source_updated_at timestamptz,
  fetched_at        timestamptz not null default now(),
  data_mode         text not null default 'live'
);
create index if not exists p30_quotes_fixture_idx on p30_quote_snapshots(fixture_id, bookmaker, market, selection, fetched_at desc);

create table if not exists p30_analysis_snapshots (
  id            uuid primary key default gen_random_uuid(),
  fixture_id    text not null references p30_fixtures(id),
  cutoff_utc    timestamptz not null,
  inputs        jsonb not null,
  model_version text,
  probabilities jsonb,
  uncertainties jsonb,
  missing_data  jsonb,
  sources       jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists p30_analysis_fixture_idx on p30_analysis_snapshots(fixture_id, cutoff_utc desc);

create table if not exists p30_tickets (
  id                     uuid primary key default gen_random_uuid(),
  pilot_id               uuid not null references p30_pilots(id) on delete cascade,
  owner_id               uuid not null references auth.users(id) on delete cascade,
  local_date             date not null,
  mode                   text not null,
  state                  text not null default 'draft' check (state in ('draft','committed','pending','won','lost','void','pending_review')),
  stake_minor            int  not null check (stake_minor > 0),
  combined_odds          numeric(24,8),
  potential_return_minor bigint,
  basis                  text,
  meta                   jsonb,
  committed_at           timestamptz,
  settled_at             timestamptz,
  actual_return_minor    bigint,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
-- One non-draft ticket per pilot-day, enforced by the database (double clicks / double runs).
create unique index if not exists p30_tickets_one_per_day on p30_tickets(pilot_id, local_date) where state <> 'draft';

create table if not exists p30_ticket_legs (
  id                      uuid primary key default gen_random_uuid(),
  ticket_id               uuid not null references p30_tickets(id) on delete cascade,
  fixture_id              text not null references p30_fixtures(id),
  market                  text not null,
  selection               text not null,
  locked_quote_id         uuid references p30_quote_snapshots(id),
  locked_analysis_id      uuid references p30_analysis_snapshots(id),
  accepted_odds           numeric(12,6) not null,
  bookmaker               text not null,
  outcome                 text not null default 'pending',
  settlement_rule_version text,
  position                int not null default 0
);
create index if not exists p30_ticket_legs_ticket_idx on p30_ticket_legs(ticket_id);

create table if not exists p30_ledger_entries (
  id              uuid primary key default gen_random_uuid(),
  pilot_id        uuid not null references p30_pilots(id) on delete cascade,
  ticket_id       uuid references p30_tickets(id) on delete set null,
  kind            text not null check (kind in ('debit','credit','refund')),
  amount_minor    bigint not null check (amount_minor >= 0),
  at              timestamptz not null default now(),
  idempotency_key text not null unique
);

create table if not exists p30_audit_events (
  id        uuid primary key default gen_random_uuid(),
  pilot_id  uuid references p30_pilots(id) on delete cascade,
  ticket_id uuid,
  kind      text not null,
  payload   jsonb,
  at        timestamptz not null default now()
);

create table if not exists p30_sync_runs (
  id         uuid primary key default gen_random_uuid(),
  provider   text not null,
  job        text not null,
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  status     text not null default 'running',
  counts     jsonb not null default '{}'::jsonb,
  error      text,
  credits    jsonb
);
create index if not exists p30_sync_runs_started_idx on p30_sync_runs(started_at desc);

create table if not exists p30_job_locks (
  job          text primary key,
  locked_until timestamptz not null
);

create table if not exists p30_model_runs (
  id              uuid primary key default gen_random_uuid(),
  version         text not null,
  training_cutoff timestamptz,
  params          jsonb,
  metrics         jsonb,
  created_at      timestamptz not null default now()
);

-- ── Atomic commit: money invariants enforced inside one transaction with a row lock on the pilot. ──
create or replace function p30_commit_ticket(p_ticket_id uuid, p_owner_id uuid, p_daily_budget_minor int, p_pilot_budget_minor int)
returns jsonb language plpgsql security definer as $$
declare
  t p30_tickets%rowtype;
  v_total bigint;
  v_now timestamptz := now();
begin
  select * into t from p30_tickets where id = p_ticket_id and owner_id = p_owner_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if t.state <> 'draft' then return jsonb_build_object('ok', true, 'alreadyCommitted', true, 'state', t.state); end if;
  perform 1 from p30_pilots where id = t.pilot_id for update;
  if exists (select 1 from p30_tickets where pilot_id = t.pilot_id and local_date = t.local_date and state <> 'draft' and id <> t.id) then
    return jsonb_build_object('ok', false, 'code', 'day_already_committed');
  end if;
  if t.stake_minor > p_daily_budget_minor then return jsonb_build_object('ok', false, 'code', 'daily_budget'); end if;
  select coalesce(sum(stake_minor),0) into v_total from p30_tickets where pilot_id = t.pilot_id and state <> 'draft';
  if v_total + t.stake_minor > p_pilot_budget_minor then return jsonb_build_object('ok', false, 'code', 'pilot_budget'); end if;
  update p30_tickets set state = 'pending', committed_at = v_now, updated_at = v_now where id = t.id;
  insert into p30_ledger_entries (pilot_id, ticket_id, kind, amount_minor, at, idempotency_key)
    values (t.pilot_id, t.id, 'debit', t.stake_minor, v_now, 'stake:' || t.id::text)
    on conflict (idempotency_key) do nothing;
  update p30_pilot_days set status = 'committed', ticket_id = t.id, updated_at = v_now where pilot_id = t.pilot_id and local_date = t.local_date;
  return jsonb_build_object('ok', true, 'alreadyCommitted', false, 'committedAt', v_now);
end $$;

-- Lock helper for scheduled jobs (returns true when acquired).
create or replace function p30_acquire_lock(p_job text, p_ttl_seconds int)
returns boolean language plpgsql security definer as $$
declare v_now timestamptz := now();
begin
  insert into p30_job_locks(job, locked_until) values (p_job, v_now + make_interval(secs => p_ttl_seconds))
    on conflict (job) do update set locked_until = excluded.locked_until where p30_job_locks.locked_until < v_now;
  return found;
end $$;

-- ── Row level security: owner-only. Server routes use the service role after verifying the owner; ──
-- ── these policies protect against direct use of the anon key from a browser. ──
alter table p30_profiles         enable row level security;
alter table p30_pilots           enable row level security;
alter table p30_pilot_configs    enable row level security;
alter table p30_pilot_days       enable row level security;
alter table p30_tickets          enable row level security;
alter table p30_ticket_legs      enable row level security;
alter table p30_ledger_entries   enable row level security;
alter table p30_audit_events     enable row level security;
alter table p30_leagues          enable row level security;
alter table p30_teams            enable row level security;
alter table p30_fixtures         enable row level security;
alter table p30_provider_mappings enable row level security;
alter table p30_quote_snapshots  enable row level security;
alter table p30_analysis_snapshots enable row level security;
alter table p30_sync_runs        enable row level security;
alter table p30_job_locks        enable row level security;
alter table p30_model_runs       enable row level security;

drop policy if exists p30_profiles_owner on p30_profiles;
create policy p30_profiles_owner on p30_profiles for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists p30_pilots_owner on p30_pilots;
create policy p30_pilots_owner on p30_pilots for select using (owner_id = auth.uid());
drop policy if exists p30_pilot_configs_owner on p30_pilot_configs;
create policy p30_pilot_configs_owner on p30_pilot_configs for select using (exists (select 1 from p30_pilots p where p.id = pilot_id and p.owner_id = auth.uid()));
drop policy if exists p30_pilot_days_owner on p30_pilot_days;
create policy p30_pilot_days_owner on p30_pilot_days for select using (exists (select 1 from p30_pilots p where p.id = pilot_id and p.owner_id = auth.uid()));
drop policy if exists p30_tickets_owner on p30_tickets;
create policy p30_tickets_owner on p30_tickets for select using (owner_id = auth.uid());
drop policy if exists p30_ticket_legs_owner on p30_ticket_legs;
create policy p30_ticket_legs_owner on p30_ticket_legs for select using (exists (select 1 from p30_tickets t where t.id = ticket_id and t.owner_id = auth.uid()));
drop policy if exists p30_ledger_owner on p30_ledger_entries;
create policy p30_ledger_owner on p30_ledger_entries for select using (exists (select 1 from p30_pilots p where p.id = pilot_id and p.owner_id = auth.uid()));
drop policy if exists p30_audit_owner on p30_audit_events;
create policy p30_audit_owner on p30_audit_events for select using (exists (select 1 from p30_pilots p where p.id = pilot_id and p.owner_id = auth.uid()));
-- Reference data: readable by any signed-in user of this project (the project has a single owner); writable by service role only.
drop policy if exists p30_leagues_read on p30_leagues;        create policy p30_leagues_read on p30_leagues for select using (auth.uid() is not null);
drop policy if exists p30_teams_read on p30_teams;            create policy p30_teams_read on p30_teams for select using (auth.uid() is not null);
drop policy if exists p30_fixtures_read on p30_fixtures;      create policy p30_fixtures_read on p30_fixtures for select using (auth.uid() is not null);
drop policy if exists p30_mappings_read on p30_provider_mappings; create policy p30_mappings_read on p30_provider_mappings for select using (auth.uid() is not null);
drop policy if exists p30_quotes_read on p30_quote_snapshots; create policy p30_quotes_read on p30_quote_snapshots for select using (auth.uid() is not null);
drop policy if exists p30_analysis_read on p30_analysis_snapshots; create policy p30_analysis_read on p30_analysis_snapshots for select using (auth.uid() is not null);
drop policy if exists p30_sync_runs_read on p30_sync_runs;    create policy p30_sync_runs_read on p30_sync_runs for select using (auth.uid() is not null);
drop policy if exists p30_model_runs_read on p30_model_runs;  create policy p30_model_runs_read on p30_model_runs for select using (auth.uid() is not null);
-- p30_job_locks: no policies → service role only.
