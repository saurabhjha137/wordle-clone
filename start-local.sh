#!/bin/bash
# Start wordle-clone frontend locally.
#
# The backend for wordle-clone is Azure Functions + CosmosDB.
# It is not included here. The live API at:
#   https://wordle-api-jsaurabh.azurewebsites.net/api
# is used by default while it remains deployed.
#
# Usage: ./start-local.sh [port]   default port 5500

set -e
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
PORT="${1:-5500}"

echo ""
echo -e "${CYAN}==> Starting wordle-clone locally${NC}"
echo "    Frontend : $FRONTEND_DIR"
echo "    Port     : $PORT"
echo ""

# Check that the frontend exists
if [ ! -f "$FRONTEND_DIR/index.html" ]; then
  echo -e "${RED}ERROR: $FRONTEND_DIR/index.html not found.${NC}"
  exit 1
fi

# Try python3 first, fall back to npx serve
if command -v python3 > /dev/null 2>&1; then
  echo -e "${GREEN}    Serving with python3 http.server${NC}"
  echo -e "    Open ${CYAN}http://localhost:${PORT}${NC}  (Ctrl-C to stop)"
  echo ""
  cd "$FRONTEND_DIR"
  exec python3 -m http.server "$PORT"
elif command -v npx > /dev/null 2>&1; then
  echo -e "${GREEN}    Serving with npx serve${NC}"
  echo -e "    Open ${CYAN}http://localhost:${PORT}${NC}  (Ctrl-C to stop)"
  echo ""
  exec npx serve "$FRONTEND_DIR" -l "$PORT"
else
  echo -e "${YELLOW}Neither python3 nor npx found.${NC}"
  echo "Install either Python 3 or Node.js, then re-run."
  exit 1
fi
