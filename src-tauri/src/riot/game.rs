use std::sync::Mutex;

use super::types::ConnectionState;
use super::http::{glz_get, glz_post, glz_post_body, glz_delete, local_get, pd_get, pd_put, pd_batch_get};
use super::logging::log_info;

fn get_local_creds(state: &Mutex<ConnectionState>) -> Result<(u16, String), String> {
    let s = state.lock().map_err(|e| e.to_string())?;
    if !s.connected {
        return Err("Not connected".to_string());
    }
    Ok((
        s.port.ok_or("No port")?,
        s.local_auth.clone().ok_or("No local_auth")?,
    ))
}

fn get_glz_creds(state: &Mutex<ConnectionState>) -> Result<(String, String, String, String, String, String), String> {
    let s = state.lock().map_err(|e| e.to_string())?;
    if !s.connected {
        return Err("Not connected".to_string());
    }
    Ok((
        s.access_token.clone().ok_or("No access_token")?,
        s.entitlements.clone().ok_or("No entitlements")?,
        s.puuid.clone().ok_or("No puuid")?,
        s.region.clone().ok_or("No region")?,
        s.shard.clone().ok_or("No shard")?,
        s.client_version.clone().ok_or("No client_version")?,
    ))
}

pub fn check_current_game(state: &Mutex<ConnectionState>) -> Result<String, String> {
    let (access_token, entitlements, puuid, region, shard, client_version) = get_glz_creds(state)?;

    let pregame_player_path = format!("/pregame/v1/players/{}", puuid);
    if let Ok(pregame_raw) = glz_get(&region, &shard, &pregame_player_path, &access_token, &entitlements, &client_version) {
        if let Ok(pregame_json) = serde_json::from_str::<serde_json::Value>(&pregame_raw) {
            if let Some(match_id) = pregame_json["MatchID"].as_str().filter(|s| !s.is_empty()) {
                let match_path = format!("/pregame/v1/matches/{}", match_id);
                if let Ok(match_raw) = glz_get(&region, &shard, &match_path, &access_token, &entitlements, &client_version) {
                    let mut result: serde_json::Value = serde_json::from_str(&match_raw)
                        .unwrap_or(serde_json::json!({}));
                    result["_phase"] = serde_json::json!("pregame");
                    return Ok(result.to_string());
                }
            }
        }
    }

    let coregame_player_path = format!("/core-game/v1/players/{}", puuid);
    if let Ok(coregame_raw) = glz_get(&region, &shard, &coregame_player_path, &access_token, &entitlements, &client_version) {
        if let Ok(coregame_json) = serde_json::from_str::<serde_json::Value>(&coregame_raw) {
            if let Some(match_id) = coregame_json["MatchID"].as_str().filter(|s| !s.is_empty()) {
                let match_path = format!("/core-game/v1/matches/{}", match_id);
                if let Ok(match_raw) = glz_get(&region, &shard, &match_path, &access_token, &entitlements, &client_version) {
                    let mut result: serde_json::Value = serde_json::from_str(&match_raw)
                        .unwrap_or(serde_json::json!({}));
                    result["_phase"] = serde_json::json!("ingame");
                    return Ok(result.to_string());
                }
            }
        }
    }

    Err("Not in a match".to_string())
}

pub fn select_agent(state: &Mutex<ConnectionState>, match_id: &str, agent_id: &str) -> Result<String, String> {
    let (access_token, entitlements, _, region, shard, client_version) = get_glz_creds(state)?;
    let path = format!("/pregame/v1/matches/{}/select/{}", match_id, agent_id);
    log_info(&format!("[Game] Selecting agent {} in match {}", agent_id, match_id));
    glz_post(&region, &shard, &path, &access_token, &entitlements, &client_version)
}

pub fn lock_agent(state: &Mutex<ConnectionState>, match_id: &str, agent_id: &str) -> Result<String, String> {
    let (access_token, entitlements, _, region, shard, client_version) = get_glz_creds(state)?;
    let path = format!("/pregame/v1/matches/{}/lock/{}", match_id, agent_id);
    log_info(&format!("[Game] Locking agent {} in match {}", agent_id, match_id));
    glz_post(&region, &shard, &path, &access_token, &entitlements, &client_version)
}

