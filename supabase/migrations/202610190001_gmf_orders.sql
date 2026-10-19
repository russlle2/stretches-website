create table if not exists public.gmf_orders (
  stripe_account_id text not null,
  stripe_session_id text not null,
  stripe_payment_intent text,
  customer_email text,
  customer_details jsonb,
  shipping_details jsonb,
  amount_total integer,
  currency text,
  line_items jsonb not null default '[]'::jsonb,
  status text not null,
  stripe_event_id text not null,
  event_created bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (stripe_account_id, stripe_session_id)
);
alter table public.gmf_orders enable row level security;
revoke all on public.gmf_orders from anon, authenticated;
grant all on public.gmf_orders to service_role;
create or replace function public.gmf_record_order(p_order jsonb) returns void language sql security invoker set search_path = public as $$
  insert into public.gmf_orders(stripe_account_id,stripe_session_id,stripe_payment_intent,customer_email,customer_details,shipping_details,amount_total,currency,line_items,status,stripe_event_id,event_created)
  values(p_order->>'stripe_account_id',p_order->>'stripe_session_id',p_order->>'stripe_payment_intent',p_order->>'customer_email',p_order->'customer_details',p_order->'shipping_details',(p_order->>'amount_total')::integer,p_order->>'currency',p_order->'line_items',p_order->>'status',p_order->>'stripe_event_id',(p_order->>'event_created')::bigint)
  on conflict(stripe_account_id,stripe_session_id) do update set
    stripe_payment_intent=excluded.stripe_payment_intent,customer_email=excluded.customer_email,customer_details=excluded.customer_details,shipping_details=excluded.shipping_details,amount_total=excluded.amount_total,currency=excluded.currency,line_items=excluded.line_items,
    status=case when gmf_orders.status='paid' then 'paid' else excluded.status end,
    stripe_event_id=excluded.stripe_event_id,event_created=greatest(gmf_orders.event_created,excluded.event_created),updated_at=now()
  where excluded.event_created>=gmf_orders.event_created or excluded.status='paid';
$$;
revoke all on function public.gmf_record_order(jsonb) from public,anon,authenticated;
grant execute on function public.gmf_record_order(jsonb) to service_role;
