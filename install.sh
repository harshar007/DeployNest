#!/usr/bin/env bash

# ==============================================================================
# DeployNest One-Click Installer for Ubuntu Server & Linux
# ==============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "============================================================"
echo "         DeployNest - Centralized CI/CD Hub                "
echo "           Ubuntu Server Auto-Installer                    "
echo "============================================================"
echo -e "${NC}"

# 1. Check Root / Sudo privileges
if [ "$EUID" -ne 0 ]; then
    echo -e "${YELLOW}[!] Note: Running without root. Some Docker installation steps may request sudo password.${NC}"
    SUDO="sudo"
else
    SUDO=""
fi

# 2. Check Docker Installation
echo -e "${GREEN}[1/5] Checking Docker installation...${NC}"
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}[->] Docker is not installed. Installing Docker automatically via official script...${NC}"
    $SUDO apt-get update -y
    $SUDO apt-get install -y curl ca-certificates gnupg
    curl -fsSL https://get.docker.com | sh
    $SUDO usermod -aG docker $USER 2>/dev/null || true
    echo -e "${GREEN}[✓] Docker installed successfully.${NC}"
else
    echo -e "${GREEN}[✓] Docker is already installed: $(docker --version)${NC}"
fi

# 3. Check Docker Compose
echo -e "${GREEN}[2/5] Checking Docker Compose...${NC}"
if ! docker compose version &> /dev/null; then
    echo -e "${YELLOW}[->] Installing Docker Compose plugin...${NC}"
    $SUDO apt-get update -y
    $SUDO apt-get install -y docker-compose-plugin
fi
echo -e "${GREEN}[✓] Docker Compose ready: $(docker compose version)${NC}"

# 4. Prepare Environment & Security Keys
echo -e "${GREEN}[3/5] Setting up environment configuration...${NC}"
mkdir -p ./data

if [ ! -f .env ]; then
    echo -e "${YELLOW}[->] Generating secure .env configuration with random encryption keys...${NC}"
    
    JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 32)
    ENCRYPTION_KEY=$(openssl rand -hex 16 2>/dev/null || head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 32)
    WEBHOOK_SECRET=$(openssl rand -hex 16 2>/dev/null || head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 32)

    cat <<EOF > .env
# DeployNest Environment Settings
HOST=0.0.0.0
PORT=29870
NODE_ENV=production
DATABASE_URL="file:./data/deploynest.db"
DEPLOYMENT_ROOT=/app/data/deployments

# Auto-Generated Security Keys
JWT_SECRET=${JWT_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
GITHUB_WEBHOOK_SECRET=${WEBHOOK_SECRET}
EOF
    echo -e "${GREEN}[✓] .env file created with unique 256-bit encryption keys.${NC}"
else
    echo -e "${GREEN}[✓] Existing .env file detected.${NC}"
fi

# 5. Build and Launch Container
echo -e "${GREEN}[4/5] Building and launching DeployNest container...${NC}"
$SUDO docker compose up -d --build

# 6. Detect IP Address & Summary
echo -e "${GREEN}[5/5] Detecting server IP address...${NC}"
SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -z "$SERVER_IP" ]; then
    SERVER_IP=$(curl -s --max-time 3 https://ifconfig.me || echo "localhost")
fi

echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}      🚀 DeployNest Successfully Deployed on Ubuntu!        ${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
echo -e "  🌐 Access Dashboard at:  ${BLUE}http://${SERVER_IP}:29870${NC}"
echo -e "  📁 Data Directory:        ./data"
echo -e "  🐳 Container Status:      $SUDO docker compose ps"
echo -e "  📜 View Live Logs:        $SUDO docker compose logs -f"
echo ""
echo -e "${YELLOW}Initial setup guide:${NC}"
echo -e "  1. Open ${BLUE}http://${SERVER_IP}:29870${NC} in your web browser."
echo -e "  2. Complete the initial Admin account creation."
echo -e "  3. Connect your GitHub PAT to start deploying projects!"
echo ""
