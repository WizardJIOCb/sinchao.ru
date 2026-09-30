CREATE TABLE table_payments (
  id uuid PRIMARY KEY,
  visit_id uuid NOT NULL REFERENCES dine_visits(id),
  -- Keep the original share identity in the payment history when a canceled
  -- attempt's unpaid split is reset. The nullable FK tracks the live share.
  share_id uuid NOT NULL,
  bill_share_id uuid REFERENCES bill_shares(id) ON DELETE SET NULL,
  owner text NOT NULL,
  user_id uuid REFERENCES users(id),
  amount integer NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'RUB' CHECK (currency = 'RUB'),
  method text NOT NULL CHECK (method IN ('bank_card', 'sbp')),
  status text NOT NULL DEFAULT 'CREATING'
    CHECK (status IN ('CREATING','PENDING','WAITING_FOR_CAPTURE','SUCCEEDED','CANCELED')),
  provider_id text UNIQUE,
  provider_key uuid NOT NULL UNIQUE,
  provider_shop_id text NOT NULL,
  provider_test_mode boolean NOT NULL,
  return_url text NOT NULL,
  confirmation_url text,
  test boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);
CREATE UNIQUE INDEX one_active_table_payment ON table_payments(share_id)
  WHERE status IN ('CREATING','PENDING','WAITING_FOR_CAPTURE');
CREATE INDEX table_payments_visit ON table_payments(visit_id, created_at);
