# Valorant API Docs — Full Endpoint Reference

Source: https://valapidocs.techchrism.me/

---

## Authentication Flow

### POST Auth Cookies
- **URL:** `https://auth.riotgames.com/api/v1/authorization`
- **Purpose:** Initialize auth session, get cookies for subsequent requests

### PUT Auth Request
- **URL:** `https://auth.riotgames.com/api/v1/authorization`
- **Body:** `{"type": "auth", "username": "...", "password": "..."}`
- **Returns:** Access token in redirect URI, or MFA prompt
- **Use for:** Remote authentication (non-local)

### PUT Multi-Factor Authentication
- **URL:** `https://auth.riotgames.com/api/v1/authorization`
- **Body:** `{"type": "multifactor", "code": "123456"}`
- **Use for:** 2FA code submission

### GET Cookie Reauth
- **URL:** `https://auth.riotgames.com/authorize?redirect_uri=...&client_id=...`
- **Use for:** Re-authenticate using existing cookies without username/password

### POST Entitlement
- **URL:** `https://entitlements.auth.riotgames.com/api/token/v1`
- **Returns:** Entitlements JWT token
- **Use for:** Required header for PD/GLZ endpoints

### GET Player Info
- **URL:** `https://auth.riotgames.com/userinfo`
- **Returns:** PUUID, game name, tag line, account info
- **Use for:** Getting player identity from auth token

### PUT Riot Geo
- **URL:** `https://riot-geo.pas.si.riotgames.com/pas/v1/product/valorant`
- **Returns:** Player's region and shard
- **Use for:** Determining correct API base URLs

### GET PAS Token
- **URL:** `https://riot-geo.pas.si.riotgames.com/pas/v1/service/chat`
- **Returns:** PAS token for XMPP
- **Use for:** Chat/presence connections

### GET Riot Client Config
- **URL:** `https://clientconfig.rpg.riotgames.com/api/v1/config/player`
- **Returns:** Client configuration flags
- **Use for:** Feature flags, client settings

---

## XMPP

### TCP XMPP Connection
- **Host:** `{region}.chat.si.riotgames.com:5223`
- **Protocol:** TLS XMPP
- **Use for:** Real-time presence updates, chat messages, friend status changes
- **Note:** This is a persistent TCP connection, not HTTP. Provides live events for presence changes.

---

## PVP Endpoints

Base: `https://pd.{shard}.a.pvp.net`

### GET Fetch Content
- **Path:** `/content-service/v3/content`
- **Base:** shared (`https://shared.{shard}.a.pvp.net`)
- **Returns:** Game content definitions — agents, maps, modes, seasons, acts, ceremonies, competitive tiers
- **Use for:** UUID resolution, building local content database

### GET Account XP
- **Path:** `/account-xp/v1/players/{puuid}`
- **Returns:** Account level, total XP, XP per match history, XP bonuses
- **Use for:** Level display, XP progress tracking, daily/weekly bonus tracking

### GET Player Loadout
- **Path:** `/personalization/v2/players/{puuid}/playerloadout`
- **Returns:** Full equipped loadout — gun skins (per weapon), skin chromas, buddies, sprays (pre-round, mid-round, post-round), player card, player title, account level border
- **Use for:** Loadout viewer, skin showcase

### PUT Set Player Loadout
- **Path:** `/personalization/v2/players/{puuid}/playerloadout`
- **Body:** Modified loadout object
- **Use for:** Equip skins, change player card/title, swap buddies, set sprays
- **Note:** Takes effect next game start

### GET Player MMR
- **Path:** `/mmr/v1/players/{puuid}`
- **Returns:** Current rank, RR, peak rank per season, rank history, latest competitive update with RR delta
- **Use for:** Rank tracker, RR graphs, season-by-season rank history, peak rank display

### GET Match History
- **Path:** `/match-history/v1/history/{puuid}?startIndex=0&endIndex=15&queue=competitive`
- **Query:** startIndex, endIndex, queue (competitive/unrated/deathmatch/spikerush/ggteam/newmap/onefa/snowball/custom)
- **Returns:** Array of match entries with MatchID, GameStartTime, QueueID
- **Use for:** Match history list, paginated match browsing

