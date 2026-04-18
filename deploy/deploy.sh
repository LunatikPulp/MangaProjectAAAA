#!/bin/bash
set -e

echo "=== Deploying Manga Project ==="

APP_DIR="/opt/manga"

# Install Python dependencies
echo "[1/4] Installing Python dependencies..."
cd "$APP_DIR/backend"
./venv/bin/pip install -r requirements.txt

# Install Node dependencies and build frontend
echo "[2/4] Building frontend..."
cd "$APP_DIR/frontend"
npm install
npm run build

# Copy Frames and Achievement Icons to build output
if [ -d "public/Frames" ]; then
    cp -r public/Frames dist/Frames 2>/dev/null || true
fi
if [ -d "public/Achievement Icons" ]; then
    cp -r "public/Achievement Icons" "dist/Achievement Icons" 2>/dev/null || true
fi
if [ -d "public/Horror_design" ]; then
    cp -r public/Horror_design dist/Horror_design 2>/dev/null || true
fi

# Fix ownership
echo "[3/4] Fixing permissions..."
chown -R manga:manga "$APP_DIR"

# Restart services
echo "[4/4] Restarting services..."
systemctl restart manga
nginx -t && systemctl reload nginx

echo ""
echo "=== Deploy complete! ==="
echo "Check status: systemctl status manga"
echo "View logs: journalctl -u manga -f"
echo "Site: http://188.127.249.157"
