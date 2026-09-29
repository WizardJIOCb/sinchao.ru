ALTER TABLE bill_shares ADD COLUMN gift_paid integer NOT NULL DEFAULT 0 CHECK(gift_paid>=0 AND gift_paid<=amount);
ALTER TABLE gift_redemptions ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE gift_redemptions ADD COLUMN share_id uuid REFERENCES bill_shares(id);
ALTER TABLE gift_redemptions ADD CONSTRAINT gift_one_target CHECK((order_id IS NOT NULL)::int+(share_id IS NOT NULL)::int=1);
