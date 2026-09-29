UPDATE reservations
SET data = jsonb_set(data, '{timezone}', (SELECT data->'timezone' FROM restaurant WHERE id=1))
WHERE NOT data ? 'timezone';
