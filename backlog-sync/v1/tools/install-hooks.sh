#!/usr/bin/env bash
# Active les hooks versionnes dans tools/hooks. Idempotent. A refaire a chaque clone
# (la configuration des hooks est locale a .git/config).
set -eu
cd "$(git rev-parse --show-toplevel)"
git config core.hooksPath tools/hooks
chmod +x tools/hooks/* tools/*.sh 2>/dev/null || true
echo "Hooks actifs : $(git config core.hooksPath)"
