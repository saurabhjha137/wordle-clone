#!/bin/bash
# Deploy Wordle Elite (wordleee) to Azure
#
# Frontend  → Azure Blob Storage static website (wordleclonesaurabhjha137)
# Backend   → Azure Functions consumption plan  (wordleee-api)
#             FastAPI is wrapped via AsgiFunctionApp — no VM quota needed.
#
# Prerequisites:
#   az login          (Azure CLI authenticated)
#   backend/.env      must exist with JWT_SECRET set
#
# Usage: ./deploy-azure.sh

set -e
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
ENV_FILE="$BACKEND_DIR/.env"

RG="wordle-rg"
LOCATION="eastus"           # storage account region
FUNC_LOCATION="eastus2"    # separate region — eastus has Linux consumption plan conflicts
STORAGE_ACCOUNT="wordleee"
FUNC_APP="wordleee-api"
SUBSCRIPTION=$(az account show --query id --output tsv)

echo ""
echo -e "${CYAN}==> Deploying Wordle Elite to Azure${NC}"
echo "    Subscription    : $SUBSCRIPTION"
echo "    Resource Group  : $RG"
echo "    Storage Account : $STORAGE_ACCOUNT  (frontend + Functions runtime)"
echo "    Function App    : $FUNC_APP          (backend FastAPI via ASGI)"
echo ""

# ── Preflight ─────────────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  echo -e "${RED}ERROR: backend/.env not found.${NC}"
  echo "       cp backend/.env.example backend/.env  then set JWT_SECRET."
  exit 1
fi

JWT_SECRET=$(grep -E "^JWT_SECRET=" "$ENV_FILE" | cut -d= -f2- | tr -d '"' | tr -d "'")
if [ -z "$JWT_SECRET" ] || echo "$JWT_SECRET" | grep -q "REPLACE_ME"; then
  echo -e "${RED}ERROR: JWT_SECRET is not set in backend/.env${NC}"
  echo "       Generate one: python3 -c \"import secrets; print(secrets.token_hex(32))\""
  exit 1
fi

ROOT_USER=$(grep -E "^ROOT_USER=" "$ENV_FILE" | cut -d= -f2- | tr -d '"' | tr -d "'" || echo "admin")

# ── [1/6] Build frontend ───────────────────────────────────────────────────
echo "[1/6] Building frontend..."
FUNC_URL="https://${FUNC_APP}.azurewebsites.net"
cd "$FRONTEND_DIR"
[ ! -d node_modules ] && npm install --silent
VITE_API_URL="$FUNC_URL" npm run build -- --logLevel silent
echo -e "${GREEN}      Done.${NC}"
cd "$SCRIPT_DIR"

# ── [2/6] Enable static website + upload frontend ─────────────────────────
echo "[2/6] Enabling static website..."
az storage blob service-properties update \
  --account-name "$STORAGE_ACCOUNT" \
  --static-website \
  --index-document "index.html" \
  --404-document "index.html" \
  --auth-mode login \
  --output none
echo -e "${GREEN}      Done.${NC}"

echo "[3/6] Uploading frontend build..."
az storage blob upload-batch \
  --account-name "$STORAGE_ACCOUNT" \
  --source "$FRONTEND_DIR/dist" \
  --destination '$web' \
  --overwrite \
  --content-cache-control "no-cache, no-store, must-revalidate" \
  --auth-mode key \
  --output none
echo -e "${GREEN}      Done.${NC}"

FRONTEND_URL=$(az storage account show \
  --name "$STORAGE_ACCOUNT" \
  --resource-group "$RG" \
  --query "primaryEndpoints.web" \
  --output tsv | sed 's|/$||')

# ── [3/6] Create Function App (consumption plan — no VM quota needed) ──────
echo "[4/6] Creating Function App (if needed)..."
EXISTS=$(az functionapp list --resource-group "$RG" \
  --query "[?name=='$FUNC_APP'] | length(@)" -o tsv 2>/dev/null || echo 0)

if [ "${EXISTS:-0}" -eq 0 ] 2>/dev/null; then
  az functionapp create \
    --name "$FUNC_APP" \
    --resource-group "$RG" \
    --storage-account "$STORAGE_ACCOUNT" \
    --consumption-plan-location "$FUNC_LOCATION" \
    --runtime python \
    --runtime-version "3.12" \
    --functions-version 4 \
    --os-type Linux \
    --subscription "$SUBSCRIPTION" \
    --output none
  echo -e "${GREEN}      Created.${NC}"
else
  echo "      Already exists."
fi

# ── [4/6] Set app settings ─────────────────────────────────────────────────
echo "[5/6] Setting environment variables..."
az functionapp config appsettings set \
  --name "$FUNC_APP" \
  --resource-group "$RG" \
  --settings \
    JWT_SECRET="$JWT_SECRET" \
    ROOT_USER="$ROOT_USER" \
    DATABASE_URL="sqlite:////tmp/wordleee.db" \
    CORS_ORIGIN="$FRONTEND_URL" \
    AzureWebJobsFeatureFlags="EnableWorkerIndexing" \
    ENABLE_ORYX_BUILD="true" \
  --output none
echo -e "${GREEN}      Done.${NC}"

# Azure Functions intercepts OPTIONS preflights before FastAPI sees them,
# so CORS must also be registered at the platform level.
az functionapp cors add --name "$FUNC_APP" --resource-group "$RG" \
  --allowed-origins "$FRONTEND_URL" --output none 2>/dev/null || true
az functionapp cors add --name "$FUNC_APP" --resource-group "$RG" \
  --allowed-origins "http://localhost:5173" --output none 2>/dev/null || true
az functionapp cors add --name "$FUNC_APP" --resource-group "$RG" \
  --allowed-origins "http://127.0.0.1:5173" --output none 2>/dev/null || true

# ── [5/6] Deploy backend via func CLI (installs packages on Azure) ─────────
echo "[6/6] Deploying backend via func CLI..."
# Clear Run-From-Package settings that conflict with func publish
az functionapp config appsettings delete \
  --name "$FUNC_APP" \
  --resource-group "$RG" \
  --setting-names WEBSITE_RUN_FROM_PACKAGE WEBSITE_USE_ZIP \
  --output none 2>/dev/null || true

cd "$BACKEND_DIR"
func azure functionapp publish "$FUNC_APP" --python
echo -e "${GREEN}      Done.${NC}"
cd "$SCRIPT_DIR"

# ── Summary ────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}==> Deploy complete!${NC}"
echo ""
echo -e "    Frontend  : ${CYAN}${FRONTEND_URL}${NC}"
echo -e "    Backend   : ${CYAN}${FUNC_URL}${NC}"
echo -e "    API Docs  : ${CYAN}${FUNC_URL}/docs${NC}"
echo -e "    Health    : ${CYAN}${FUNC_URL}/api/health${NC}"
echo ""
echo -e "${YELLOW}Note: SQLite lives in /tmp on the Function instance.${NC}"
echo "      Data resets when the instance cold-starts."
echo "      For persistence, swap DATABASE_URL to Azure SQL or Postgres."
echo ""
