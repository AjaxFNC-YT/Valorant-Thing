use base64::Engine;
use std::sync::Mutex;
use std::time::Instant;

use super::types::{ConnectionState, PlayerInfo};
use super::http::{local_get, https_get, authed_get, pd_get};
use super::process::{read_lockfile, is_pid_alive, is_riot_client_running, parse_region_shard};
use super::logging::{log_info, log_error};

pub fn connect_and_store(state: &Mutex<ConnectionState>) -> Result<PlayerInfo, String> {
    log_info("[Connect] Reading lockfile...");
    let (pid, port, password) = read_lockfile()?;

    if !is_pid_alive(pid) {
        return Err(format!("Riot Client PID {} is dead (stale lockfile)", pid));
    }

    let local_auth = format!(
        "Basic {}",
        base64::engine::general_purpose::STANDARD.encode(format!("riot:{}", password))
    );

    log_info(&format!("[Connect] Fetching entitlements (port={}, pid={})...", port, pid));
    let tokens_raw = match local_get(port, &local_auth, "/entitlements/v1/token") {
        Ok(r) => r,
        Err(e) if e.contains("ECONNREFUSED") || e.contains("connect ECONNREFUSED") => {
            return Err(format!("Riot Client API refused connection on port {} (restart Riot Client)", port));
        }
        Err(e) => return Err(e),
    };
    let tokens: serde_json::Value =
        serde_json::from_str(&tokens_raw).map_err(|e| format!("Parse tokens: {}", e))?;

    let access_token = tokens["accessToken"]
        .as_str()
        .ok_or("No accessToken")?
        .to_string();
    let entitlements_jwt = tokens["token"]
        .as_str()
        .ok_or("No entitlements token")?
        .to_string();
    let puuid = tokens["subject"]
        .as_str()
        .ok_or("No subject/puuid")?
        .to_string();
    log_info(&format!("[Connect] Got tokens, puuid={}", puuid));

    log_info("[Connect] Fetching account info...");
    let mut game_name = String::from("Unknown");
    let mut game_tag = String::from("0000");
    let mut rso_debug: Option<String> = None;
    match authed_get("https://auth.riotgames.com/userinfo", &access_token) {
        Ok(raw) => {
            rso_debug = Some(raw.clone());
            if let Ok(ui) = serde_json::from_str::<serde_json::Value>(&raw) {
                if let Some(n) = ui["acct"]["game_name"].as_str().filter(|s| !s.is_empty()) {
                    game_name = n.to_string();
                }
                if let Some(t) = ui["acct"]["tag_line"].as_str().filter(|s| !s.is_empty()) {
                    game_tag = t.to_string();
                }
            }
        }
        Err(e) => log_error(&format!("[Connect] userinfo failed: {}", e)),
    }
    log_info(&format!("[Connect] player={}#{}", game_name, game_tag));

    let (region, shard) = parse_region_shard()?;

    let client_version = match https_get("https://valorant-api.com/v1/version") {
        Ok(body) => {
            let clean = body.trim().trim_end_matches('\0');
            match serde_json::from_str::<serde_json::Value>(clean) {
                Ok(v) => v["data"]["riotClientVersion"]
                    .as_str()
                    .unwrap_or("unknown")
                    .to_string(),
                Err(_) => "unknown".to_string(),
            }
        }
        Err(_) => "unknown".to_string(),
    };
    log_info(&format!("[Connect] version={}", client_version));

    let mut player_card_url: Option<String> = None;
    let mut loadout_debug: Option<String> = None;
    let loadout_path = format!("/personalization/v2/players/{}/playerloadout", puuid);
    match pd_get(&shard, &loadout_path, &access_token, &entitlements_jwt, &client_version) {
        Ok(raw) => {
            loadout_debug = Some(raw.clone());
            if let Ok(loadout) = serde_json::from_str::<serde_json::Value>(&raw) {
                if let Some(card_id) = loadout["Identity"]["PlayerCardID"].as_str() {
                    player_card_url = Some(format!(
                        "https://media.valorant-api.com/playercards/{}/smallart.png",
                        card_id
                    ));
                    log_info(&format!("[Connect] player card: {}", card_id));
                }
            }
        }
        Err(e) => log_error(&format!("[Connect] loadout failed: {}", e)),
    }

    let info = PlayerInfo {
        puuid: puuid.clone(),
        game_name: game_name.clone(),
        game_tag: game_tag.clone(),
        region: region.clone(),
        shard: shard.clone(),
        client_version: client_version.clone(),
        player_card_url: player_card_url.clone(),
        rso_debug,
        loadout_debug,
    };

    let mut s = state.lock().map_err(|e| e.to_string())?;
    s.connected = true;
    s.port = Some(port);
    s.local_auth = Some(local_auth);
    s.access_token = Some(access_token);
    s.entitlements = Some(entitlements_jwt);
    s.puuid = Some(puuid);
    s.region = Some(region);
    s.shard = Some(shard);
    s.client_version = Some(client_version);
    s.game_name = Some(game_name);
    s.game_tag = Some(game_tag);
    s.player_card_url = player_card_url;
    s.token_fetched_at = Some(Instant::now());

    log_info("[Connect] Connected successfully");
    Ok(info)
}

