#!/bin/bash
set -euo pipefail
umask 077
output="/var/backups/food-sinchao/food-sinchao-$(date +%Y%m%d-%H%M%S).sql.gz"
runuser -u postgres -- pg_dump food_sinchao | gzip > "$output"
test -s "$output"
find /var/backups/food-sinchao -maxdepth 1 -type f -name 'food-sinchao-*.sql.gz' -mtime +14 -delete
echo "Backup saved: $output"
