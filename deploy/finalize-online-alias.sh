#!/bin/bash
# Activate the .online alias only after the canonical HTTPS site is working.
set -Eeuo pipefail
umask 077
root=/var/www/sinchao.ru
state=/var/lib/food-sinchao-online-domain
install -d -m 700 "$state" /var/lib/food-sinchao-domain
exec 9>/var/lib/food-sinchao-domain/activation.lock
flock -n 9 || exit 0
if test -f "$state/complete"; then exit 0; fi
if ! test -f "$state/started"; then date +%s > "$state/started"; fi
now=$(date +%s)
if (( now - $(cat "$state/started") > 86400 )); then
    echo 'Alias activation stopped after 24 hours; inspect DNS and rerun manually.'
    touch "$state/expired"
    systemctl disable --now sinchao-online-activation.timer
    exit 1
fi
if ! test -f /var/lib/food-sinchao-domain/complete; then
    echo 'Waiting for canonical sinchao.ru HTTPS activation.'
    exit 0
fi
if ! curl --max-time 15 -fsS https://sinchao.ru/api/health >/dev/null; then
    echo 'Waiting for canonical sinchao.ru public health.'
    exit 0
fi
for resolver in 1.1.1.1 8.8.8.8; do
    for domain in sinchao.online www.sinchao.online; do
        address=$(dig +time=3 +tries=1 +short "$domain" A @"$resolver")
        if [[ "$address" != 82.146.42.213 ]]; then
            echo "Waiting for public DNS: $domain via $resolver."
            exit 0
        fi
    done
done
if test -f "$state/last-acme" && (( now - $(cat "$state/last-acme") < 1200 )); then
    echo 'Waiting before another alias ACME attempt.'
    exit 0
fi
date +%s > "$state/last-acme"
certbot certonly --webroot -w "$root/acme" --cert-name sinchao.online \
    -d sinchao.online -d www.sinchao.online --non-interactive --agree-tos \
    --register-unsafely-without-email --keep-until-expiring
backup=$(mktemp -d /var/backups/food-sinchao/online-activation-XXXXXXXX)
cp -a /etc/nginx/sites-available/sinchao.online "$backup/sinchao.online"
rollback() {
    trap - ERR
    cp -a "$backup/sinchao.online" /etc/nginx/sites-available/sinchao.online
    nginx -t && systemctl reload nginx
    echo "Alias activation rolled back; backup: $backup"
    exit 1
}
trap rollback ERR
install -m 644 "$root/current/deploy/nginx-online-redirect.conf" /etc/nginx/sites-available/sinchao.online
nginx -t
systemctl reload nginx
sleep 2
for domain in sinchao.online www.sinchao.online; do
    for scheme in http https; do
        result=$(curl --max-time 20 -sS -o /dev/null -w '%{http_code} %{redirect_url}' \
            "$scheme://$domain/dine-in/alias-check?source=online")
        [[ "$result" == '308 https://sinchao.ru/dine-in/alias-check?source=online' ]]
    done
done
certbot renew --cert-name sinchao.online --dry-run --non-interactive
systemctl is-active certbot.timer
trap - ERR
date -u +%FT%TZ > "$state/complete"
systemctl disable --now sinchao-online-activation.timer || true
echo "sinchao.online alias activated; redirects and certificate renewal verified. Backup: $backup"
