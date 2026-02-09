# Valorant Thing — Complete Architecture Reference

> This document describes **every** aspect of the codebase so an AI agent (or developer) can understand the full system, match existing code style, reuse existing utilities, and make correct edits.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Project Structure](#project-structure)
3. [Build & Run](#build--run)
4. [Code Style Rules](#code-style-rules)
5. [Rust Backend (`src-tauri/`)](#rust-backend-src-tauri)
   - [Entry Point & Shared State](#entry-point--shared-state)
   - [Module Layout (`src/riot/`)](#module-layout-srcriot)
   - [HTTP Layer (`http.rs`)](#http-layer-httpers)
   - [Connection Lifecycle (`connection.rs`)](#connection-lifecycle-connectionrs)
   - [Game Actions (`game.rs`)](#game-actions-gamers)
   - [Process Detection (`process.rs`)](#process-detection-processrs)
   - [XMPP Fake Presence (`xmpp.rs`)](#xmpp-fake-presence-xmpprs)
   - [Discord RPC (`discord.rs`)](#discord-rpc-discordrs)
   - [Logging (`logging.rs`)](#logging-loggingrs)
   - [Tauri Commands (Complete List)](#tauri-commands-complete-list)
6. [React Frontend (`src/`)](#react-frontend-src)
   - [App.jsx — Central State Machine](#appjsx--central-state-machine)
   - [Page Components](#page-components)
   - [Shared Components](#shared-components)
   - [Animation System](#animation-system)
   - [Theming System](#theming-system)
7. [Riot API Integration](#riot-api-integration)
8. [localStorage Keys](#localstorage-keys)
9. [External APIs](#external-apis)
10. [Common Patterns & Conventions](#common-patterns--conventions)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop framework | **Tauri v2** (Rust backend + webview frontend) |
| Backend language | **Rust** (2021 edition) |
| Frontend framework | **React 18** (functional components, hooks only) |
| Bundler | **Vite** (port 1420 for dev) |
| Styling | **Tailwind CSS** with CSS custom properties for theming |
| Animations | **framer-motion** (`motion.div`, `AnimatePresence`, `MotionConfig`) |
| Icons | Inline SVGs everywhere (no icon library) |
| Fonts | `Chakra Petch` (display/headings), `IBM Plex Sans` (body) |
| Package manager | **npm** |
| Installer | **NSIS** (Windows .exe setup) |

### Key Rust Crates

| Crate | Purpose |
|-------|---------|
| `tauri` | App framework (features: `protocol-asset`, `tray-icon`, `devtools`) |
| `tauri-plugin-autostart` | Start with Windows |
| `tauri-plugin-notification` | System tray notifications |
| `tauri-plugin-shell` | Open URLs in browser |
| `tauri-plugin-dialog` | File picker dialogs |
| `tauri-plugin-fs` | File system access from frontend |
| `serde` / `serde_json` | JSON serialization |
| `base64` | Encoding/decoding tokens and presence data |
| `regex` | Parsing ShooterGame.log for region/shard |
| `native-tls` | TLS for XMPP connections (comes via dependencies) |
| `discord-rich-presence` | Discord IPC for Rich Presence |

### Key npm Packages

| Package | Purpose |
|---------|---------|
| `@tauri-apps/api` | Invoke Rust commands, window management |
| `@tauri-apps/plugin-*` | Autostart, shell, notification, dialog, fs |
| `framer-motion` | Animation library |
| `react-colorful` | Color picker for custom themes |

---

## Project Structure

```
ValorantApp/
├── src/                          # React frontend
│   ├── main.jsx                  # React entry point (StrictMode + App)
│   ├── App.jsx                   # Central state machine (~870 lines)
│   ├── index.css                 # Tailwind + theme variables + custom CSS
│   └── components/
│       ├── TitleBar.jsx          # Window title bar (drag, minimize, close)
│       ├── Sidebar.jsx           # Navigation sidebar with tabs
│       ├── PlayerInfo.jsx        # Player card + connection status indicator
│       ├── HomePage.jsx          # Stats overview, rank, match history
│       ├── InstalockPage.jsx     # Agent auto-select/lock configuration
│       ├── MapDodgePage.jsx      # Map blacklist auto-dodge
│       ├── FakeStatusPage.jsx    # XMPP presence spoofing UI
│       ├── PartyPage.jsx         # Party management (members, friends, invite)
│       ├── MatchInfoPage.jsx     # Live match player info + ranks
│       ├── MiscPage.jsx          # Menu video customization, queue automation
│       ├── SettingsPage.jsx      # App settings, themes, config import/export
│       └── LogsPage.jsx          # Debug log viewer
├── src-tauri/                    # Rust backend
│   ├── Cargo.toml                # Rust dependencies
│   ├── tauri.conf.json           # Tauri config (window, bundle, security)
│   ├── build.rs                  # Tauri build script
│   ├── capabilities/
│   │   └── default.json          # Tauri permissions (fs, shell, etc.)
│   ├── icons/                    # App icons (ico, png, bmp for NSIS)
│   └── src/
│       ├── main.rs               # Binary entry (calls lib::run)
│       ├── lib.rs                # All #[tauri::command] definitions + app setup
│       ├── discord.rs            # Discord Rich Presence IPC
│       └── riot/
│           ├── mod.rs            # Module exports
│           ├── types.rs          # ConnectionState + PlayerInfo structs
│           ├── http.rs           # ALL HTTP functions (local, pd, glz, henrik)
│           ├── connection.rs     # Connect, disconnect, health check, token refresh
│           ├── game.rs           # Game actions (agent select, party, queue, stats)
│           ├── process.rs        # Process detection, lockfile, region parsing
│           ├── xmpp.rs           # XMPP connection + fake presence
│           └── logging.rs        # Event-based logging to frontend
├── index.html                    # Vite entry HTML
├── package.json                  # npm config (version here)
├── vite.config.js                # Vite config (port 1420)
├── tailwind.config.js            # Tailwind theme extensions
├── postcss.config.js             # PostCSS (tailwind + autoprefixer)
└── changelog.md                  # Release changelog (gitignored)
```

---

## Build & Run

```bash
# Development
npm run tauri dev

# Production build (creates NSIS installer)
npx tauri build
# Output: src-tauri/target/release/bundle/nsis/Valorant Thing_X.Y.Z_x64-setup.exe
```

### Version Locations (must all match)

When bumping version, update **all 4 files**:

1. `package.json` → `"version"`
2. `src-tauri/Cargo.toml` → `version`
3. `src-tauri/tauri.conf.json` → `"version"`
4. `src/components/SettingsPage.jsx` → About section string `"Valorant Thing vX.Y.Z"`

Then run `npm install --package-lock-only` to sync `package-lock.json`.

### Prerequisites

- **Node.js** — Required at runtime. All HTTP requests to Riot/Valorant APIs are made by spawning `node -e "<script>"` processes from Rust. The app shows a blocking modal if Node is not installed.
- **Riot Client** — Must be running (and Valorant open) for the app to connect.

---

## Code Style Rules

1. **No comments** unless absolutely necessary for complex logic.
2. Clean, self-documenting code — variable/function names explain intent.
3. **SDK-first** — use Tauri APIs and existing helpers, don't reinvent.
4. One feature per file when practical.
5. Early-out patterns for invalid data.
6. No memory allocations in hot paths.
7. Use `localStorage` caching for data that doesn't change frequently.
8. Inline SVGs for all icons (no icon library imports).
9. All Tailwind classes — no separate CSS modules per component.
10. Functional React components only, hooks only (no class components).

---

## Rust Backend (`src-tauri/`)

### Entry Point & Shared State

`main.rs` calls `lib::run()`. The `run()` function in `lib.rs`:

1. Sets the Windows AppUserModelID (for taskbar grouping).
2. Creates three `Arc<Mutex<T>>` shared state objects:
   - **`SharedState`** = `Arc<Mutex<riot::ConnectionState>>` — Riot Client connection (tokens, puuid, region).
   - **`DiscordShared`** = `Arc<Mutex<discord::DiscordState>>` — Discord RPC client.
   - **`XmppShared`** = `Arc<Mutex<riot::xmpp::XmppState>>` — XMPP connection for fake presence.
3. Registers Tauri plugins: autostart, notification, shell, dialog, fs.
4. Sets up the system tray (Show + Quit menu, left-click to show window).
5. Initializes the logging system (`riot::logging::init`).
6. Registers all `#[tauri::command]` handlers via `tauri::generate_handler![]`.

**Pattern for async commands:** Almost every async command follows the same pattern:
```rust
#[tauri::command]
async fn some_command(state: tauri::State<'_, SharedState>) -> Result<T, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || riot::some_function(&state))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}
```
This is because all Riot API calls use `node` subprocess spawning which is blocking I/O, so they must run on `spawn_blocking`.

### Module Layout (`src/riot/`)

```
riot/
├── mod.rs          # Re-exports. This is the public API surface.
├── types.rs        # ConnectionState struct, PlayerInfo struct
├── http.rs         # All HTTP request functions
├── connection.rs   # connect_and_store, disconnect, health_check, refresh_tokens
├── game.rs         # All gameplay-related API calls
├── process.rs      # OS-level process/file detection
├── xmpp.rs         # XMPP chat connection for fake presence
└── logging.rs      # Tauri event-based logging
```

`mod.rs` re-exports everything that `lib.rs` needs. When adding a new public function, you must also add it to `mod.rs`'s `pub use` lines.

### HTTP Layer (`http.rs`)

**Critical design decision:** All HTTP requests are made by spawning a `node -e "<inline JS script>"` subprocess. This is because Rust's native TLS doesn't easily handle Riot's local API (self-signed cert on `127.0.0.1`), and Node's `https` module with `rejectUnauthorized: false` handles it cleanly.

Every HTTP function:
1. Constructs an inline Node.js script string.
2. Spawns `node -e` with `creation_flags(0x08000000)` on Windows (to hide the console window).
3. Reads stdout as the response body, stderr as debug/error info.
4. Returns `Result<String, String>`.

**HTTP Functions:**

| Function | Target | Purpose |
|----------|--------|---------|
| `local_get(port, auth, path)` | `https://127.0.0.1:{port}` | Riot Client local API (lockfile auth) |
| `local_put(port, auth, path, body)` | Same | PUT to local API |
| `https_get(url)` | Any HTTPS URL | Simple unauthenticated GET |
| `authed_get(url, access_token)` | Any URL | GET with Bearer token |
| `authed_get_with_entitlements(url, access_token, entitlements)` | Any URL | GET with Bearer + X-Riot-Entitlements-JWT |
| `pd_get(shard, path, ...)` | `https://pd.{shard}.a.pvp.net` | Valorant PD (Player Data) API |
| `pd_put(shard, path, body, ...)` | Same | PUT to PD API |
| `pd_batch_get(shard, paths, ...)` | Same | Parallel GET for multiple PD paths (uses Promise.all in Node) |
| `glz_get(region, shard, path, ...)` | `https://glz-{region}-1.{shard}.a.pvp.net` | Valorant GLZ (Game Logic Zone) API |
| `glz_post(region, shard, path, ...)` | Same | POST (empty body) |
| `glz_post_body(region, shard, path, body, ...)` | Same | POST with JSON body |
| `glz_delete(region, shard, path, ...)` | Same | DELETE |
| `henrik_api_get(path, api_key)` | `https://api.henrikdev.xyz` | Henrik's third-party Valorant API |

**Auth headers pattern:** All authenticated Riot API calls need:
- `Authorization: Bearer {access_token}`
- `X-Riot-Entitlements-JWT: {entitlements}`
- `X-Riot-ClientPlatform: {PLATFORM}` (base64-encoded static JSON)
- `X-Riot-ClientVersion: {client_version}` (fetched from valorant-api.com)

**Helper functions in `game.rs`:**
- `get_local_creds(state)` → extracts `(port, local_auth)` from ConnectionState
- `get_glz_creds(state)` → extracts `(access_token, entitlements, puuid, region, shard, client_version)`

These are the standard way to extract credentials before making API calls. Always use these instead of manually locking the mutex.

### Connection Lifecycle (`connection.rs`)

#### Connect Flow (`connect_and_store`)
1. Read lockfile from `%LOCALAPPDATA%\Riot Games\Riot Client\Config\lockfile` → get PID, port, password.
2. Verify PID is alive via `tasklist`.
3. Build Basic auth: `Base64("riot:{password}")`.
4. `local_get` → `/entitlements/v1/token` → get `accessToken`, `token` (entitlements JWT), `subject` (puuid).
5. `authed_get` → `https://auth.riotgames.com/userinfo` → get `game_name`, `tag_line`.
6. Parse region/shard from `%LOCALAPPDATA%\VALORANT\Saved\Logs\ShooterGame.log` (regex for `glz-{region}-1.{shard}.a.pvp.net`).
7. `https_get` → `https://valorant-api.com/v1/version` → get `riotClientVersion`.
8. `pd_get` → `/personalization/v2/players/{puuid}/playerloadout` → get player card ID.
9. Store everything in `ConnectionState`, set `connected = true`, record `token_fetched_at`.

#### Health Check (runs every 10s from frontend)
1. If not connected → return None.
2. Check if Riot Client is still running (lockfile + PID alive).
3. If token is >600s old → refresh via `refresh_tokens()`.
4. Every 60s, validate token by hitting PD loadout endpoint.
5. If validation fails → try refresh → if refresh fails → disconnect.

#### Token Refresh (`refresh_tokens`)
Re-reads the lockfile and fetches fresh tokens from `/entitlements/v1/token`. Updates `ConnectionState` in-place.

### Game Actions (`game.rs`)

| Function | API | What it does |
|----------|-----|-------------|
| `check_current_game` | GLZ `/pregame/v1/players/{puuid}` + `/core-game/v1/players/{puuid}` | Checks if in pregame or in-game, returns match data with `_phase` field |
| `select_agent` | GLZ POST `/pregame/v1/matches/{id}/select/{agentId}` | Selects (hovers) an agent |
| `lock_agent` | GLZ POST `/pregame/v1/matches/{id}/lock/{agentId}` | Locks in the agent |
| `pregame_quit` | GLZ POST `/pregame/v1/matches/{id}/quit` | Dodges in agent select |
| `coregame_quit` | GLZ POST `/core-game/v1/players/{puuid}/disassociate/{id}` | Leaves an active match |
| `get_party` | GLZ GET party + name resolution | Returns full party info with member details |
| `get_friends` | Local `/chat/v4/friends` + `/chat/v4/presences` | Friends list with online status and player cards |
| `set_party_accessibility` | GLZ POST party accessibility | Open/close party |
| `disable_party_code` | GLZ DELETE party invite code | Removes invite code |
| `kick_from_party` | GLZ DELETE party member | Kicks a member |
| `generate_party_code` | GLZ POST party invite code | Generates new invite code |
| `join_party_by_code` | GLZ POST join by code | Joins party via code |
| `enter_queue` | GLZ POST matchmaking join | Queues for a match |
| `leave_queue` | GLZ POST matchmaking leave | Leaves the queue |
| `get_home_stats` | PD mmr + loadout + account-xp | Gets player stats (rank, RR, peak, wins/losses, level, card) |
| `get_match_page` | PD match-history + batch match-details | Paginated competitive match history |
| `get_owned_agents` | PD store entitlements | List of owned agent UUIDs |
| `get_player_mmr` | PD mmr for any player | Gets rank tier and RR for a specific player |
| `resolve_player_names` | PD name-service | Resolves puuids to game names |
| `check_loadout` | PD player loadout | Token validation ping |

### Process Detection (`process.rs`)

| Function | What it does |
|----------|-------------|
| `read_lockfile()` | Reads `%LOCALAPPDATA%\Riot Games\Riot Client\Config\lockfile`, parses `name:pid:port:password:protocol` |
| `is_pid_alive(pid)` | Runs `tasklist /FI "PID eq {pid}"` and checks if output contains the PID |
| `is_riot_client_running()` | Reads lockfile + checks PID alive |
| `is_valorant_running()` | Riot Client running AND `VALORANT-Win64-Shi` process exists |
| `find_valorant_path()` | Reads `C:\ProgramData\Riot Games\Metadata\valorant.live\valorant.live.product_settings.yaml` for `product_install_full_path` |
| `parse_region_shard()` | Regex on `%LOCALAPPDATA%\VALORANT\Saved\Logs\ShooterGame.log` for last GLZ URL occurrence |

### XMPP Fake Presence (`xmpp.rs`)

XMPP is Riot's chat protocol. The app connects to Riot's XMPP server to spoof the player's in-game presence (shown to friends).

#### State: `XmppState`
```rust
pub struct XmppState {
    pub connected: bool,
    pub stream: Option<native_tls::TlsStream<TcpStream>>,   // Raw TLS socket
    pub logs: Vec<XmppLog>,                                   // Debug log ring buffer (max 500)
    pub jid: String,                                          // XMPP JID (e.g., puuid@region.pvp.net/RC-xxx)
    pub puuid: String,
    pub xmpp_region: String,
    pub connected_at: Option<Instant>,
    pub real_valorant_data: Option<serde_json::Value>,        // Real game presence captured at connect
    pub real_keystone_ts: Option<u64>,                        // Real keystone timestamp
}
```

#### Connect Flow (`xmpp_connect`)
1. Fetch PAS (Player Affinity Service) token via `https://riot-geo.pas.si.riotgames.com/pas/v1/service/chat`.
2. Decode JWT payload to get `affinity` (chat server region code like `jp1`, `na1`).
3. Fetch client config from `https://clientconfig.rpg.riotgames.com` to get actual chat host + domain.
4. TCP connect to `{host}:5223`, TLS handshake (accepts invalid certs).
5. XMPP stream negotiation:
   - Send `<stream:stream>` → receive `<stream:features>`.
   - Send `<auth mechanism="X-Riot-RSO-PAS">` with RSO + PAS tokens.
   - Re-open stream after auth success.
   - Bind resource (`RC-{timestamp}`), start session, send entitlements.
   - Send `<presence/>` to announce online.
6. Read initial presence burst (up to 8 chunks, 1.5s each).
7. **Capture real presence data**: `extract_real_valorant_payload()` parses the initial burst for the player's own Valorant presence stanza, stores the base64-decoded JSON and keystone timestamp.

#### Fake Presence (`xmpp_send_fake_presence`)
1. Starts from `real_valorant_data` (the actual game presence captured at connect).
2. Overrides only specific fields: `competitiveTier`, `accountLevel`, `leaderboardPosition`, `playerCardId`, `playerTitleId`, `sessionLoopState`, `queueId`, `partySize`, `maxPartySize`, scores, premier data.
3. Re-encodes to base64 with tab-indented JSON format (`format_json_tabs`).
4. Builds XML: `<presence><games><keystone>...</keystone><valorant>...</valorant></games></presence>`
5. Uses real keystone timestamp (so the fake presence doesn't override the real client's keystone).
6. Uses current timestamp for valorant `<s.t>` so the fake data takes precedence.

#### Polling (`xmpp_poll`)
Called from frontend every ~1s. Reads any pending data from the XMPP stream with 150ms timeout. Detects connection drops.

#### Other XMPP Commands
- `xmpp_disconnect` — Sends `</stream:stream>`, clears state.
- `xmpp_send_raw` — Send arbitrary XML (debug tool).
- `xmpp_get_status` — Returns JSON with connection status, uptime, real card/title IDs, premier data.
- `xmpp_get_logs` — Returns all XMPP debug logs as JSON array.
- `xmpp_check_local_presences` — Reads `/chat/v4/presences` from local API, decodes base64 private data.
- `local_api_discover` — Debug tool, hits `/help`, `/chat/v1/me`, `/chat/v1/session`.

### Discord RPC (`discord.rs`)

Simple Discord Rich Presence integration via IPC pipe:

- **App ID**: `1469359571637108931`
- `start_rpc` — Creates IPC client, connects, sets default "In Lobby" activity.
- `stop_rpc` — Clears activity, closes connection.
- `update_rpc` — Updates activity with custom details, state, and image assets.

The frontend updates RPC every 5s based on game state (lobby, agent select, in-game with score).
   
### Logging (`logging.rs`)

Uses a global `OnceLock<AppHandle>` initialized once at app startup. Emits Tauri events (`"backend-log"`) with `LogPayload { log_type, message }`.

- `log_info(msg)` — Emits with `log_type: "info"`.
- `log_error(msg)` — Emits with `log_type: "error"`.

Frontend listens via `listen("backend-log", ...)` in `App.jsx`, skips messages starting with `"[XMPP]"` (XMPP has its own log system).

### Tauri Commands (Complete List)

| Command | Params | Returns | Category |
|---------|--------|---------|----------|
| `connect` | — | `PlayerInfo` | Connection |
| `disconnect` | — | — | Connection |
| `get_status` | — | `String` | Connection |
| `get_player` | — | `Option<PlayerInfo>` | Connection |
| `health_check` | — | `Option<PlayerInfo>` | Connection |
| `get_token_age` | — | `u64` (seconds) | Connection |
| `is_valorant_running` | — | `bool` | Process |
| `find_valorant_path` | — | `String` | Process |
| `check_node_installed` | — | `bool` | Process |
| `compute_file_hash` | `path: String` | `String` | File |
| `force_copy_file` | `source, dest` | — | File |
| `toggle_devtools` | — | — | Dev |
| `exit_app` | — | — | App |
| `check_for_update` | — | `String` (JSON) | Update |
| `download_and_install_update` | `url, filename` | — | Update |
| `check_current_game` | — | `String` (JSON) | Game |
| `select_agent` | `match_id, agent_id` | `String` | Game |
| `lock_agent` | `match_id, agent_id` | `String` | Game |
| `pregame_quit` | `match_id` | `String` | Game |
| `coregame_quit` | `match_id` | `String` | Game |
| `get_owned_agents` | — | `Vec<String>` | Game |
| `get_home_stats` | `queue_filter` | `String` (JSON) | Stats |
| `get_match_page` | `page, page_size` | `String` (JSON) | Stats |
| `check_loadout` | — | `String` | Stats |
| `get_player_mmr` | `target_puuid` | `String` (JSON) | Stats |
| `resolve_player_names` | `puuids: Vec<String>` | `String` (JSON) | Stats |
| `henrik_get_account` | `puuid, api_key` | `String` (JSON) | Henrik |
| `henrik_get_mmr` | `puuid, region, api_key` | `String` (JSON) | Henrik |
| `get_party` | — | `String` (JSON) | Party |
| `get_friends` | — | `String` (JSON) | Party |
| `set_party_accessibility` | `open: bool` | `String` | Party |
| `disable_party_code` | — | `String` | Party |
| `kick_from_party` | `target_puuid` | `String` | Party |
| `generate_party_code` | — | `String` | Party |
| `join_party_by_code` | `code` | `String` | Party |
| `enter_queue` | — | `String` | Queue |
| `leave_queue` | — | `String` | Queue |
| `start_discord_rpc` | — | — | Discord |
| `stop_discord_rpc` | — | — | Discord |
| `update_discord_rpc` | `details, rpc_state, large_image, large_text, small_image, small_text` | — | Discord |
| `xmpp_connect` | — | `String` | XMPP |
| `xmpp_disconnect` | — | — | XMPP |
| `xmpp_poll` | — | `String` | XMPP |
| `xmpp_get_status` | — | `String` (JSON) | XMPP |
| `xmpp_get_logs` | — | `String` (JSON) | XMPP |
| `xmpp_send_fake_presence` | `presence_json` | — | XMPP |
| `xmpp_send_raw` | `data` | — | XMPP |
| `xmpp_check_local_presences` | — | `String` (JSON) | XMPP |
| `local_api_discover` | — | `String` (JSON) | XMPP |

---

## React Frontend (`src/`)

### App.jsx — Central State Machine

`App.jsx` (~870 lines) is the single root component. It owns **all** top-level state and passes it down as props. There is no Redux, no Context API, no state management library.

#### State Variables (all declared with `useState`)

| State | Type | Persistence | Purpose |
|-------|------|-------------|---------|
| `status` | `"waiting"` / `"connecting"` / `"connected"` / `"disconnected"` | — | Connection status |
| `player` | `PlayerInfo \| null` | — | Current player info |
| `activeTab` | string | — | Current sidebar tab |
| `showLogs` | bool | `show_logs` | Show Logs tab in sidebar |
| `theme` | string | `app_theme` | Current theme name |
| `simplifiedTheme` | bool | `simplified_theme` | Use solid bg vs gradient |
| `customTheme` | object | `custom_theme` | Custom theme config |
| `discordRpc` | bool | `discord_rpc` | Discord RPC enabled |
| `startWithWindows` | bool | `start_with_windows` | Autostart |
| `startMinimized` | bool | `start_minimized` | Start in tray |
| `minimizeToTray` | bool | `minimize_to_tray` | Minimize to tray vs taskbar |
| `closeWithGame` | bool | `close_with_game` | Exit when Valorant closes |
| `devMode` | bool | `dev_mode` | Ctrl+Shift+I opens devtools |
| `disableAnimations` | bool | `disable_animations` | Disable all animations |
| `nodeInstalled` | bool | — | Node.js availability |
| `updateInfo` | object | — | Available update data |
| `updating` | bool | — | Update download in progress |
| `fakeStatusUnsaved` | bool | — | Block tab change if unsaved fake status |
| `logs` | array | — | Application logs (max 200) |
| `instalockActive` | bool | — | Instalock feature active |
| `henrikApiKey` | string | `henrik_api_key` | Henrik API key |
| `mapDodgeActive` | bool | — | Map dodge feature active |
| `pregameMatchId` | string | — | Current pregame match ID |
| `autoUnqueue` | bool | `auto_unqueue` | Auto leave queue after dodge |
| `autoRequeue` | bool | `auto_requeue` | Auto requeue after match end |
| `selectDelay` | number | `instalock_select_delay` | ms delay before selecting agent |
| `lockDelay` | number | `instalock_lock_delay` | ms delay before locking agent |

#### Key Refs

| Ref | Purpose |
|-----|---------|
| `connectingRef` | Prevents concurrent connect attempts |
| `instalockConfigRef` | Current instalock config (avoids re-render on config change) |
| `lockedMatchRef` | Match ID that has already been auto-locked (prevents double-lock) |
| `lockedAgentNameRef` | Name of locked agent (for RPC display) |
| `mapDodgeRef` | Current dodge config (blacklist Set + maps array) |
| `dodgedMatchRef` | Match ID already auto-dodged |
| `gamePhaseRef` | Current game phase: `"pregame"` / `"ingame"` / `null` |
| `rpcMatchInfoRef` | In-game score data for Discord RPC |
| `pendingUnqueueRef` | Pending auto-unqueue action |
| `pendingRequeueRef` | Pending auto-requeue action |

#### Core Loops (useEffect intervals)

1. **Auto-connect loop** — When `status === "waiting"`, polls `is_valorant_running` every 3s. Auto-connects when detected.
2. **Health check loop** — When `status === "connected"`, runs `health_check` + `check_loadout` + video hash check every 10s.
3. **Match polling loop** — When `instalockActive || mapDodgeActive` and connected, polls `check_current_game` every 3s. Handles:
   - Map dodge (auto-quit if map is blacklisted).
   - Instalock (select + lock agent with configurable delays, supports per-map agent selection).
   - Auto-unqueue after dodge detection.
   - Auto-requeue after match end detection.
   - Discord RPC updates (phase, score, agent name).
4. **Discord RPC loop** — Updates RPC every 5s based on game state.

#### Page Rendering

Pages use `AnimatePresence mode="wait"` for tab transitions. Each page is wrapped in a `motion.div` with fade-in/out animation.

**Special case:** `FakeStatusPage` uses `absolute inset-0` positioning and `hidden` class toggle instead of `AnimatePresence` because XMPP connections must persist when switching tabs (unmounting would kill the connection).

### Page Components

#### HomePage.jsx
- Shows player card (wide art), rank, RR, level, peak rank.
- Win/loss stats with bar chart.
- Competitive match history (paginated, 25 per page).
- Each match shows map icon, W/L, score, K/D/A, agent icon.
- Auto-refreshes stats every 5 minutes.
- Fetches map data from `valorant-api.com/v1/maps` (cached in module-level `mapCache`).

#### InstalockPage.jsx
- Two sub-tabs: "All Agents" (global default) and "Per-Map" selection.
- Fetches agents from `valorant-api.com/v1/agents` and maps from `valorant-api.com/v1/maps`.
- Filters out non-playable maps (`EXCLUDED_MAPS` constant).
- Checks owned agents via `get_owned_agents` command (grays out unowned).
- Supports a "None" agent option per map (disables instalock for that map).
- Config saved to `localStorage` key `instalock-config`.
- `saveConfig()` / `loadConfig()` helpers handle serialization.
- Toggle switch activates/deactivates the feature.

#### MapDodgePage.jsx
- Shows all competitive maps with splash art.
- Toggle per map to add to blacklist.
- Config saved to `localStorage` key `mapdodge-config`.
- Master toggle to activate/deactivate auto-dodge.
- Blacklisted maps shown with red border and crossed-out styling.

#### FakeStatusPage.jsx (~630 lines, largest component)
- XMPP-based presence spoofing UI.
- Three sections: **Rank & Identity**, **Game State**, **Premier**.
- On enable: connects XMPP, then sends fake presence every 3s via `setInterval`.
- On disable: disconnects XMPP.
- Fields: competitive tier (dropdown), account level, leaderboard position, player card ID, player title ID, session state, queue, party size, scores, premier division/tag/roster.
- Fetches card/title data from `valorant-api.com` for previews.
- Player card and title show preview images.
- "Unsaved changes" bar floats at bottom (absolute positioned) when config is dirty.
- Config persisted in `localStorage` key `fakestatus_config`.
- Has built-in log viewer (uses XMPP logs via `xmpp_get_logs`).
- Uses `xmpp_get_status` to get real card/title IDs (shown as "current" defaults).

#### PartyPage.jsx
- Shows current party members with cards, ranks, levels.
- Party management: kick members, open/close party, generate/disable invite code.
- Friends list with online status, sorted online-first then alphabetical.
- "Invite to party" (copy invite code) and join-by-code functionality.
- MMR lookup for each party member (fetched on load).
- Detects party leader for permission-gating kick/invite controls.

#### MatchInfoPage.jsx
- Polls `check_current_game` every 5s when connected.
- Pregame: shows agent select state with team composition.
- In-game: shows both teams with player info.
- For each player: resolves name, fetches MMR (tier + RR), shows agent icon.
- Optional Henrik API integration for extended account info (requires API key).
- Rank images from `valorant-api.com/v1/competitivetiers`.

#### MiscPage.jsx
- **Menu Video Customization**: Replace Valorant's main menu background video.
  - Auto-detects Valorant install path via `find_valorant_path`.
  - Backs up original video before first replacement.
  - Copies selected video to game directory (`ShooterGame\Content\Movies\Menu\12_00_Homescreen_VCT.mp4`).
  - Computes file hash for auto-restore (health check re-copies if game reverts).
  - Video preview using Tauri's `convertFileSrc` + asset protocol.
  - Config in `localStorage` key `menu_video_config`.
- **Queue Automation**: Toggle switches for auto-unqueue (after dodge) and auto-requeue (after match).

#### SettingsPage.jsx
- **Timing**: Instalock select delay and lock delay sliders (0-2000ms).
- **Henrik API Key**: Input field for the third-party API key.
- **Behavior**: Start with Windows, start minimized, minimize to tray, close with game.
- **Appearance**: Theme selector (7 presets + custom), simplified theme toggle, custom theme editor with gradient builder and color picker.
- **Other**: Show logs toggle, Discord RPC toggle, developer mode toggle, disable animations toggle.
- **Config Export/Import**: Exports all `localStorage` as a `.valthing` JSON file. Import restores it.
- **About section**: Shows current version string.

#### LogsPage.jsx
- Displays app logs with timestamps, type badges (INFO/ERR/MATCH), click-to-copy.
- Auto-scrolls to bottom on new entries.
- Clear button resets logs.

### Shared Components

#### TitleBar.jsx
- Custom window title bar (Tauri `decorations: false`).
- Drag region for window moving.
- Minimize button (supports minimize-to-tray).
- Close button (calls `exit_app` Tauri command, not window close).

#### Sidebar.jsx
- Navigation tabs with animated active indicator (`layoutId="sidebar-active"` spring animation).
- Tabs: Home, Instalock, Map Dodge, Fake Status, Party, Match Info, Misc, Logs (conditional).
- Bottom section: Dodge button (appears during pregame), player info, refresh button, settings button.
- Tab change is blocked if `fakeStatusUnsaved` is true and leaving the fake status tab.

#### PlayerInfo.jsx
- Shows player card thumbnail (8x8 rounded), name#tag, connection status dot.
- Click name to copy to clipboard (with tooltip).
- Status colors: green (connected), yellow (connecting/waiting), red (disconnected).

### Animation System

Two-layer animation disabling:

1. **framer-motion**: `<MotionConfig reducedMotion={disableAnimations ? "always" : "never"}>` wraps the entire app.
2. **CSS**: `.no-animations` class on `<html>` element sets `transition-duration: 0s !important; animation-duration: 0s !important;` on all elements.

For framer-motion animations with explicit `delay` or `staggerChildren` (which `MotionConfig` doesn't fully disable), each component has:
```jsx
const noAnim = () => localStorage.getItem("disable_animations") === "true";
const T0 = { duration: 0 };

// Usage:
<motion.div transition={noAnim() ? T0 : { duration: 0.2, delay: 0.05 }} ...>
```

**Pages with `noAnim` + `T0` pattern**: InstalockPage, MatchInfoPage, HomePage, MapDodgePage, PartyPage, MiscPage, SettingsPage.

### Theming System

#### CSS Variables (defined in `index.css`, extended in `tailwind.config.js`)

All colors use **space-separated RGB triplets** (e.g., `16 10 10`), consumed via Tailwind's `rgb(var(--name) / <alpha-value>)` pattern for opacity support.

| Variable | Tailwind Class | Purpose |
|----------|---------------|---------|
| `--base-900` | `bg-base-900` | Darkest background |
| `--base-800` | `bg-base-800` | Main background |
| `--base-700` | `bg-base-700` | Card/panel background |
| `--base-600` | `bg-base-600` | Elevated elements |
| `--base-500` | `bg-base-500` | Hover states |
| `--base-400` | `bg-base-400` | Active states |
| `--border` | `border-border` | Default border color |
| `--border-light` | `border-border-light` | Lighter border |
| `--text-primary` | `text-text-primary` | Main text |
| `--text-secondary` | `text-text-secondary` | Secondary text |
| `--text-muted` | `text-text-muted` | Muted/subtle text |
| `--val-red` | `text-val-red`, `bg-val-red` | Accent color (named "red" but changes per theme) |
| `--val-red-dark` | `bg-val-redDark` | Darker accent |
| `--accent-blue` | `text-accent-blue`, `bg-accent-blue` | Same as val-red (aliased) |
| `--status-green` | `text-status-green` | Success/online status |
| `--status-yellow` | `text-status-yellow` | Warning/connecting status |
| `--status-red` | `text-status-red` | Error/offline status |

#### Preset Themes (set via `data-theme` attribute on `<html>`)

| Theme | Accent Color | Vibe |
|-------|-------------|------|
| `crimson-moon` (default) | Red `#ed4245` | Dark red, Valorant-like |
| `radianite` | Teal `#00e6b4` | Dark teal/cyan |
| `midnight-blurple` | Blue/purple `#5865f2` | Discord-like |
| `chroma-glow` | Pink `#ff73fa` | Dark magenta |
| `forest` | Green `#43b581` | Dark green |
| `mars` | Orange `#f26522` | Warm dark orange |
| `dusk` | Gray `#99aab5` | Neutral/muted |
| `custom` | User-defined | User picks gradient stops + accent |

#### Custom Theme

Custom themes define:
- `accent` — hex color for the accent.
- `angle` — gradient angle in degrees.
- `stops` — array of `{ color: "#hex", pos: 0-100 }` gradient stops.

`deriveCustomVars(ct)` in App.jsx auto-generates all CSS variables from these parameters by mixing the darkest gradient stop with the accent color.

#### Background

- **Simplified theme** (`simplifiedTheme: true`): Solid `bg-base-800` backgrounds on container + sidebar + titlebar.
- **Gradient theme** (`simplifiedTheme: false`): Main container gets `linear-gradient(135deg, transparent 0%, rgb(var(--val-red) / 0.18) 100%), rgb(var(--base-900))` (or custom gradient for custom theme). Sidebar and title bar have no explicit bg (transparent over the gradient).

---

## Riot API Integration

### API Domains

| Domain Pattern | Name | Purpose |
|---------------|------|---------|
| `127.0.0.1:{port}` | Local API | Riot Client local endpoints (lockfile auth) |
| `auth.riotgames.com` | RSO | Account info (userinfo) |
| `pd.{shard}.a.pvp.net` | PD | Player Data — MMR, loadout, match history, store |
| `glz-{region}-1.{shard}.a.pvp.net` | GLZ | Game Logic Zone — pregame, coregame, party, queue |
| `riot-geo.pas.si.riotgames.com` | PAS | Player Affinity Service (XMPP routing) |
| `clientconfig.rpg.riotgames.com` | Client Config | Chat host resolution |
| `{host}:5223` | XMPP | Chat/presence (TLS) |
| `valorant-api.com` | Community API | Agent/map/rank assets and metadata (no auth needed) |
| `api.henrikdev.xyz` | Henrik API | Third-party API for extended player info |
| `api.github.com` | GitHub | Update checking (latest release) |

### Authentication

```
Local API:    Authorization: Basic base64("riot:{lockfile_password}")
RSO:          Authorization: Bearer {access_token}
PD/GLZ:       Authorization: Bearer {access_token}
              X-Riot-Entitlements-JWT: {entitlements_jwt}
              X-Riot-ClientPlatform: {PLATFORM_BASE64}
              X-Riot-ClientVersion: {client_version}
Henrik:       Authorization: {api_key}
```

### Region/Shard

- **Region** examples: `na`, `eu`, `ap`, `kr`
- **Shard** examples: `na`, `eu`, `ap`, `kr`
- Parsed from the last occurrence of `glz-{region}-1.{shard}.a.pvp.net` in ShooterGame.log.

---

## localStorage Keys

| Key | Type | Used By | Description |
|-----|------|---------|-------------|
| `app_theme` | string | App.jsx, SettingsPage | Current theme name |
| `simplified_theme` | `"true"/"false"` | App.jsx, SettingsPage | Solid vs gradient backgrounds |
| `custom_theme` | JSON | App.jsx, SettingsPage | Custom theme config (accent, angle, stops) |
| `discord_rpc` | `"true"/"false"` | App.jsx, SettingsPage | Discord RPC enabled |
| `start_with_windows` | `"true"/"false"` | App.jsx, SettingsPage | Autostart |
| `start_minimized` | `"true"/"false"` | App.jsx, SettingsPage | Start hidden in tray |
| `minimize_to_tray` | `"true"/"false"` | App.jsx, SettingsPage | Minimize behavior |
| `close_with_game` | `"true"/"false"` | App.jsx, SettingsPage | Exit when Valorant closes |
| `dev_mode` | `"true"/"false"` | App.jsx, SettingsPage | Enable Ctrl+Shift+I |
| `disable_animations` | `"true"/"false"` | App.jsx, SettingsPage, all pages | Disable all animations |
| `show_logs` | `"true"/"false"` | App.jsx, SettingsPage | Show Logs tab |
| `henrik_api_key` | string | App.jsx, SettingsPage, MatchInfoPage | Henrik API key |
| `instalock_select_delay` | number string | App.jsx, SettingsPage | Agent select delay (ms) |
| `instalock_lock_delay` | number string | App.jsx, SettingsPage | Agent lock delay (ms) |
| `auto_unqueue` | `"true"/"false"` | App.jsx, MiscPage | Auto leave queue after dodge |
| `auto_requeue` | `"true"/"false"` | App.jsx, MiscPage | Auto requeue after match |
| `instalock-config` | JSON | InstalockPage | `{ defaultAgent, perMap, active }` |
| `mapdodge-config` | JSON | MapDodgePage, App.jsx | `{ blacklist: [], active }` |
| `fakestatus_config` | JSON | FakeStatusPage | Fake presence settings |
| `menu_video_config` | JSON | MiscPage, App.jsx (health check) | `{ backupPath, destPath, hash }` |

**Config export/import** (SettingsPage): Exports ALL localStorage as a `.valthing` JSON file. Import merges into existing localStorage and reloads the page.

---

## External APIs

### valorant-api.com (Community, no auth)

| Endpoint | Used For |
|----------|---------|
| `/v1/agents?isPlayableCharacter=true` | Agent list (InstalockPage, MatchInfoPage) |
| `/v1/maps` | Map list + splash art (InstalockPage, MapDodgePage, HomePage) |
| `/v1/version` | Client version string (connection.rs) |
| `/v1/competitivetiers` | Rank icons and names (MatchInfoPage) |
| `/v1/playercards` | Card art (FakeStatusPage) |
| `/v1/playertitles` | Title names (FakeStatusPage) |

Image CDN patterns:
```
https://media.valorant-api.com/agents/{uuid}/displayicon.png
https://media.valorant-api.com/agents/{uuid}/displayiconsmall.png
https://media.valorant-api.com/playercards/{uuid}/smallart.png
https://media.valorant-api.com/playercards/{uuid}/wideart.png
https://media.valorant-api.com/competitivetiers/{tierUuid}/{tier}/smallicon.png
https://media.valorant-api.com/maps/{uuid}/splash.png
https://media.valorant-api.com/maps/{uuid}/listviewicon.png
```

### Henrik API (requires API key)

| Endpoint | Used For |
|----------|---------|
| `/valorant/v1/by-puuid/account/{puuid}` | Account lookup by puuid |
| `/valorant/v2/by-puuid/mmr/{region}/{puuid}` | MMR/rank data by puuid |

### GitHub API (no auth)

| Endpoint | Used For |
|----------|---------|
| `/repos/AjaxFNC-YT/Valorant-Thing/releases/latest` | Auto-update check |

---

## Common Patterns & Conventions

### Adding a New Tauri Command

1. Write the function in the appropriate Rust module (e.g., `game.rs` for game features).
2. If it needs `ConnectionState`, use the helper `get_glz_creds()` or `get_local_creds()`.
3. Add a `pub use` in `riot/mod.rs` if it's in a submodule.
4. Add the `#[tauri::command]` wrapper in `lib.rs` following the `spawn_blocking` pattern.
5. Add the command name to the `tauri::generate_handler![]` list in `lib.rs`.
6. Call from frontend: `await invoke("command_name", { param1: value })`.

### Adding a New Page

1. Create `src/components/NewPage.jsx`.
2. Export a default function component.
3. Import in `App.jsx`.
4. Add a `NavButton` in `Sidebar.jsx` (with inline SVG icon).
5. Add the `activeTab === "newpage"` render block in `App.jsx`'s `<AnimatePresence>`.
6. Wrap in `<motion.div>` with the standard page transition: `initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15, ease: "easeOut" }}`.

### Adding a New Setting

1. Add `useState` in `App.jsx` with `localStorage` initializer.
2. Add `useEffect` for persistence: `localStorage.setItem("key", String(value))`.
3. Pass as prop + onChange handler to `SettingsPage.jsx`.
4. Add UI toggle/input in the appropriate settings section.

### UI Component Patterns

- **Section cards**: `<div className="p-4 rounded-xl bg-base-700 border border-border space-y-4">`.
- **Section headers**: `<h3 className="text-xs font-display font-medium text-text-secondary uppercase tracking-wider">`.
- **Toggle switches**: Custom `<button>` with conditional `bg-val-red` / `bg-base-500`, inner dot with `translate-x`.
- **Buttons**: `rounded-lg bg-val-red text-white text-xs font-display font-semibold hover:brightness-110 transition-all`.
- **Text inputs**: `bg-base-600 border border-border rounded-lg px-3 py-1.5 text-xs font-body text-text-primary`.
- **Loading spinners**: `<div className="w-5 h-5 border-2 border-val-red/30 border-t-val-red rounded-full animate-spin" />`.
- **Empty states**: Centered SVG icon + text, `text-text-muted`.

### Invoke Pattern

Frontend always calls Rust via `invoke()`:
```jsx
import { invoke } from "@tauri-apps/api/core";

// Simple
const result = await invoke("command_name");

// With params (camelCase in JS → snake_case auto-converted by Tauri)
const result = await invoke("get_match_page", { page: 0, pageSize: 25 });

// Result is always a string for JSON responses — parse manually
const data = JSON.parse(result);
```

### Error Handling Pattern

```jsx
try {
  const raw = await invoke("some_command");
  const data = JSON.parse(raw);
  // use data
} catch (err) {
  const errMsg = typeof err === "string" ? err : err?.message || String(err);
  addLog("error", `[Feature] Failed: ${errMsg}`);
}
```

### Ref Pattern for Intervals

State that's read inside `setInterval` or `setTimeout` callbacks uses refs to avoid stale closures:
```jsx
const [value, setValue] = useState(initial);
const valueRef = useRef(value);
useEffect(() => { valueRef.current = value; }, [value]);

// In interval callback:
if (valueRef.current) { ... }
```

---

## Window Configuration

From `tauri.conf.json`:
- **Size**: 1100 x 700, not resizable, not maximizable.
- **Decorations**: false (custom title bar).
- **Transparent**: true (for rounded corners).
- **Center**: true (opens centered on screen).
- **CSP**: null (no content security policy restriction).
- **Asset Protocol**: enabled with `**` scope (for local video file serving).

## System Tray

- Left-click tray icon → show + focus window.
- Right-click → menu with "Show" and "Quit".
- Minimize-to-tray sends a notification "Minimized to system tray."

## Auto-Update Flow

1. On startup, `check_for_update` spawns Node to GET GitHub releases API.
2. Compares semver of latest release tag vs `CARGO_PKG_VERSION`.
3. If newer, shows modal with "Update Now" button.
4. `download_and_install_update` uses `curl` to download the `.exe` installer to `%TEMP%`.
5. Creates a `.bat` that waits 2s then launches the installer.
6. Exits the app so the installer can replace files.
