CREATE TABLE achievement_grants (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  grant_key text NOT NULL,
  dish_id text NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  progress integer NOT NULL CHECK (progress > 0 AND progress <= 10000),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, grant_key, dish_id)
);
