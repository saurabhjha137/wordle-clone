#!/bin/bash
# Deploy Wordle Clone frontend to Azure Blob Storage (static website)
# Usage: ./deploy-azure.sh <storage-account-name>
# Example: ./deploy-azure.sh wordleclonesaurabhjha137

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
SUBSCRIPTION=$(az account show --query id --output tsv)

echo ""
echo "==> Deploying Wordle Clone to Azure"
echo "    Subscription    : $SUBSCRIPTION"
echo "    Storage Account : $STORAGE_ACCOUNT"
echo "    Resource Group  : $RESOURCE_GROUP"
echo "    Location        : $LOCATION"
echo "    Source          : $FRONTEND_DIR"
echo ""

az account set --subscription "$SUBSCRIPTION"

echo "[1/4] Creating resource group..."
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --subscription "$SUBSCRIPTION" \
  --output none
echo "      Done."

echo "[2/4] Creating storage account..."
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

echo "[3/4] Enabling static website hosting..."
az storage blob service-properties update \
  --account-name "$STORAGE_ACCOUNT" \
  --static-website \
  --index-document "index.html" \
  --404-document "index.html" \
  --subscription "$SUBSCRIPTION" \
  --auth-mode login \
  --output none
echo "      Done."

# Upload ALL files with no-cache so browsers always get the latest version
echo "[4/4] Uploading files (no-cache on all assets)..."
az storage blob upload-batch \
  --account-name "$STORAGE_ACCOUNT" \
  --source "$FRONTEND_DIR" \
  --destination '$web' \
  --overwrite \
  --content-cache-control "no-cache, no-store, must-revalidate" \
  --subscription "$SUBSCRIPTION" \
  --auth-mode key \
  --output none
echo "      Done."

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
