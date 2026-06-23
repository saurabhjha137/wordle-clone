# Wordle Clone — Azure Cloud Deployment

A full-stack Wordle game deployed on Microsoft Azure. Built as a hands-on cloud learning project covering static hosting, serverless APIs, NoSQL databases, and user authentication.

**Live Demo:** https://wordleclonesaurabhjha137.z13.web.core.windows.net

---

## Features

- Classic Wordle gameplay — 6 guesses, 5-letter word
- Green / Yellow / Grey tile coloring with correct duplicate-letter logic
- Flip, bounce, and shake animations
- User authentication — Register & Login with JWT sessions
- Daily word rotates automatically (same word for all players per day)
- On-screen keyboard + physical keyboard support
- Statistics modal — games played, win %, streak, guess distribution
- How to Play modal
- Mobile responsive

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER                               │
│            HTML + CSS + JavaScript (Static)                  │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Azure Blob Storage (Static Website)             │
│      wordleclonesaurabhjha137.z13.web.core.windows.net       │
│      Hosts: index.html, style.css, app.js, auth.js, etc.    │
│      Free Tier: 5 GB storage + 20K reads (12 months)        │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST API calls (HTTPS + CORS)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Azure Functions — Consumption Plan              │
│          wordle-api-jsaurabh.azurewebsites.net/api           │
│                                                              │
│   POST /api/register  →  Create new user account            │
│   POST /api/login     →  Authenticate, return JWT token      │
│                                                              │
│   Runtime: Python 3.11                                       │
│   Free Tier: 1,000,000 calls/month (Always Free)            │
└──────────────────────────┬──────────────────────────────────┘
                           │ Azure Cosmos SDK
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  Azure Cosmos DB (NoSQL)                     │
│           Account: wordle-cosmos-jsaurabh                    │
│           Database: wordledb                                 │
│           Container: users  (partition key: /username)       │
│                                                              │
│   Stores: id, username, email, passwordHash, age, createdAt │
│   Free Tier: 1,000 RU/s + 25 GB storage (Always Free)      │
└─────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Plain HTML5, CSS3, JavaScript (no framework) |
| Backend | Python 3.11 — Azure Functions v2 (decorator model) |
| Database | Azure Cosmos DB (NoSQL / Core SQL API) |
| Auth | JWT (PyJWT) + bcrypt password hashing |
| Hosting | Azure Blob Storage static website |

---

## Azure Services & Free Tier

| Service | Purpose | Free Tier |
|---|---|---|
| Azure Blob Storage | Frontend static hosting | 5 GB + 20K GETs — 12 months |
| Azure Functions | Serverless REST API | 1M calls/month — Always free |
| Azure Cosmos DB | User database | 1000 RU/s + 25 GB — Always free |
| Application Insights | Function monitoring | 5 GB/month — Always free |

**Total monthly cost for this project: ₹0 / $0**

---

## Project Structure

```
wordle-clone/
│
├── frontend/                   # Static site (deployed to Azure Blob Storage)
│   ├── index.html              # App shell — game board, keyboard, modals, auth overlay
│   ├── style.css               # All styles — dark theme, animations, auth card
│   ├── app.js                  # Game logic — guessing, tile reveal, stats
│   ├── auth.js                 # Auth UI logic — login/register forms, JWT session
│   ├── config.js               # API URL config (localhost vs production)
│   └── words.js                # Word list + daily word picker
│
├── backend/                    # Azure Functions app (Python)
│   ├── function_app.py         # All HTTP routes — register + login
│   ├── host.json               # Functions runtime config
│   ├── requirements.txt        # Python dependencies
│   ├── local.settings.json     # Local dev secrets (gitignored)
│   ├── local.settings.json.example  # Template for secrets
│   └── utils/
│       ├── validate.py         # Input validation rules
│       ├── db.py               # Cosmos DB queries
│       └── auth.py             # JWT sign/verify helpers
│
├── deploy-azure.sh             # Deploy frontend to Azure Blob Storage
├── deploy-functions.sh         # Deploy backend to Azure Functions
└── README.md
```

---

## Auth Flow

```
Register:
  Browser → POST /api/register { username, email, password, age }
         → validate inputs (server + client)
         → check username/email not taken
         → bcrypt.hash(password, rounds=10)
         → store user in Cosmos DB
         → return JWT token (7 day expiry)
         → frontend stores token in localStorage

Login:
  Browser → POST /api/login { username, password }
         → find user in Cosmos DB
         → bcrypt.compare(password, hash)
         → return JWT token
         → frontend stores token in localStorage

Session:
  On page load → check localStorage for token
  If token exists → show game (trust client-side, server validates on API calls)
  If no token → show login/register overlay
```

---

## Input Validation Rules

| Field | Rules |
|---|---|
| Username | 3–20 characters, letters / numbers / underscores only |
| Email | Valid email format (RFC-style) |
| Password | Min 8 chars, must contain at least 1 letter and 1 number |
| Age | Integer, 13–120 |

Validation runs on both client (real-time, on blur) and server (always authoritative).

---

## Local Development