### GET Match Details
- **Path:** `/match-details/v1/matches/{matchId}`
- **Returns:** Complete match data:
  - Match info (map, mode, duration, server, season)
  - All players (PUUID, name, agent, team, rank, stats)
  - Per-round data (outcome, plant/defuse, economy)
  - Kill events (killer, victim, weapon, position, assistants, headshot)
  - Damage events (instigator, receiver, damage, legshots/bodyshots/headshots)
  - Economy per round (loadout value, spent, remaining)
  - Ability casts per round
- **Use for:** Full post-match analysis, damage breakdown, kill feed replay, economy graphs, round timeline

### GET Competitive Updates
- **Path:** `/mmr/v1/players/{puuid}/competitiveupdates?startIndex=0&endIndex=15&queue=competitive`
- **Returns:** Recent comp matches with: MatchID, MapID, TierAfterUpdate, TierBeforeUpdate, RankedRatingAfterUpdate, RankedRatingBeforeUpdate, RankedRatingEarned, CompetitiveMovement (PROMOTED/DEMOTED/STABLE)
- **Use for:** RR gain/loss tracker, rank up/down alerts, elo graph

### GET Leaderboard
- **Path:** `/mmr/v1/leaderboards/affinity/{region}/queue/competitive/season/{seasonId}?startIndex=0&size=25`
- **Query:** startIndex, size, query (search by name)
- **Returns:** Leaderboard entries with rank position, name, tag, RR, wins
- **Use for:** Leaderboard viewer, checking if player is Radiant/Immortal

### GET Penalties
- **Path:** `/restrictions/v3/penalties`
- **Returns:** Active penalties — type, expiry time, reason
- **Use for:** Ban/restriction status display, cooldown timers

### GET Config
- **Path:** `/v1/config/{region}` (shared)
- **Returns:** Internal Riot config values
- **Use for:** Feature flags, maintenance detection

### PUT Name Service
- **Path:** `/name-service/v2/players`
- **Body:** Array of PUUIDs
- **Returns:** Display names and taglines for each PUUID
- **Use for:** Bulk PUUID → name resolution

---

## Store Endpoints

Base: `https://pd.{shard}.a.pvp.net`

### GET Prices
- **Path:** `/store/v1/offers/`
- **Returns:** All item prices — VP cost, Radianite cost per item UUID
- **Use for:** Price database, value calculations

### GET Storefront
- **Path:** `/store/v2/storefront/{puuid}`
- **Returns:**
  - **FeaturedBundle:** Current featured bundle with items, price, time remaining
  - **SkinsPanelLayout:** 4 daily rotating skins with UUIDs and prices
  - **BonusStore:** Night market items (when active) with discounts
  - **AccessoryStore:** Accessory offers
- **Timers:** SingleItemOffersRemainingDurationInSeconds, BundleRemainingDurationInSeconds
- **Use for:** Daily store viewer, bundle tracker, night market display, store reset countdown

### GET Wallet
- **Path:** `/store/v1/wallet/{puuid}`
- **Returns:** Currency balances by UUID
  - VP: `85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741`
  - Radianite: `e59aa87c-4cbf-517a-5983-6e81511be9b7`
  - Free agents: `f08d4ae3-939c-4576-ab26-09ce1f23bb37`
  - Kingdom Credits: `85ca954a-41f2-ce94-9b45-8ca3dd39a00d`
- **Use for:** Currency display, purchase affordability checks

### GET Owned Items
- **Path:** `/store/v1/entitlements/{puuid}/{itemTypeId}`
- **Returns:** Array of owned item UUIDs for the given type
- **Use for:** Collection tracker, "owned" badges, inventory management

---

## Party Endpoints

Base: `https://glz-{region}-1.{shard}.a.pvp.net`

