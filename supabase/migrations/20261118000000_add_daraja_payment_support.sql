begin;

alter table public.custom_trip_payments
  drop constraint custom_trip_payments_provider_check;

alter table public.custom_trip_payments
  add constraint custom_trip_payments_provider_check
  check (provider in ('pesapal', 'daraja'));

commit;
