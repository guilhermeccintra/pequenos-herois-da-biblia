begin;
-- Existing Stripe tables are left intact for rollback; new Perfect Pay records are separate.
create table if not exists public.perfectpay_sales (
 sale_code text primary key, user_id uuid not null references auth.users(id) on delete cascade,
 plan text not null check(plan in ('monthly','annual')),
 approved_at timestamptz, reversed_at timestamptz,
 last_status integer not null, last_event_at timestamptz not null, updated_at timestamptz not null default now()
);
create table if not exists public.perfectpay_events (
 id bigint generated always as identity primary key,
 sale_code text not null, user_id uuid not null references auth.users(id) on delete cascade,
 status integer not null, event_at timestamptz not null, received_at timestamptz not null default now(),
 unique(sale_code,status,event_at)
);
alter table public.perfectpay_sales enable row level security;
alter table public.perfectpay_events enable row level security;
revoke all on public.perfectpay_sales,public.perfectpay_events from public,anon,authenticated;
grant all on public.perfectpay_sales,public.perfectpay_events to service_role;
create or replace function public.find_verified_billing_user(p_email text)
returns uuid language sql security definer set search_path = '' as $$
 select id from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null and deleted_at is null limit 1;
$$;
create or replace function public.apply_perfectpay_event(p_user_id uuid,p_sale_code text,p_plan text,p_kind text,p_event_at timestamptz,p_status integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_old public.perfectpay_sales%rowtype; v_best record; v_inserted integer;
begin
 if p_status is null or p_kind not in ('paid','reversed') or p_plan not in ('monthly','annual') or p_sale_code !~ '^[a-zA-Z0-9_-]{5,100}$' or p_event_at is null then raise exception 'invalid event'; end if;
 -- Lock the account row to serialize events across concurrent serverless instances.
 insert into public.subscriptions(user_id) values(p_user_id) on conflict(user_id) do nothing;
 perform 1 from public.subscriptions where user_id=p_user_id for update;
 select * into v_old from public.perfectpay_sales where sale_code=p_sale_code for update;
 if found and (v_old.user_id<>p_user_id or v_old.plan<>p_plan) then raise exception 'sale ownership conflict'; end if;
 insert into public.perfectpay_events(sale_code,user_id,status,event_at) values(p_sale_code,p_user_id,p_status,p_event_at) on conflict do nothing;
 get diagnostics v_inserted = row_count;
 if v_inserted=0 then return jsonb_build_object('duplicate',true); end if;
 insert into public.perfectpay_sales(sale_code,user_id,plan,approved_at,reversed_at,last_status,last_event_at)
 values(p_sale_code,p_user_id,p_plan,case when p_kind='paid' then p_event_at end,case when p_kind='reversed' then p_event_at end,p_status,p_event_at)
 on conflict(sale_code) do update set
 approved_at=case when p_kind='paid' then greatest(public.perfectpay_sales.approved_at,excluded.approved_at) else public.perfectpay_sales.approved_at end,
 reversed_at=case when p_kind='reversed' then greatest(public.perfectpay_sales.reversed_at,excluded.reversed_at) else public.perfectpay_sales.reversed_at end,
 last_status=case when excluded.last_event_at >= public.perfectpay_sales.last_event_at then excluded.last_status else public.perfectpay_sales.last_status end,
 last_event_at=greatest(public.perfectpay_sales.last_event_at,excluded.last_event_at),updated_at=now();
 -- Reversal is sticky for this sale code. Each renewal MUST have a distinct sale code.
 -- This is NOT a complete recurring billing implementation until real renewal payloads are verified.
 select s.plan, s.approved_at into v_best from public.perfectpay_sales s
 where s.user_id=p_user_id and s.approved_at is not null and s.reversed_at is null
 and (case when s.plan='monthly' then s.approved_at+interval '1 month' else s.approved_at+interval '1 year' end)>now()
 order by (case when s.plan='monthly' then s.approved_at+interval '1 month' else s.approved_at+interval '1 year' end) desc limit 1;
 update public.subscriptions set
 status=case when v_best.approved_at is null then 'none' else 'active' end,
 plan=v_best.plan,
 current_period_end=case when v_best.plan='monthly' then v_best.approved_at+interval '1 month' when v_best.plan='annual' then v_best.approved_at+interval '1 year' end,
 cancel_at_period_end=false,updated_at=now() where user_id=p_user_id;
 return jsonb_build_object('updated',true,'active',v_best.approved_at is not null);
end;
$$;
revoke all on function public.find_verified_billing_user(text),public.apply_perfectpay_event(uuid,text,text,text,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.find_verified_billing_user(text),public.apply_perfectpay_event(uuid,text,text,text,timestamptz,integer) to service_role;
commit;