### GET Party
- **Path:** `/parties/v1/parties/{partyId}`
- **Returns:** Full party state — members (with identity, ready status, pings, competitive tier), queue, matchmaking state, accessibility, custom game settings, party code
- **Use for:** Party viewer, member cards, queue status

### GET Party Player
- **Path:** `/parties/v1/players/{puuid}`
- **Returns:** CurrentPartyID, Requests array
- **Use for:** Getting party ID for other calls

### DELETE Party Remove Player
- **Path:** `/parties/v1/players/{puuid}`
- **Use for:** Kick from party

### POST Party Set Member Ready
- **Path:** `/parties/v1/parties/{partyId}/members/{puuid}/setReady`
- **Body:** `{"ready": true}`
- **Use for:** Ready toggle

### POST Refresh Competitive Tier
- **Path:** `/parties/v1/parties/{partyId}/members/{puuid}/refreshCompetitiveTier`
- **Use for:** Force rank refresh in party

### POST Refresh Player Identity
- **Path:** `/parties/v1/parties/{partyId}/members/{puuid}/refreshPlayerIdentity`
- **Use for:** Force identity refresh

### POST Refresh Pings
- **Path:** `/parties/v1/parties/{partyId}/members/{puuid}/refreshPings`
- **Use for:** Refresh ping data

### POST Change Queue
- **Path:** `/parties/v1/parties/{partyId}/queue`
- **Body:** `{"queueID": "competitive"}`
- **Use for:** Switch game mode

### POST Start Custom Game
- **Path:** `/parties/v1/parties/{partyId}/startcustomgame`
- **Use for:** Launch custom game

### POST Enter Matchmaking Queue
- **Path:** `/parties/v1/parties/{partyId}/matchmaking/join`
- **Use for:** Start searching for match

### POST Leave Matchmaking Queue
- **Path:** `/parties/v1/parties/{partyId}/matchmaking/leave`
- **Use for:** Cancel search

### POST Set Party Accessibility
- **Path:** `/parties/v1/parties/{partyId}/accessibility`
- **Body:** `{"accessibility": "OPEN" | "CLOSED"}`
- **Use for:** Open/close party

### POST Set Custom Game Settings
- **Path:** `/parties/v1/parties/{partyId}/customgamesettings`
- **Body:** Map URL, Mode URL, GamePod (server), GameRules
- **Use for:** Custom game configuration

### POST Party Invite
- **Path:** `/parties/v1/parties/{partyId}/invites/name/{name}/tag/{tag}`
- **Use for:** Invite by display name

### POST Party Request
- **Path:** `/parties/v1/parties/{partyId}/request`
- **Body:** `{"Subjects": ["{puuid}"]}`
- **Use for:** Request to join

### POST Party Decline
- **Path:** `/parties/v1/parties/{partyId}/request/{requestId}/decline`
- **Use for:** Decline join request

### GET Custom Game Configs
- **Path:** `/parties/v1/parties/customgameconfigs`
- **Returns:** Available maps, modes, servers
- **Use for:** Custom game setup dropdowns

### GET Party Chat Token
- **Path:** `/parties/v1/parties/{partyId}/muctoken`
- **Use for:** Party chat access

### GET Party Voice Token
- **Path:** `/parties/v1/parties/{partyId}/voicetoken`
- **Use for:** Party voice access

### DELETE Party Disable Code
- **Path:** `/parties/v1/parties/{partyId}/invitecode`
- **Use for:** Remove party code

### POST Party Generate Code
- **Path:** `/parties/v1/parties/{partyId}/invitecode`
- **Use for:** Generate shareable party code

### POST Party Join By Code
- **Path:** `/parties/v1/players/{puuid}/joinbycode/{code}`
- **Use for:** Join party via code

---

## Pre-Game Endpoints (Agent Select)

Base: `https://glz-{region}-1.{shard}.a.pvp.net`

### GET Pre-Game Player
- **Path:** `/pregame/v1/players/{puuid}`
- **Returns:** MatchID for current agent select
- **Use for:** Detecting agent select phase

