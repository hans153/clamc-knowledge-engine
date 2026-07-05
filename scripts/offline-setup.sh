#!/bin/bash
# Offline deployment setup: pre-download all Docker images and npm packages
set -e

echo "=== Pulling Docker images for offline transfer ==="
docker pull pgvector/pgvector:pg16
docker pull redis:7-alpine
docker pull node:20-alpine
docker pull nginx:alpine
docker pull lpdswing/mineru-web-mineru-api:v3.4.0

echo "=== Saving images to tar ==="
docker save pgvector/pgvector:pg16 redis:7-alpine node:20-alpine nginx:alpine lpdswing/mineru-web-mineru-api:v3.4.0 -o knowledge-engine-images.tar

echo "=== Done ==="
echo "Transfer knowledge-engine-images.tar and project directory to target server."
echo "On target: docker load -i knowledge-engine-images.tar && docker compose up -d"
