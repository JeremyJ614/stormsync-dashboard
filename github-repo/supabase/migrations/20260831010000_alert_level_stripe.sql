-- Alert levels are bought through Stripe now, not requested by hand.
--
-- The entitlement records which subscription paid for it so a cancellation can
-- remove exactly that level. Tier-included levels stay computed and are never
-- written here, so none of this can strip something the member's plan covers.

alter table public.alert_entitlements
  add column if not exists stripe_subscription_id text;

create index if not exists alert_entitlements_sub_idx
  on public.alert_entitlements (stripe_subscription_id)
  where stripe_subscription_id is not null;

comment on column public.alert_entitlements.stripe_subscription_id is
  'Stripe subscription that pays for this level. Set by stripe-webhook; null for admin grants.';
