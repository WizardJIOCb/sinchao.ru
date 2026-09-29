#!/bin/bash
set -euo pipefail
release_name="$1"
[[ "$release_name" =~ ^[a-zA-Z0-9-]+$ ]] || exit 1
release="/opt/food-sinchao/releases/$release_name"
test -d "$release"
cd "$release"
npm ci --no-audit --no-fund
set -a
source /etc/food-sinchao.env
set +a
npm run migrate
npm run seed
bash deploy/backup.sh
chown -R root:food-sinchao "$release"
chmod -R o-rwx "$release"
ln -sfn "$release" /opt/food-sinchao/current
install -m 644 deploy/food-sinchao.service /etc/systemd/system/food-sinchao.service
install -m 644 deploy/food-sinchao-backup.service /etc/systemd/system/food-sinchao-backup.service
install -m 644 deploy/food-sinchao-backup.timer /etc/systemd/system/food-sinchao-backup.timer
systemctl daemon-reload
systemctl enable --now food-sinchao food-sinchao-backup.timer
systemctl restart food-sinchao
for attempt in {1..10}; do
    if curl -fsS http://127.0.0.1:3187/api/health; then exit 0; fi
    sleep 1
done
exit 1
