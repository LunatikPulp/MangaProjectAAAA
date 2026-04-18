#!/bin/bash
set -e

echo "=== Manga Project VPS Setup ==="
echo "Ubuntu 24.04 | Brotli + Redis + HTTPS ready"
echo ""

# Update system
echo "[1/10] Updating system..."
apt update && apt upgrade -y

# Install base packages
echo "[2/10] Installing base packages..."
apt install -y python3 python3-pip python3-venv nginx git curl unzip

# Install Node.js 20
echo "[3/10] Installing Node.js 20..."
if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi
echo "Node.js $(node --version), npm $(npm --version)"

# Install Redis
echo "[4/10] Installing Redis..."
apt install -y redis-server
systemctl enable redis-server
systemctl start redis-server
# Verify Redis is running
redis-cli ping && echo "Redis OK" || echo "Redis FAILED"

# Install nginx brotli modules
echo "[5/10] Installing nginx brotli modules..."
apt install -y libnginx-mod-http-brotli-filter libnginx-mod-http-brotli-static

# Install Playwright system dependencies
echo "[6/10] Installing Playwright browser dependencies..."
apt install -y \
    libnss3 libnspr4 libatk1.0-0t64 libatk-bridge2.0-0t64 \
    libcups2t64 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2t64 libxshmfence1 libx11-xcb1 \
    libxfixes3 fonts-liberation libappindicator3-1 \
    xdg-utils wget ca-certificates

# Create manga user
echo "[7/10] Creating manga user..."
if ! id -u manga &>/dev/null; then
    useradd -r -m -s /bin/bash manga
fi

# Create directory structure
echo "[8/10] Creating directories..."
mkdir -p /opt/manga/{backend,frontend}
mkdir -p /opt/manga/backend/{uploads/avatars,uploads/banners,uploads/backgrounds,uploads/shop,uploads/personalization,manga,image_cache}
mkdir -p /var/cache/nginx/proxy
chown -R manga:manga /opt/manga

# Setup Python virtual environment
echo "[9/10] Setting up Python venv..."
if [ ! -d /opt/manga/backend/venv ]; then
    python3 -m venv /opt/manga/backend/venv
fi
chown -R manga:manga /opt/manga/backend/venv

# Install Playwright browsers (as manga user)
echo "[10/10] Installing Playwright Chromium..."
su - manga -c "/opt/manga/backend/venv/bin/pip install playwright && /opt/manga/backend/venv/bin/playwright install chromium"

# Setup systemd service
echo "Setting up systemd service..."
cp /opt/manga/deploy/manga.service /etc/systemd/system/manga.service
systemctl daemon-reload
systemctl enable manga

# Setup nginx — global config (gzip + brotli + cache zone)
echo "Setting up nginx..."
# Inject brotli/gzip/cache settings into nginx.conf if not present
if ! grep -q "brotli on" /etc/nginx/nginx.conf; then
    # Insert before the closing } of http block
    sed -i '/include \/etc\/nginx\/sites-enabled/a\\n\t# Brotli compression\n\tbrotli on;\n\tbrotli_comp_level 6;\n\tbrotli_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;' /etc/nginx/nginx.conf
fi
if ! grep -q "proxy_cache_path" /etc/nginx/nginx.conf; then
    sed -i '/include \/etc\/nginx\/sites-enabled/a\\n\tproxy_cache_path /var/cache/nginx/proxy levels=1:2 keys_zone=imgcache:10m max_size=500m inactive=7d use_temp_path=off;' /etc/nginx/nginx.conf
fi

# Setup nginx — site config
rm -f /etc/nginx/sites-enabled/default
cp /opt/manga/deploy/nginx.conf /etc/nginx/sites-available/manga
ln -sf /etc/nginx/sites-available/manga /etc/nginx/sites-enabled/manga
nginx -t && systemctl reload nginx

# Firewall
echo "Configuring firewall..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo ""
echo "=== Setup complete! ==="
echo ""
echo "Next steps:"
echo "  1. Copy your project to /opt/manga/"
echo "  2. Copy .env.production to /opt/manga/backend/.env and fill in secrets"
echo "  3. Run: cd /opt/manga && bash deploy/deploy.sh"
echo "  4. Setup HTTPS: certbot --nginx -d your-domain.com"
echo ""
echo "Services:"
echo "  Redis:  systemctl status redis-server"
echo "  App:    systemctl status manga"
echo "  Nginx:  systemctl status nginx"
