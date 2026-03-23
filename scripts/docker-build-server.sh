#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Building SharedTerminal Enterprise server image..."

# Build the application first
cd "$PROJECT_ROOT"
npm run build

# Build the server Docker image
docker build \
  -t sharedterminal-server:latest \
  -f docker/Dockerfile.server \
  .

echo "Server image built: sharedterminal-server:latest"
echo ""
echo "To deploy:"
echo "  cd deploy && docker-compose up -d"