### GET Pre-Game Match
- **Path:** `/pregame/v1/matches/{matchId}`
- **Returns:** Full agent select state — all players (PUUID, character selection, character selection state, is locked), map, mode, team assignments, timer
- **Use for:** Agent select overlay, teammate picks, map display

### GET Pre-Game Loadouts
- **Path:** `/pregame/v1/matches/{matchId}/loadouts`
- **Returns:** All player loadouts during agent select
- **Use for:** Skin viewer during agent select

### POST Select Character
- **Path:** `/pregame/v1/matches/{matchId}/select/{agentId}`
- **Use for:** Hover an agent

### POST Lock Character
- **Path:** `/pregame/v1/matches/{matchId}/lock/{agentId}`
- **Use for:** Lock in agent

### POST Pre-Game Quit
- **Path:** `/pregame/v1/matches/{matchId}/quit`
- **Use for:** Dodge match

---

## Current Game Endpoints (In-Match)

Base: `https://glz-{region}-1.{shard}.a.pvp.net`

### GET Current Game Player
- **Path:** `/core-game/v1/players/{puuid}`
- **Returns:** MatchID for current live game
- **Use for:** Detecting active match

### GET Current Game Match
- **Path:** `/core-game/v1/matches/{matchId}`
- **Returns:** Full live match state — all players (PUUID, agent, team, account level, incognito status), map, mode, server, provisioning state, score
- **Use for:** Live match overlay, scoreboard, player lookup

### GET Current Game Loadouts
- **Path:** `/core-game/v1/matches/{matchId}/loadouts`
- **Returns:** All player skins, sprays, buddies in the live match
- **Use for:** Skin viewer during match

### POST Current Game Quit
- **Path:** `/core-game/v1/players/{puuid}/disassociate/{matchId}`
- **Use for:** Leave match

---

## Contract Endpoints

Base: `https://pd.{shard}.a.pvp.net`

### GET Item Upgrades
- **Path:** `/contract-definitions/v3/item-upgrades`
- **Returns:** Skin upgrade progression definitions (levels, chromas, costs)
- **Use for:** Skin upgrade tracker

### GET Contracts
- **Path:** `/contracts/v1/contracts/{puuid}`
- **Returns:** All contracts with progress — XP earned, rewards unlocked, active contract
- **Use for:** Contract/battlepass progress tracker

### POST Activate Contract
- **Path:** `/contracts/v1/contracts/{puuid}/special/{contractId}`
- **Use for:** Switch active contract/agent contract

---

## Local Endpoints

Base: `https://127.0.0.1:{port}` (from lockfile)
Auth: `Basic base64("riot:{password}")`

### GET Local Help
- **Path:** `/help`
- **Returns:** List of all available local endpoints
- **Use for:** Endpoint discovery

### GET Sessions
- **Path:** `/product-session/v1/external-sessions`
- **Returns:** Running game sessions with launch args, PID
- **Use for:** Detecting if Valorant is running

### GET RSO User Info
- **Path:** `/rso-auth/v1/authorization/userinfo`
- **Returns:** User info from RSO
- **Use for:** Account details

### GET Client Region
- **Path:** `/riotclient/region-locale`
- **Returns:** Region and locale settings
- **Use for:** Region detection

### GET Account Alias
- **Path:** `/player-account/aliases/v1/active`
- **Returns:** Active game name and tagline
- **Use for:** Current player display name

### GET Entitlements Token
- **Path:** `/entitlements/v1/token`
- **Returns:** Access token (accessToken), entitlements JWT (token), PUUID (subject)
- **Use for:** Getting auth for PD/GLZ endpoints

### GET Chat Session
- **Path:** `/chat/v1/session`
- **Returns:** PUUID, game_name, game_tag, PID, loaded, resource
- **Use for:** Player identity, connection status

### GET Friends
- **Path:** `/chat/v4/friends`
- **Returns:** Full friends list with PUUID, name, tag, note, game name
- **Use for:** Friends list display

