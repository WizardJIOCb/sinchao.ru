CREATE TABLE uploaded_images (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
  content bytea NOT NULL CHECK (octet_length(content) <= 102400),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
