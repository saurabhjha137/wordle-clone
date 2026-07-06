#!/bin/bash
# Retire wordle-clone Azure resources before deploying wordleee.
#
# DELETES:
#   - wordle-api-jsaurabh   (Function App + its App Insights)
#   - wordle-func-app        (duplicate Function App + App Insights)
#   - wordle-cosmos-jsaurabh (CosmosDB — wordleee uses SQLite)
#
# KEEPS (reused by wordleee deploy):
#   - wordleclonesaurabhjha137  (Storage Account — static website)
#   - EastUSLinuxDynamicPlan    (consumption plan — reused for App Service)
#   - wordle-rg                 (resource group)

set -e
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

RG="wordle-rg"
SUBSCRIPTION=$(az account show --query id --output tsv)

echo ""
echo -e "${YELLOW}==> Retiring wordle-clone Azure resources${NC}"
echo "    Subscription   : $SUBSCRIPTION"
echo "    Resource Group : $RG"
echo ""
echo -e "${RED}    The following resources will be DELETED:${NC}"
echo "      - wordle-api-jsaurabh   (Function App)"
echo "      - wordle-func-app        (Function App)"
echo "      - wordle-cosmos-jsaurabh (CosmosDB)"
echo ""
echo -e "${YELLOW}    The following resources will be KEPT:${NC}"
echo "      - wordleclonesaurabhjha137 (Storage — reused for wordleee)"
echo "      - EastUSLinuxDynamicPlan   (App Service Plan — reused)"
echo ""
read -p "    Proceed? [y/N] " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  echo "Aborted."
  exit 0
fi
echo ""

delete_if_exists() {
  local NAME="$1" TYPE="$2" EXTRA_ARGS="${3:-}"
  echo -e "[...] Checking $NAME ($TYPE)..."
  EXISTS=$(az resource list --resource-group "$RG" --name "$NAME" --resource-type "$TYPE" --query "length(@)" -o tsv 2>/dev/null || echo 0)
  if [ "$EXISTS" -gt 0 ] 2>/dev/null; then
    echo -e "      Deleting..."
    az resource delete \
      --resource-group "$RG" \
      --name "$NAME" \
      --resource-type "$TYPE" \
      --subscription "$SUBSCRIPTION" \
      --output none $EXTRA_ARGS
    echo -e "${GREEN}      Deleted.${NC}"
  else
    echo "      Not found / already deleted."
  fi
}

# Function Apps (includes their App Insights via cascading delete)
delete_if_exists "wordle-api-jsaurabh" "Microsoft.Web/sites"
delete_if_exists "wordle-func-app"      "Microsoft.Web/sites"

# App Insights (in case not auto-deleted)
delete_if_exists "wordle-api-jsaurabh" "Microsoft.Insights/components" "--api-version 2020-02-02"
delete_if_exists "wordle-func-app"      "Microsoft.Insights/components" "--api-version 2020-02-02"

# CosmosDB
echo -e "[...] Deleting CosmosDB wordle-cosmos-jsaurabh (this may take 2-3 min)..."
az cosmosdb delete \
  --name "wordle-cosmos-jsaurabh" \
  --resource-group "$RG" \
  --subscription "$SUBSCRIPTION" \
  --yes \
  --output none 2>/dev/null && echo -e "${GREEN}      Deleted.${NC}" || echo "      Not found / already deleted."

echo ""
echo -e "${GREEN}==> Retire complete. Storage account and plan are untouched.${NC}"
echo "    Run ./deploy-azure.sh next to deploy wordleee."
echo ""
