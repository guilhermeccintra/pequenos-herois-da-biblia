-- Run as the Supabase project owner in SQL Editor. Safe to re-run.
-- Browser clients can only manage their own reading progress.
begin;

create table if not exists public.stories (
  id integer primary key check (id between 1 and 40),
  body jsonb not null check (jsonb_typeof(body) = 'object' and (body->>'id')::integer = id),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'none',
  plan text check (plan in ('monthly','annual')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  billing_lock_token uuid,
  billing_lock_until timestamptz,
  checkout_request_id uuid,
  checkout_plan text check (checkout_plan in ('monthly','annual')),
  checkout_requested_at timestamptz,
  checkout_session_id text,
  updated_at timestamptz not null default now()
);

create table if not exists public.stripe_events (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  stripe_created bigint,
  processed_at timestamptz not null default now()
);

create table if not exists public.reading_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  story_id integer not null references public.stories(id) on delete cascade,
  part integer not null default 0 check (part between 0 and 3),
  completed boolean not null default false,
  favorite boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(user_id,story_id)
);

alter table public.stories enable row level security;
alter table public.subscriptions enable row level security;
alter table public.stripe_events enable row level security;
alter table public.reading_progress enable row level security;

revoke all on public.stories, public.subscriptions, public.stripe_events, public.reading_progress from public, anon, authenticated;
grant all on public.stories, public.subscriptions, public.stripe_events, public.reading_progress to service_role;
grant select, insert, update, delete on public.reading_progress to authenticated;

drop policy if exists reading_progress_owner on public.reading_progress;
create policy reading_progress_owner on public.reading_progress for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.touch_reading_progress()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists reading_progress_updated_at on public.reading_progress;
create trigger reading_progress_updated_at before update on public.reading_progress
for each row execute function public.touch_reading_progress();

-- A short, fenced lease covers external Stripe reads and writes across serverless
-- processes. The row lock serializes claims; a stale worker cannot commit its result.
create or replace function public.acquire_billing_lock(p_user_id uuid)
returns uuid language plpgsql set search_path = '' as $$
declare v_token uuid;
begin
  insert into public.subscriptions(user_id) values(p_user_id) on conflict(user_id) do nothing;
  perform 1 from public.subscriptions where user_id=p_user_id for update;
  if exists(select 1 from public.subscriptions where user_id=p_user_id and billing_lock_until > now()) then
    return null;
  end if;
  v_token := gen_random_uuid();
  update public.subscriptions set billing_lock_token=v_token, billing_lock_until=now()+interval '2 minutes'
    where user_id=p_user_id;
  return v_token;
end;
$$;

create or replace function public.assert_billing_lock(p_user_id uuid, p_token uuid)
returns void language plpgsql set search_path = '' as $$
begin
  perform 1 from public.subscriptions where user_id=p_user_id and billing_lock_token=p_token
    and billing_lock_until > now() for update;
  if not found then raise exception 'expired billing lease' using errcode='P0001'; end if;
end;
$$;

create or replace function public.release_billing_lock(p_user_id uuid, p_token uuid)
returns void language sql set search_path = '' as $$
  update public.subscriptions set billing_lock_token=null,billing_lock_until=null
    where user_id=p_user_id and billing_lock_token=p_token;
$$;

create or replace function public.save_stripe_customer(p_user_id uuid, p_token uuid, p_customer_id text)
returns void language plpgsql set search_path = '' as $$
begin
  perform public.assert_billing_lock(p_user_id,p_token);
  if exists(select 1 from public.subscriptions where user_id=p_user_id and stripe_customer_id is not null and stripe_customer_id<>p_customer_id) then
    raise exception 'customer mapping already exists';
  end if;
  update public.subscriptions set stripe_customer_id=p_customer_id,updated_at=now() where user_id=p_user_id;
end;
$$;

