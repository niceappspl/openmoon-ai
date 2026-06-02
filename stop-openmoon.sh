#!/bin/bash

echo "Stopping openMOON..."

pkill -f "node.*mcp-servers" 2>/dev/null
pkill -f "openmoon" 2>/dev/null
pkill -f "cargo.*openmoon" 2>/dev/null
pkill -f "tauri dev" 2>/dev/null

sleep 1

if pgrep -f "openmoon|mcp-servers" > /dev/null; then
    pkill -9 -f "openmoon" 2>/dev/null
    pkill -9 -f "mcp-servers" 2>/dev/null
fi

echo "openMOON stopped."