pub fn pregame_quit(state: &Mutex<ConnectionState>, match_id: &str) -> Result<String, String> {
    let (access_token, entitlements, _, region, shard, client_version) = get_glz_creds(state)?;
    let quit_path = format!("/pregame/v1/matches/{}/quit", match_id);
    log_info(&format!("[Game] Dodging match {}", match_id));
    glz_post(&region, &shard, &quit_path, &access_token, &entitlements, &client_version)
}

pub fn coregame_quit(state: &Mutex<ConnectionState>, match_id: &str) -> Result<String, String> {
    let (access_token, entitlements, puuid, region, shard, client_version) = get_glz_creds(state)?;
    let path = format!("/core-game/v1/players/{}/disassociate/{}", puuid, match_id);
    log_info(&format!("[Game] Leaving match {}", match_id));
    glz_post(&region, &shard, &path, &access_token, &entitlements, &client_version)
}

pub fn get_party(state: &Mutex<ConnectionState>) -> Result<String, String> {
    let (access_token, entitlements, puuid, region, shard, client_version) = get_glz_creds(state)?;

    let player_path = format!("/parties/v1/players/{}", puuid);
    let player_raw = glz_get(&region, &shard, &player_path, &access_token, &entitlements, &client_version)?;
    let player_json: serde_json::Value = serde_json::from_str(&player_raw).map_err(|e| format!("Parse party player: {}", e))?;
    let party_id = player_json["CurrentPartyID"].as_str().filter(|s| !s.is_empty())
        .ok_or("No party ID found")?;

    let party_path = format!("/parties/v1/parties/{}", party_id);
    let party_raw = glz_get(&region, &shard, &party_path, &access_token, &entitlements, &client_version)?;
    let party_json: serde_json::Value = serde_json::from_str(&party_raw).map_err(|e| format!("Parse party: {}", e))?;

    let members = party_json["Members"].as_array().ok_or("No Members array")?;
    let puuids: Vec<String> = members.iter()
        .filter_map(|m| m["Subject"].as_str().map(|s| s.to_string()))
        .collect();

    let puuids_json = serde_json::to_string(&puuids).unwrap_or_default();
    let mut name_map: std::collections::HashMap<String, (String, String)> = std::collections::HashMap::new();

    if let Ok(names_raw) = pd_put(&shard, "/name-service/v2/players", &puuids_json, &access_token, &entitlements, &client_version) {
        if let Ok(names) = serde_json::from_str::<Vec<serde_json::Value>>(&names_raw) {
            for n in names {
                if let (Some(subject), Some(game_name), Some(tag)) = (
                    n["Subject"].as_str(),
                    n["GameName"].as_str(),
                    n["TagLine"].as_str(),
                ) {
                    name_map.insert(subject.to_string(), (game_name.to_string(), tag.to_string()));
                }
            }
        }
    }

    let mut result_members = Vec::new();
    for m in members {
        let subject = m["Subject"].as_str().unwrap_or_default();
        let (game_name, game_tag) = name_map.get(subject)
            .map(|(n, t)| (n.as_str(), t.as_str()))
            .unwrap_or(("Unknown", "0000"));
        let identity = &m["PlayerIdentity"];
        let card_id = identity["PlayerCardID"].as_str().unwrap_or_default();
        let card_url = if !card_id.is_empty() {
            format!("https://media.valorant-api.com/playercards/{}/smallart.png", card_id)
        } else {
            String::new()
        };

        result_members.push(serde_json::json!({
            "puuid": subject,
            "game_name": game_name,
            "game_tag": game_tag,
            "player_card_url": card_url,
            "account_level": identity["AccountLevel"].as_u64().unwrap_or(0),
            "incognito": identity["Incognito"].as_bool().unwrap_or(false),
            "hide_account_level": identity["HideAccountLevel"].as_bool().unwrap_or(false),
            "competitive_tier": m["CompetitiveTier"].as_u64().unwrap_or(0),
            "is_owner": m["IsOwner"].as_bool().unwrap_or(false),
            "is_ready": m["IsReady"].as_bool().unwrap_or(false),
        }));
    }

    let result = serde_json::json!({
        "party_id": party_id,
        "my_puuid": puuid,
        "members": result_members,
        "state": party_json["State"].as_str().unwrap_or(""),
        "accessibility": party_json["Accessibility"].as_str().unwrap_or(""),
        "invite_code": party_json["InviteCode"].as_str().unwrap_or(""),
    });

    Ok(result.to_string())
}