pub fn health_check(state: &Mutex<ConnectionState>) -> Option<PlayerInfo> {
    {
        let s = match state.lock() {
            Ok(s) => s,
            Err(_) => return None,
        };
        if !s.connected {
            return None;
        }
    }

    if !is_riot_client_running() {
        log_error("[Health] Riot Client not running, disconnecting");
        disconnect(state);
        return None;
    }

    let needs_refresh = {
        let s = state.lock().ok()?;
        match s.token_fetched_at {
            Some(t) => t.elapsed().as_secs() > 600,
            None => true,
        }
    };

    if needs_refresh {
        log_info("[Health] Token expired, refreshing...");
        if let Err(e) = refresh_tokens(state) {
            log_error(&format!("[Health] Token refresh failed: {}, disconnecting", e));
            disconnect(state);
            return None;
        }
    }

    let should_validate = {
        let s = state.lock().ok()?;
        match s.last_token_check {
            Some(t) => t.elapsed().as_secs() > 60,
            None => true,
        }
    };

    if should_validate {
        if let Ok(mut s) = state.lock() {
            s.last_token_check = Some(Instant::now());
        }
        if !validate_token(state) {
            log_error("[Health] Token validation failed, refreshing...");
            if let Err(e) = refresh_tokens(state) {
                log_error(&format!("[Health] Token refresh also failed: {}, disconnecting", e));
                disconnect(state);
                return None;
            }
            if !validate_token(state) {
                log_error("[Health] Token still invalid after refresh, disconnecting");
                disconnect(state);
                return None;
            }
            log_info("[Health] Token refreshed and validated successfully");
        }
    }

    get_cached_player(state)
}

fn validate_token(state: &Mutex<ConnectionState>) -> bool {
    let (shard, access_token, entitlements, client_version, puuid) = {
        let s = match state.lock() {
            Ok(s) => s,
            Err(_) => return false,
        };
        match (&s.shard, &s.access_token, &s.entitlements, &s.client_version, &s.puuid) {
            (Some(sh), Some(at), Some(et), Some(cv), Some(pu)) =>
                (sh.clone(), at.clone(), et.clone(), cv.clone(), pu.clone()),
            _ => return false,
        }
    };

    let path = format!("/personalization/v2/players/{}/playerloadout", puuid);
    match pd_get(&shard, &path, &access_token, &entitlements, &client_version) {
        Ok(body) => {
            if body.contains("CREDENTIALS_INVALID") || body.contains("\"httpStatus\":401") {
                log_error("[Health] Token check: CREDENTIALS_INVALID");
                return false;
            }
            true
        }
        Err(e) => {
            if e.contains("401") || e.contains("CREDENTIALS_INVALID") {
                log_error(&format!("[Health] Token check error: {}", e));
                return false;
            }
            log_error(&format!("[Health] Token check request failed: {} (network issue, keeping token)", e));
            true
        }
    }
}

fn refresh_tokens(state: &Mutex<ConnectionState>) -> Result<(), String> {
    let (pid, port, password) = read_lockfile().map_err(|e| format!("lockfile re-read: {}", e))?;
    if !is_pid_alive(pid) {
        return Err(format!("Riot Client PID {} is dead", pid));
    }
    let local_auth = format!(
        "Basic {}",
        base64::engine::general_purpose::STANDARD.encode(format!("riot:{}", password))
    );

    log_info(&format!("[Health] Refreshing tokens (port={}, pid={})...", port, pid));
    let tokens_raw = local_get(port, &local_auth, "/entitlements/v1/token")?;
    let tokens: serde_json::Value =
        serde_json::from_str(&tokens_raw).map_err(|e| format!("Parse tokens: {}", e))?;

    let access_token = tokens["accessToken"].as_str().ok_or("No accessToken")?.to_string();
    let entitlements_jwt = tokens["token"].as_str().ok_or("No entitlements token")?.to_string();

    let mut s = state.lock().map_err(|e| e.to_string())?;
    s.port = Some(port);
    s.local_auth = Some(local_auth);
    s.access_token = Some(access_token);
    s.entitlements = Some(entitlements_jwt);
    s.token_fetched_at = Some(Instant::now());
    log_info("[Health] Tokens refreshed successfully");
    Ok(())
}

pub fn disconnect(state: &Mutex<ConnectionState>) {
    if let Ok(mut s) = state.lock() {
        s.connected = false;
        s.port = None;
        s.local_auth = None;
        s.access_token = None;
        s.entitlements = None;
    }
}

pub fn get_status(state: &Mutex<ConnectionState>) -> String {
    match state.lock() {
        Ok(s) => {
            if s.connected {
                "connected".to_string()
            } else {
                "disconnected".to_string()
            }
        }
        Err(_) => "disconnected".to_string(),
    }
}

pub fn get_cached_player(state: &Mutex<ConnectionState>) -> Option<PlayerInfo> {
    let s = state.lock().ok()?;
    if !s.connected {
        return None;
    }
    Some(PlayerInfo {
        puuid: s.puuid.clone()?,
        game_name: s.game_name.clone()?,
        game_tag: s.game_tag.clone()?,
        region: s.region.clone()?,
        shard: s.shard.clone()?,
        client_version: s.client_version.clone()?,
        player_card_url: s.player_card_url.clone(),
        rso_debug: None,
        loadout_debug: None,
    })
}

pub fn get_token_age_secs(state: &Mutex<ConnectionState>) -> u64 {
    if let Ok(s) = state.lock() {
        if let Some(t) = s.token_fetched_at {
            return t.elapsed().as_secs();
        }
    }
    0
}
