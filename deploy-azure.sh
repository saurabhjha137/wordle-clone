#!/bin/bash
# Deploy Wordle Clone frontend to Azure Blob Storage (static website)
# Usage: ./deploy-azure.sh <storage-account-name>
# Example: ./deploy-azure.sh wordleclonesaurabhjha137
#
# Rules for storage account name:
#   - 3 to 24 characters, lowercase letters and numbers only, globally unique

set -e

STORAGE_ACCOUNT="${1}"

if [ -z "$STORAGE_ACCOUNT" ]; then
  echo "Usage: ./deploy-azure.sh <storage-account-name>"
  echo "Example: ./deploy-azure.sh wordleclonesaurabhjha137"
  exit 1
fi

RESOURCE_GROUP="wordle-rg"
LOCATION="eastus"
FRONTEND_DIR="$(dirname "$0")/frontend"

# Resolve the active subscription ID explicitly so all commands use it
SUBSCRIPTION=$(az account show --query id --output tsv)

echo ""
echo "==> Deploying Wordle Clone to Azure"
echo "    Subscription    : $SUBSCRIPTION"
echo "    Storage Account : $STORAGE_ACCOUNT"
echo "    Resource Group  : $RESOURCE_GROUP"
echo "    Location        : $LOCATION"
echo "    Source          : $FRONTEND_DIR"
echo ""

# Pin CLI to this subscription for the entire session
az account set --subscription "$SUBSCRIPTION"

# 1. Create resource group
echo "[1/5] Creating resource group..."
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --subscription "$SUBSCRIPTION" \
  --output none
echo "      Done."

# 2. Create storage account (LRS = cheapest, free for 12 months)
echo "[2/5] Creating storage account..."
az storage account create \
  --name "$STORAGE_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --sku Standard_LRS \
  --kind StorageV2 \
  --allow-blob-public-access true \
  --subscription "$SUBSCRIPTION" \
  --output none
echo "      Done."

# 3. Enable static website hosting
echo "[3/5] Enabling static website hosting..."
az storage blob service-properties update \
  --account-name "$STORAGE_ACCOUNT" \
  --static-website \
  --index-document "index.html" \
  --404-document "index.html" \
  --subscription "$SUBSCRIPTION" \
  --auth-mode login \
  --output none
echo "      Done."

# 4. Upload frontend files
echo "[4/5] Uploading files..."
az storage blob upload-batch \
  --account-name "$STORAGE_ACCOUNT" \
  --source "$FRONTEND_DIR" \
  --destination '$web' \
  --overwrite \
  --subscription "$SUBSCRIPTION" \
  --auth-mode key \
  --output none
echo "      Done."

# 5. Set cache headers (HTML = no-cache, assets = 1 year)
echo "[5/5] Setting cache headers..."
az storage blob update \
  --account-name "$STORAGE_ACCOUNT" \
  --container-name '$web' \
  --name "index.html" \
  --content-cache-control "no-cache, no-store, must-revalidate" \
  --subscription "$SUBSCRIPTION" \
  --auth-mode key \
  --output none 2>/dev/null || true

# Get the website URL
WEBSITE_URL=$(az storage account show \
  --name "$STORAGE_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --subscription "$SUBSCRIPTION" \
  --query "primaryEndpoints.web" \
  --output tsv)

echo ""
echo "==> Deploy complete!"
echo ""
echo "    Website URL:"
echo "    ${WEBSITE_URL}"
echo ""
