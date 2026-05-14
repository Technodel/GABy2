# 🚀 GABy — Full Redesign & Transformation Plan
**Target: VPS Deployment (Web App, not Electron desktop)**

> **Naming Rule (applies to every file, every string, every comment in the codebase):**
> The product name is always written as **GABy** — three capital letters G, A, B followed by lowercase y.
> Never: `GABY`, `Gaby`, `gaby`, `GaBY`. Always: `GABy`.
> This applies in UI text, variable names exposed in UI, page titles, emails, error messages, and all documentation.

---

## 📌 Project Overview

**GABy** is a white-labeled, multi-user AI coding assistant platform. It is designed for non-technical or low-experience users who want to give GABy a goal and let it execute everything autonomously — no commands, no jargon, no interruptions.

- **Admin:** One super-admin (you) manages API keys, users, balances, and pricing.
- **Users:** Receive a clean, friendly chat interface. They type a goal. GABy handles the rest.
- **Branding:** All "Aider" / "AiderDesk" references are replaced with **GABy**.
- **Deployment:** Web-based (Docker + VPS), not Electron desktop.
- **Local Bridge:** Users install a lightweight background agent (GABy Bridge) on their own computer. It connects to the GABy VPS server via WebSocket and executes all file operations, terminal commands, tests, and dev server actions on the user's local machine. The web UI is hosted on the VPS; the actual coding work happens locally.

---

## 🔌 Phase 0.5 — GABy Bridge: Local Agent for User Machines

The GABy Bridge is a tiny background process the user installs once on their computer. It acts as a local executor: it receives instructions from the GABy VPS server over a persistent WebSocket connection and carries them out on the user's actual machine — editing real local files, running real terminals, executing tests, and starting dev servers using the user's own installed tools (Node, Python, Git, etc.).

This is what makes GABy work on local files without requiring a desktop app.

---

### Architecture Overview

```
User's Browser
  │  (HTTPS)
  ▼
GABy VPS Server  ←──────────────────────────────────────────┐
  │  (WebSocket, authenticated)                          │
  ▼                                                      │
GABy Bridge (running on user's local machine)                │
  │                                                      │
  ├── Reads/writes files in user's local project folder  │
  ├── Runs terminal commands (npm install, git, etc.)    │
  ├── Executes test suites (npm test, pytest, etc.)      │
  ├── Starts/stops dev server for validation             │
  └── Streams all output back to VPS → VPS to browser ──┘
```

The VPS never touches the user's filesystem directly. It only sends instruction payloads. The Bridge executes them locally and streams results back.

---

### 0.5.1 — Bridge: What It Is

- A single Node.js script (~300-500 lines)
- Installed globally via npm: `npm install -g gaby-bridge`
- Started with one command: `gaby-bridge start`
- Runs silently in the background (no window, no UI)
- Connects to the GABy VPS at `wss://yourdomain.com/bridge`
- Authenticates with the user's GABy credentials (JWT token, same as the web login)
- Heartbeats every 30 seconds to keep the connection alive
- Auto-reconnects if the connection drops

**New file to create:** `bridge/src/index.ts` — the entire Bridge codebase lives in a `/bridge` subfolder of the repo and is published separately to npm as `gaby-bridge`

---

### 0.5.2 — Bridge: Installation Flow (User-Facing)

After a user logs in for the first time, if no Bridge is detected, the web UI shows a one-time setup screen:

```
┌─────────────────────────────────────────────────────────┐
│  🔌 One quick setup step                                │
│                                                         │
│  GABy works directly on your computer's files.         │
│  You just need to install the GABy Bridge — it takes   │
│  about 30 seconds.                                      │
│                                                         │
│  Open your terminal and run:                            │
│  ┌─────────────────────────────────────────────────┐   │
│  │  npm install -g gaby-bridge && gaby-bridge start │   │
│  └─────────────────────────────────────────────────┘   │
│  [📋 Copy command]                                      │
│                                                         │
│  ⏳ Waiting for GABy Bridge to connect...              │
│     (this page updates automatically)                   │
└─────────────────────────────────────────────────────────┘
```

Once the Bridge connects, the server pushes a `bridge:connected` WebSocket event to the user's browser tab, and the UI automatically advances to the main chat — no page refresh needed.

The setup screen also includes:
- A "What is this?" expandable section (plain English explanation, no jargon)
- OS-specific instructions toggle: macOS / Windows / Linux
- For Windows: also show the PowerShell equivalent

**Narrator translation for setup screen:**
- Plain English: *"GABy Bridge is a tiny helper app that lets GABy work directly inside your project folders. It runs quietly in the background and doesn't collect any data."*

---

### 0.5.3 — Bridge: Authentication

The Bridge authenticates to the VPS using the same JWT the user gets when logging in via the browser.

**Flow:**
1. User logs in via browser → receives JWT
2. Setup screen shows the install command with the token embedded:
   `gaby-bridge start --token <JWT> --server wss://yourdomain.com`
3. Bridge stores the token locally in `~/.gaby/config.json`
4. On each connection, Bridge sends: `{ type: "bridge:auth", token: "<JWT>" }`
5. Server validates the JWT, associates the WebSocket connection with `userId`
6. Server stores: `activeBridges[userId] = ws` — one Bridge per user at a time
7. If a second Bridge connects for the same user, the old one is disconnected gracefully

**Token refresh:** If the JWT expires while the Bridge is running, the server sends `{ type: "bridge:token_expired" }` and the Bridge opens the user's browser to the GABy login page automatically, then waits for a new token to be pasted or re-auth to complete.

---

### 0.5.4 — Bridge: Command Protocol

All communication between the VPS server and the Bridge uses a simple JSON message protocol over the WebSocket.

**VPS → Bridge (instructions):**

```typescript
// Read a file
{ type: "exec:read_file", id: "uuid", payload: { path: "/Users/user/myproject/src/App.tsx" } }

// Write a file
{ type: "exec:write_file", id: "uuid", payload: { path: "...", content: "..." } }

// Create a directory
{ type: "exec:mkdir", id: "uuid", payload: { path: "..." } }

// Delete a file
{ type: "exec:delete_file", id: "uuid", payload: { path: "..." } }

// Run a shell command (streams output back line by line)
{ type: "exec:shell", id: "uuid", payload: { cwd: "/Users/user/myproject", command: "npm install" } }

// Run tests
{ type: "exec:run_tests", id: "uuid", payload: { cwd: "...", command: "npm test -- --ci" } }

// Start dev server (for validation — see Phase 12)
{ type: "exec:start_dev_server", id: "uuid", payload: { cwd: "...", command: "npm run dev", readySignal: "Local:", timeoutSeconds: 30 } }

// Kill a running process by id
{ type: "exec:kill", id: "uuid", payload: { processId: "uuid-of-shell-command" } }

// List directory contents
{ type: "exec:list_dir", id: "uuid", payload: { path: "..." } }

// Check if a path exists
{ type: "exec:path_exists", id: "uuid", payload: { path: "..." } }
```

**Bridge → VPS (responses):**

```typescript
// Acknowledgement (sent immediately on receipt)
{ type: "bridge:ack", id: "uuid" }

// Streaming output line (for shell/test commands)
{ type: "bridge:stream", id: "uuid", payload: { line: "...", stream: "stdout" | "stderr" } }

// Command complete
{ type: "bridge:done", id: "uuid", payload: { exitCode: 0, success: true } }

// Error
{ type: "bridge:error", id: "uuid", payload: { message: "..." } }

// File content response
{ type: "bridge:file_content", id: "uuid", payload: { content: "...", encoding: "utf8" } }

// Dev server ready signal detected
{ type: "bridge:server_ready", id: "uuid" }

// Dev server crashed
{ type: "bridge:server_crashed", id: "uuid", payload: { error: "..." } }

// Heartbeat
{ type: "bridge:ping" }
```

All messages include a unique `id` (UUID) so the server can correlate responses to requests even if they arrive out of order.

---

### 0.5.5 — Bridge: Security Rules (Critical)

The Bridge runs on the user's machine with access to their filesystem. These security rules are non-negotiable:

