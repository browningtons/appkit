-- appkit server-entitlement store.
--
-- One row per paid Checkout Session. "Is this email Pro?" = an active row
-- exists for that email. Refunds flip status to 'refunded', revoking access.
--
-- Run against your project with the Supabase CLI:
--   supabase db push
-- or paste into the SQL editor. Safe to re-run (idempotent).

create table if not exists public.entitlements (
  stripe_session_id        text primary key,
  email                    text not null,
  stripe_customer_id       text,
  stripe_payment_intent_id text,
  product_id               text not null,
  price_id                 text not null,
  status                   text not null default 'active'
                             check (status in ('active', 'refunded')),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- Restore-by-email looks up by lowercased email; the API always writes
-- lowercase, so a plain index is enough.
create index if not exists entitlements_email_idx
  on public.entitlements (email);

-- Refund revocation finds rows by payment intent.
create index if not exists entitlements_payment_intent_idx
  on public.entitlements (stripe_payment_intent_id);

-- Lock the table down. The API uses the service-role key, which bypasses RLS;
-- enabling RLS with no policies means the anon/public key cannot read buyer
-- emails. Do NOT add a public select policy.
alter table public.entitlements enable row level security;
