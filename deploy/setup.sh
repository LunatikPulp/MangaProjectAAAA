#!/bin/bash
set -e

echo "=== Manga Project VPS Setup ==="
echo "Ubuntu 24.04 | 2GB RAM | Playwright enabled"
echo ""

# Update system
echo "[1/8] Updating system..."
apt update && apt upgrade -y

# Install base packages
echo "[2/8] Installing base packages..."
apt install -y python3 python3-pip python3-venv nginx git curl unzip

# Install Node.js 20
echo "[3/8] Installing Node.js 20..."
if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi
echo "Node.js $(node --version), npm $(npm --version)"

# Install Playwright system dependencies
echo "[4/8] Installing Playwright browser dependencies..."
apt install -y \
    libnss3 libnspr4 libatk1.0-0t64 libatk-bridge2.0-0t64 \
    libcups2t64 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2t64 libxshmfence1 libx11-xcb1 \
    libxfixes3 fonts-liberation libappindicator3-1 \
    xdg-utils wget ca-certificates

# Create manga user
echo "[5/8] Creating manga user..."
if ! id -u manga &>/dev/null; then
    useradd -r -m -s /bin/bash manga
fi

# Create directory structure
echo "[6/8] Creating directories..."
mkdir -p /opt/manga/{backend,frontend}
mkdir -p /opt/manga/backend/{uploads/avatars,uploads/banners,uploads/backgrounds,uploads/shop,uploads/personalization,manga}
chown -R manga:manga /opt/manga

# Setup Python virtual environment
echo "[7/8] Setting up Python venv..."
if [ ! -d /opt/manga/backend/venv ]; then
    python3 -m venv /opt/manga/backend/venv
fi
chown -R manga:manga /opt/manga/backend/venv

# Install Playwright browsers (as manga user)
echo "[8/8] Installing Playwright Chromium..."
su - manga -c "/opt/manga/backend/venv/bin/pip install playwright && /opt/manga/backend/venv/bin/playwright install chromium"

# Setup systemd service
echo "Setting up systemd service..."
cp /opt/manga/deploy/manga.service /etc/systemd/system/manga.service
systemctl daemon-reload
systemctl enable manga

# Setup nginx
echo "Setting up nginx..."
rm -f /etc/nginx/sites-enabled/default
cp /opt/manga/deploy/nginx.conf /etc/nginx/sites-available/manga
ln -sf /etc/nginx/sites-available/manga /etc/nginx/sites-enabled/manga
nginx -t && systemctl reload nginx

# Firewall
echo "Configuring firewall..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw --force enable

echo ""
echo "=== Setup complete! ==="
echo "Next steps:"
echo "  1. Copy your project to /opt/manga/"
echo "  2. Copy .env.production to /opt/manga/backend/.env and edit SECRET_KEY"
echo "  3. Run: cd /opt/manga && bash deploy/deploy.sh"
echo "  4. Open http://57.129.106.133:2151 in browser"