1. **Path sandboxing:** The Bridge only operates within paths the user has explicitly registered as a project in the GABy web UI. Any instruction targeting a path outside registered project directories is rejected with `bridge:error` and logged.
2. **No arbitrary code from the VPS:** The Bridge executes commands, but the command strings are assembled server-side from the aider/agent engine output — never directly from raw user chat input without sanitization.
3. **Command allowlist:** The Bridge maintains a soft allowlist of permitted command prefixes (npm, npx, node, python, pip, git, cargo, go, yarn, pnpm). Any command outside this list requires an explicit flag in the instruction payload: `{ "requiresConfirmation": true }`. For GABy's auto-approve mode, this flag is suppressed for standard dev commands.
4. **No shell expansion tricks:** All commands are run via `child_process.spawn()` with argument arrays, never `exec()` with a raw string — this prevents shell injection.
5. **Local-only:** The Bridge only accepts connections initiated from the VPS domain. CORS-equivalent origin check on the WebSocket handshake.
6. **Encrypted transport:** All Bridge ↔ VPS communication is over WSS (WebSocket Secure, TLS). Never plain WS in production.

---

### 0.5.6 — Bridge: Status Indicator in UI

The web UI top bar shows a small Bridge status indicator next to the balance badge:

```
[🟢 Bridge connected]   or   [🔴 Bridge offline — click to reconnect]
```

- 🟢 Green dot: Bridge is connected and responsive (last ping < 35 seconds ago)
- 🔴 Red dot: Bridge connection lost — clicking it shows the install instructions again
- The indicator is only visible to users, not in the admin panel
- It does NOT show any technical details (no IP address, no port, no token info)

Narrator message when Bridge disconnects mid-task:
*"It looks like the GABy Bridge went offline. Please make sure it's running on your computer, then try again 🔌"*

---

### 0.5.7 — Phase 12 Integration

Phase 12 (Automatic Test Execution Loop and Dev Server Validation) now executes via the Bridge instead of on the VPS. The logic is identical — the only change is that instead of the VPS server spawning local processes, it sends `exec:run_tests` and `exec:start_dev_server` instructions to the Bridge, and streams the results back through the WebSocket chain:

```
Aider engine (VPS) → Bridge instruction → Bridge runs tests locally → streams output to VPS → VPS narrator translates → browser shows friendly message
```

All Phase 12 narrator translations remain the same. The user experience is identical — they see friendly messages, never raw output.

---

### 0.5.8 — New Files to Create

```
bridge/
  package.json               — name: "gaby-bridge", bin: { "gaby-bridge": "./dist/index.js" }
  tsconfig.json
  src/
    index.ts                 — CLI entry: parses --token and --server flags, starts the bridge
    bridge.ts                — Core Bridge class: WebSocket connection, reconnect logic, heartbeat
    executor.ts              — Handles all exec:* instruction types
    sandbox.ts               — Path sandboxing and command allowlist enforcement
    config.ts                — Reads/writes ~/.gaby/config.json
    process-manager.ts       — Tracks running child processes by ID, handles kill instructions
```

Add to the VPS server:

```
src/server/bridge-manager.ts — Tracks active Bridge connections per userId, routes instructions
src/server/bridge-routes.ts  — WebSocket endpoint /bridge with JWT auth handshake
```

---

### 0.5.9 — Acceptance Criteria for the Bridge

- [ ] `npm install -g gaby-bridge && gaby-bridge start --token <JWT> --server wss://domain.com` works on macOS, Windows, and Linux
- [ ] First-time setup screen shown if no Bridge detected within 10 seconds of login
- [ ] Setup screen auto-advances to main UI when Bridge connects — no manual refresh
- [ ] Bridge status indicator (green/red) visible in top bar at all times
- [ ] Bridge only operates within user-registered project directories — path outside registered dirs is rejected
- [ ] All Bridge ↔ VPS communication is over WSS with JWT authentication
- [ ] Token expiry is handled gracefully — Bridge prompts re-authentication without crashing
- [ ] If Bridge disconnects mid-task, user sees a friendly message — not a technical error
- [ ] Phase 12 test loops and dev server validation execute on the user's local machine via Bridge
- [ ] No raw shell output, no file paths, no system info ever reaches the browser UI — all goes through narrator sanitization on the VPS
- [ ] Second Bridge connection for the same user gracefully disconnects the first
- [ ] Commands are run via `spawn()` with argument arrays, never `exec()` with raw strings

## 🗂️ Phase 1 — Global Rebrand: Aider → GABy
## 🏗️ Phase 0 — Project Setup & Fork