create or replace function public.commit_billing_snapshot(
  p_user_id uuid, p_token uuid, p_snapshot jsonb,
  p_event_id text default null, p_event_type text default null, p_event_created bigint default null
)
returns void language plpgsql set search_path = '' as $$
begin
  perform public.assert_billing_lock(p_user_id,p_token);
  if p_event_id is not null then
    insert into public.stripe_events(id,user_id,type,stripe_created)
      values(p_event_id,p_user_id,p_event_type,p_event_created) on conflict(id) do nothing;
    if not found then return; end if;
  end if;
  update public.subscriptions set
    stripe_subscription_id=p_snapshot->>'stripe_subscription_id',
    status=p_snapshot->>'status',
    plan=p_snapshot->>'plan',
    current_period_end=(p_snapshot->>'current_period_end')::timestamptz,
    cancel_at_period_end=coalesce((p_snapshot->>'cancel_at_period_end')::boolean,false),
    updated_at=now()
  where user_id=p_user_id;
  -- Event insertion and the entitlement mutation commit or roll back together.
end;
$$;

create or replace function public.reserve_checkout_request(p_user_id uuid, p_token uuid, p_plan text)
returns uuid language plpgsql set search_path = '' as $$
declare v_request uuid;
begin
  perform public.assert_billing_lock(p_user_id,p_token);
  if p_plan not in ('monthly','annual') then raise exception 'invalid checkout plan'; end if;
  select checkout_request_id into v_request from public.subscriptions
    where user_id=p_user_id and checkout_session_id is null;
  if v_request is not null then
    if exists(select 1 from public.subscriptions where user_id=p_user_id
      and checkout_plan=p_plan and checkout_requested_at > now()-interval '23 hours') then
      return v_request;
    end if;
    -- A timed-out Stripe create might have succeeded. Never rotate its key merely
    -- because a different plan was requested or idempotency retention elapsed.
    raise exception 'unresolved checkout request';
  end if;
  v_request := gen_random_uuid();
  update public.subscriptions set checkout_request_id=v_request,checkout_plan=p_plan,
    checkout_requested_at=now(),checkout_session_id=null where user_id=p_user_id;
  return v_request;
end;
$$;

create or replace function public.save_checkout_session(p_user_id uuid, p_token uuid, p_request_id uuid, p_session_id text)
returns void language plpgsql set search_path = '' as $$
begin
  perform public.assert_billing_lock(p_user_id,p_token);
  update public.subscriptions set checkout_session_id=p_session_id
    where user_id=p_user_id and checkout_request_id=p_request_id;
  if not found then raise exception 'checkout request changed'; end if;
end;
$$;

-- Preserve audio uploaded separately, even if content is reimported concurrently.
create or replace function public.import_story(p_id integer,p_body jsonb)
returns void language sql set search_path = '' as $$
  insert into public.stories(id,body) values(p_id,p_body)
  on conflict(id) do update set
    body=excluded.body || jsonb_build_object('audio_path',coalesce(nullif(public.stories.body->'audio_path','null'::jsonb),excluded.body->'audio_path','null'::jsonb)),
    updated_at=now();
$$;

revoke all on function public.touch_reading_progress() from public,anon,authenticated;
revoke all on function public.acquire_billing_lock(uuid) from public,anon,authenticated;
revoke all on function public.assert_billing_lock(uuid,uuid) from public,anon,authenticated;
revoke all on function public.release_billing_lock(uuid,uuid) from public,anon,authenticated;
revoke all on function public.save_stripe_customer(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.commit_billing_snapshot(uuid,uuid,jsonb,text,text,bigint) from public,anon,authenticated;
revoke all on function public.reserve_checkout_request(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.save_checkout_session(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.import_story(integer,jsonb) from public,anon,authenticated;
grant execute on function public.acquire_billing_lock(uuid), public.assert_billing_lock(uuid,uuid), public.release_billing_lock(uuid,uuid), public.save_stripe_customer(uuid,uuid,text), public.commit_billing_snapshot(uuid,uuid,jsonb,text,text,bigint), public.reserve_checkout_request(uuid,uuid,text), public.save_checkout_session(uuid,uuid,uuid,text), public.import_story(integer,jsonb) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('story-assets','story-assets',false,52428800,array['image/webp','image/png','image/jpeg','audio/mpeg'])
on conflict(id) do update set public=false,file_size_limit=52428800,allowed_mime_types=excluded.allowed_mime_types;

-- Restrictive guard also protects this bucket if another app has a permissive
-- policy on all Storage objects. Service-role signing/uploads bypass RLS.
drop policy if exists story_assets_private_guard on storage.objects;
create policy story_assets_private_guard on storage.objects as restrictive for all to anon,authenticated
  using (bucket_id <> 'story-assets') with check (bucket_id <> 'story-assets');

commit;