### POST Send Friend Request
- **Path:** `/chat/v4/friendrequests`
- **Body:** `{"game_name": "...", "game_tag": "..."}`
- **Use for:** Send friend request

### DELETE Remove Friend Request
- **Path:** `/chat/v4/friendrequests/{puuid}`
- **Use for:** Cancel/decline friend request

### GET Presence
- **Path:** `/chat/v4/presences`
- **Returns:** All friend presences with base64-encoded `private` field containing:
  - isValid, sessionLoopState, partyOwnerSessionLoopState
  - customGameName, customGameTeam
  - partyOwnerMatchMap, partyOwnerMatchCurrentTeam, partyOwnerMatchScoreAllyTeam, partyOwnerMatchScoreEnemyTeam
  - partyOwnerProvisioningFlow, partyOwnerMatchRRPenalty
  - partyId, partySize, partyVersion, partyClientVersion
  - queueId, queueEntryTime
  - competitiveTier, preferredLevelBorder
  - isIdle, playerCardId, playerTitleId, accountLevel
- **Use for:** Rich friend status, detecting what everyone is doing, party info

### GET Friend Requests
- **Path:** `/chat/v4/friendrequests`
- **Returns:** Pending incoming/outgoing friend requests
- **Use for:** Friend request notifications

### GET Local Swagger Docs
- **Path:** `/swagger/v3/openapi.json`
- **Returns:** OpenAPI spec for all local endpoints
- **Use for:** Endpoint discovery, documentation

### WSS Local WebSocket
- **URL:** `wss://riot:{password}@127.0.0.1:{port}`
- **Returns:** Real-time events for:
  - Presence changes
  - Friend requests
  - Chat messages
  - Game state changes
- **Use for:** Live event streaming without polling

---

## Local Chat Endpoints

### GET Party Chat Info
- **Path:** `/chat/v6/conversations/ares-parties`
- **Returns:** Party chat conversation info
- **Use for:** Party chat display

### GET Pre-Game Chat Info
- **Path:** `/chat/v6/conversations/ares-pregame`
- **Returns:** Agent select chat info
- **Use for:** Pre-game chat display

### GET Current Game Chat Info
- **Path:** `/chat/v6/conversations/ares-coregame`
- **Returns:** In-game chat info
- **Use for:** In-game chat display

### GET All Chat Info
- **Path:** `/chat/v6/conversations`
- **Returns:** All active conversations
- **Use for:** Unified chat view

### GET Chat Participants
- **Path:** `/chat/v6/conversations/{cid}/participants`
- **Returns:** Participants in a conversation
- **Use for:** Chat member list

### POST Send Chat
- **Path:** `/chat/v6/conversations/{cid}/messages`
- **Body:** `{"cid": "...", "message": "...", "type": "chat"}`
- **Use for:** Send chat messages

### GET Chat History
- **Path:** `/chat/v6/conversations/{cid}/messages`
- **Returns:** Message history for a conversation
- **Use for:** Chat log display

---

## External Resources

### valorant-api.com
- **URL:** `https://valorant-api.com/v1/`
- **Endpoints:**
  - `/agents` — All agent data with abilities, images
  - `/buddies` — Gun buddy data with images
  - `/bundles` — Store bundle data
  - `/ceremonies` — Win ceremonies
  - `/competitivetiers` — Rank tier data with icons
  - `/contenttiers` — Content tier data (skin rarity)
  - `/currencies` — Currency definitions
  - `/events` — Game events
  - `/gamemodes` — Game mode data
  - `/gear` — Armor data
  - `/levelborders` — Account level border images
  - `/maps` — Map data with images, callouts
  - `/playercards` — Player card images
  - `/playertitles` — Player title text
  - `/seasons` — Season/act data with dates
  - `/sprays` — Spray data with images
  - `/themes` — Skin themes
  - `/weapons` — All weapons with skins, chromas, levels, images, videos
  - `/version` — Current game version string
- **Use for:** Asset images, names, icons — everything visual. This is the go-to for displaying any game content.