### Steps:
1. Fork `https://github.com/hotovo/aider-desk` into your own GitHub repo named `gaby`.
2. Clone to your VPS build server.
3. Remove all Electron-specific configs and dependencies (`electron-builder.yml`, `electron.vite.config.ts`, `electron` npm packages).
4. Convert the app to a **pure web application**:
   - Backend: Node.js/Express (already partially exists in the repo's `src/server`)
   - Frontend: React (already in `src/renderer`) — keep React, strip Electron shell
   - Run as: `node dist/server/index.js` behind nginx on VPS
5. Set up Docker + `docker-compose.yml` for VPS deployment.

### Environment Variables (`.env`):
```
GABY_ADMIN_PASSWORD=301088
GABY_PORT=3000
GABY_DB_PATH=./data/gaby.db
GABY_SECRET_JWT=<random_secret>
```

---

## 🗂️ Phase 1 — Global Rebrand: Aider → GABy

### Naming Convention — Enforced Everywhere:
The product name is **GABy** (G-A-B-y). This exact casing must be enforced with a linter/grep check at the end of every build. Add a CI step:
```bash
# Fail if any wrong casing found in UI-facing files
grep -rn "GABY\|Gaby\|gaby" src/renderer/src/ && echo "❌ Wrong GABy casing found!" && exit 1
```

### Find & Replace (entire codebase):
| Old String | New String |
|---|---|
| `AiderDesk` | `GABy` |
| `Aider Desk` | `GABy` |
| `aider-desk` | `gaby` |
| `aider` (in UI text) | `GABy` |
| `aiderdesk.hotovo.com` | *(your VPS domain)* |
| App title in `package.json` | `"name": "gaby"` |
| Window titles, page titles | `GABy` |
| All logo/icon assets | Replace with GABy logo (provided separately or generated) |

### Files to specifically update:
- `src/renderer/src/App.tsx` — title, branding
- `src/renderer/src/components/` — any header/logo components
- `package.json` — name, description, productName
- `electron-builder.yml` — (will be deleted, but check for name refs)
- `README.md` — full rewrite for GABy
- Any `<title>` HTML tags

---

## 🔐 Phase 2 — Authentication System (New)

AiderDesk has no multi-user auth. Build this from scratch on top of its server.

### 2.1 — Admin Login
- Route: `/admin/login`
- Single hardcoded password: `301088` (from env `GABY_ADMIN_PASSWORD`)
- On success: issues a JWT with role `admin`, stored in `httpOnly` cookie
- Session duration: 24 hours, renewable

### 2.2 — User Login
- Route: `/login`
- Username + password (hashed with bcrypt, stored in SQLite)
- On success: issues a JWT with role `user` + `userId`
- Middleware checks balance > 0 before allowing chat requests

### 2.3 — Auth Middleware
- All API routes protected
- `/admin/*` requires `admin` role
- `/api/*` requires `user` or `admin` role
- Attach `req.user` with `{ id, username, balance, role }`

### 2.4 — Database (SQLite via better-sqlite3)
Create `data/gaby.db` with these tables:

```sql
-- Users table
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  balance REAL DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  max_tokens_per_session INTEGER DEFAULT NULL
);

-- API Keys table (admin-managed)
CREATE TABLE api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,       -- 'anthropic', 'openai', 'gemini', etc.
  key_value TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  label TEXT
);

-- Usage log table
CREATE TABLE usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  session_id TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  raw_cost REAL DEFAULT 0,       -- actual API cost
  charged_cost REAL DEFAULT 0,   -- cost after admin markup formula
  timestamp TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

-- Pricing config table
CREATE TABLE pricing_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  markup_formula TEXT DEFAULT '1.5',   -- multiplier expression, e.g. "cost * 1.5"
  global_max_tokens INTEGER DEFAULT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
```

---

## 👑 Phase 3 — Admin Panel (`/admin`)

Accessible only with admin JWT. Clean, minimal dark UI.

### 3.1 — Sidebar Navigation (Admin)
```
[GABy Admin]
─────────────
👥 Users
🔑 API Keys
💰 Pricing
⚙️ Settings
📊 Usage Stats
```

### 3.2 — Users Page (`/admin/users`)
**List view (table):**
| Username | Balance | Status | Max Tokens | Actions |
|---|---|---|---|---|
| john_doe | $12.50 | Active | Unlimited | Edit / Deactivate |

**Add User modal:**
- Username (text)
- Password (text, will be hashed)
- Initial Balance ($) — popup amount input
- Max tokens per session (optional, overrides global)
- [ Create User ] button

**Edit User modal:**
- Change balance (add/subtract)
- Reset password
- Toggle active/inactive
- Set per-user token limit

**Delete User:** soft-delete (set `is_active = 0`)

### 3.3 — API Keys Page (`/admin/api-keys`)

Each API key is assigned to a **Mode**. Modes are how users choose their experience tier — they replace the confusing "agent/model" dropdown entirely.

#### The Three Modes:

| Mode | Internal Name | Description | Intent |
|---|---|---|---|
| ⚡ **Free Mode** | `free` | Lightweight, fast, almost free to run | Entry-level, low-cost tasks |
| 🚀 **Fast Mode** | `fast` | Advanced AI, still quick response | Balanced performance + quality |
| 🧠 **Pro Mode** | `pro` | Slower but deep reasoning, most capable | Complex problems, best results |

**Add Key form fields:**
- Provider dropdown: `Anthropic`, `OpenAI`, `Gemini`, `Deepseek`, `OpenAI-compatible`
- Mode assignment — **required** — radio or dropdown:
  - `⚡ Free Mode`
  - `🚀 Fast Mode`
  - `🧠 Pro Mode`
- Label (e.g. "Anthropic – Pro", "OpenAI – Free")
- API Key value (masked input, shown once)
- [ Save Key ] button

**List view:**
| Provider | Label | Mode | Status | Actions |
|---|---|---|---|---|
| Anthropic | Claude Haiku | ⚡ Free | Active | Delete |
| Anthropic | Claude Sonnet | 🚀 Fast | Active | Delete |
| Anthropic | Claude Opus | 🧠 Pro | Active | Delete |

**Rules:**
- Each mode should have exactly one active key at a time. If a second key is added for the same mode, the old one is automatically deactivated (or prompt admin to confirm).
- Admin can have keys from different providers per mode (e.g. Free = Gemini Flash, Fast = OpenAI GPT-4o, Pro = Anthropic Claude Opus).
- Key injection: before each GABy call, server reads the user's currently selected mode, fetches the active key for that mode, and injects it into the aider subprocess — transparent to the user.

### 3.4 — Pricing Page (`/admin/pricing`)

Each mode has its **own independent pricing formula**, since each uses a different API with different costs.

**Per-Mode Formula Builder:**

```
⚡ Free Mode Pricing
  Raw API cost formula: [input_tokens * 0.000001 + output_tokens * 0.000002]  (example base)
  Your markup multiplier: [ 2.0 ]
  → Charged = raw_cost × 2.0
  [ Save ]

🚀 Fast Mode Pricing
  Raw API cost formula: [input_tokens * 0.000003 + output_tokens * 0.000006]
  Your markup multiplier: [ 2.5 ]
  → Charged = raw_cost × 2.5
  [ Save ]

🧠 Pro Mode Pricing
  Raw API cost formula: [input_tokens * 0.000015 + output_tokens * 0.000075]
  Your markup multiplier: [ 3.0 ]
  → Charged = raw_cost × 3.0
  [ Save ]
```

Each formula is a mathjs-evaluated expression. Variables available: `input_tokens`, `output_tokens`, `cost` (= raw API cost pre-calculated if provider reports it).

**Advanced mode toggle:** shows raw formula string input instead of the multiplier UI (e.g. `cost * 2.5 + 0.0005`).

**DB schema update** — replace single `pricing_config` table with:

```sql
CREATE TABLE pricing_modes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mode TEXT NOT NULL UNIQUE,              -- 'free' | 'fast' | 'pro'
  display_name TEXT NOT NULL,             -- '⚡ Free Mode' etc.
  markup_formula TEXT NOT NULL DEFAULT '1.5',   -- mathjs expression
  input_token_base_cost REAL DEFAULT 0,   -- $ per token (reference only)
  output_token_base_cost REAL DEFAULT 0,  -- $ per token (reference only)
  global_max_tokens INTEGER DEFAULT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Seed data:
INSERT INTO pricing_modes (mode, display_name, markup_formula) VALUES
  ('free', '⚡ Free Mode', 'cost * 2.0'),
  ('fast', '🚀 Fast Mode', 'cost * 2.5'),
  ('pro',  '🧠 Pro Mode',  'cost * 3.0');
```

**Update `api_keys` table** to include mode:
```sql
ALTER TABLE api_keys ADD COLUMN mode TEXT NOT NULL DEFAULT 'fast';
-- mode: 'free' | 'fast' | 'pro'
```

**Update `usage_log` table** to include mode used:
```sql
ALTER TABLE usage_log ADD COLUMN mode TEXT DEFAULT 'fast';
```

**Token Limits (per mode):**
- Each mode card has its own "Max tokens per session" field
- Individual user overrides still apply (per-user limit takes precedence)
- 0 = unlimited

### 3.5 — Usage Stats Page (`/admin/usage-stats`)
**No charts.** Simple clean tables:

**Overall summary:**
| Metric | Value |
|---|---|
| Total Users | 12 |
| Total Sessions | 340 |
| Total Charged | $450.20 |
| Total Raw Cost | $180.08 |

**Per-user table:**
| User | Sessions | Mode Used | Input Tokens | Output Tokens | Charged | Balance Left |
|---|---|---|---|---|---|---|
| john | 45 | 🧠 Pro | 120,000 | 80,000 | $12.40 | $37.60 |

**Filter:** by date range (date picker), by user, by mode (Free / Fast / Pro)

### 3.6 — Admin Settings Page (`/admin/settings`)
- Change admin password
- Toggle: Allow new user self-registration (OFF by default)
- Global auto-approve: ON/OFF toggle (default ON — this passes to GABy engine)
- App appearance: dark/light mode toggle for admin panel

### 3.7 — Contact Info Page (`/admin/contact`)

Admin sets the public-facing contact details that appear on the user-side "Contact Us" page. Pre-filled with defaults below, fully editable.

**Form fields:**
- Phone number: `+96170449900`
- Email address: `Adarwich@engineer.com`
- Website URL: `Technodel.Tech`
- WhatsApp link (optional): same phone or different
- Support message / tagline (optional text shown above contacts): e.g. *"We're here to help! Reach out anytime."*

**[ Save Contact Info ]** button — stored in DB.

```sql
CREATE TABLE contact_info (
  id INTEGER PRIMARY KEY DEFAULT 1,
  phone TEXT DEFAULT '+96170449900',
  email TEXT DEFAULT 'Adarwich@engineer.com',
  website TEXT DEFAULT 'Technodel.Tech',
  whatsapp TEXT DEFAULT '',
  support_message TEXT DEFAULT 'We''re here to help! Reach out anytime.',
  updated_at TEXT DEFAULT (datetime('now'))
);
```

**Admin sidebar** updated:
```
[GABy Admin]
─────────────
👥 Users
🔑 API Keys
💰 Pricing
📊 Usage Stats
📞 Contact Info    ← new
⚙️ Settings
```

---

## 💬 Phase 4 — User Interface (The Main GABy Chat)

This is the only thing regular users see. It must be **dead simple, warm, and friendly.**

### 4.1 — User Layout
```
┌─────────────────────────────────────────────┐
│  GABy  ·  [Project Name]        [⚙] [Logout] │  ← top bar, minimal
├────────────┬────────────────────────────────┤
│            │                                │
│  Projects  │     Chat / Activity Window     │
│  Sidebar   │                                │
│            │                                │
│  [+ New]   │                                │
│            ├────────────────────────────────┤
│            │   [  Type your goal here... ]  │
│            │                           [→]  │
└────────────┴────────────────────────────────┘
```

### 4.2 — Projects Sidebar
- List of user's projects (folders)
- [ + New Project ] button → prompts for a project name and folder path on server
- Click project → opens its chat
- **Remove:** all references to "Tasks", "Worktrees", "Skills", "Rule Files", "Power Tools", "Aider amount"
- Each project shows: name only. No extra metadata clutter.

### 4.3 — Chat / Activity Window
This is the core redesign area.

**What to SHOW:**
- GABy's friendly narration of what it's doing
- Progress updates in plain English
- Success confirmations
- Friendly error explanations

**What to HIDE:**
- Raw shell commands (e.g. `cd D:\Projects\...; node scripts/...`)
- Model names or provider names
- Token counts in real-time
- Raw AI output that includes backtick code blocks of commands
- Aider internal messages
- File diff outputs (show only summary: "I updated 3 files for you!")

**Message translation layer (new middleware):**
Create a `NarratorService` that intercepts all agent/aider messages and:
1. If message is a shell command being executed → show: `"🔧 I'm running a quick setup step behind the scenes..."`
2. If message is a file edit → show: `"✏️ I just updated [filename] — looking good!"`
3. If message is a search/read → show: `"🔍 Let me take a look at your codebase..."`
4. If message is a plan → show as friendly bullet points
5. If message is completion → show: `"✅ Done! Here's what I did:"` + plain-English summary
6. If message is an error → show: `"Hmm, I hit a small snag. Let me try a different approach... 💪"`

**Message bubbles:**
- User messages: right-aligned, dark bg
- GABy messages: left-aligned, subtle accent color, GABy avatar icon
- System narration: center-aligned, small italic text, muted color

### 4.4 — Balance Display
- Show user's remaining balance in top bar as a friendly credit indicator: `💳 Credits: $24.30`
- **STRICT RULE — Zero technical info for users:** The following must NEVER appear anywhere in the user-facing UI — not in chat, not in tooltips, not in error messages, not in settings, not anywhere:
  - Token counts (input tokens, output tokens, total tokens)
  - Model names (Claude, GPT, Gemini, Haiku, Sonnet, Opus, etc.)
  - Provider names (Anthropic, OpenAI, Google, Deepseek, etc.)
  - Raw API costs or cost breakdowns
  - The word "tokens" in any form
  - The word "model" or "LLM" or "AI model" in any form
  - Any numeric usage statistics (latency, context window, etc.)
  - Any internal system messages from aider/agent engine
- When balance drops below $5: amber color, gentle pulse animation on the credit badge
- When balance is $0: red, input is disabled, message shown: `"Looks like you're out of credits! Reach out to us and we'll top you right up 😊"`
- After each completed task, balance updates silently in the top bar — no breakdown shown, no usage summary, just the updated balance number

### 4.5 — Auto-Approve (Default ON)
- GABy automatically approves all tool calls without asking the user
- No confirmation dialogs shown to user
- User never sees "Do you want to run this command?" prompts
- Admin can toggle this globally from admin settings

### 4.6 — User Settings (Gear Icon)
Only these options — nothing technical, no token counts, no model names, no technical labels:

```
⚙️ My Settings
─────────────────────────────────────────────

🎨 Appearance
  ○ Dark Mode  ● Light Mode

⏱ Session Limit
  If admin has set no limit → "Unlimited — go wild! 🚀"
  If admin has set a limit → shown as friendly label only:
    "Short session" / "Medium session" / "Long session" / "Extended session"
  NEVER show the actual token number.

✅ Auto-Approve GABy's actions
  [Toggle: ON ●  OFF ○]  (default ON)
  Label: "Let GABy work without asking me every step"

─────────────────────────────────────────────

🧠 GABy's Memory

  GABy can remember things about you and your projects — like how you
  like your code structured, things you've told it before, or decisions
  you've made in past sessions. This makes GABy smarter over time.

  Memory is: [ ON ● / OFF ○ ]  (default ON)

  [ 📋 View My Memories ]  ← opens a simple list

    Memory list view:
    ┌────────────────────────────────────────────────┐
    │ 🧠 GABy remembers...                           │
    │                                                │
    │  • "I prefer tabs over spaces"          [🗑️]  │
    │  • "Main project uses React + TypeScript" [🗑️] │
    │  • "Always use async/await, not .then()"  [🗑️] │
    │                                                │
    │  [ + Add a Memory ]   [ 🗑️ Clear All ]        │
    └────────────────────────────────────────────────┘

  [ + Add a Memory ] → simple text input, plain English:
    Placeholder: "e.g. I always use Tailwind for styling"
    [ Save Memory ] button

  [ 🗑️ Clear All ] → confirmation dialog:
    "Are you sure? GABy will forget everything it learned about you.
     You can always teach it again! 😊"
    [ Yes, clear it ] / [ Keep my memories ]

─────────────────────────────────────────────
[ Save Settings ]
```

**Memory implementation notes:**
- Memory is per-user, per-project scope (same as AiderDesk's LanceDB memory system)
- "Add a Memory" stores a plain-text string — GABy embeds it internally, user never sees the vector
- The memory list shows the plain-text content only — no IDs, no embeddings, no technical metadata
- Deleting a single memory removes it from the vector store
- "Clear All" wipes all memory entries for that user
- Memory toggle OFF: GABy still functions normally but does not read from or write to memory store during sessions
- All memory operations are silent — no technical output shown in chat when GABy reads/writes memory

**Critical implementation note:** The "Session Limit" shown to users must be translated from the internal token number into a friendly human label. Use this mapping (or admin can set a custom label):

| Admin token limit | User-facing label |
|---|---|
| 0 / null | "Unlimited — go wild! 🚀" |
| ≤ 8,000 | "Short session" |
| ≤ 32,000 | "Medium session" |
| ≤ 100,000 | "Long session" |
| > 100,000 | "Extended session" |

The raw token number is stored and used internally but is **never rendered in the UI for users.**

---

## 📖 Phase 5 — About Page

Route: `/about` (accessible from user menu)

The About page is **bilingual** — English on the left, Arabic on the right (or stacked on mobile: English first, Arabic below). Arabic text is right-to-left (`dir="rtl"`). A language toggle at the top lets the user switch to see only one language at a time if preferred.

---

### English Version:

> ## 👋 Meet GABy — Your Personal Coding Sidekick
>
> GABy isn't just a tool. GABy is the coding buddy you always wished you had — one that never gets tired, never judges your questions, and doesn't stop until your project is done.
>
> ### What can GABy do for you?
>
> **🎯 You give the goal. GABy does the rest.**
> Just tell GABy what you want — "build me a login page", "fix the bug in my checkout flow", "add dark mode to my app" — and GABy takes it from there. No commands, no code to copy-paste, no guesswork.
>
> **🔍 It reads your entire project**
> GABy explores your project automatically to understand how everything fits together before touching a single file.
>
> **✏️ It writes, edits & creates files**
> GABy can create new files, modify existing ones, and organize your project — all without you lifting a finger.
>
> **🔧 It handles the hard stuff automatically**
> GABy runs everything behind the scenes while it keeps you in the loop with friendly, plain-English updates.
>
> **🔄 It doesn't give up**
> If something doesn't work the first time, GABy tries a different approach. It keeps going until it gets it right — or tells you clearly what's blocking it.
>
> **📁 Multiple Projects**
> Work on as many projects as you need. GABy keeps everything organized and separate.
>
> **🧠 It gets smarter the more you use it**
> GABy remembers your preferences, your project style, and your past decisions — so every session feels like working with someone who already knows you.
>
> **💬 Plain English, always**
> No tech jargon. GABy explains what it's doing in a way that actually makes sense.
>
> **💰 You're in control of your budget**
> Your admin sets a credit balance for you. GABy shows you what you have left at all times — no surprise charges.
>
> ---
>
> ### What Makes GABy Different From Just Using ChatGPT?
>
> | ChatGPT / Regular AI | GABy |
> |---|---|
> | Gives you code to copy-paste | Actually writes the files in your project |
> | You run the commands yourself | GABy runs everything automatically |
> | Stops after one answer | Keeps going until the full goal is done |
> | Technical interface | Plain English, friendly, no jargon |
>
> **💸 The cost is surprisingly low.**
> GABy uses AI only as much as needed for your task — which means most tasks cost a fraction of what you'd expect. You stay in control of your balance, and there are no hidden fees or surprise charges.
>
> **🎯 Your goal will be achieved. That's the whole point.**
> GABy doesn't give up. If one approach doesn't work, it tries another. It keeps going — adjusting, fixing, retrying — until the job is done. You don't have to follow up, debug, or figure out what went wrong. GABy handles it.
>
> ---
> *GABy is powered by cutting-edge AI. You don't need to know how it works. You just need to tell it what you want — and GABy won't stop until it's done.*

---

### Arabic Version (عربي) — `dir="rtl"`:

> ## 👋 تعرّف على GABy — مساعدك الشخصي في البرمجة
>
> GABy ليس مجرد أداة. GABy هو رفيق البرمجة الذي كنت دائمًا تتمنى وجوده — لا يتعب، لا يحكم عليك، ولا يتوقف حتى يُنجز مشروعك.
>
> ### ماذا يمكن لـ GABy أن يفعل من أجلك؟
>
> **🎯 أنت تحدد الهدف. GABy يتكفّل بالباقي.**
> فقط أخبر GABy بما تريد — "ابنِ لي صفحة تسجيل دخول"، "أصلح الخطأ في صفحة الدفع"، "أضف الوضع الليلي لتطبيقي" — وGABy يتولى الأمر من هناك. لا أوامر، لا نسخ ولصق، لا تخمين.
>
> **🔍 يقرأ مشروعك بالكامل**
> يستكشف GABy مشروعك تلقائيًا ويفهم كيف يرتبط كل شيء ببعضه قبل أن يلمس أي ملف.
>
> **✏️ يكتب، يعدّل، وينشئ الملفات**
> يستطيع GABy إنشاء ملفات جديدة، تعديل الموجودة، وتنظيم مشروعك — كل ذلك دون أن تحرك إصبعًا.
>
> **🔧 يتعامل مع الأمور الصعبة تلقائيًا**
> يُنجز GABy كل شيء خلف الكواليس، ويُبقيك على اطلاع بتحديثات ودية وبلغة بسيطة.
>
> **🔄 لا يستسلم**
> إذا لم ينجح الأمر من المحاولة الأولى، يجرّب GABy نهجًا مختلفًا. يستمر حتى يصل إلى الحل — أو يوضّح لك بدقة ما الذي يعيق التقدم.
>
> **📁 مشاريع متعددة**
> اعمل على أي عدد من المشاريع تريد. GABy يُبقي كل شيء منظمًا ومنفصلًا.
>
> **🧠 يصبح أذكى كلما استخدمته أكثر**
> يتذكر GABy تفضيلاتك وأسلوب عملك وقراراتك السابقة — حتى تشعر في كل جلسة أنك تعمل مع شخص يعرفك جيدًا.
>
> **💬 لغة بسيطة دائمًا**
> لا مصطلحات تقنية. GABy يشرح ما يفعله بطريقة مفهومة ومريحة.
>
> **💰 أنت في السيطرة على ميزانيتك**
> يحدد المسؤول رصيدًا لك. GABy يُريك ما تبقى لديك في كل وقت — لا مفاجآت في الفواتير.
>
> ---
>
> ### ما الذي يجعل GABy مختلفًا عن ChatGPT العادي؟
>
> | ChatGPT / الذكاء الاصطناعي العادي | GABy |
> |---|---|
> | يعطيك كودًا لتنسخه وتلصقه | يكتب الملفات مباشرة في مشروعك |
> | أنت من يشغّل الأوامر | GABy يُشغّل كل شيء تلقائيًا |
> | يتوقف بعد إجابة واحدة | يستمر حتى يُنجز الهدف بالكامل |
> | واجهة تقنية | لغة بسيطة، ودية، بلا مصطلحات معقدة |
>
> **💸 التكلفة منخفضة بشكل مدهش.**
> يستخدم GABy الذكاء الاصطناعي بالقدر الذي تحتاجه مهمتك فقط — مما يعني أن معظم المهام تكلّف أقل بكثير مما تتوقع. أنت في السيطرة على رصيدك، ولا توجد رسوم خفية أو مفاجآت.
>
> **🎯 هدفك سيتحقق. هذا هو المقصود تمامًا.**
> GABy لا يستسلم. إذا لم ينجح أسلوب ما، يجرّب أسلوبًا آخر. يستمر في التعديل والإصلاح والمحاولة — حتى ينتهي العمل. لا حاجة للمتابعة أو اكتشاف الأخطاء. GABy يتولى كل ذلك.
>
> ---
> *GABy مدعوم بأحدث تقنيات الذكاء الاصطناعي. لا تحتاج أن تعرف كيف يعمل. فقط أخبره بما تريد — ولن يتوقف حتى يُنجزه.*

---

### Implementation Notes for the About Page:
- Language toggle button top-right: `🇬🇧 English` / `🇱🇧 العربية`
- Default language: detect browser language — show Arabic if `ar`, otherwise English
- On mobile: stack vertically, English first, Arabic below with a divider
- Arabic section has `dir="rtl"` and `font-family: 'Noto Sans Arabic', Inter, sans-serif`
- Add `Noto Sans Arabic` from Google Fonts to the font imports
- Each feature block uses the same card-style component for both languages — just swap content and direction

---

## 🗑️ Phase 6 — Features to REMOVE Completely

### 6.0 — Agent Mode Only: Remove All Other Modes

AiderDesk originally had multiple operating modes (Chat mode, Code mode, Ask mode, etc.). **Keep only Agent mode.** Everything else is deleted.

| Mode to Remove | Action |
|---|---|
| Chat mode | Delete entirely — component, route, backend handler |
| Code mode | Delete entirely |
| Ask mode | Delete entirely |
| Any mode-switcher UI (tabs, dropdowns, toggles between modes) | Delete |
| Any `/code`, `/ask`, `/chat` slash-command UI | Delete |

The app boots directly into Agent mode. There is no mode selection. GABy is always in full agent mode — users just type their goal.

**Backend:** The aider engine should be initialized with agent/autonomous settings by default, always. No runtime mode switching.

### 6.1 — Full Feature Removal List

Remove all UI, routes, components, and backend logic for:

| Feature | Action |
|---|---|
| Model Library / Model Selector | Delete entirely — users never choose a model |
| Any model name display (Claude, GPT, Haiku, etc.) | Strip from all UI layers |
| Any provider name display (Anthropic, OpenAI, etc.) | Strip from all UI layers |
| Token count display anywhere in user UI | Delete — replace with friendly credit balance only |
| Usage charts / token charts | Remove entirely from user UI |
| Per-message token breakdown | Never shown to user |
| "Context window" indicators | Remove entirely |
| Rule Files UI | Delete |
| Skills management UI | Delete |
| Power Tools toggle UI | Delete |
| Aider amount / Aider mode toggle | Delete |
| Git Worktrees UI | Delete |
| Local / Worktree dropdown | Delete |
| MCP Server management UI | Delete |
| Hooks management UI | Delete |
| Subagent configuration UI | Delete |
| Agent profiles selector | Delete — best profile auto-selected per mode |
| Context files sidebar (manual file adding) | Delete — GABy reads project automatically |
| REST API docs page | Delete |
| "Export as Markdown/Image" task option | Delete |
| All references to LanceDB, LLM, vector, embedding | Delete from all UI |
| Any tooltip or label containing "token", "model", "LLM", "context", "embedding" | Strip and replace with friendly language or remove |
| Cost per message breakdown shown to user | Delete — only show updated balance total |
| "Powered by [ModelName]" or similar attribution in user UI | Delete |

> **Note:** Memory management is intentionally NOT on this removal list. It is kept and exposed to users in a friendly way — see Phase 4.6 (User Settings — Memory section).

---

## 🎨 Phase 7 — Design System (Minimal Dark UI)

### Color Palette:
```
Background:     #0D0F14  (near black)
Surface:        #161921  (card/panel bg)
Border:         #252833  (subtle borders)
Accent:         #6C63FF  (GABy purple — primary CTA)
Accent Hover:   #5A52E0
Success:        #34D399  (green)
Warning:        #FBBF24  (amber)
Error:          #F87171  (red)
Text Primary:   #F1F5F9
Text Secondary: #94A3B8
Text Muted:     #475569
```

### Typography:
```
Font: Inter (Google Fonts)
Headings: 600 weight
Body: 400 weight
Code (if shown): JetBrains Mono, small, muted
```

### Components:
- **Buttons:** rounded-lg, accent bg, no shadows, subtle hover transition
- **Inputs:** dark bg, border `#252833`, focus border `#6C63FF`
- **Cards:** `#161921` bg, `1px solid #252833` border, `border-radius: 12px`
- **Sidebar:** `#0D0F14` bg, items have hover state with `#161921`
- **Chat bubbles:** user = accent bg, GABy = surface bg with left border accent
- **Scrollbars:** thin, styled, `#252833`

### Icons:
- Use **Lucide React** (already in the project)
- Replace all Aider-specific icons with neutral coding/assistant icons
- GABy logo: simple `G` lettermark in accent purple circle

### Animations:
- GABy "thinking" indicator: 3 dots pulse animation
- Message appear: fade-in-up, 200ms
- Page transitions: fade, 150ms
- Keep all animations subtle and fast

---

## ⚙️ Phase 8 — Backend Architecture Changes

### 8.1 — Remove Electron IPC
Replace all `ipcMain` / `ipcRenderer` calls with standard HTTP REST API calls or WebSocket events.

### 8.2 — Add WebSocket for Real-Time Updates
GABy agent events → pushed to frontend via WebSocket. All payloads are pre-sanitized — no technical data ever leaves the server toward the user client:

```
EVENT: gaby:thinking      → payload: { message: "GABy is thinking..." }
EVENT: gaby:narration     → payload: { message: "<friendly plain-English text>" }
EVENT: gaby:file_changed  → payload: { message: "Updated [filename] ✏️" }
EVENT: gaby:done          → payload: { message: "<friendly completion summary>" }
EVENT: gaby:error         → payload: { message: "Hit a snag — trying a different approach 💪" }
EVENT: gaby:balance       → payload: { balance: 24.30 }   ← ONLY the new balance total, nothing else

FORBIDDEN in any WebSocket payload sent to user:
  - model, modelName, provider, providerName
  - inputTokens, outputTokens, totalTokens, tokens (any form)
  - rawCost, chargedCost, costBreakdown
  - apiKey (obviously)
  - Any internal engine state or aider output
```

### 8.3 — Token Cost Deduction Flow (Internal Only — Never Exposed to User)
```
1. User sends message
2. Server checks user.balance > 0 → reject if zero (send friendly message, not a technical error)
3. Identify user's selected mode (free / fast / pro)
4. GABy processes request via aider engine using the mode's assigned API key
5. On completion: read token counts from aider/API response (server-side only)
6. raw_cost = (input_tokens * input_token_base_cost) + (output_tokens * output_token_base_cost)
   — all values from pricing_modes table, user never sees these numbers
7. charged_cost = eval(mode.markup_formula, { cost: raw_cost, input_tokens, output_tokens })
8. UPDATE users SET balance = balance - charged_cost WHERE id = user_id
9. INSERT INTO usage_log (user_id, mode, input_tokens, output_tokens, raw_cost, charged_cost, ...)
10. Push gaby:balance event to user's WebSocket → sends ONLY the new balance total ($XX.XX)
    — NO token counts, NO cost breakdown, NO model info sent to frontend
11. If balance goes to zero or below: cap at 0, push friendly "out of credits" event

STRICTLY FORBIDDEN from being sent to user frontend:
  - input_tokens value
  - output_tokens value  
  - raw_cost value
  - charged_cost breakdown
  - model name used
  - provider name used
  - any numeric usage stat other than the remaining balance total
```

### 8.4 — API Key Injection
- Remove all user-facing API key configuration
- Before each aider/agent call: pull active key from `api_keys` table for required provider
- Inject as environment variable into the aider subprocess
- User never sees or configures API keys

### 8.5 — Narrator Middleware
Create `src/server/narrator.ts`:
```typescript
export function narrateMessage(rawMessage: string, messageType: string): string {
  // Pattern matching to translate technical output to friendly text
  // messageType: 'command' | 'file_edit' | 'search' | 'plan' | 'complete' | 'error'
  const translations = {
    command: () => "🔧 Running a quick setup step...",
    file_edit: (filename) => `✏️ Updating ${filename} — almost there!`,
    search: () => "🔍 Exploring your project files...",
    plan: (steps) => formatFriendlyPlan(steps),
    complete: (summary) => `✅ All done! ${summary}`,
    error: () => "Hmm, hit a snag — let me try a different approach 💪"
  };
  // ... pattern matching logic
}
```

---

## 🐳 Phase 9 — Docker & VPS Deployment

### `Dockerfile`:
```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --production

COPY dist/ ./dist/
COPY data/ ./data/

EXPOSE 3000
CMD ["node", "dist/server/index.js"]
```

### `docker-compose.yml`:
```yaml
version: '3.8'
services:
  gaby:
    build: .
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data          # SQLite DB persistence
      - ./projects:/app/projects  # User project folders
    environment:
      - GABY_ADMIN_PASSWORD=301088
      - GABY_SECRET_JWT=change_this_to_random_string
      - GABY_PORT=3000
    networks:
      - gaby-net

networks:
  gaby-net:
```

### Nginx config (on VPS):
```nginx
server {
    server_name yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Run with: `certbot --nginx -d yourdomain.com` for SSL.

---

## 📋 Phase 10 — File-by-File Change Summary for Agent

### Files to DELETE:
```
electron-builder.yml
electron.vite.config.ts
src/main/           (entire Electron main process directory)
src/preload/        (Electron preload scripts)
docs-site/          (marketing site, not needed)
resources/          (Electron icons, will be replaced)
patches/            (Electron patches)
```

### Files to CREATE (new):
```
src/server/auth.ts              — JWT auth middleware
src/server/admin-routes.ts      — Admin panel API routes
src/server/user-routes.ts       — User API routes  
src/server/narrator.ts          — Message translation service (technical → friendly)
src/server/sanitizer.ts         — Information Firewall: sanitizeForUser(), friendlyError()
src/server/billing.ts           — Balance deduction logic (fully internal)
src/server/db.ts                — SQLite setup & migrations
bridge/src/index.ts             — CLI entry point for gaby-bridge npm package
bridge/src/bridge.ts            — WebSocket connection, reconnect, heartbeat
bridge/src/executor.ts          — Handles all exec:* instruction types locally
bridge/src/sandbox.ts           — Path sandboxing and command allowlist
bridge/src/config.ts            — ~/.gaby/config.json read/write
bridge/src/process-manager.ts   — Tracks child processes by ID, handles kills
src/server/bridge-manager.ts    — VPS-side: tracks active Bridge connections per userId
src/server/bridge-routes.ts     — VPS-side: /bridge WebSocket endpoint with JWT handshake
src/renderer/src/pages/BridgeSetup.tsx  — First-time setup screen with install command + copy button
src/renderer/src/components/BridgeStatusBadge.tsx — Green/red indicator in top bar
src/server/test-runner.ts       — Detects & runs project test suites; parses results (Phase 12)
src/server/dev-server-validator.ts — Starts dev server, watches for errors, validates clean startup (Phase 12)
src/renderer/src/pages/Login.tsx
src/renderer/src/pages/AdminPanel.tsx
src/renderer/src/pages/AdminUsers.tsx
src/renderer/src/pages/AdminApiKeys.tsx
src/renderer/src/pages/AdminPricing.tsx
src/renderer/src/pages/AdminUsageStats.tsx
src/renderer/src/pages/AdminSettings.tsx
src/renderer/src/pages/AdminContactInfo.tsx
src/renderer/src/pages/About.tsx              — bilingual EN + AR, RTL support
src/renderer/src/pages/ContactUs.tsx
src/renderer/src/pages/UserSettings.tsx
src/renderer/src/components/MemoryManager.tsx — memory list, add/delete/clear UI
src/renderer/src/components/BalanceBadge.tsx
src/renderer/src/components/ModeSelector.tsx
src/renderer/src/components/GabyAvatar.tsx
src/renderer/src/components/NarratedMessage.tsx
src/renderer/src/hooks/useWebSocket.ts
docker-compose.yml
Dockerfile
nginx.conf
```

### Files to HEAVILY MODIFY:
```
package.json                    — rename, remove electron deps, add new deps
src/server/index.ts             — remove electron, add express server properly
src/renderer/src/App.tsx        — new routing, auth guards
src/renderer/src/main.tsx       — remove electron context
tailwind.config.js              — new color palette
src/renderer/src/styles/        — new design system CSS vars
```

### New Dependencies to Add:
```json
{
  "better-sqlite3": "^9.0.0",
  "bcryptjs": "^2.4.3",
  "jsonwebtoken": "^9.0.0",
  "cookie-parser": "^1.4.6",
  "mathjs": "^12.0.0",
  "ws": "^8.14.0"
}
```

### Dependencies to REMOVE:
```
electron
electron-builder
electron-vite
@electron-toolkit/*
```

---

## 🔁 Phase 12 — Autonomous Test Execution & Dev Server Validation Loop

This phase makes GABy behave exactly like a human developer: **code → run → check → fix → repeat.** Instead of stopping after writing changes and reporting "done", GABy closes the loop by validating its own work automatically.

---

### 12.1 — Automatic Test Execution Loop

**Behavior:**
After GABy makes any code changes to a project, it must automatically:
1. Detect if a test suite exists (check for `package.json` scripts like `test`, `jest`, `vitest`, `mocha`; or `pytest`, `cargo test`, `go test`, etc. based on project type)
2. If a test suite is found — run it immediately
3. Read the test results output
4. If any tests fail:
   - Read the failure output carefully
   - Make targeted code fixes to address the failures
   - Re-run the tests
   - Repeat until all tests pass **or** the session token limit is approaching
5. Only report "done" to the user once tests are passing (or if no test suite exists)

**Session limit behavior:** If the loop is still running and the session is nearing its token limit, GABy stops the loop, reports the current state to the user in plain English (e.g. *"I fixed most of the issues — 2 tests are still failing. Want me to continue in a new session?"*), and does not silently cut off.

**Narrator translations for test loop (added to `narrator.ts`):**
```typescript
test_running:  () => "🧪 Running your project's tests to make sure everything works..."
test_pass:     (count) => `✅ All ${count} tests passed — looking great!`
test_fail:     (count) => `⚠️ ${count} test(s) didn't pass — I'm fixing them now...`
test_fixing:   () => "🔧 Adjusting the code based on test results..."
test_loop:     (attempt) => `🔄 Running tests again (attempt ${attempt})...`
test_give_up:  () => "I've made significant progress on the tests. A couple of edge cases remain — want me to keep going?"
```

**Information Firewall compliance:** Test output (raw stack traces, assertion errors, file paths) must never reach the user. Only the narrator-translated versions above are sent via WebSocket. Raw test runner output is logged server-side only.

**Detection heuristic (server-side, in `src/server/test-runner.ts`):**
```typescript
// Ordered by priority — first match wins
const TEST_RUNNERS = [
  { check: 'package.json scripts.test',   cmd: 'npm test -- --ci' },
  { check: 'package.json scripts.vitest', cmd: 'npx vitest run' },
  { check: 'pytest.ini or setup.py',      cmd: 'python -m pytest' },
  { check: 'Cargo.toml',                  cmd: 'cargo test' },
  { check: 'go.mod',                      cmd: 'go test ./...' },
];
```

**New file to create:** `src/server/test-runner.ts`
- Exports: `detectTestRunner(projectPath)`, `runTests(projectPath)`, `parseTestResults(output)`
- `parseTestResults()` returns `{ passed: number, failed: number, errors: string[] }` — the `errors` field is used internally by GABy to make fixes, never sent to the user

---

### 12.2 — Dev Server Validation

**Behavior:**
After GABy makes changes to a project (especially when the changes involve config files, dependencies, routing, or entry points), it must:
1. Detect the project's dev server start command (from `package.json` scripts: `dev`, `start`, `serve`)
2. Spin up (or restart) the dev server in a background subprocess
3. Watch its stdout/stderr for a configurable "ready" signal (e.g. `"Local:"`, `"listening on"`, `"ready"`, `"compiled successfully"`)
4. If the server crashes or emits startup errors before the ready signal:
   - Read the error output
   - Terminate the failed server subprocess
   - Make targeted fixes to the code/config
   - Restart the server
   - Repeat until it starts cleanly **or** session limit approached
5. Once the server starts cleanly — kill the validation subprocess and report success
6. If no dev server command is found — skip this step silently

**Narrator translations for dev server validation (added to `narrator.ts`):**
```typescript
server_starting:  () => "🚀 Starting up your project to make sure it runs..."
server_ready:     () => "✅ Project started successfully — everything looks clean!"
server_crashed:   () => "⚠️ The project hit a startup error — I'm fixing it now..."
server_fixing:    () => "🔧 Patching the startup issue..."
server_restarting:() => "🔄 Restarting to check if the fix worked..."
server_give_up:   () => "I fixed the main startup issues. One thing needs a closer look — want me to continue?"
```

**Implementation notes:**
- Dev server subprocess must be isolated — port conflicts handled by auto-assigning an unused port (don't use the user's real port during validation)
- Subprocess is always terminated after validation (success or failure) — never left running
- Startup timeout: 30 seconds. If the server hasn't signaled ready in 30s, treat it as a crash and read stderr
- Server stdout/stderr is **never forwarded to the user** — it is read server-side only, passed through `sanitizeForUser()`, and only the narrator translation is sent

**New file to create:** `src/server/dev-server-validator.ts`
- Exports: `detectDevCommand(projectPath)`, `validateDevServer(projectPath, command)`
- Uses Node.js `child_process.spawn()` with a writable stream on stderr/stdout
- Returns `{ success: boolean, error?: string }` — `error` is internal only

---

### 12.3 — Combined Execution Flow

The full post-change flow for GABy after completing code edits:

```
1. GABy finishes writing/editing files
2. → Run test suite (if exists)
     → Tests fail? Fix → re-run (loop, max 5 attempts)
     → Tests pass? Continue
3. → Validate dev server (if dev command exists)
     → Server crashes? Fix → restart (loop, max 3 attempts)
     → Server starts? Continue
4. → Report "done" to user with friendly summary
```

This loop is fully internal. The user only sees friendly narrator messages at each stage — no raw output, no error text, no stack traces.

**Build order impact:** Phase 12 must be implemented after Phase 8.5 (Narrator Middleware) since it depends on `narrateMessage()`. Add it to the build order between Phase 8.5 and Phase 4.

---

## 🔥 Phase 11 — The Information Firewall (User-Facing Data Rules)

This is a dedicated architectural rule that applies at **every layer** of the application. Think of it as a one-way valve: technical data flows freely on the server and in the admin panel, but it is **completely blocked** from ever reaching the user-facing frontend.

### The Absolute Blacklist — Never Rendered for Users:

| Category | Specific items blocked |
|---|---|
| **Model identity** | Claude, GPT, Gemini, Haiku, Sonnet, Opus, Mistral, Llama, Deepseek, or any model name |
| **Provider identity** | Anthropic, OpenAI, Google, Meta, Deepseek, or any provider name |
| **Token data** | input_tokens, output_tokens, total_tokens, context_tokens, or the word "token/s" in any form |
| **Cost breakdowns** | raw_cost, charged_cost, cost per token, pricing formula results |
| **Technical metrics** | latency, context window size, temperature, top_p, max_tokens, stop sequences |
| **Internal engine output** | Any aider CLI output, diff output, git messages, shell command text |
| **API internals** | API key fragments, endpoint URLs, model strings, version strings |
| **Error internals** | Stack traces, HTTP status codes, engine error messages |

### Implementation Enforcement:

**Backend (`narrator.ts` + `billing.ts`):**
- All WebSocket `gaby:*` events pass through a `sanitizeForUser()` function before dispatch
- `sanitizeForUser()` strips any key matching the blacklist before the payload leaves the server
- Billing events send only `{ balance: number }` — nothing else

**Frontend (React):**
- No component reads or renders `model`, `tokens`, `cost`, `provider` props from any state
- Redux/Zustand store has no user-visible slice for technical metrics
- Any component that previously showed a model badge or token counter is deleted, not hidden — deleted
- `console.log` statements with technical data are acceptable in dev mode but must not render in UI

**API responses to user client:**
- User-facing API endpoints (`/api/chat`, `/api/projects`, etc.) never include model/token/cost fields in their JSON responses
- Only admin API endpoints (`/admin/*`) include full technical data

**Error messages to users:**
- All user-facing errors go through a `friendlyError()` function
- Examples:
  - API key invalid → `"GABy is having a bit of trouble connecting. We're on it! 🔧"`
  - Rate limit hit → `"GABy needs a quick breather — try again in a moment 😄"`
  - Out of balance → `"Looks like you're out of credits! Reach out and we'll top you up 😊"`
  - Unknown error → `"Hmm, something unexpected happened. GABy is already trying again!"`

### Admin Panel Exception:
The admin panel (`/admin/*`) is explicitly exempt from this firewall. Admins see:
- Full token counts per user per session
- Raw and charged costs
- Model assignments per mode (internally — labeled as "Free/Fast/Pro key")
- All usage statistics in full detail

1. **Admin password** stored only as env var — never in DB
2. **API keys** stored in DB but never exposed to frontend or users
3. **User passwords** bcrypt-hashed (cost factor 12)
4. **JWT secrets** from env var, rotated on redeploy
5. **Rate limiting** on `/login` route (5 attempts per 15 min)
6. **Input validation** on all admin forms (sanitize with `zod`)
7. **CORS** configured to only allow your VPS domain
8. **All shell commands** run by GABy engine are sandboxed within project directories

---

## ✅ Acceptance Criteria Checklist

**Branding & Naming**
- [ ] No "Aider" or "AiderDesk" text visible anywhere in the UI
- [ ] No AI model names shown anywhere in the user UI (Claude, GPT, Gemini, Haiku, Sonnet, Opus — none)
- [ ] No AI provider names shown anywhere in the user UI (Anthropic, OpenAI, Google — none)
- [ ] Product name written as **GABy** (exactly G-A-B-y) everywhere — CI grep check passes with zero wrong-casing hits (`GABY`, `Gaby`, `gaby` must all be flagged)
- [ ] `Noto Sans Arabic` font is loaded and renders correctly

**Agent Mode Only**
- [ ] Only Agent mode exists — Chat mode, Code mode, Ask mode fully deleted
- [ ] No mode-switcher UI of any kind between aider modes
- [ ] App starts directly in full Agent mode on every session, no choice required

**User-Facing Technical Blackout (CRITICAL)**
- [ ] The word "token" or "tokens" does not appear anywhere in the user UI
- [ ] Token counts (input, output, total) are never shown to users
- [ ] Raw or charged cost breakdowns are never shown to users
- [ ] No raw shell commands shown in chat window
- [ ] No aider engine internal messages shown to users
- [ ] No file diffs shown — only friendly summary ("I updated 3 files for you!")
- [ ] No model/provider attribution shown anywhere in user UI
- [ ] No "context window", "LLM", "embedding", "vector" language in user UI
- [ ] Balance shows only as a dollar total — no breakdown of how it was calculated
- [ ] Session limit shown to users only as a friendly label (Short/Medium/Long), never as a token number

**Admin Panel**
- [ ] Admin login works with password `301088`
- [ ] Admin can create users with an initial balance
- [ ] Admin can add/remove API keys per provider AND per mode (Free/Fast/Pro)
- [ ] Admin can set independent pricing formula per mode
- [ ] Admin can set token limits per mode (stored internally, shown to users as friendly labels only)
- [ ] Admin can set per-user token limit override
- [ ] Admin usage stats show token counts and costs (admin-only, never user-facing)
- [ ] Admin can edit Contact Info (phone, email, website, support message)
- [ ] No usage charts — tables only

**User Experience**
- [ ] Mode selector (⚡ Free / 🚀 Fast / 🧠 Pro) is visible and functional in user top bar
- [ ] Mode names show only the friendly labels — no model names behind them
- [ ] Balance deducts silently after each task, new total pushed via WebSocket
- [ ] User sees friendly narrated messages throughout task execution
- [ ] Auto-approve is ON by default — no command confirmation dialogs shown to users
- [ ] User settings shows: appearance, session limit (friendly label), auto-approve toggle, and Memory section
- [ ] Memory section: ON/OFF toggle, view memories list, add a memory, delete individual entry, clear all
- [ ] Memory list shows plain-text entries only — no IDs, embeddings, or technical metadata
- [ ] Contact Us page shows admin-configured contact details
- [ ] About page is bilingual (English + Arabic, with RTL layout for Arabic)
- [ ] About page language toggle works correctly
- [ ] Local/Worktree dropdown is removed
- [ ] No model library or model selector page exists

**Deployment**
- [ ] Deploys via Docker on VPS
- [ ] Works via HTTPS with nginx proxy

**GABy Bridge (Local Agent)**
- [ ] `gaby-bridge` npm package installable and runnable on macOS, Windows, Linux
- [ ] First-time setup screen appears when no Bridge detected within 10 seconds of login
- [ ] Setup screen auto-advances to main UI when Bridge connects (no refresh needed)
- [ ] Bridge status indicator (🟢/🔴) visible in user top bar
- [ ] Bridge rejects any file operation outside user-registered project directories
- [ ] All Bridge communication is over WSS with JWT auth — no plain WS in production
- [ ] Token expiry handled gracefully — Bridge prompts re-auth without crashing
- [ ] Mid-task Bridge disconnect shows friendly narrator message to user
- [ ] Phase 12 tests and dev server run on user's local machine via Bridge
- [ ] No raw output, paths, or system info ever reaches the browser — all sanitized on VPS
- [ ] Commands use spawn() with arg arrays, never exec() with raw strings

**Autonomous Test & Server Validation (Phase 12)**
- [ ] After code changes, GABy detects and runs the project's test suite automatically (npm test, pytest, cargo test, go test)
- [ ] If tests fail, GABy fixes and re-runs — loop continues until all tests pass or session limit approached
- [ ] If session limit is approaching mid-loop, GABy reports the current state in plain English — no silent cutoff
- [ ] Raw test output (stack traces, assertions) is NEVER shown to users — only narrator-translated messages
- [ ] After code changes, GABy spins up (or restarts) the dev server in an isolated subprocess on a non-conflicting port
- [ ] If dev server crashes on startup, GABy reads the error, fixes the code, and restarts — repeat until clean startup
- [ ] Dev server validation subprocess is always terminated after the check (never left running)
- [ ] Raw server stdout/stderr is NEVER forwarded to the user — internal only
- [ ] Both test loop and server validation respect the Information Firewall — all output sanitized before any WebSocket event is sent
- [ ] `src/server/test-runner.ts` and `src/server/dev-server-validator.ts` created as specified

---

## 📅 Suggested Build Order for Agent

1. **Phase 0** — Fork, strip Electron, set up as web app
2. **Phase 0.5** — GABy Bridge: build the bridge npm package, bridge-manager.ts, bridge-routes.ts on the VPS, and the first-time setup UI screen. This must be done before Phase 4 (user UI) because the chat UI depends on Bridge connection state.
3. **Phase 2** — Auth system (login flows, DB setup)
4. **Phase 8.4** — API key injection from DB (foundational, no user config)
5. **Phase 11** — Implement the Information Firewall (`sanitizeForUser()`, `friendlyError()`) — do this EARLY so it's baked in from the start
6. **Phase 8.3** — Token billing flow (fully internal, firewall-protected)
7. **Phase 3** — Admin panel (all sub-pages including Pricing per mode, Contact Info)
8. **Phase 8.2** — WebSocket narrator events (all sanitized through firewall)
9. **Phase 8.5** — Narrator middleware (friendly message translation)
10. **Phase 12** — Autonomous test execution loop + dev server validation (depends on narrator being in place)
11. **Phase 4** — User chat UI (complete redesign: mode selector, balance badge, narrated chat)
12. **Phase 5** — About page
13. **Phase 6** — Remove all listed features (model library, token displays, worktrees, etc.)
14. **Phase 7** — Full design system application
15. **Phase 1** — Final rebrand sweep (search entire codebase for any "Aider", model names, "token")
16. **Phase 9** — Docker + nginx deployment config
17. **Testing** — Full end-to-end: admin creates user → admin sets mode keys → user logs in → user picks mode → sends goal → GABy edits files → tests run automatically → dev server validated → balance deducts silently → only friendly output shown → zero technical terms visible

---

*This plan is complete and self-contained. Pass it to your agent as-is. Each phase is actionable and sequenced to minimize blocking dependencies.*
