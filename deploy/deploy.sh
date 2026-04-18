#!/bin/bash
set -e

echo "=== Deploying Manga Project ==="

APP_DIR="/opt/manga"

# Check Redis
echo "[0/5] Checking Redis..."
if systemctl is-active --quiet redis-server; then
    echo "  Redis is running"
else
    echo "  Starting Redis..."
    systemctl start redis-server
fi
redis-cli ping > /dev/null 2>&1 && echo "  Redis PONG OK" || echo "  WARNING: Redis not responding (caching will be disabled)"

# Install Python dependencies
echo "[1/5] Installing Python dependencies..."
cd "$APP_DIR/backend"
./venv/bin/pip install -r requirements.txt --quiet

# Install Node dependencies and build frontend
echo "[2/5] Building frontend..."
cd "$APP_DIR/frontend"
npm install --silent
npm run build

# Copy static assets to build output
echo "[3/5] Copying static assets..."
for dir in Frames "Achievement Icons" Horror_design Frames_lvl Frames_shop Logo money; do
    if [ -d "public/$dir" ]; then
        cp -r "public/$dir" "dist/$dir" 2>/dev/null || true
    fi
done

# Fix ownership
echo "[4/5] Fixing permissions..."
chown -R manga:manga "$APP_DIR"

# Restart services
echo "[5/5] Restarting services..."
systemctl restart manga
nginx -t && systemctl reload nginx

echo ""
echo "=== Deploy complete! ==="
echo "Check status:"
echo "  App:    systemctl status manga"
echo "  Redis:  redis-cli ping"
echo "  Nginx:  systemctl status nginx"
echo "  Logs:   journalctl -u manga -f"