### Prerequisites
- Python 3.11+
- Node.js 18+ (for Azure Functions Core Tools)
- Azure Functions Core Tools v4
- Azure Cosmos DB (or use the emulator)

### 1. Install Azure Functions Core Tools
```bash
npm install -g azure-functions-core-tools@4 --unsafe-perm true
```

### 2. Set up backend secrets
```bash
cd backend
cp local.settings.json.example local.settings.json
# Edit local.settings.json and fill in:
#   COSMOS_CONNECTION_STRING — your Cosmos DB connection string
#   JWT_SECRET — any long random string
```

### 3. Install Python dependencies
```bash
cd backend
pip install -r requirements.txt
```

### 4. Run the backend locally
```bash
cd backend
func start
# API runs at http://localhost:7071/api
```

### 5. Serve the frontend
Open `frontend/index.html` directly in browser, or use Live Server (VS Code extension).

The `config.js` file automatically uses `http://localhost:7071/api` when running on localhost.

---

## Azure Deployment

### Prerequisites
- Azure CLI installed and logged in (`az login`)
- Azure Functions Core Tools v4

### Step 1 — Register required Azure providers (first time only)
```bash
az provider register --namespace Microsoft.Storage --subscription <your-subscription-id>
az provider register --namespace Microsoft.DocumentDB --subscription <your-subscription-id>
az provider register --namespace Microsoft.Web --subscription <your-subscription-id>
```
Wait for each to show `Registered`:
```bash
az provider show --namespace Microsoft.Storage --query registrationState --output tsv
```

### Step 2 — Deploy frontend to Azure Blob Storage
```bash
./deploy-azure.sh wordleclonesaurabhjha137
```
This script:
1. Creates a resource group (`wordle-rg`)
2. Creates a Storage Account (Standard LRS)
3. Enables static website hosting
4. Uploads all frontend files
5. Prints the live URL

### Step 3 — Create Azure Cosmos DB (free tier)
```bash
az cosmosdb create \
  --name wordle-cosmos-jsaurabh \
  --resource-group wordle-rg \
  --enable-free-tier true \
  --default-consistency-level Session \
  --locations regionName=westus2 failoverPriority=0 isZoneRedundant=false

az cosmosdb sql database create \
  --account-name wordle-cosmos-jsaurabh \
  --resource-group wordle-rg \
  --name wordledb

az cosmosdb sql container create \
  --account-name wordle-cosmos-jsaurabh \
  --resource-group wordle-rg \
  --database-name wordledb \
  --name users \
  --partition-key-path /username \
  --throughput 400
```

Get the connection string:
```bash
az cosmosdb keys list \
  --name wordle-cosmos-jsaurabh \
  --resource-group wordle-rg \
  --type connection-strings \
  --query "connectionStrings[0].connectionString" \
  --output tsv
```

### Step 4 — Deploy backend (Azure Functions)
```bash
./deploy-functions.sh wordle-api-jsaurabh
```

### Step 5 — Set secrets on the Function App
```bash
az functionapp config appsettings set \
  --name wordle-api-jsaurabh \
  --resource-group wordle-rg \
  --settings \
    COSMOS_CONNECTION_STRING="<your-cosmos-connection-string>" \
    JWT_SECRET="<your-long-random-secret>"
```

### Step 6 — Configure CORS
```bash
az functionapp cors add \
  --name wordle-api-jsaurabh \
  --resource-group wordle-rg \
  --allowed-origins "https://wordleclonesaurabhjha137.z13.web.core.windows.net"
```

---

## Environment Variables

| Variable | Where | Description |
|---|---|---|
| `COSMOS_CONNECTION_STRING` | Azure Functions App Settings | Cosmos DB connection string |
| `JWT_SECRET` | Azure Functions App Settings | Secret key for signing JWT tokens |
| `API_URL` (in config.js) | Frontend | Base URL of the Functions API |

---

## API Reference

### POST /api/register

**Request:**
```json
{
  "username": "jsaurabh",
  "email": "user@example.com",
  "password": "Secret123",
  "age": 25
}
```

**Response (201):**
```json
{
  "token": "<jwt>",
  "user": { "username": "jsaurabh", "displayName": "jsaurabh", "email": "user@example.com" }
}
```

**Error (400):**
```json
{
  "errors": {
    "username": "Username must be 3–20 characters.",
    "password": "Password must contain at least one number."
  }
}
```

---

### POST /api/login

**Request:**
```json
{
  "username": "jsaurabh",
  "password": "Secret123"
}
```

**Response (200):**
```json
{
  "token": "<jwt>",
  "user": { "username": "jsaurabh", "displayName": "jsaurabh", "email": "user@example.com" }
}
```

---

## Troubleshooting

| Error | Fix |
|---|---|
| `SubscriptionNotFound` on storage/functions | Register the provider: `az provider register --namespace Microsoft.Storage` |
| `ServiceUnavailable` on Cosmos DB in East US | Use `westus2` with `isZoneRedundant=false` |
| `You do not have required permissions` on blob upload | Add `--auth-mode key` to `az storage` commands |
| `func: command not found` | Run `npm install -g azure-functions-core-tools@4` |

---

## License

MIT — free to use for learning and personal projects.
