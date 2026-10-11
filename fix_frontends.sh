#!/bin/bash

# Exit on any error
set -e

echo "=========================================================="
echo "⚡ Starting Frontend Fix & Clean Installation Script ⚡"
echo "=========================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "👉 Step 1: Stopping existing Vite dev servers..."
VITE_PIDS=$(pgrep -f vite || true)
if [ -n "$VITE_PIDS" ]; then
  echo "Found running Vite PIDs: $VITE_PIDS. Killing them..."
  kill -9 $VITE_PIDS || true
  echo "Vite processes terminated."
else
  echo "No active Vite processes found."
fi

echo ""
echo "👉 Step 2: Deleting any leftover node_modules..."
rm -rf "$SCRIPT_DIR/Frontend/node_modules"
rm -rf "$SCRIPT_DIR/payments_frontend/node_modules"
echo "Cleaned node_modules."

echo ""
echo "👉 Step 3: Clearing global npm cache..."
npm cache clean --force

echo ""
echo "👉 Step 4: Installing dependencies for Main Frontend..."
cd "$SCRIPT_DIR/Frontend"
echo "Running npm install (bypassing proxy)..."
env HTTP_PROXY="" HTTPS_PROXY="" http_proxy="" https_proxy="" npm install
echo "✅ Main Frontend dependencies installed successfully!"

echo ""
echo "👉 Step 5: Installing dependencies for Payments Frontend..."
cd "$SCRIPT_DIR/payments_frontend"
echo "Running npm install (bypassing proxy)..."
env HTTP_PROXY="" HTTPS_PROXY="" http_proxy="" https_proxy="" npm install
echo "✅ Payments Frontend dependencies installed successfully!"

echo ""
echo "=========================================================="
echo "🎉 Cleanup and installation finished successfully! 🎉"
echo "=========================================================="
echo "You can now start the dev servers by running:"
echo "  - In Frontend: npm run dev"
echo "  - In payments_frontend: npm run dev"
echo "=========================================================="