pub fn get_friends(state: &Mutex<ConnectionState>) -> Result<String, String> {
    let (port, auth) = get_local_creds(state)?;
    let raw = local_get(port, &auth, "/chat/v4/friends")?;
    let json: serde_json::Value = serde_json::from_str(&raw).map_err(|e| format!("Parse friends: {}", e))?;
    let friends = json["friends"].as_array().cloned().unwrap_or_default();

    log_info(&format!("[Friends] Raw friends count: {}", friends.len()));
    let mut presence_map: std::collections::HashMap<String, (String, String)> = std::collections::HashMap::new();
    if let Ok(pres_raw) = local_get(port, &auth, "/chat/v4/presences") {
        if let Ok(pres_json) = serde_json::from_str::<serde_json::Value>(&pres_raw) {
            for p in pres_json["presences"].as_array().cloned().unwrap_or_default() {
                let puuid = p["puuid"].as_str().unwrap_or_default().to_string();
                let state_str = p["state"].as_str().unwrap_or("offline").to_string();
                let pres_product = p["product"].as_str().unwrap_or_default();
                let mut card_url = String::new();
                if pres_product == "valorant" {
                    if let Some(priv_b64) = p["private"].as_str().filter(|s| !s.is_empty()) {
                        if let Ok(decoded) = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, priv_b64) {
                            if let Ok(priv_json) = serde_json::from_slice::<serde_json::Value>(&decoded) {
                                if let Some(card_id) = priv_json["playerPresenceData"]["playerCardId"].as_str().filter(|s| !s.is_empty()) {
                                    card_url = format!("https://media.valorant-api.com/playercards/{}/smallart.png", card_id);
                                }
                            }
                        }
                    }
                }
                presence_map.insert(puuid, (state_str, card_url));
            }
        }
    }

    let mut result = Vec::new();
    for f in &friends {
        let game_name = f["game_name"].as_str().unwrap_or_default();
        let game_tag = f["game_tag"].as_str().unwrap_or_default();
        if game_name.is_empty() { continue; }
        let puuid = f["puuid"].as_str().unwrap_or_default();
        let note = f["note"].as_str().unwrap_or_default();
        let (status, card_url) = presence_map.get(puuid)
            .map(|(s, c)| (s.as_str(), c.as_str()))
            .unwrap_or(("offline", ""));
        let has_card = !card_url.is_empty();
        let pid = f["pid"].as_str().unwrap_or_default();
        let product = if pid.contains("valorant") { "valorant" } else if pid.contains("league") { "league" } else { "" };
        result.push(serde_json::json!({
            "puuid": puuid,
            "game_name": game_name,
            "game_tag": game_tag,
            "product": product,
            "status": if has_card { status } else { "offline" },
            "player_card_url": card_url,
            "note": note,
        }));
    }

    result.sort_by(|a, b| {
        let a_offline = a["status"].as_str().unwrap_or("") == "offline";
        let b_offline = b["status"].as_str().unwrap_or("") == "offline";
        a_offline.cmp(&b_offline).then_with(|| {
            let a_name = a["game_name"].as_str().unwrap_or_default().to_lowercase();
            let b_name = b["game_name"].as_str().unwrap_or_default().to_lowercase();
            a_name.cmp(&b_name)
        })
    });

    Ok(serde_json::json!(result).to_string())
}

pub fn resolve_player_names(state: &Mutex<ConnectionState>, puuids: Vec<String>) -> Result<String, String> {
    let (access_token, entitlements, _, _, shard, client_version) = get_glz_creds(state)?;
    let body = serde_json::json!(puuids).to_string();
    let raw = pd_put(&shard, "/name-service/v2/players", &body, &access_token, &entitlements, &client_version)?;
    let names: Vec<serde_json::Value> = serde_json::from_str(&raw).map_err(|e| format!("Parse names: {}", e))?;
    let mut result = Vec::new();
    for n in names {
        result.push(serde_json::json!({
            "puuid": n["Subject"].as_str().unwrap_or_default(),
            "name": n["GameName"].as_str().unwrap_or_default(),
            "tag": n["TagLine"].as_str().unwrap_or_default(),
        }));
    }
    Ok(serde_json::json!(result).to_string())
}

