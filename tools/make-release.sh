#!/bin/bash
# Usage: tools/make-release.sh <from-tag> <to-tag> <out-dir>
# Builds two zips: <to-tag>-update.zip (only files changed since <from-tag>: upload over the live site)
# and <to-tag>-full.zip (the whole site). Never includes wip/, docs/, tools/ or config.php.
set -e
cd "$(dirname "$0")/.."
FROM=$1; TO=$2; OUT=${3:-.}
EX=(':!wip' ':!docs' ':!tools' ':!.gitignore' ':!README.md' ':!HANDOVER.md' ':!RELEASES.md')
git diff --name-only --diff-filter=d "$FROM" "$TO" -- . "${EX[@]}" > /tmp/changed.txt
git archive --format=zip -o "$OUT/$TO-update.zip" "$TO" -- $(cat /tmp/changed.txt)
git archive --format=zip -o "$OUT/$TO-full.zip" "$TO" -- . "${EX[@]}"
echo "changed files since $FROM:"; cat /tmp/changed.txt; ls -la "$OUT/$TO-update.zip" "$OUT/$TO-full.zip"
