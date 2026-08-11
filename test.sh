#!/usr/bin/env bash
# Pipe the sample payload through a generated statusline script.
set -euo pipefail
script="${1:-statusline.js}"
if [ ! -f "$script" ]; then
  echo "usage: ./test.sh path/to/statusline.js" >&2
  exit 1
fi
node "$script" < sample-payload.json
echo
