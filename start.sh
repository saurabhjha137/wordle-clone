#!/usr/bin/env bash
set -e

# ---------------------------------------------------------------------------
# Color helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

ok()   { printf "${GREEN}[OK]${NC}    %s\n" "$1"; }
warn() { printf "${YELLOW}[WARN]${NC}  %s\n" "$1"; }
err()  { printf "${RED}[ERROR]${NC} %s\n" "$1" >&2; }

# ---------------------------------------------------------------------------
# Resolve script directory so all paths work from any cwd
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

BACKEND_PORT=8000
FRONTEND_PORT=5173

printf "\n${BOLD}=== Wordle Elite — startup ===${NC}\n"
printf "  Backend  → http://localhost:%s\n" "${BACKEND_PORT}"
printf "  Frontend → http://localhost:%s\n" "${FRONTEND_PORT}"
printf "\n"

# ---------------------------------------------------------------------------
# 1. Ensure backend/.env exists
# ---------------------------------------------------------------------------
ENV_FILE="${SCRIPT_DIR}/backend/.env"
ENV_EXAMPLE="${SCRIPT_DIR}/backend/.env.example"

if [ ! -f "${ENV_FILE}" ]; then
    if [ -f "${ENV_EXAMPLE}" ]; then
        cp "${ENV_EXAMPLE}" "${ENV_FILE}"
        warn "backend/.env was missing — copied from .env.example."
        warn "Open backend/.env and set JWT_SECRET before running again."
    else
        err "backend/.env.example not found; cannot create backend/.env."
    fi
    exit 1
fi
ok "backend/.env present"

# ---------------------------------------------------------------------------
# 2. Create Python virtual environment if absent
# ---------------------------------------------------------------------------
VENV_DIR="${SCRIPT_DIR}/backend/.venv"
FRESH_VENV=0

if [ ! -d "${VENV_DIR}" ]; then
    printf "Creating Python virtual environment...\n"
    python3 -m venv "${VENV_DIR}"
    ok "Created backend/.venv"
    FRESH_VENV=1
else
    ok "backend/.venv present"
fi

# ---------------------------------------------------------------------------
# 3. Install Python requirements when needed
# ---------------------------------------------------------------------------
SENTINEL="${VENV_DIR}/.installed"
REQUIREMENTS="${SCRIPT_DIR}/backend/requirements.txt"

NEEDS_INSTALL=0
if [ "${FRESH_VENV}" = "1" ]; then
    NEEDS_INSTALL=1
elif [ ! -f "${SENTINEL}" ]; then
    NEEDS_INSTALL=1
elif [ -f "${REQUIREMENTS}" ] && [ "${REQUIREMENTS}" -nt "${SENTINEL}" ]; then
    NEEDS_INSTALL=1
fi

if [ "${NEEDS_INSTALL}" = "1" ]; then
    printf "Installing Python dependencies...\n"
    "${VENV_DIR}/bin/pip" install --quiet -r "${REQUIREMENTS}"
    touch "${SENTINEL}"
    ok "Python dependencies installed"
else
    ok "Python dependencies up to date"
fi

# ---------------------------------------------------------------------------
# 4. Install frontend npm dependencies if node_modules is absent
# ---------------------------------------------------------------------------
if [ ! -d "${SCRIPT_DIR}/frontend/node_modules" ]; then
    printf "Installing frontend npm dependencies...\n"
    (cd "${SCRIPT_DIR}/frontend" && npm install)
    ok "Frontend npm dependencies installed"
else
    ok "Frontend node_modules present"
fi

# ---------------------------------------------------------------------------
# 5. Build frontend if dist is absent
# ---------------------------------------------------------------------------
if [ ! -d "${SCRIPT_DIR}/frontend/dist" ]; then
    printf "Building frontend...\n"
    (cd "${SCRIPT_DIR}/frontend" && npm run build)
    ok "Frontend built → frontend/dist/"
else
    ok "Frontend dist present"
fi

# ---------------------------------------------------------------------------
# 6. Start backend in background, logging to backend/server.log
# ---------------------------------------------------------------------------
LOG_FILE="${SCRIPT_DIR}/backend/server.log"
printf "Starting backend on port %s (log: backend/server.log)...\n" "${BACKEND_PORT}"

(
    cd "${SCRIPT_DIR}/backend"
    # shellcheck source=/dev/null
    . "${VENV_DIR}/bin/activate"
    exec uvicorn main:app --reload --port "${BACKEND_PORT}"
) >> "${LOG_FILE}" 2>&1 &
BACKEND_PID=$!
ok "Backend started (PID ${BACKEND_PID})"

# ---------------------------------------------------------------------------
# 8. Cleanup trap — kill backend when the script exits
# ---------------------------------------------------------------------------
cleanup() {
    printf "\n"
    warn "Shutting down…"
    if kill -0 "${BACKEND_PID}" 2>/dev/null; then
        kill "${BACKEND_PID}"
        wait "${BACKEND_PID}" 2>/dev/null || true
        ok "Backend stopped"
    fi
}
trap cleanup INT TERM EXIT

# ---------------------------------------------------------------------------
# 7. Start frontend dev server in the foreground
# ---------------------------------------------------------------------------
printf "\n${GREEN}Both servers starting.${NC}  Press Ctrl-C to stop.\n\n"
(cd "${SCRIPT_DIR}/frontend" && npm run dev)
