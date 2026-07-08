# Wordleee Elite

A full-stack multiplayer Wordle clone built on Azure. Features room-based challenges, per-mode leaderboards, daily puzzles, achievements, and a cyberpunk city background.

**Live:** https://wordleee.z13.web.core.windows.net

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite — hosted on Azure Blob Storage (static website) |
| Backend | FastAPI + Python 3.12 — Azure Functions v2 (AsgiFunctionApp, Linux Consumption) |
| Database | Azure Cosmos DB NoSQL — free tier, serverless, `wordleee-db` |
| Auth | JWT HS256 · bcrypt passwords & recovery answers |
| Cipher | XOR + base64 (key `WRDL`) — words never sent as plaintext |

---

## Features

| Feature | Detail |
|---|---|
| Word lengths | 3 · 4 · 5 · 6 · 7 letters with distinct attempt limits and time limits |
| Modes | Ranked (affects leaderboard) · Practice |
| Daily challenge | Same word for all users each UTC day; one submission per day |
| Countdown timer | LED clock per mode — runs out = game over |
| Auth | Register / Login / Forgot password (two bcrypt-hashed recovery phrases) |
| Leaderboard | Filter by word length · Sort by wins / win% / best time / played / streak |
| Multiplayer rooms | Admin creates with a secret word + optional creator hint → players get invite toast → join → start → all play same word → auto-finish |
| Room hints & scoring | Players can spend points on hints during room games; final room ranking uses score, hints, guesses, and time |
| Achievements | Unlocked on game submit (speed, streaks, first win, etc.) |
| Themes | Dark / light / auto + animated background (city parallax, hyperspace, warp) |
| Security | Rate limiting · token version invalidation · admin audit log |

---

## Architecture

```
  Browser (React SPA)
  ┌───────────────────────────────────────────────────────┐
  │  App.jsx  →  Login | Lobby | Game                     │
  │  api.js  (fetch wrapper · JWT headers · word cache)   │
  └──────────────────┬────────────────────────────────────┘
                     │  HTTPS  (JWT Bearer)
  ┌──────────────────▼────────────────────────────────────┐
  │  Azure Functions — wordleee-api.azurewebsites.net      │
  │  FastAPI wrapped in AsgiFunctionApp                   │
  │  ┌──────────┬──────────┬──────────┬─────────────┐     │
  │  │/api/auth │/api/game │/api/rooms│/api/leaderbd│     │
  └──┴──────────┴──────────┴──────────┴─────────────┴─────┘
                     │  Cosmos DB SDK
  ┌──────────────────▼────────────────────────────────────┐
  │  Azure Cosmos DB — wordleee-db                         │
  │  users · game_results · rooms · room_participants      │
  │  auth_activity · audit_log · daily_submissions         │
  │  user_achievements                                     │
  └────────────────────────────────────────────────────────┘
  Frontend static files served from Azure Blob Storage ($web)
```

---

## Auth Flow

1. **Register** — POST `/api/auth/register`. Server validates username pattern (`^[a-zA-Z0-9_-]{3,20}$`) and password complexity (8+ chars, letter + digit + special). bcrypt-hashes password and both recovery answers. Returns JWT with `token_version=0` embedded.
2. **Login** — POST `/api/auth/login`. Returns JWT with current `token_version` from the user document.
3. **Every request** — `Authorization: Bearer <token>`. `get_current_user()` decodes JWT, reads Cosmos user doc, compares `token_version` — mismatch returns 401 immediately.
4. **Forgot password** — POST `/api/auth/forgot-password`. Verifies both recovery answers (bcrypt). Returns a 15-min reset token.
5. **Reset password** — POST `/api/auth/reset-password`. Sets new bcrypt hash **and increments `token_version`** — all previously issued JWTs are invalidated.

---

## Game Flow

1. Lobby: pick word length (3–7) + mode (ranked/practice/daily).
2. `GET /api/game/word?length=N` returns an XOR+base64 ciphered word. Client deciphers it — plaintext never on the wire.
3. Player types guesses. Each `ENTER` calls `GET /api/game/validate-word?word=W` (results cached in a module-level `Map` — no duplicate requests per session).
4. Evaluation (correct / present / absent) runs client-side.
5. Game ends on win, no attempts left, or timer expiry.
6. `POST /api/game/submit` records the result, updates stats, awards achievements, and — if `room_id` is present — bridges to update the room participant.

