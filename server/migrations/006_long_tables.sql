ALTER TABLE qr_tables DROP CONSTRAINT qr_tables_shape_check;
ALTER TABLE qr_tables ADD CONSTRAINT qr_tables_shape_check CHECK(shape IN ('round','square','long'));
