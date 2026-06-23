#!/bin/bash
# Deploy Wordle backend (Azure Functions) to Azure
# Run once to create infra, then again to redeploy code
#
# Prerequisites:
#   az login
#   pip install azure-functions-core-tools  (or: npm i -g azure-functions-core-tools@4)
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
STORAGE_ACCOUNT="wordleclonesaurabhjha137"   # reuse existing storage account
LOCATION="eastus"
BACKEND_DIR="$(dirname "$0")/backend"
SUBSCRIPTION=$(az account show --query id --output tsv)

echo ""
echo "==> Deploying Wordle Backend (Python Functions)"
echo "    Function App : $FUNC_APP"
echo "    Subscription : $SUBSCRIPTION"
echo ""

# 1. Create Function App (Python 3.11, consumption = free)
echo "[1/4] Creating Function App..."
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
echo "[2/4] Configuring CORS..."
az functionapp cors add \
  --name "$FUNC_APP" \
  --resource-group "$RESOURCE_GROUP" \
  --allowed-origins "https://${STORAGE_ACCOUNT}.z13.web.core.windows.net" "http://localhost:5500" "http://127.0.0.1:5500" \
  --subscription "$SUBSCRIPTION" \
  --output none
echo "      Done."

# 3. Set app settings (COSMOS_CONNECTION_STRING and JWT_SECRET must be set manually)
echo "[3/4] Reminder — set these secrets in the Azure Portal or run:"
echo ""
echo "   az functionapp config appsettings set \\"
echo "     --name $FUNC_APP \\"
echo "     --resource-group $RESOURCE_GROUP \\"
echo "     --settings \\"
echo "       COSMOS_CONNECTION_STRING=\"<your-cosmos-connection-string>\" \\"
echo "       JWT_SECRET=\"#Hash-DASH@Studios007\""
echo ""

# 4. Deploy function code
echo "[4/4] Deploying function code..."
cd "$BACKEND_DIR"
func azure functionapp publish "$FUNC_APP" --python

echo ""
echo "==> Deploy complete!"
echo ""
echo "    API Base URL:"
echo "    https://${FUNC_APP}.azurewebsites.net/api"
echo ""
echo "    Update frontend/config.js with this URL, then redeploy the frontend:"
echo "    ./deploy-azure.sh wordleclonesaurabhjha137"
echo ""