---

## Room (Multiplayer) Flow

```
  Admin opens Create Room modal
    → picks word length, types secret word (validated against dictionary)
    → optionally enters a creator-written sentence hint
    → selects players from user list
    → POST /api/rooms  (server ciphers word, creates participant docs)

  Players: InvitePoller polls /api/rooms/invites every 10s
    → toast notification appears
    → POST /api/rooms/{id}/join  (status: invited → joined)

  Admin: POST /api/rooms/{id}/start  (status: waiting → active)

  Each player: Lobby shows "Play" button
    → GET /api/rooms/{id} returns cipher_word (only when active + joined)
    → Game mounts with room's word and time_limit
    → player may request hints; each charged hint reduces final score

  On submit: POST /api/game/submit  (with room_id)
    → server updates participant: status=won|lost, won=bool, guesses, time_taken, hints, score
    → when all joined players have submitted → room status=finished

  Room status machine:
    waiting → (start) → active → (all submit) → finished
    waiting/active → (cancel) → cancelled
    any status → (creator DELETE) → hard-deleted from Cosmos
```

Waiting rooms older than 30 minutes are silently hidden from lists without deleting from the database.

### Room Hints

Hints are only available inside active multiplayer room games. They are requested through the backend so the server can track penalties and prevent client-side score tampering.

| Hint | Cost | Result |
|---|---:|---|
| Creator | 100 pts | Reveals the optional sentence written by the room creator |
| Vowels | 80 pts | Shows how many vowels are in the word |
| Remove | 100 pts | Removes up to 3 letters that are not in the answer |
| Reveal | 150 pts | Reveals one unrevealed correct position |
| First | 200 pts | Reveals the first letter |

Rules:

- Maximum 3 charged hints per player per room.
- Hints are blocked before room start and after the player submits.
- If no creator hint exists, revealing it costs 0 points.
- Plaintext room words are never returned by the hint endpoint.

### Room Scoring

Room score is calculated server-side when a participant submits:

```
score = 500 win base
      + time bonus (2 × seconds remaining)
      + guess bonus
      - wrong guess penalty
      - hint penalty
```

Guess bonus:

| Guesses | Bonus |
|---:|---:|
| 1 | 500 |
| 2 | 350 |
| 3 | 250 |
| 4 | 150 |
| 5+ | 50 |

Wrong guesses cost 50 points each. Losses and timeouts score 0. Final score never goes below 0.

Finished rooms rank players by:

1. Higher score
2. Fewer hints used
3. Fewer guesses
4. Faster time

---

## Project Structure

```
wordleee/
├── deploy-azure.sh             One-command build + deploy to Azure
├── frontend/
│   └── src/
│       ├── App.jsx             Root — auth state, theme, bg, routing
│       ├── Login.jsx           Register + login + password reset
│       ├── Lobby.jsx           Hub — mode select, stats, leaderboard, rooms panel
│       ├── Game.jsx            Board, keyboard, timer, result overlay
│       ├── CityBg.jsx          Animated canvas background
│       └── api.js              Fetch wrapper, auth headers, word cipher, validate cache
│
└── backend/
    ├── main.py                 FastAPI app, CORS, SlowAPI limiter, router includes
    ├── limiter.py              Shared SlowAPI Limiter instance (X-Forwarded-For aware)
    ├── config.py               pydantic-settings — reads environment variables
    ├── models.py               User dataclass (includes token_version)
    ├── schemas.py              Pydantic request/response schemas + validators
    ├── database.py             Cosmos DB container factory (lazy singleton)
    ├── dependencies.py         get_current_user (token_version check), require_admin
    ├── function_app.py         Azure Functions entry point (AsgiFunctionApp)
    ├── auth/
    │   ├── router.py           Rate-limited: /register /login /forgot-password /reset-password
    │   ├── service.py          Business logic — bcrypt, token_version increment on reset
    │   └── utils.py            make_access_token(token_version), decode_access_token, bcrypt helpers
    ├── game/
    │   ├── router.py           /word /validate-word /daily /submit /history /achievements
    │   ├── service.py          Word selection, daily logic, submit_game, achievements
    │   └── words.py            Word lists by length + cipher_word() + is_valid_word()
    ├── room/
    │   ├── router.py           Full CRUD + join/start/cancel/hint/result/delete
    │   └── service.py          Room lifecycle, hints, scoring, 30-min expiry, delete + audit log
    ├── leaderboard/
    │   ├── router.py           GET / (filtered) + /me + /{username}
    │   └── service.py          Aggregation over game_results
    ├── admin/
    │   └── router.py           /users /set-admin /reset-user + audit logging
    ├── utils/
    │   └── audit.py            log_admin_action() → audit_log Cosmos container
    └── requirements.txt
```

