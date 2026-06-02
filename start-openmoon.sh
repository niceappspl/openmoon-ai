#!/bin/bash

# openMOON startup — run from repo root: ./start-openmoon.sh

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Starting openMOON..."

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

is_running() {
    pgrep -f "$1" > /dev/null
}

echo -e "${YELLOW}Cleaning up existing processes...${NC}"
pkill -f "node.*mcp-servers" 2>/dev/null
pkill -f "openmoon" 2>/dev/null
pkill -f "tauri dev" 2>/dev/null
sleep 2

echo -e "\n${YELLOW}1. Starting MCP servers...${NC}"
cd "$ROOT/mcp-servers"

if ! command -v npm &> /dev/null; then
    echo -e "${RED}npm not found. Install Node.js${NC}"
    exit 1
fi

for server in automation filesystem browser media productivity; do
    echo -e "${YELLOW}   Starting $server...${NC}"
    cd "$ROOT/mcp-servers/$server"
    if [ -f "package.json" ]; then
        npm start > "/tmp/mcp_$server.log" 2>&1 &
        sleep 1
    else
        echo -e "${RED}   No package.json for $server${NC}"
    fi
done

sleep 5

echo -e "\n${YELLOW}2. Starting openMOON (Tauri)...${NC}"
cd "$ROOT"

if [ -f ".env" ]; then
    set -a
    # shellcheck source=/dev/null
    source .env
    set +a
    echo -e "${GREEN}Environment loaded from .env${NC}"
else
    echo -e "${YELLOW}No .env file — using system environment${NC}"
fi

npm run tauri:dev &
APP_PID=$!

sleep 5

echo -e "\n${GREEN}openMOON status${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

for server in automation filesystem browser media productivity; do
    if [ -f "/tmp/mcp_$server.log" ] && grep -q "running on stdio" "/tmp/mcp_$server.log"; then
        echo -e "${GREEN}MCP $server: running${NC}"
    else
        echo -e "${RED}MCP $server: not running (see /tmp/mcp_$server.log)${NC}"
    fi
done

if is_running "openmoon"; then
    echo -e "${GREEN}openMOON: running${NC}"
else
    echo -e "${RED}openMOON: not detected (tauri dev may still be building)${NC}"
fi

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "\n${GREEN}Ready. Cmd+Shift+Space to open.${NC}"
echo -e "${YELLOW}Stop: ./stop-openmoon.sh${NC}"

wait $APP_PID
