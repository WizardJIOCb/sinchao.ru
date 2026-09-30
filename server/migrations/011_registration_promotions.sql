CREATE TABLE promotion_grants (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code text NOT NULL REFERENCES promotions(code),
  created_at timestamptz NOT NULL DEFAULT now(),
  used_order_id uuid REFERENCES orders(id),
  PRIMARY KEY(user_id,code)
);
CREATE UNIQUE INDEX one_registration_promotion ON promotions ((data->>'registrationGift'))
  WHERE data->>'registrationGift'='true';
INSERT INTO promotions(code,data) VALUES('APP200',
  '{"code":"APP200","title":"Син чао в приложении — подарок за регистрацию","kind":"fixed","amount":20000,"percent":0,"dishIds":[],"enabled":true,"startsAt":null,"endsAt":null,"limit":null,"minSubtotal":0,"registrationGift":true,"requiresGrant":true}')
ON CONFLICT(code) DO NOTHING;
