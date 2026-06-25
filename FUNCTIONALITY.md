# Wordle Clone — Functionality Reference

**Live URL:** https://wordleclonesaurabhjha137.z13.web.core.windows.net  
**API Base:** https://wordle-api-jsaurabh.azurewebsites.net/api

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Game Modes — Word Lengths](#2-game-modes--word-lengths)
3. [Core Gameplay](#3-core-gameplay)
4. [Timer System](#4-timer-system)
5. [Word System](#5-word-system)
6. [Statistics](#6-statistics)
7. [Leaderboard](#7-leaderboard)
8. [Game-Over Panel](#8-game-over-panel)
9. [Multiplayer Rooms](#9-multiplayer-rooms)
10. [Header & Navigation](#10-header--navigation)
11. [Toast Notifications](#11-toast-notifications)
12. [Backend API Reference](#12-backend-api-reference)
13. [Database Schema](#13-database-schema)
14. [Security](#14-security)
15. [Deployment](#15-deployment)

---

## 1. Authentication

### Registration
- Fields: **Username**, **Email**, **Password**, **Age**
- Validation runs on both client (real-time, on blur) and server (authoritative)
- Username: 3–20 characters, letters / numbers / underscores only
- Password: minimum 8 characters, must contain at least 1 letter and 1 number
- Age: must be 13 or older
- Password strength meter shown in real time (weak / medium / strong)
- Passwords stored as **bcrypt hashes** (rounds = 10) — never plain text
- Duplicate username and duplicate email are each checked separately and return distinct error messages

### Login
- Fields: **Username**, **Password**
- Returns a **JWT token** (7-day expiry) + user object on success
- Invalid credentials return a generic message — doesn't reveal whether username or password was wrong

### Session
- Token and user object stored in **localStorage** on login/register
- On page load: if token exists → go straight to game; if not → show auth overlay
- Logout clears localStorage and returns to the auth overlay
- The **user-greeting** in the header shows the user's first initial as a coloured avatar circle (e.g. "G" for ggBoy)

### Auth UI Details
- Sliding tab switcher between **Sign In** and **Register** (animated slider underline)
- Show/hide password toggle on all password inputs
- Real-time field-level error messages (appear on blur, clear when corrected)
- Submit button disabled with loading text ("Signing in…") while API call is in flight

---

## 2. Game Modes — Word Lengths

Players choose a board size from the **Length Picker** before each game.

| Word Length | Attempts | Timer  |
|-------------|----------|--------|
| 3 letters   | 4 guesses | 1:30  |
| 4 letters   | 5 guesses | 2:00  |
| 5 letters   | 6 guesses | 2:30  |
| 6 letters   | 7 guesses | 3:00  |
| 7 letters   | 8 guesses | 3:30  |

- The picker shows each option with its attempt count and time limit
- The chosen length is saved to **localStorage** so it persists across sessions
- Every setting (tile sizes, attempt rows, timer, word pool, board layout) adapts dynamically to the selected length — all lengths are fully supported everywhere

**Tile sizes** scale automatically by length so the board always fits the screen:

| Length | Tile size |
|--------|-----------|
| 3      | 78 px     |
| 4      | 70 px     |
| 5      | 62 px     |
| 6      | 54 px     |
| 7      | 46 px     |

---

## 3. Core Gameplay

### Board
- Built dynamically in JavaScript based on word length and attempt count
- Each tile shows a letter, flips to reveal its colour after a guess is submitted
- Active tile has a cursor-style border; active row has a numbered left accent

### Guess Evaluation
- **Correct** (green): letter is in the right position
- **Present** (yellow): letter is in the word but in the wrong position
- **Absent** (grey): letter is not in the word
- Duplicate-letter logic handled correctly — a letter won't be marked yellow/green more times than it appears in the target word

### Keyboard
- On-screen keyboard updates colour state after each guess (keys take the highest-rank colour seen so far: correct > present > absent)
- Physical keyboard fully supported (letter keys, Enter, Backspace)
- Keyboard input is blocked when a modal is open, the auth overlay is showing, or the length picker is visible

### Animations
- **Tile flip**: each tile in a row flips in sequence on guess submission
- **Row bounce**: winning row bounces after a correct guess
- **Row shake**: row shakes when the guess is invalid (not enough letters, not in word list)
- Animations are CSS-driven with JavaScript-triggered class additions

### Validation
- Guesses must be the exact required length — "Not enough letters" if short
- Guesses must exist in the valid-words list for that length — "Not in word list" if unknown
- Keyboard input blocked after `gameOver` flag is set

---

## 4. Timer System

- A **countdown bar** (thin progress bar below the header) depletes from full to empty over the time limit
- Bar colour transitions: **green** (safe, > 40%) → **yellow** (warning, 20–40%) → **red** (danger, < 20%)
- A **digital timer** (`M:SS`) is shown in the header center next to the date
- Both timer UI elements are hidden at the start and shown when a game begins
- On **timeout**: game ends, "⏰ Time's up!" toast shown, word is revealed, game-over panel appears
- Timer stops immediately on win or loss
- Timer UI is hidden between games (on the picker screen)

---

## 5. Word System

### Backend Word API
- `GET /api/word?length=N` — returns a random word for the requested length
- Words are selected randomly server-side from a curated pool for each length
- The word is **never returned in plain text** — it is XOR-ciphered and base64-encoded before being sent over the network

### Cipher (XOR + Base64)
- Key: `[87, 82, 68, 76]` (bytes for `W R D L`)
- Each letter's character code is XOR'd with the repeating key, then the result is base64-encoded
- Example: `SUGAR` → `Gh0RAgM=` in the network response
- The frontend deciphers it using the same key before starting the game
- A casual network inspector will see only a base64 token, not the actual word

### Client-Side Fallback
- If the backend API fails (network error, cold start), the frontend falls back to a local word pool indexed by day
- This ensures the game always starts even without a backend response

### Word Pools
- 3 letters: ~150 words
- 4 letters: ~300 words
- 5 letters: ~450 words
- 6 letters: ~200 words
- 7 letters: ~120 words

---

## 6. Statistics

- Local statistics are tracked per word length separately in **localStorage**
- Stats modal is accessible at any time via the bar-chart icon in the header
- Stats shown for the currently active board length

### Stats Tracked
| Stat | Description |
|---|---|
| Played | Total games started |
| Win % | Wins divided by games played |
| Streak | Consecutive wins ending today |
| Best | All-time best win streak |
| Distribution | Bar chart of wins by guess number (1 through max attempts) |

### Guess Distribution
- Horizontal bar chart — each row represents how many times the player won on that guess number
- The bar width is proportional to the highest count in the distribution
- The winning row is highlighted in green immediately after a win

---

## 7. Leaderboard

- Global leaderboard showing the **top 10 players by total wins**
- Data is stored server-side in Cosmos DB and updated after every game
- Accessible from the trophy icon in the header

### Columns
| Column | Description |
|---|---|
| # | Rank (🥇 🥈 🥉 for top 3, number for rest) |
| Player | Display name |
| Played | Total games played |
| Wins | Total wins |
| Win % | Rounded win percentage |
| Streak | Current win streak |
| Best | All-time best streak |

### Server Stats Update
- After every game end (win, loss, or timeout), `POST /api/save-result` is called with `won` and `guessCount`
- The backend updates the user's stats in Cosmos DB atomically
- Streak logic: streak increments if the player won yesterday; resets to 1 on a new win after a gap; resets to 0 on a loss

---

## 8. Game-Over Panel

Shown on the board itself (not inside any modal) after every game end — win, loss, or timeout.

### Behaviour
- The **on-screen keyboard hides** when the panel appears — it's no longer needed and freeing the space means the panel is immediately visible without scrolling
- The hint bar also hides
- Panel **slides up** with a smooth animation; animation replays on every game end (not just first)
- Keyboard and hint bar are **restored** when a new game starts

### Content
| Scenario | Panel shows |
|---|---|
| Win (solo) | "Play Again" + "Change Mode" buttons |
| Win (room) | `👑 Challenge by ggBoy` + buttons |
| Lose / Timeout (solo) | Word reveal ("The word was XXXXX") + buttons |
| Lose / Timeout (room) | Word reveal + `👑 Challenge by ggBoy` + buttons |

### Buttons
- **Play Again** — starts a new game at the same word length with a new random word
- **Change Mode** — returns to the Length Picker to choose a different board size

---

## 9. Multiplayer Rooms

A room-based challenge system where an admin user sets a word and invites players.

### Who Can Create Rooms
- Only the user with username `ggboy` can create rooms
- A special **create-room button** (golden, "add person" icon) appears in the header only for that user after login

### Creating a Room (ggBoy)
1. Click the golden icon in the header
2. A modal opens with three inputs:
   - **Word**: a 5-letter word (validated: exactly 5 A–Z letters, no spaces or numbers)
   - **Time Limit**: dropdown — 1:00, 1:30, 2:00, 3:00, or 5:00
   - **Players**: scrollable checklist of all registered users (fetched from backend)
3. Click "Create Room" — room is stored in Cosmos DB with status `active`
4. Toast confirms "Room created! Players have been notified."

### Invite Notification (All Players)
- The frontend **polls `/api/invites` every 10 seconds** silently for every logged-in user
- When a new room invite is found, a **floating popup** slides in below the header:
  ```
  🎮  ggBoy challenged you!
      2:00 time limit · 3 players
      [Dismiss]    [Join Game →]
  ```
- Multiple invites queue up and show one at a time
- Each invite is tracked in **localStorage** so it is never shown twice (even after page refresh)

### Joining a Room
- Clicking **Join Game →** calls `POST /api/rooms/{roomId}/join`
- The backend returns the ciphered word, time limit, and creator's display name
- The player's status is updated from `pending` to `playing` in Cosmos DB
- `startRoomGame()` is called — the board starts with the admin's word and custom timer

### Room Game Behaviour
- Gameplay is identical to a normal 5-letter game
- The game-over panel shows `👑 Challenge by ggBoy` in accent colour regardless of outcome
- On win: result is saved to both the room document and the player's personal stats
- On loss/timeout: word is revealed as usual, room result saved

### Room Result Storage
- `POST /api/rooms/{roomId}/result` — saves `{won, guessCount, completedAt}` per player
- `playerStatus` updated: `pending` → `playing` → `won` / `lost`

---

## 10. Header & Navigation

```
[?] [🏆]          WORDLE            [👑*] [📊] | [G] [→|]
                  June 24, 2026
                  timer display
```

| Element | Description |
|---|---|
| `?` (Help) | Opens "How to Play" modal |
| `🏆` (Leaderboard) | Opens global leaderboard modal |
| `WORDLE` | Game title |
| Date | Current date (e.g. "June 24, 2026") |
| Timer | Live countdown display — hidden between games |
| `👑` (Create Room) | Admin only (ggBoy) — golden, opens create-room modal |
| `📊` (Statistics) | Opens statistics modal for current board length |
| `G` (Avatar) | Coloured circle with user's first initial; tooltip shows full display name |
| `→|` (Logout) | Clears session and returns to login/register |
| Divider `|` | Visual separator between nav icons and user identity group |

- Header is **sticky** — stays at top of viewport while scrolling
- Semi-transparent with backdrop blur (`rgba(17,17,21, 0.85)`)
- Modals can be closed with the `✕` button, by clicking the backdrop, or pressing `Escape`

---

## 11. Toast Notifications

- Appear centered near the top of the game area
- Auto-dismiss after a configurable duration (default 1,400 ms; some messages use 2,000–3,000 ms)
- Only one toast at a time — a new toast cancels the previous timer
- `white-space: nowrap` so long messages don't wrap awkwardly

| Message | When |
|---|---|
| "Not enough letters" | Guess submitted with fewer than required letters |
| "Not in word list" | Guess is not in the valid words list for that length |
| "Loading word…" | Submitted before the backend word fetch completed |
| "Genius!" / "Magnificent!" / … | Win on guesses 1–8 (progressively less impressive) |
| "The word was XXXXX" | Loss after using all guesses |
| "⏰ Time's up!" | Timer expired |
| "Room created! Players have been notified." | Admin created a room |
| "Joining room…" | Player clicked Join in the invite popup |
| "Could not join room." | Backend join call failed |

---

## 12. Backend API Reference

All endpoints are at `https://wordle-api-jsaurabh.azurewebsites.net/api`.  
All responses are JSON. CORS is open (`*`). All mutating endpoints handle `OPTIONS` preflight.

---

### `POST /api/register`
Create a new user account.

**Request body:**
```json
{ "username": "alice", "email": "alice@example.com", "password": "Pass123!", "age": 22 }
```
**Response 201:**
```json
{ "token": "<jwt>", "user": { "username": "alice", "displayName": "alice", "email": "alice@example.com" } }
```
**Errors:** 400 (validation), 409 (username or email already taken)

---

### `POST /api/login`
Authenticate an existing user.

**Request body:**
```json
{ "username": "alice", "password": "Pass123!" }
```
**Response 200:**
```json
{ "token": "<jwt>", "user": { "username": "alice", "displayName": "alice", "email": "alice@example.com" } }
```
**Errors:** 400 (validation), 401 (invalid credentials)

---

### `POST /api/save-result`
Save a game result to the authenticated user's stats.  
**Auth:** Bearer token required.

**Request body:**
```json
{ "won": true, "guessCount": 3, "wordLength": 5 }
```
**Response 200:**
```json
{ "ok": true }
```

---

### `GET /api/word?length=N`
Get a random word of the requested length (3–7), ciphered.  
**No auth required.**

**Response 200:**
```json
{ "word": "Gh0RAgM=", "length": 5 }
```
The `word` field is XOR+base64 encoded. Decode with key `[87, 82, 68, 76]`.

---

### `GET /api/leaderboard`
Get the top 10 players by wins.  
**No auth required.**

**Response 200:**
```json
{
  "leaderboard": [
    { "username": "iammahtabs", "won": 11, "played": 22, "winPct": 50, "streak": 1, "maxStreak": 1 }
  ]
}
```

---

### `GET /api/users`
List all registered users (for the room player picker).  
**Auth:** ggBoy only.

**Response 200:**
```json
{ "users": [{ "username": "alice", "displayName": "alice" }] }
```
**Errors:** 403 (not ggBoy)

---

### `POST /api/rooms`
Create a multiplayer room.  
**Auth:** ggBoy only.

**Request body:**
```json
{ "word": "SUGAR", "timeLimit": 120, "players": ["alice", "bob"] }
```
**Response 201:**
```json
{ "roomId": "uuid" }
```
**Errors:** 400 (word not 5 alpha letters, no players), 403 (not ggBoy)

---

### `GET /api/invites`
Get rooms where the authenticated user has a pending invite.  
**Auth:** Bearer token required. Polled every 10 seconds by the frontend.

**Response 200:**
```json
{
  "invites": [
    { "id": "uuid", "createdBy": "ggBoy", "timeLimit": 120, "playerCount": 3 }
  ]
}
```

---

### `POST /api/rooms/{roomId}/join`
Accept a room invite and receive the ciphered word.  
**Auth:** Bearer token required.

**Response 200:**
```json
{ "word": "Gh0RAgM=", "timeLimit": 120, "createdBy": "ggBoy" }
```
**Errors:** 403 (not in player list), 404 (room not found)

---

### `POST /api/rooms/{roomId}/result`
Submit the game result for a room.  
**Auth:** Bearer token required.

**Request body:**
```json
{ "won": false, "guessCount": null }
```
**Response 200:**
```json
{ "ok": true }
```

---

## 13. Database Schema

**Cosmos DB** — database: `wordledb`, container: `users` (partition key: `/username`)  
Two document types co-exist in the same container, distinguished by the presence of a `type` field.

### User Document
```json
{
  "id": "uuid",
  "username": "alice",
  "displayName": "alice",
  "email": "alice@example.com",
  "passwordHash": "$2b$10$...",
  "age": 22,
  "createdAt": "2026-06-24T10:00:00Z",
  "stats": {
    "played": 15,
    "won": 9,
    "streak": 2,
    "maxStreak": 4,
    "lastWon": "2026-06-24"
  }
}
```

### Room Document
```json
{
  "id": "uuid",
  "type": "room",
  "createdBy": "ggboy",
  "createdByDisplay": "ggBoy",
  "word": "Gh0RAgM=",
  "wordLength": 5,
  "timeLimit": 120,
  "players": ["alice", "bob"],
  "playerStatus": {
    "alice": "won",
    "bob": "pending"
  },
  "playerResults": {
    "alice": { "won": true, "guessCount": 3, "completedAt": "2026-06-24T10:05:00Z" }
  },
  "status": "active",
  "createdAt": "2026-06-24T10:00:00Z"
}
```

**Player status lifecycle:** `pending` → `playing` → `won` / `lost`

---

## 14. Security

| Concern | Implementation |
|---|---|
| Password storage | bcrypt hash, rounds=10 — never stored in plain text |
| API authentication | JWT Bearer tokens, 7-day expiry, HS256 algorithm |
| Word exposure | XOR+base64 cipher; word never appears in plain text in any network response |
| Admin gating | `POST /api/rooms` and `GET /api/users` check `payload['username'] == 'ggboy'` server-side |
| CORS | All endpoints return `Access-Control-Allow-Origin: *` (suitable for learning project) |
| Secrets management | `COSMOS_CONNECTION_STRING` and `JWT_SECRET` stored as Azure Function App settings, never in code or git |
| Browser caching | All frontend assets served with `Cache-Control: no-cache, no-store, must-revalidate` — prevents stale JS after deployments |

---

## 15. Deployment

### Frontend — Azure Blob Storage Static Website
```bash
./deploy-azure.sh wordleclonesaurabhjha137
```
- Uploads all files from `frontend/` to the `$web` container
- Sets `Cache-Control: no-cache, no-store, must-revalidate` on every file
- Enables static website hosting with `index.html` as the default document

### Backend — Azure Functions (Python 3.11, Consumption Plan)
```bash
./deploy-functions.sh wordle-api-jsaurabh
```
The script runs 5 steps:
1. Creates the Function App if it doesn't exist
2. Configures CORS
3. Deploys function code via `func azure functionapp publish` (remote build)
4. Re-applies `COSMOS_CONNECTION_STRING` and `JWT_SECRET` from `local.settings.json` (prevents wipe-on-redeploy)
5. Verifies both secrets are set with ✓/✗ output

### Frontend JS Modules
No build step, bundler, or transpiler. All JS is served as native ES modules (`type="module"`). The browser loads them directly.

### Module dependency graph
```
app.js
  ├── constants.js    (word length config)
  ├── config.js       (API URL)
  ├── storage.js      (localStorage helpers)
  ├── words.js        (word pools + valid guesses)
  ├── board.js        (DOM tile building)
  ├── timer.js        (countdown + progress bar)
  ├── game.js         (guess evaluation + animations)
  ├── stats.js        (local stats read/write + render)
  ├── leaderboard.js  (server leaderboard fetch + render)
  ├── auth.js         (login/register forms + session)
  └── rooms.js        (multiplayer rooms + invite polling)
```

---

*Document covers all features as of deployment on 2026-06-24.*
