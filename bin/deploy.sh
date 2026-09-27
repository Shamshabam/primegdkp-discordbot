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
# Usage, from anywhere:
#     /home/forge/primegdkp-discordbot/bin/deploy.sh

set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Pulling"
# --ff-only so a dirty or diverged checkout stops here rather than being merged
# into something nobody has ever run. package-lock.json is the one that goes
# out of step, because installing on the server rewrites it - and the lockfile
# the repository holds is the one that was tested.
git checkout -- package-lock.json 2>/dev/null || true
git pull --ff-only

echo "==> Installing"
# ci rather than install: the lockfile is what was tested, and a deploy is not
# the moment to find out what a newer minor version does.
npm ci

echo "==> Building"
npm run build

# Only now. Everything above exits non-zero on failure and set -e stops the
# script, so a build that does not compile leaves the running bot alone rather
# than taking it down and putting nothing back.
echo "==> Restarting"
# Supervisor owns the process and restarts it when it dies, so stopping it is
# how it gets restarted. No match means it was not running, which is not a
# failure - it will be started by supervisor either way.
pkill -f "$(pwd)/dist/index.js" || true

echo
echo "Built $(git rev-parse --short HEAD) - $(git log -1 --pretty=%s)"
echo
echo "Give it a few seconds, then check it came back on this build:"
echo "    curl -s localhost:3001/api/health"
