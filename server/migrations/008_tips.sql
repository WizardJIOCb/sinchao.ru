ALTER TABLE dine_visits ADD COLUMN tip_choice jsonb NOT NULL DEFAULT '{"kind":"none","value":0}';
ALTER TABLE dine_visits ADD COLUMN tip_version integer NOT NULL DEFAULT 0;
ALTER TABLE dine_visits ADD COLUMN tip_user_id uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE bill_shares ADD COLUMN tip integer NOT NULL DEFAULT 0 CHECK (tip >= 0 AND tip <= amount);
CREATE TABLE general_achievement_rules (id text PRIMARY KEY, data jsonb NOT NULL);
