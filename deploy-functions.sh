#!/bin/bash
# Deploy Wordle backend (Azure Functions) to Azure
# Run once to create infra, then again to redeploy code
#
# Secrets are read automatically from backend/local.settings.json
# (gitignored — never commit that file)
#
# Usage: ./deploy-functions.sh <function-app-name>
# Example: ./deploy-functions.sh wordle-api-jsaurabh

set -e

FUNC_APP="${1}"

if [ -z "$FUNC_APP" ]; then
  echo "Usage: ./deploy-functions.sh <function-app-name>"
  echo "Example: ./deploy-functions.sh wordle-api-jsaurabh"
  exit 1
fi

RESOURCE_GROUP="wordle-rg"
STORAGE_ACCOUNT="wordleclonesaurabhjha137"
LOCATION="eastus"
BACKEND_DIR="$(dirname "$0")/backend"
LOCAL_SETTINGS="$BACKEND_DIR/local.settings.json"
SUBSCRIPTION=$(az account show --query id --output tsv)

echo ""
echo "==> Deploying Wordle Backend (Python Functions)"
echo "    Function App : $FUNC_APP"
echo "    Subscription : $SUBSCRIPTION"
echo ""

# 1. Create Function App (Python 3.11, consumption = free)
echo "[1/5] Creating Function App..."
az functionapp create \
  --name "$FUNC_APP" \
  --resource-group "$RESOURCE_GROUP" \
  --storage-account "$STORAGE_ACCOUNT" \
  --consumption-plan-location "$LOCATION" \
  --runtime python \
  --runtime-version "3.11" \
  --functions-version 4 \
  --os-type Linux \
  --subscription "$SUBSCRIPTION" \
  --output none 2>/dev/null || echo "      Already exists, continuing."
echo "      Done."

# 2. Set CORS (allow frontend origin)
echo "[2/5] Configuring CORS..."
az functionapp cors add \
  --name "$FUNC_APP" \
  --resource-group "$RESOURCE_GROUP" \
  --allowed-origins "https://${STORAGE_ACCOUNT}.z13.web.core.windows.net" "http://localhost:5500" "http://127.0.0.1:5500" \
  --subscription "$SUBSCRIPTION" \
  --output none 2>/dev/null || true
echo "      Done."

# 3. Deploy function code
echo "[3/5] Deploying function code..."
cd "$BACKEND_DIR"
func azure functionapp publish "$FUNC_APP" --python
cd - > /dev/null

# 4. Apply production secrets (always runs — re-applies after every deploy)
echo "[4/5] Applying production secrets..."
if [ -f "$LOCAL_SETTINGS" ]; then
  COSMOS_CS=$(python3 -c "import json,sys; d=json.load(open('$LOCAL_SETTINGS')); print(d['Values']['COSMOS_CONNECTION_STRING'])" 2>/dev/null || echo "")
  JWT_SEC=$(python3 -c "import json,sys; d=json.load(open('$LOCAL_SETTINGS')); print(d['Values']['JWT_SECRET'])" 2>/dev/null || echo "")

  if [ -n "$COSMOS_CS" ] && [ -n "$JWT_SEC" ]; then
    az functionapp config appsettings set \
      --name "$FUNC_APP" \
      --resource-group "$RESOURCE_GROUP" \
      --settings \
        COSMOS_CONNECTION_STRING="$COSMOS_CS" \
        JWT_SECRET="$JWT_SEC" \
      --subscription "$SUBSCRIPTION" \
      --output none
    echo "      Done."
  else
    echo "      WARNING: Could not read secrets from $LOCAL_SETTINGS"
    echo "      Set them manually:"
    echo "      COSMOS_CONNECTION_STRING=<your-connection-string>"
    echo "      JWT_SECRET=<your-jwt-secret>"
  fi
else
  echo "      WARNING: $LOCAL_SETTINGS not found."
  echo "      Set COSMOS_CONNECTION_STRING and JWT_SECRET in Azure Portal."
fi

# 5. Verify
echo "[5/5] Verifying secrets are set..."
SETTINGS=$(az functionapp config appsettings list \
  --name "$FUNC_APP" \
  --resource-group "$RESOURCE_GROUP" \
  --query "[?name=='COSMOS_CONNECTION_STRING' || name=='JWT_SECRET'].name" \
  -o tsv 2>/dev/null)

if echo "$SETTINGS" | grep -q "COSMOS_CONNECTION_STRING"; then
  echo "      COSMOS_CONNECTION_STRING ✓"
else
  echo "      COSMOS_CONNECTION_STRING ✗ (MISSING)"
fi
if echo "$SETTINGS" | grep -q "JWT_SECRET"; then
  echo "      JWT_SECRET               ✓"
else
  echo "      JWT_SECRET               ✗ (MISSING)"
fi

echo ""
echo "==> Deploy complete!"
echo ""
echo "    API Base URL:"
echo "    https://${FUNC_APP}.azurewebsites.net/api"
echo ""
