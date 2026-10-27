#!/bin/bash
# Finish this domain migration after public DNS propagation. Run as root.
set -Eeuo pipefail
umask 077
root=/var/www/sinchao.ru
state=/var/lib/food-sinchao-domain
install -d -m 700 "$state"
exec 9>"$state/activation.lock"
flock -n 9 || exit 0
if test -f "$state/complete"; then exit 0; fi
if ! test -f "$state/started"; then date +%s > "$state/started"; fi
now=$(date +%s)
if (( now - $(cat "$state/started") > 86400 )); then
    echo 'Domain activation stopped after 24 hours; inspect DNS and rerun manually.'
    touch "$state/expired"
    systemctl disable --now sinchao-domain-activation.timer
    exit 1
fi
for resolver in 1.1.1.1 8.8.8.8; do
    for domain in sinchao.ru www.sinchao.ru; do
        address=$(dig +time=3 +tries=1 +short "$domain" A @"$resolver")
        if [[ "$address" != 82.146.42.213 ]]; then
            echo "Waiting for public DNS: $domain via $resolver."
            exit 0
        fi
    done
done
# Limit ACME retries even if DNS is ready but validation fails elsewhere.
if test -f "$state/last-acme" && (( now - $(cat "$state/last-acme") < 1200 )); then
    echo 'Waiting before another ACME attempt.'
    exit 0
fi
date +%s > "$state/last-acme"
test -f "$root/current/dist/server.js"
certbot certonly --webroot -w "$root/acme" --cert-name sinchao.ru \
    -d sinchao.ru -d www.sinchao.ru --non-interactive --agree-tos \
    --register-unsafely-without-email --keep-until-expiring

backup=$(mktemp -d /var/backups/food-sinchao/domain-activation-XXXXXXXX)
cp -a /etc/food-sinchao.env "$backup/environment"
cp -a /etc/nginx/sites-available/sinchao.ru "$backup/sinchao.ru"
cp -a /etc/nginx/sites-available/food.xedoc.ru "$backup/food.xedoc.ru"
cp -a /etc/letsencrypt/renewal/food.xedoc.ru.conf "$backup/old-certificate-renewal.conf"
rollback() {
    trap - ERR
    cp -a "$backup/environment" /etc/food-sinchao.env
    cp -a "$backup/sinchao.ru" /etc/nginx/sites-available/sinchao.ru
    cp -a "$backup/food.xedoc.ru" /etc/nginx/sites-available/food.xedoc.ru
    cp -a "$backup/old-certificate-renewal.conf" /etc/letsencrypt/renewal/food.xedoc.ru.conf
    systemctl restart food-sinchao
    nginx -t && systemctl reload nginx
    echo "Domain activation rolled back; backup: $backup"
    exit 1
}
trap rollback ERR
install -m 644 "$root/current/deploy/nginx-https.conf" /etc/nginx/sites-available/sinchao.ru
install -m 644 "$root/current/deploy/nginx-legacy-redirect.conf" /etc/nginx/sites-available/food.xedoc.ru
nginx -t
python3 - <<'PY'
import os, pathlib, re
p = pathlib.Path('/etc/food-sinchao.env')
s = p.read_text()
if len(re.findall(r'^APP_ORIGIN=', s, re.M)) != 1:
    raise SystemExit('Expected exactly one APP_ORIGIN setting')
s = re.sub(r'^APP_ORIGIN=.*$', 'APP_ORIGIN=https://sinchao.ru', s, flags=re.M)
tmp = p.with_suffix('.env.next')
tmp.write_text(s)
tmp.chmod(0o600)
os.replace(tmp, p)
PY
systemctl restart food-sinchao
for attempt in {1..15}; do
    if curl -fsS http://127.0.0.1:3187/api/health; then break; fi
    sleep 1
done
curl -fsS http://127.0.0.1:3187/api/health
systemctl reload nginx
sleep 2
curl -fsS --resolve sinchao.ru:443:127.0.0.1 https://sinchao.ru/api/health
curl -fsS https://sinchao.ru/api/health
redirect=$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' 'https://food.xedoc.ru/menu?domain-check=1')
[[ "$redirect" == '308 https://sinchao.ru/menu?domain-check=1' ]]
# Test and persist webroot renewal for old QR links as well as the new origin.
certbot reconfigure --cert-name food.xedoc.ru --webroot -w "$root/acme" --non-interactive
certbot renew --cert-name sinchao.ru --dry-run --non-interactive --no-random-sleep-on-renew
systemctl is-active certbot.timer
trap - ERR
date -u +%FT%TZ > "$state/complete"
systemctl disable --now sinchao-domain-activation.timer || true
echo "Domain activated and HTTPS renewal verified. Backup: $backup"