pub fn get_player_mmr(state: &Mutex<ConnectionState>, target_puuid: &str) -> Result<String, String> {
    let (access_token, entitlements, _, _, shard, client_version) = get_glz_creds(state)?;
    let path = format!("/mmr/v1/players/{}", target_puuid);
    let raw = pd_get(&shard, &path, &access_token, &entitlements, &client_version)?;
    let json: serde_json::Value = serde_json::from_str(&raw).map_err(|e| format!("Parse MMR: {}", e))?;

    let tier = json["LatestCompetitiveUpdate"]["TierAfterUpdate"].as_u64().unwrap_or(0);
    let rr = json["LatestCompetitiveUpdate"]["RankedRatingAfterUpdate"].as_u64().unwrap_or(0);

    let result = serde_json::json!({
        "currenttier": tier,
        "ranking_in_tier": rr,
        "raw": json,
    });
    Ok(result.to_string())
}

pub fn set_party_accessibility(state: &Mutex<ConnectionState>, open: bool) -> Result<String, String> {
    let (access_token, entitlements, puuid, region, shard, client_version) = get_glz_creds(state)?;
    let player_path = format!("/parties/v1/players/{}", puuid);
    let player_raw = glz_get(&region, &shard, &player_path, &access_token, &entitlements, &client_version)?;
    let player_json: serde_json::Value = serde_json::from_str(&player_raw).map_err(|e| format!("Parse: {}", e))?;
    let party_id = player_json["CurrentPartyID"].as_str().filter(|s| !s.is_empty())
        .ok_or("No party ID")?;
    let path = format!("/parties/v1/parties/{}/accessibility", party_id);
    let body = format!(r#"{{"accessibility":"{}"}}"#, if open { "OPEN" } else { "CLOSED" });
    glz_post_body(&region, &shard, &path, &body, &access_token, &entitlements, &client_version)
}

pub fn disable_party_code(state: &Mutex<ConnectionState>) -> Result<String, String> {
    let (access_token, entitlements, puuid, region, shard, client_version) = get_glz_creds(state)?;
    let player_path = format!("/parties/v1/players/{}", puuid);
    let player_raw = glz_get(&region, &shard, &player_path, &access_token, &entitlements, &client_version)?;
    let player_json: serde_json::Value = serde_json::from_str(&player_raw).map_err(|e| format!("Parse: {}", e))?;
    let party_id = player_json["CurrentPartyID"].as_str().filter(|s| !s.is_empty())
        .ok_or("No party ID")?;
    let path = format!("/parties/v1/parties/{}/invitecode", party_id);
    glz_delete(&region, &shard, &path, &access_token, &entitlements, &client_version)
}

pub fn kick_from_party(state: &Mutex<ConnectionState>, target_puuid: &str) -> Result<String, String> {
    let (access_token, entitlements, puuid, region, shard, client_version) = get_glz_creds(state)?;
    let player_path = format!("/parties/v1/players/{}", puuid);
    let player_raw = glz_get(&region, &shard, &player_path, &access_token, &entitlements, &client_version)?;
    let player_json: serde_json::Value = serde_json::from_str(&player_raw).map_err(|e| format!("Parse: {}", e))?;
    let party_id = player_json["CurrentPartyID"].as_str().filter(|s| !s.is_empty())
        .ok_or("No party ID")?;
    let kick_path = format!("/parties/v1/parties/{}/members/{}", party_id, target_puuid);
    log_info(&format!("[Party] Kick {} from party {}", target_puuid, party_id));
    glz_delete(&region, &shard, &kick_path, &access_token, &entitlements, &client_version)
}

pub fn generate_party_code(state: &Mutex<ConnectionState>) -> Result<String, String> {
    let (access_token, entitlements, puuid, region, shard, client_version) = get_glz_creds(state)?;
    let player_path = format!("/parties/v1/players/{}", puuid);
    let player_raw = glz_get(&region, &shard, &player_path, &access_token, &entitlements, &client_version)?;
    let player_json: serde_json::Value = serde_json::from_str(&player_raw).map_err(|e| format!("Parse: {}", e))?;
    let party_id = player_json["CurrentPartyID"].as_str().filter(|s| !s.is_empty())
        .ok_or("No party ID")?;
    let code_path = format!("/parties/v1/parties/{}/invitecode", party_id);
    glz_post(&region, &shard, &code_path, &access_token, &entitlements, &client_version)
}

pub fn join_party_by_code(state: &Mutex<ConnectionState>, code: &str) -> Result<String, String> {
    let (access_token, entitlements, _, region, shard, client_version) = get_glz_creds(state)?;
    let path = format!("/parties/v1/players/joinbycode/{}", code);
    glz_post(&region, &shard, &path, &access_token, &entitlements, &client_version)
}

pub fn enter_queue(state: &Mutex<ConnectionState>) -> Result<String, String> {
    let (access_token, entitlements, puuid, region, shard, client_version) = get_glz_creds(state)?;
    let player_path = format!("/parties/v1/players/{}", puuid);
    let player_raw = glz_get(&region, &shard, &player_path, &access_token, &entitlements, &client_version)?;
    let player_json: serde_json::Value = serde_json::from_str(&player_raw).map_err(|e| format!("Parse: {}", e))?;
    let party_id = player_json["CurrentPartyID"].as_str().filter(|s| !s.is_empty())
        .ok_or("No party ID")?;
    let path = format!("/parties/v1/parties/{}/matchmaking/join", party_id);
    log_info(&format!("[Queue] Entering queue for party {}", party_id));
    glz_post(&region, &shard, &path, &access_token, &entitlements, &client_version)
}

pub fn leave_queue(state: &Mutex<ConnectionState>) -> Result<String, String> {
    let (access_token, entitlements, puuid, region, shard, client_version) = get_glz_creds(state)?;
    let player_path = format!("/parties/v1/players/{}", puuid);
    let player_raw = glz_get(&region, &shard, &player_path, &access_token, &entitlements, &client_version)?;
    let player_json: serde_json::Value = serde_json::from_str(&player_raw).map_err(|e| format!("Parse: {}", e))?;
    let party_id = player_json["CurrentPartyID"].as_str().filter(|s| !s.is_empty())
        .ok_or("No party ID")?;
    let path = format!("/parties/v1/parties/{}/matchmaking/leave", party_id);
    log_info(&format!("[Queue] Leaving queue for party {}", party_id));
    glz_post(&region, &shard, &path, &access_token, &entitlements, &client_version)
}

pub fn check_loadout(state: &Mutex<ConnectionState>) -> Result<String, String> {
    let (access_token, entitlements, puuid, _region, shard, client_version) = get_glz_creds(state)?;
    let path = format!("/personalization/v2/players/{}/playerloadout", puuid);
    pd_get(&shard, &path, &access_token, &entitlements, &client_version)?;
    Ok("ok".to_string())
}

fn extract_map_name(map_url: &str) -> String {
    map_url.rsplit('/').next().unwrap_or("Unknown").to_string()
}

pub fn get_home_stats(state: &Mutex<ConnectionState>, queue_filter: &str) -> Result<String, String> {
    let (access_token, entitlements, puuid, _region, shard, client_version) = get_glz_creds(state)?;

    let mmr_path = format!("/mmr/v1/players/{}", puuid);
    let mmr_raw = pd_get(&shard, &mmr_path, &access_token, &entitlements, &client_version)?;
    let mmr: serde_json::Value = serde_json::from_str(&mmr_raw).map_err(|e| format!("parse mmr: {}", e))?;

    let current_tier = mmr["LatestCompetitiveUpdate"]["TierAfterUpdate"].as_u64().unwrap_or(0);
    let current_rr = mmr["LatestCompetitiveUpdate"]["RankedRatingAfterUpdate"].as_u64().unwrap_or(0);

    let mut peak_tier: u64 = 0;
    let mut comp_wins: u64 = 0;
    let mut comp_games: u64 = 0;
    if let Some(seasons) = mmr["QueueSkills"]["competitive"]["SeasonalInfoBySeasonID"].as_object() {
        for (_id, season) in seasons {
            let tier = season["CompetitiveTier"].as_u64().unwrap_or(0);
            if tier > peak_tier { peak_tier = tier; }
            comp_wins += season["NumberOfWinsWithPlacements"].as_u64().unwrap_or(0);
            comp_games += season["NumberOfGames"].as_u64().unwrap_or(0);
        }
    }

    let loadout_path = format!("/personalization/v2/players/{}/playerloadout", puuid);
    let mut card_id = String::new();
    if let Ok(loadout_raw) = pd_get(&shard, &loadout_path, &access_token, &entitlements, &client_version) {
        if let Ok(loadout) = serde_json::from_str::<serde_json::Value>(&loadout_raw) {
            card_id = loadout["Identity"]["PlayerCardID"].as_str().unwrap_or("").to_string();
        }
    }

    let mut account_level: u64 = 0;
    let xp_path = format!("/account-xp/v1/players/{}", puuid);
    if let Ok(xp_raw) = pd_get(&shard, &xp_path, &access_token, &entitlements, &client_version) {
        if let Ok(xp) = serde_json::from_str::<serde_json::Value>(&xp_raw) {
            account_level = xp["Progress"]["Level"].as_u64().unwrap_or(0);
        }
    }

    Ok(serde_json::json!({
        "level": account_level,
        "cardId": card_id,
        "currentTier": current_tier,
        "currentRR": current_rr,
        "peakTier": peak_tier,
        "wins": comp_wins,
        "losses": comp_games.saturating_sub(comp_wins),
        "totalGames": comp_games,
    }).to_string())
}

pub fn get_match_page(state: &Mutex<ConnectionState>, page: u64, page_size: u64) -> Result<String, String> {
    let (access_token, entitlements, puuid, _region, shard, client_version) = get_glz_creds(state)?;

    let start = page * page_size;
    let end = start + page_size;
    let history_path = format!("/match-history/v1/history/{}?startIndex={}&endIndex={}&queue=competitive", puuid, start, end);
    let history_raw = pd_get(&shard, &history_path, &access_token, &entitlements, &client_version)?;
    let history: serde_json::Value = serde_json::from_str(&history_raw).map_err(|e| format!("parse history: {}", e))?;
    let total = history["Total"].as_u64().unwrap_or(0);

    let mut match_paths: Vec<String> = Vec::new();
    if let Some(matches) = history["History"].as_array() {
        for m in matches {
            if let Some(id) = m["MatchID"].as_str() {
                match_paths.push(format!("/match-details/v1/matches/{}", id));
            }
        }
    }

    let mut matches: Vec<serde_json::Value> = Vec::new();
    if !match_paths.is_empty() {
        let details = pd_batch_get(&shard, &match_paths, &access_token, &entitlements, &client_version)?;
        for detail in &details {
            if detail.is_null() { continue; }

            let map_name = extract_map_name(detail["matchInfo"]["mapId"].as_str().unwrap_or(""));

            let player_data = detail["players"].as_array().and_then(|players| {
                players.iter().find(|p| p["subject"].as_str() == Some(puuid.as_str()))
            });

            let (team_id, kills, deaths, assists, agent) = match player_data {
                Some(p) => (
                    p["teamId"].as_str().unwrap_or("").to_string(),
                    p["stats"]["kills"].as_u64().unwrap_or(0),
                    p["stats"]["deaths"].as_u64().unwrap_or(0),
                    p["stats"]["assists"].as_u64().unwrap_or(0),
                    p["characterId"].as_str().unwrap_or("").to_string(),
                ),
                None => continue,
            };

            let mut won = false;
            let mut rounds_won: u64 = 0;
            let mut rounds_lost: u64 = 0;

            if let Some(teams) = detail["teams"].as_array() {
                for team in teams {
                    let tid = team["teamId"].as_str().unwrap_or("");
                    let rw = team["roundsWon"].as_u64().unwrap_or(0);
                    if tid == team_id {
                        won = team["won"].as_bool().unwrap_or(false);
                        rounds_won = rw;
                    } else {
                        rounds_lost = rw;
                    }
                }
            }

            matches.push(serde_json::json!({
                "map": map_name,
                "won": won,
                "roundsWon": rounds_won,
                "roundsLost": rounds_lost,
                "kills": kills,
                "deaths": deaths,
                "assists": assists,
                "agent": agent,
            }));
        }
    }

    Ok(serde_json::json!({
        "matches": matches,
        "total": total,
        "page": page,
        "pageSize": page_size,
    }).to_string())
}

pub fn get_owned_agents(state: &Mutex<ConnectionState>) -> Result<Vec<String>, String> {
    let (access_token, entitlements, puuid, _, shard, client_version) = get_glz_creds(state)?;
    let path = format!("/store/v1/entitlements/{}/01bb38e1-da47-4e6a-9b3d-945fe4655707", puuid);
    let raw = pd_get(&shard, &path, &access_token, &entitlements, &client_version)?;
    let json: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let items = json["Entitlements"].as_array().ok_or("No Entitlements array")?;
    let ids: Vec<String> = items.iter()
        .filter_map(|item| item["ItemID"].as_str().map(|s| s.to_lowercase()))
        .collect();
    log_info(&format!("[Game] Owned agents: {} total", ids.len()));
    Ok(ids)
}
