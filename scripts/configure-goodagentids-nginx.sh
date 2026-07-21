#!/usr/bin/env bash
# Install goodagentids.xyz nginx site: static SPA + /api and /host to local upstreams.
set -euo pipefail

REMOTE="${REMOTE:-geinz-vps}"
SITE_NAME="goodagentids.xyz"
SITES_AVAILABLE="/etc/nginx/sites-available/${SITE_NAME}"
SITES_ENABLED="/etc/nginx/sites-enabled/${SITE_NAME}"
BACKUP_DIR="/etc/nginx/backups"

echo "==> install nginx site on ${REMOTE}"
ssh "${REMOTE}" "sudo bash -s" <<'REMOTE'
set -euo pipefail
SITE_NAME="goodagentids.xyz"
SITES_AVAILABLE="/etc/nginx/sites-available/${SITE_NAME}"
SITES_ENABLED="/etc/nginx/sites-enabled/${SITE_NAME}"
BACKUP_DIR="/etc/nginx/backups"

mkdir -p "$BACKUP_DIR"

if [ -f "$SITES_ENABLED" ]; then
  cp "$SITES_ENABLED" "${BACKUP_DIR}/${SITE_NAME}.$(date +%Y%m%d%H%M%S).bak"
fi

# Remove stray backup files nginx would otherwise load as duplicate server blocks.
rm -f /etc/nginx/sites-enabled/"${SITE_NAME}".bak.*

cat > "$SITES_AVAILABLE" <<'NGINX'
server {
    server_name goodagentids.xyz www.goodagentids.xyz;

    root /var/www/goodagentids;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3009/;
        include /etc/nginx/snippets/proxy-common.conf;
    }

    location /host/ {
        proxy_pass http://127.0.0.1:3010/;
        include /etc/nginx/snippets/proxy-common.conf;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    listen 443 ssl;
    listen [::]:443 ssl;
    ssl_certificate /etc/letsencrypt/live/goodagentids.xyz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/goodagentids.xyz/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

server {
    if ($host = www.goodagentids.xyz) {
        return 301 https://$host$request_uri;
    }

    if ($host = goodagentids.xyz) {
        return 301 https://$host$request_uri;
    }

    server_name goodagentids.xyz www.goodagentids.xyz;
    listen 80;
    listen [::]:80;
    return 404;
}
NGINX

ln -sf "$SITES_AVAILABLE" "$SITES_ENABLED"
nginx -t
systemctl reload nginx
echo "nginx site installed: ${SITE_NAME}"
REMOTE

echo "==> verify proxies"
curl -sf -b "" "https://goodagentids.xyz/host/health" | head -c 120
echo
curl -sf -b "" "https://goodagentids.xyz/host/deploy/cmrsdzu5f0000kqqgny5plfwy/status" | python3 -c "import json,sys; d=json.load(sys.stdin); print('status ok:', d.get('status'))"
