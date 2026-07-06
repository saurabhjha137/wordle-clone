#!/bin/bash
# Deploy Wordle Elite (wordleee) to Azure
#
# Frontend  → Azure Blob Storage static website (wordleclonesaurabhjha137)
# Backend   → Azure App Service Linux / Python 3.11  (new: wordleee-api)
#
# Prerequisites:
#   az login   (Azure CLI authenticated)
#   backend/.env  must exist and JWT_SECRET must be set
#
# Usage:
#   ./deploy-azure.sh
#
# Resources created / updated in resource group: wordle-rg

set -e
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
ENV_FILE="$BACKEND_DIR/.env"

RG="wordle-rg"
LOCATION="eastus"
STORAGE_ACCOUNT="wordleclonesaurabhjha137"
APP_SERVICE_PLAN="EastUSLinuxDynamicPlan"
WEBAPP_NAME="wordleee-api"
SUBSCRIPTION=$(az account show --query id --output tsv)

echo ""
echo -e "${CYAN}==> Deploying Wordle Elite to Azure${NC}"
echo "    Subscription    : $SUBSCRIPTION"
echo "    Resource Group  : $RG"
echo "    Storage Account : $STORAGE_ACCOUNT  (frontend)"
echo "    Web App         : $WEBAPP_NAME       (backend FastAPI)"
echo ""

# ── Preflight checks ───────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  echo -e "${RED}ERROR: $ENV_FILE not found.${NC}"
  echo "       cp backend/.env.example backend/.env  then set JWT_SECRET."
  exit 1
fi

JWT_SECRET=$(grep -E "^JWT_SECRET=" "$ENV_FILE" | cut -d= -f2- | tr -d '"' | tr -d "'")
if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "REPLACE_ME_with_a_long_random_secret_at_least_32_chars" ]; then
  echo -e "${RED}ERROR: JWT_SECRET is not set in backend/.env${NC}"
  echo "       Generate one:  python3 -c \"import secrets; print(secrets.token_hex(32))\""
  exit 1
fi

DATABASE_URL=$(grep -E "^DATABASE_URL=" "$ENV_FILE" | cut -d= -f2- | tr -d '"' | tr -d "'" || echo "sqlite:///./wordleee.db")
ROOT_USER=$(grep -E "^ROOT_USER=" "$ENV_FILE" | cut -d= -f2- | tr -d '"' | tr -d "'" || echo "admin")

# ── Step 1: Build frontend ─────────────────────────────────────────────────
echo "[1/6] Building frontend..."
cd "$FRONTEND_DIR"
if [ ! -d node_modules ]; then
  npm install --silent
fi
# Point API URL at the new App Service
VITE_API_URL="https://${WEBAPP_NAME}.azurewebsites.net" npm run build
echo -e "${GREEN}      Done.${NC}"
cd "$SCRIPT_DIR"

# ── Step 2: Upload frontend to blob storage ────────────────────────────────
echo "[2/6] Enabling static website on storage account..."
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

# ── Step 3: Create / update App Service Web App ────────────────────────────
echo "[4/6] Creating App Service Web App (if needed)..."
EXISTS=$(az webapp list --resource-group "$RG" --query "[?name=='$WEBAPP_NAME'] | length(@)" -o tsv 2>/dev/null || echo 0)
if [ "$EXISTS" -eq 0 ] 2>/dev/null; then
  az webapp create \
    --name "$WEBAPP_NAME" \
    --resource-group "$RG" \
    --plan "$APP_SERVICE_PLAN" \
    --runtime "PYTHON:3.11" \
    --subscription "$SUBSCRIPTION" \
    --output none
  echo -e "${GREEN}      Created.${NC}"
else
  echo "      Already exists."
fi

# Set startup command and CORS
az webapp config set \
  --name "$WEBAPP_NAME" \
  --resource-group "$RG" \
  --startup-file "gunicorn -w 2 -k uvicorn.workers.UvicornWorker main:app" \
  --output none

FRONTEND_URL=$(az storage account show \
  --name "$STORAGE_ACCOUNT" \
  --resource-group "$RG" \
  --query "primaryEndpoints.web" \
  --output tsv | tr -d '/')

az webapp cors add \
  --name "$WEBAPP_NAME" \
  --resource-group "$RG" \
  --allowed-origins "$FRONTEND_URL" "http://localhost:5173" \
  --output none 2>/dev/null || true

# ── Step 4: Set environment variables ─────────────────────────────────────
echo "[5/6] Setting environment variables..."
az webapp config appsettings set \
  --name "$WEBAPP_NAME" \
  --resource-group "$RG" \
  --settings \
    JWT_SECRET="$JWT_SECRET" \
    DATABASE_URL="$DATABASE_URL" \
    ROOT_USER="$ROOT_USER" \
    SCM_DO_BUILD_DURING_DEPLOYMENT=true \
  --output none
echo -e "${GREEN}      Done.${NC}"

# ── Step 5: Zip deploy backend ─────────────────────────────────────────────
echo "[6/6] Deploying FastAPI backend (zip deploy)..."
cd "$BACKEND_DIR"

# Build zip excluding venv, db, secrets
zip -r /tmp/wordleee-backend.zip . \
  --exclude ".venv/*" \
  --exclude "*.db" \
  --exclude "*.db-shm" \
  --exclude "*.db-wal" \
  --exclude ".env" \
  --exclude "local.settings.json" \
  --exclude "__pycache__/*" \
  --exclude "*/__pycache__/*" \
  > /dev/null

az webapp deployment source config-zip \
  --name "$WEBAPP_NAME" \
  --resource-group "$RG" \
  --src /tmp/wordleee-backend.zip \
  --output none
rm /tmp/wordleee-backend.zip
echo -e "${GREEN}      Done.${NC}"
cd "$SCRIPT_DIR"

# ── Summary ────────────────────────────────────────────────────────────────
WEBSITE_URL=$(az storage account show \
  --name "$STORAGE_ACCOUNT" \
  --resource-group "$RG" \
  --query "primaryEndpoints.web" \
  --output tsv)

echo ""
echo -e "${GREEN}==> Deploy complete!${NC}"
echo ""
echo -e "    Frontend  : ${CYAN}${WEBSITE_URL}${NC}"
echo -e "    Backend   : ${CYAN}https://${WEBAPP_NAME}.azurewebsites.net${NC}"
echo -e "    API Docs  : ${CYAN}https://${WEBAPP_NAME}.azurewebsites.net/docs${NC}"
echo ""
echo -e "${YELLOW}Note: SQLite DB lives on the App Service filesystem.${NC}"
echo "      Data resets on each deploy / app restart."
echo "      For persistence, swap DATABASE_URL to Azure SQL or Postgres."
echo ""
