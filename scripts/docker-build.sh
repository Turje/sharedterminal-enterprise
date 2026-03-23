#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Building SharedTerminal Docker image..."
docker build -t sharedterminal:latest "$PROJECT_ROOT/docker"
echo "Done! Image: sharedterminal:latest"