---

## Local Development

### Prerequisites

- Python 3.12
- Node.js 18+
- Azure Cosmos DB account (or the [Cosmos DB emulator](https://learn.microsoft.com/azure/cosmos-db/local-emulator))

### 1 — Backend

```bash
cd wordleee/backend

python3 -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate

pip install -r requirements.txt

# Copy and fill in local.settings.json (gitignored — never commit this)
# Required keys: COSMOS_CONNECTION_STRING, JWT_SECRET (32+ chars), ADMIN_PASSWORD
cp local.settings.json.example local.settings.json

uvicorn main:app --reload --port 8000
```

Swagger UI: http://localhost:8000/docs

### 2 — Frontend

```bash
cd wordleee/frontend

npm install

# API URL defaults to http://localhost:8000 — override if needed:
# echo "VITE_API_URL=http://localhost:8000" > .env.local

npm run dev
```

App: http://localhost:5173

### 3 — Admin account

On first cold start, `main.py` seeds a root admin user from `ROOT_USER` (default: `admin`) and `ADMIN_PASSWORD` environment variables. Log in with those credentials to access room creation and admin endpoints.

---

## Deploy to Azure

```bash
bash deploy-azure.sh
```

The script: builds the frontend → uploads to Azure Blob Storage `$web` → sets Function App env vars → deploys backend via `func azure functionapp publish`.

**Resources used:**

| Resource | Name |
|---|---|
| Resource group | `wordle-rg` |
| Storage account | `wordleee` |
| Function App | `wordleee-api` |
| Cosmos DB | `wordleee-db` (free tier) |

---

## Environment Variables

### Backend (Azure App Settings / `local.settings.json`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `COSMOS_CONNECTION_STRING` | **Yes** | — | Azure Cosmos DB connection string |
| `JWT_SECRET` | **Yes** | — | Min 32 bytes. App refuses to start if missing or too short. |
| `ADMIN_PASSWORD` | **Yes** | — | Password for the seeded root admin account |
| `ROOT_USER` | No | `admin` | Username that always has admin rights (server-side constant) |
| `JWT_ALGORITHM` | No | `HS256` | JWT signing algorithm |
| `ACCESS_TOKEN_EXPIRE_HOURS` | No | `720` | Access token lifetime (30 days) |
| `RESET_TOKEN_EXPIRE_MINUTES` | No | `15` | Password-reset token lifetime |
| `CORS_ORIGIN` | No | — | Extra allowed origin appended to the built-in list |

### Frontend (`frontend/.env.production`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_API_URL` | No | `http://localhost:8000` | Backend base URL |

---

## API Reference

### Auth — `/api/auth`

| Method | Path | Rate limit | Description |
|---|---|---|---|
| POST | `/register` | 5/min/IP | Create account, returns JWT |
| POST | `/login` | 10/min/IP | Login, returns JWT |
| POST | `/forgot-password` | 5/min/IP | Verify recovery answers, returns 15-min reset token |
| POST | `/reset-password` | — | Set new password; invalidates all existing tokens |

### Game — `/api/game`

| Method | Path | Description |
|---|---|---|
| GET | `/word?length=N` | XOR+b64 ciphered random word (N = 3–7) |
| GET | `/validate-word?word=W` | `{valid: bool}` — client caches in a module-level Map |
| GET | `/daily?word_length=N` | Same ciphered word for all users on the current UTC date |
| POST | `/submit` | Record result; awards achievements; bridges to room participant update |
| GET | `/history?limit=N` | Last N game results for current user |
| GET | `/achievements` | Unlocked achievements for current user |

### Rooms — `/api/rooms`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/` | Admin | Create room (server ciphers word, stores optional `creator_hint`, creates participant docs) |
| GET | `/` | Bearer | Rooms created by or involving the current user (30-min expiry filter) |
| GET | `/invites` | Bearer | Pending invites within 30 minutes |
| GET | `/{id}` | Bearer | Room detail + participants; `cipher_word` only when active + joined |
| POST | `/{id}/join` | Bearer | Accept invite (invited → joined) |
| POST | `/{id}/start` | Bearer | Creator only — waiting → active |
| POST | `/{id}/hint` | Bearer | Request room hint; updates `hints_used` and `hint_penalty` |
| POST | `/{id}/cancel` | Bearer | Creator only — any status → cancelled |
| DELETE | `/{id}` | Bearer | Creator only — hard-delete room + all participant docs |
| POST | `/{id}/result` | Bearer | Submit room game result directly; server calculates score |

Create room body:

```json
{
  "name": "admin's 5-Letter Room",
  "word_length": 5,
  "time_limit": 150,
  "max_players": 10,
  "word": "BRAVE",
  "creator_hint": "Think of courage.",
  "invited_usernames": ["cool_player"]
}
```

Hint request body:

```json
{
  "hint_type": "creator_hint",
  "known_positions": {}
}
```

Supported `hint_type` values: `creator_hint`, `vowel_count`, `remove_wrong_letters`, `reveal_letter`, `first_letter`.

### Leaderboard — `/api/leaderboard`

| Method | Path | Query params | Description |
|---|---|---|---|
| GET | `/` | `limit`, `word_length`, `sort_by` | Ranked list — sort by `wins`, `win_pct`, `best_time`, `played`, `streak` |
| GET | `/me` | — | Current user's aggregated stats |
| GET | `/{username}` | — | Any player's stats |

### Admin — `/api/admin`

| Method | Path | Description |
|---|---|---|
| GET | `/users` | All registered usernames (used by Create Room player picker) |
| POST | `/set-admin` | Grant or revoke `is_admin` flag; audit-logged |
| POST | `/reset-user` | Force-set password / email / recovery answers; audit-logged |
| GET | `/show-all-user-data` | All users with their auth activity |

### Health

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | `{status: "ok", version}` — used by deploy smoke tests |

---

## Security

| Control | Implementation |
|---|---|
| Passwords | bcrypt (one-way) — never stored or returned as plaintext |
| Recovery answers | bcrypt-hashed before storage; verified with `bcrypt.checkpw` |
| JWT secret | Min 32 bytes enforced at startup by pydantic validator |
| Token version invalidation | `token_version` int in user doc + JWT payload; password reset increments it, instantly invalidating all live tokens |
| Rate limiting | `slowapi` — login 10/min, register + forgot-password 5/min per IP (X-Forwarded-For aware) |
| CORS | Explicit allow-list: `GET POST DELETE OPTIONS` + `Authorization Content-Type Accept` headers only |
| Username validation | `^[a-zA-Z0-9_-]{3,20}$` — enforced at schema level |
| Password complexity | 8+ chars, at least one letter + one digit + one special character |
| Word cipher | XOR + base64 (key `WRDL`) — plaintext word never sent over the wire |
| Admin audit log | `audit_log` Cosmos container — records `set_admin`, `reset_user`, `delete_room` actions with actor, target, timestamp |
| Credentials | `local.settings.json` and `.env` are gitignored — never committed |
| Admin gating | `ROOT_USER` hardcoded server-side in `config.py`; also grantable via `is_admin` DB flag |

---

## Key Design Decisions

- **Username as Cosmos partition key** — `id` and partition key both equal `username` for O(1) user lookups.
- **Room participants co-located** — `room_id` is the partition key for `room_participants`, so all participant queries are single-partition.
- **Room scoring is server-side** — the frontend can request hints and submit game outcome, but final score is calculated in `room/service.py`.
- **Creator hint is hidden until requested** — the sentence is stored on the room and only revealed through `/api/rooms/{id}/hint`, costing 100 points when present.
- **Word cipher is obfuscation, not encryption** — the key is visible in client JS. Security relies on the server for word selection, not secrecy of the cipher.
- **30-min waiting room expiry** — filtered at query time, not via a background job. Rooms remain in DB until hard-deleted.
- **`MODES` as single source of truth** — word-length timing defined once in `Lobby.jsx`; `ROOM_TIME_FOR_LEN` and `Game.jsx` both derive from it.
- **Room timer validation matches UI** — backend accepts the room timers used by the frontend: 60, 90, 120, 150, 180, 210, and 300 seconds.
- **Validate-word cache** — module-level `Map` in `api.js`; words are immutable so it never needs invalidation.
- **Late import in `game/service.py`** — `from room.service import update_room_participant_from_game` is inside the function body to avoid a circular import.
