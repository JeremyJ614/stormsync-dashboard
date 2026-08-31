-- Text alerts need to know the carrier.
--
-- There is no free SMS API worth building on, so the default route is the
-- carrier's own email-to-SMS gateway, which is addressed as
-- <number>@<carrier domain>. That means the carrier is not a nicety — without
-- it there is nowhere to send the message. A member on a paid provider
-- (TWILIO_* set on the function) never needs it, so it stays nullable.
alter table public.notification_prefs
  add column if not exists alert_carrier text;

comment on column public.notification_prefs.alert_carrier is
  'Mobile carrier key for the email-to-SMS gateway (verizon, att, tmobile, ...). Ignored when Twilio is configured.';
