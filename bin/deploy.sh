#!/usr/bin/env bash
#
# Bring the bot on this server up to date with the repository.
#
# The bot runs as a Forge background process rather than as a site, so nothing
# pulls or builds it when a commit is pushed - the website deploys itself and
# the bot quietly stays on whatever was last built here by hand. The first sign
# of that is one endpoint answering 404 while every other one works, which is a
# miserable thing to debug.
#
# Run this, then restart the "Discord Bot" process in Forge. It does not restart
# anything itself: the process is Forge's to manage, and a script that killed it
# would leave the bot down if the build below failed.
#
# Usage, from anywhere:
#     /home/forge/primegdkp-discordbot/bin/deploy.sh

set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Pulling"
# --ff-only so a dirty or diverged checkout stops here rather than being
# merged into something nobody has ever run.
git pull --ff-only

echo "==> Installing"
# ci rather than install: the lockfile is what was tested, and a deploy is not
# the moment to find out what a newer minor version does.
npm ci

echo "==> Building"
npm run build

echo
echo "Built $(git rev-parse --short HEAD) - $(git log -1 --pretty=%s)"
echo
echo "Now restart the Discord Bot process in Forge, then check it came back on this build:"
echo "    curl -s localhost:3001/api/health"
