#!/bin/bash
set -e

echo "=== Deploying Manga Project ==="

APP_DIR="/opt/manga"

# Check Redis
echo "[0/6] Checking Redis..."
if systemctl is-active --quiet redis-server; then
    echo "  Redis is running"
else
    echo "  Starting Redis..."
    systemctl start redis-server
fi
redis-cli ping > /dev/null 2>&1 && echo "  Redis PONG OK" || echo "  WARNING: Redis not responding (caching will be disabled)"

# Install Python dependencies
echo "[1/6] Installing Python dependencies..."
cd "$APP_DIR/backend"
./venv/bin/pip install -r requirements.txt --quiet

# Install Node dependencies and build frontend
echo "[2/6] Building frontend..."
cd "$APP_DIR/frontend"
# Garbage-collect hashed chunks older than 7 days.
# We keep recent old chunks so that open tabs from previous deploys can still
# lazy-load their routes (prevents "Failed to fetch dynamically imported module").
# vite.config.ts has emptyOutDir=false so new build merges into existing dist/.
if [ -d "dist/assets" ]; then
    echo "  GC: deleting assets older than 7 days..."
    find dist/assets -type f -mtime +7 -delete 2>/dev/null || true
fi
npm install --silent
npm run build

# Copy static assets to build output
echo "[3/6] Copying static assets..."
for dir in Frames "Achievement Icons" Horror_design Frames_lvl Frames_shop Logo money; do
    if [ -d "public/$dir" ]; then
        cp -r "public/$dir" "dist/$dir" 2>/dev/null || true
    fi
done

# Create symlinks for Frames (server.py references /opt/manga/public/Frames_*)
echo "[4/6] Creating symlinks for Frames..."
mkdir -p "$APP_DIR/public"
ln -sf "$APP_DIR/frontend/dist/Frames_lvl" "$APP_DIR/public/Frames_lvl" 2>/dev/null || true
ln -sf "$APP_DIR/frontend/dist/Frames_shop" "$APP_DIR/public/Frames_shop" 2>/dev/null || true

# Fix ownership
echo "[5/6] Fixing permissions..."
chown -R manga:manga "$APP_DIR"

# Restart services
echo "[6/6] Restarting services..."
systemctl restart manga
nginx -t && systemctl reload nginx

echo ""
echo "=== Deploy complete! ==="
echo "Check status:"
echo "  App:    systemctl status manga"
echo "  Redis:  redis-cli ping"
echo "  Nginx:  systemctl status nginx"
echo "  Logs:   journalctl -u manga -f"
