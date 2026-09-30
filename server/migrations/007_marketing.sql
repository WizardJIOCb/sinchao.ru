CREATE TABLE promotions (
  code text PRIMARY KEY,
  data jsonb NOT NULL,
  used integer NOT NULL DEFAULT 0 CHECK (used >= 0)
);
INSERT INTO promotions(code,data) VALUES ('480', '{"code":"480","title":"Фо Бо: 4 = фо, 80 = BO","percent":0,"dishIds":["pho-bo"],"enabled":false,"startsAt":null,"endsAt":null,"limit":null,"minSubtotal":0}');
CREATE TABLE dish_achievement_rules (
  dish_id text PRIMARY KEY,
  data jsonb NOT NULL
);
