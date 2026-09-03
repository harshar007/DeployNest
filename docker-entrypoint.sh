#!/bin/sh
set -e

echo "==> Ensuring deployment data directories exist..."
mkdir -p /app/data/deployments
chmod -R 777 /app/data 2>/dev/null || true

echo "==> Pushing Prisma database schema..."
npx prisma db push --skip-generate

echo "==> Starting DeployNest application..."
exec "$@"

