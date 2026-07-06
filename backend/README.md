# Wordleee — Backend API

FastAPI + SQLAlchemy backend for **Wordleee Elite**. SQLite for local dev; swap `DATABASE_URL` to PostgreSQL/Azure SQL for production.

---

## Quick Start

```bash
cd wordleee/backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env          # edit JWT_SECRET to a 32+ char secret
uvicorn main:app --reload

# Swagger UI → http://localhost:8000/docs
```

---

## Project Structure

```
backend/
├── main.py              # App entry point — CORS, routers, startup
├── config.py            # Settings via pydantic-settings (.env)
├── database.py          # SQLAlchemy engine + session factory
├── models.py            # ORM models (all tables)
├── schemas.py           # Pydantic request/response schemas
├── dependencies.py      # Shared FastAPI deps: get_current_user, require_admin
│
├── auth/                # Authentication domain
│   ├── router.py        # POST /api/auth/{register,login,forgot-password,reset-password}
│   ├── service.py       # Business logic (register, login, forgot/reset)
│   └── utils.py         # bcrypt hashing + JWT sign/verify
│
├── game/                # Game domain
│   ├── router.py        # GET /api/game/word  POST /api/game/submit
│   ├── service.py       # Word delivery, result persistence, stat update
│   └── words.py         # Word pools (3–7 letters) + XOR cipher
│
├── room/                # Multiplayer room domain
│   ├── router.py        # CRUD + join/start/result endpoints
│   └── service.py       # Room lifecycle business logic
│
├── leaderboard/         # Stats domain
│   ├── router.py        # GET /api/leaderboard  /me  /{username}
│   └── service.py       # Aggregate query helpers
│
├── admin/               # Admin-only utilities
│   └── router.py        # GET /api/admin/show-all-user-data
│
├── requirements.txt
├── .env.example
└── README.md
```

---

## Database Tables

| Table | Purpose |
|---|---|
| `users` | Auth credentials + two security Q&A |
| `auth_activity` | Audit log: every register / login / reset attempt |
| `user_stats` | Aggregate stats per player (1 row / user) |
| `game_results` | One row per completed game (solo or room) |
| `rooms` | Multiplayer rooms — admin-created |
| `room_participants` | Players assigned to a room + their status |

---

## API Reference

### Auth  `POST /api/auth/…`

| Endpoint | Auth | Description |
|---|---|---|
| `POST /register` | — | Register; returns JWT |
| `POST /login` | — | Login; returns JWT |
| `POST /forgot-password` | — | Verify username + both secret answers; returns short-lived reset token |
| `POST /reset-password` | — | Use reset token to set a new password |

### Game  `GET /api/game/…`

| Endpoint | Auth | Description |
|---|---|---|
| `GET /word?length=N` | JWT | Returns XOR+base64 ciphered word. Decipher client-side. |
| `POST /submit` | JWT | Submit game result; updates `user_stats` |

**Word cipher (client-side JS):**
```js
const KEY = [87, 82, 68, 76];
const decipher = b64 =>
    atob(b64).split('').map((c, i) =>
        String.fromCharCode(c.charCodeAt(0) ^ KEY[i % 4])
    ).join('');
```

### Rooms  `/api/rooms/…`

| Endpoint | Auth | Description |
|---|---|---|
| `POST /` | Admin JWT | Create room (admin only) — backend picks word |
| `GET /` | JWT | List waiting/active rooms |
| `GET /{id}` | JWT | Room detail; `cipher_word` only shown to participants of active rooms |
| `POST /{id}/join` | JWT | Join a room |
| `POST /{id}/start` | Admin JWT | Start room (`waiting → active`) |
| `POST /{id}/result` | JWT | Submit your game result; room auto-finishes when all done |

Valid `time_limit` values: `60 | 90 | 120 | 180 | 300` seconds.

### Leaderboard  `/api/leaderboard/…`

| Endpoint | Auth | Description |
|---|---|---|
| `GET /?limit=10` | JWT | Global leaderboard (sorted by wins) |
| `GET /me` | JWT | Your own stats |
| `GET /{username}` | JWT | Any user's stats |

### Admin  `/api/admin/…`

| Endpoint | Auth | Description |
|---|---|---|
| `GET /show-all-user-data` | Root JWT | All users + full auth activity. Use Swagger only — blocked from frontend by CORS. |

---

## Environment Variables

Copy `.env.example` → `.env`:

```
DATABASE_URL=sqlite:///./wordleee.db
JWT_SECRET=<random-32+-char-string>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_HOURS=24
RESET_TOKEN_EXPIRE_MINUTES=15
ROOT_USER=admin
```

For Azure: set `DATABASE_URL` to your connection string and configure these as Application Settings.

---

## SOLID Design Notes

| Principle | Applied |
|---|---|
| **Single Responsibility** | Each module handles one domain; routers only marshal HTTP, services contain logic |
| **Open/Closed** | Add word pools by extending `WORD_POOLS` dict — no existing code changes |
| **Liskov** | All service functions accept `Session` and return consistent types |
| **Interface Segregation** | `get_current_user` and `require_admin` are separate deps; callers take only what they need |
| **Dependency Inversion** | Services depend on `Session` (abstraction), not a specific DB driver |

---

## Security Notes

- Passwords hashed with **bcrypt** — never stored in plaintext
- Secret answers always stored **lowercase**
- Words served **XOR-ciphered** — plaintext never appears in any HTTP response
- Reset tokens expire in **15 minutes**
- Admin endpoint has no CORS origin allowance — browser JS cannot call it cross-origin
- JWT secret must be **32+ bytes** for HS256
