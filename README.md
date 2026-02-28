<p align="center">
  <img src="src-tauri/icons/icon.png" width="80" />
</p>

<h1 align="center">Valorant Thing</h1>

<p align="center">
  <b>The ultimate Valorant companion app.</b><br/>
  Instalock agents, dodge maps, spoof your status, manage parties, view live match info, get notifications, share configs — all in one sleek desktop app.<br/>
  Built with <b>Tauri v2 + Rust + React</b>.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows-0078D4?style=for-the-badge&logo=windows&logoColor=white" />
  <img src="https://img.shields.io/badge/Tauri-v2-FFC131?style=for-the-badge&logo=tauri&logoColor=white" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/Rust-Backend-DEA584?style=for-the-badge&logo=rust&logoColor=black" />
</p>

> [!WARNING]
> This project is **not affiliated with or endorsed by Riot Games**. Use at your own risk. The app interacts with local and remote Valorant APIs — while it doesn't modify game files, automated agent locking and match dodging may violate Riot's Terms of Service.

---

## Screenshots

<table>
  <tr>
    <td align="center"><img src="screenshots/home.png" width="480" /><br/><sub><b>Home</b> — Stats, rank, and match history</sub></td>
    <td align="center"><img src="screenshots/instalock.png" width="480" /><br/><sub><b>Agent Instalock</b> — Role-grouped grid with per-map selection</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="screenshots/match-info.png" width="480" /><br/><sub><b>Live Match Info</b> — Real-time ranks, agents, and scores</sub></td>
    <td align="center"><img src="screenshots/map-dodge.png" width="480" /><br/><sub><b>Map Dodge</b> — Blacklist maps with one click</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="screenshots/fake-status.png" width="480" /><br/><sub><b>Fake Status</b> — Spoof your presence via XMPP</sub></td>
    <td align="center"><img src="screenshots/settings.png" width="480" /><br/><sub><b>Settings</b> — Themes, share codes, and configuration</sub></td>
  </tr>
</table>

---

## Features

### Agent Instalock
Pick a default agent or configure **per-map selections** — the app automatically selects and locks your agent the instant you enter agent select. Agents are displayed in a **role-grouped grid** (Duelist, Initiator, Controller, Sentinel) with role filter buttons matching the real game's agent select screen. Unowned agents show a lock icon overlay. Configurable select and lock delays for fine-tuning.

**Profiles** — Save multiple agent configurations as named profiles. Switch between setups instantly.

### Map Dodge
Blacklist maps you don't want to play. Maps are split into **Standard** and **Deathmatch** sections. When the app detects a blacklisted map in agent select, it auto-dodges. Simple as that.

### Fake Status
Spoof your Valorant presence via **XMPP** — show any rank, level, game state, player card, title, and Premier info to anyone viewing your profile. Toggle on/off with live XMPP log viewer. Unsaved changes are caught with a save/discard prompt when navigating away.

### Live Match Info
See all players in your current match with their **agents, ranks, RR, and account levels**. Works in both agent select and in-game. Shows the current map, game mode, server, and live score.

### Party Management
View party members, kick players, generate/join party codes, toggle open/closed party, invite friends, request to join, and manage queue state — all from one page.

### Notifications
Get overlay notifications for **match found** (with map name), **agent locking** (countdown), **agent locked** (confirmation), **dodge**, and **queue actions**. Choose which **monitor** notifications appear on and pick a corner position (top-left, top-right, bottom-left, bottom-right). Notifications render in a transparent overlay window that doesn't steal the game focus.

### Share Codes & Cloud Sync
Share your agent profiles, custom themes, and full app configs with a single code:
- `VT-AGENT-XXXXX` — Agent profile
- `VT-THEME-XXXXX` — Custom theme
- `VT-CONFIG-XXXXX` — Full settings

Import/export via share codes or `.vt` files. Cloud API powered by Rust (`reqwest`), no JS fetch.

### Discord Rich Presence
Shows your current activity in Discord:
- Game phase (lobby, agent select, in-game)
- Locked agent name and live match score
- Active features (autolocking, map dodging)

### Customization
**8 built-in themes** (Crimson Moon, Radianite, Midnight Blurple, Chroma Glow, Forest, Mars, Dusk) plus a **fully custom theme builder** with gradient angle editor, color stop picker, and live preview. Simplified mode strips the gradient for a flat look.

### Queue Automation
- **Auto Unqueue** — Automatically leaves queue when someone dodges
- **Auto Requeue** — Instantly requeues after a match ends

### System Integration
- **System tray** — Minimize to tray, left-click to restore, right-click for Show/Quit
- **Start with Windows** — Auto-launch on boot, optionally minimized to tray
- **Close with game** — Exit the app when Valorant closes

### Developer Tools
Hidden debug page — run `__VT_DEV()` in the console to enable. Includes log viewer, notification tester, cloud save/load tester, and state inspector.

---

## How It Works

```
┌─────────────────┐     ┌───────────────────┐     ┌────────────────────┐
│  React Frontend │────▶│   Rust Backend    │────▶│   Riot APIs       │
│  (Tauri WebView)│◀────│   (Tauri Commands)│◀────│  (Local + Remote) │
└─────────────────┘     └───────────────────┘     └────────────────────┘
```

**Local Valorant Client API** — Reads the lockfile for port + auth token. Used for entitlement tokens, chat, presence data, and XMPP.

**Riot PD / GLZ APIs** — Authenticated remote endpoints for player data, MMR, match details, agent select/lock, party management, queue state, and dodge.

**valorant-api.com** — Public community API for static assets (agent icons, map images, rank icons, player cards/titles).

**Splooshima API** *(optional fallback)* — Third-party API for extended player info when Riot's endpoints don't return enough data.

**VT Cloud** (`vt-cloud.ajaxfnc.com`) — Share code storage for profiles, themes, and configs. No auth required.

All API calls happen in the **Rust backend** — the React frontend never touches credentials directly.

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | [Tauri v2](https://v2.tauri.app) |
| Frontend | React 19 + TailwindCSS 4 |
| Backend | Rust (reqwest, native-tls, serde, base64, regex) |
| XMPP | Native TLS socket for presence spoofing |
| Cloud | reqwest → `vt-cloud.ajaxfnc.com` |
| Discord | `discord-rich-presence` crate via IPC |
| Packaging | NSIS installer (Windows) |

---

## Building from Source

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://rustup.rs/) (stable)
- [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/)

### Setup

```bash
git clone https://github.com/AjaxFNC-YT/Valorant-Thing.git
cd Valorant-Thing
npm install
```

### Development

```bash
npx tauri dev
```

### Production Build

```bash
npx tauri build
```

The installer will be output to:
```
src-tauri/target/release/bundle/nsis/Valorant Thing_x.x.x_x64-setup.exe
```

---

## Configuration

All settings persist in `localStorage` between sessions:

| Setting | Default | Description |
|---------|---------|-------------|
| Theme | Crimson Moon | App color theme (8 presets + custom) |
| Simplified Theme | Off | Flat solid backgrounds |
| Discord RPC | On | Show status in Discord |
| Notifications | On | Overlay notifications for match events |
| Notification Position | Top Right | Corner position for notification toasts |
| Notification Monitor | Game | Which display shows notifications |
| Start with Windows | Off | Auto-launch on boot |
| Start Minimized | Off | Launch hidden in tray |
| Close with Game | Off | Exit when Valorant closes |
| Select Delay | 0ms | Delay before agent select |
| Lock Delay | 500ms | Delay before agent lock |
| Splooshima API Key | — | Optional fallback for player data |

---

## License

Proprietary
