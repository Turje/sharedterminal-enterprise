#!/usr/bin/env bash
set -euo pipefail

# ─── SharedTerminal Demo Server Setup ───────────────────────────
# Run this on a fresh Ubuntu 22.04+ VPS (DigitalOcean, Oracle, AWS, etc.)
# Usage: curl -sSL <raw-github-url>/demo/setup.sh | bash
# ─────────────────────────────────────────────────────────────────

ACCENT='\033[38;2;218;119;86m'
GREEN='\033[32m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

echo ""
echo -e "  ${ACCENT}${BOLD}SharedTerminal${RESET} — Demo Server Setup"
echo -e "  ${DIM}────────────────────────────────────${RESET}"
echo ""

# 1. Install Docker if missing
if ! command -v docker &>/dev/null; then
  echo -e "  ${DIM}Installing Docker...${RESET}"
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"
  echo -e "  ${GREEN}✓${RESET} Docker installed"
else
  echo -e "  ${GREEN}✓${RESET} Docker already installed"
fi

# 2. Install Node.js 20 if missing
if ! command -v node &>/dev/null; then
  echo -e "  ${DIM}Installing Node.js 20...${RESET}"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
  echo -e "  ${GREEN}✓${RESET} Node.js installed"
else
  echo -e "  ${GREEN}✓${RESET} Node.js $(node -v) already installed"
fi

# 3. Install Caddy (reverse proxy with auto-HTTPS)
if ! command -v caddy &>/dev/null; then
  echo -e "  ${DIM}Installing Caddy...${RESET}"
  sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
  sudo apt-get update
  sudo apt-get install -y caddy
  echo -e "  ${GREEN}✓${RESET} Caddy installed"
else
  echo -e "  ${GREEN}✓${RESET} Caddy already installed"
fi

# 4. Clone and build SharedTerminal
INSTALL_DIR="$HOME/sharedterminal"
if [ ! -d "$INSTALL_DIR" ]; then
  echo -e "  ${DIM}Cloning SharedTerminal...${RESET}"
  git clone https://github.com/Turje/sharedterminal-enterprise.git "$INSTALL_DIR"
else
  echo -e "  ${DIM}Updating SharedTerminal...${RESET}"
  cd "$INSTALL_DIR" && git pull
fi

cd "$INSTALL_DIR"
echo -e "  ${DIM}Building...${RESET}"
npm install --production=false
npm run build
npm run docker:build 2>/dev/null || npm run build:docker 2>/dev/null || true
echo -e "  ${GREEN}✓${RESET} SharedTerminal built"

# 5. Copy demo project
DEMO_PROJECT="$HOME/demo-project"
if [ ! -d "$DEMO_PROJECT" ]; then
  cp -r "$INSTALL_DIR/demo/sample-project" "$DEMO_PROJECT"
  echo -e "  ${GREEN}✓${RESET} Demo project copied to $DEMO_PROJECT"
fi

# 6. Configure Caddy reverse proxy
DEMO_DOMAIN="${DEMO_DOMAIN:-demo.sharedterminal.dev}"
sudo tee /etc/caddy/Caddyfile >/dev/null <<CADDY
$DEMO_DOMAIN {
    reverse_proxy localhost:3000 {
        header_up X-Forwarded-Proto {scheme}
    }
}
CADDY

sudo systemctl restart caddy
echo -e "  ${GREEN}✓${RESET} Caddy configured for $DEMO_DOMAIN"

# 7. Create systemd service
sudo tee /etc/systemd/system/sharedterminal-demo.service >/dev/null <<UNIT
[Unit]
Description=SharedTerminal Demo
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR
Environment=NODE_ENV=production
Environment=HOST=0.0.0.0
Environment=PORT=3000
Environment=TUNNEL_ENABLED=false
Environment=SERVER_URL=https://$DEMO_DOMAIN
ExecStart=$(which node) dist/cli/index.js --path $DEMO_PROJECT --public
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable sharedterminal-demo
sudo systemctl start sharedterminal-demo
echo -e "  ${GREEN}✓${RESET} Service started"

# 8. Set up session cleanup cron (every 30 min, kill idle sessions)
(crontab -l 2>/dev/null | grep -v sharedterminal; echo "*/30 * * * * docker ps --filter label=sharedterminal --filter status=running --format '{{.ID}} {{.Status}}' | awk '/hours/{print \$1}' | xargs -r docker rm -f") | crontab -
echo -e "  ${GREEN}✓${RESET} Auto-cleanup cron installed"

echo ""
echo -e "  ${GREEN}${BOLD}Done!${RESET} SharedTerminal demo is running."
echo -e "  ${DIM}Live at:${RESET} ${ACCENT}https://$DEMO_DOMAIN${RESET}"
echo ""
echo -e "  ${DIM}Check logs:${RESET} sudo journalctl -u sharedterminal-demo -f"
echo -e "  ${DIM}Public session — no password needed${RESET}"
echo ""
