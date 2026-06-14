#!/bin/bash
# Auto-deploy: check for new commits and deploy
set -e

cd /home/ubuntu/saasumkm-be || exit 1

# Save current HEAD
OLD_HEAD=$(git rev-parse HEAD)

# Fetch without merging
git fetch origin main 2>&1

# Check if remote has new commits
REMOTE_HEAD=$(git rev-parse origin/main 2>/dev/null || echo "")
if [ "$REMOTE_HEAD" = "" ] || [ "$REMOTE_HEAD" = "$OLD_HEAD" ]; then
    exit 0  # No updates
fi

echo "[autodeploy] New commit detected: $OLD_HEAD → $REMOTE_HEAD"

# Pull and deploy
git pull origin main 2>&1
npm install --production=false 2>&1
npx prisma generate 2>&1
npx prisma migrate deploy 2>&1
npx tsc 2>&1
pm2 restart saasumkm-be 2>&1

echo "[autodeploy] Deployed successfully"
