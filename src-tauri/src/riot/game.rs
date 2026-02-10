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

    let queue_id = party_json["MatchmakingData"]["QueueID"].as_str().unwrap_or("");
    let party_state = party_json["State"].as_str().unwrap_or("");

    let settings = &party_json["CustomGameData"]["Settings"];
    if party_state == "CUSTOM_GAME_SETUP" {
        log_info(&format!("[Custom] Party Settings: {}", serde_json::to_string(settings).unwrap_or_default()));
    }
    let rules = &settings["GameRules"];
    let result = serde_json::json!({
        "party_id": party_id,
        "my_puuid": puuid,
        "members": result_members,
        "state": party_state,
        "accessibility": party_json["Accessibility"].as_str().unwrap_or(""),
        "invite_code": party_json["InviteCode"].as_str().unwrap_or(""),
        "queue_id": queue_id,
        "custom_map": settings["Map"].as_str().unwrap_or(""),
        "custom_mode": settings["Mode"].as_str().unwrap_or(""),
        "custom_pod": settings["GamePod"].as_str().unwrap_or(""),
        "custom_allow_cheats": rules["AllowGameModifiers"].as_str().unwrap_or("false") == "true",
        "custom_play_out_all_rounds": rules["PlayOutAllRounds"].as_str().unwrap_or("false") == "true",
        "custom_skip_match_history": rules["SkipMatchHistory"].as_str().unwrap_or("false") == "true",
        "custom_tournament_mode": rules["TournamentMode"].as_str().unwrap_or("false") == "true",
        "custom_overtime_win_by_two": rules["IsOvertimeWinByTwo"].as_str().unwrap_or("true") == "true",
    });

    Ok(result.to_string())
}

pub fn get_friends(state: &Mutex<ConnectionState>) -> Result<String, String> {
    let (port, auth) = get_local_creds(state)?;
    let raw = local_get(port, &auth, "/chat/v4/friends")?;
    let json: serde_json::Value = serde_json::from_str(&raw).map_err(|e| format!("Parse friends: {}", e))?;
    let friends = json["friends"].as_array().cloned().unwrap_or_default();

    log_info(&format!("[Friends] Raw friends count: {}", friends.len()));

    struct PresenceInfo {
        state: String,
        product: String,
        card_url: String,
        account_level: u64,
    }

    let mut presence_map: std::collections::HashMap<String, PresenceInfo> = std::collections::HashMap::new();
    if let Ok(pres_raw) = local_get(port, &auth, "/chat/v4/presences") {
        if let Ok(pres_json) = serde_json::from_str::<serde_json::Value>(&pres_raw) {
            let presences = pres_json["presences"].as_array().cloned().unwrap_or_default();
            log_info(&format!("[Friends] Presences count: {}", presences.len()));

            let mut products_seen: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
            for p in &presences {
                let prod = p["product"].as_str().unwrap_or("?").to_string();
                *products_seen.entry(prod).or_insert(0) += 1;
            }
            log_info(&format!("[Friends] Products breakdown: {:?}", products_seen));

            let mut sample_logged = 0u32;
            for p in presences {
                let puuid = p["puuid"].as_str().unwrap_or_default().to_string();
                let state_str = p["state"].as_str().unwrap_or("offline").to_string();
                let pres_product = p["product"].as_str().unwrap_or_default().to_string();

                if presence_map.contains_key(&puuid) && pres_product != "valorant" {
                    continue;
                }

                let mut card_url = String::new();
                let mut account_level: u64 = 0;

                if let Some(priv_b64) = p["private"].as_str().filter(|s| !s.is_empty()) {
                    if let Ok(decoded) = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, priv_b64) {
                        if let Ok(priv_json) = serde_json::from_slice::<serde_json::Value>(&decoded) {
                            if sample_logged < 3 {
                                let keys: Vec<&str> = priv_json.as_object()
                                    .map(|o| o.keys().map(|k| k.as_str()).collect())
                                    .unwrap_or_default();
                                log_info(&format!("[Friends] Decoded keys for {}.. ({}): {:?}",
                                    &puuid[..8.min(puuid.len())], pres_product, keys));
                                sample_logged += 1;
                            }
                            if let Some(card_id) = priv_json["playerCardId"].as_str().filter(|s| !s.is_empty()) {
                                card_url = format!("https://media.valorant-api.com/playercards/{}/smallart.png", card_id);
                            }
                            account_level = priv_json["accountLevel"].as_u64().unwrap_or(0);
                        } else {
                            if sample_logged < 3 {
                                let preview = String::from_utf8_lossy(&decoded);
                                log_info(&format!("[Friends] JSON parse fail for {}.. preview: {}",
                                    &puuid[..8.min(puuid.len())], &preview[..preview.len().min(200)]));
                                sample_logged += 1;
                            }
                        }
                    } else if sample_logged < 3 {
                        log_info(&format!("[Friends] b64 decode fail for {}.. b64_len={}", &puuid[..8.min(puuid.len())], priv_b64.len()));
                        sample_logged += 1;
                    }
                }

                presence_map.insert(puuid, PresenceInfo {
                    state: state_str,
                    product: pres_product,
                    card_url,
                    account_level,
                });
            }
        } else {
            log_info("[Friends] Failed to parse presences JSON");
        }
    } else {
        log_info("[Friends] Failed to fetch /chat/v4/presences");
    }

    let mut online_count = 0u32;
    let mut result = Vec::new();
    for f in &friends {
        let game_name = f["game_name"].as_str().unwrap_or_default();
        let game_tag = f["game_tag"].as_str().unwrap_or_default();
        if game_name.is_empty() { continue; }
        let puuid = f["puuid"].as_str().unwrap_or_default();
        let note = f["note"].as_str().unwrap_or_default();
        let (status, card_url, level, pres_product) = match presence_map.get(puuid) {
            Some(p) => (p.state.as_str(), p.card_url.as_str(), p.account_level, p.product.as_str()),
            None => ("offline", "", 0u64, ""),
        };
        let pid = f["pid"].as_str().unwrap_or_default();
        let product = if !pres_product.is_empty() { pres_product }
            else if pid.contains("valorant") { "valorant" }
            else if pid.contains("league") { "league" }
            else { "" };
        let is_online = status != "offline" && status != "mobile";
        if is_online { online_count += 1; }
        result.push(serde_json::json!({
            "puuid": puuid,
            "game_name": game_name,
            "game_tag": game_tag,
            "product": product,
            "status": if is_online { status } else { "offline" },
            "player_card_url": card_url,
            "account_level": level,
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

    log_info(&format!("[Friends] Result: {} friends, {} online", result.len(), online_count));
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

pub fn invite_to_party(state: &Mutex<ConnectionState>, name: &str, tag: &str) -> Result<String, String> {
    let (access_token, entitlements, puuid, region, shard, client_version) = get_glz_creds(state)?;
    let player_path = format!("/parties/v1/players/{}", puuid);
    let player_raw = glz_get(&region, &shard, &player_path, &access_token, &entitlements, &client_version)?;
    let player_json: serde_json::Value = serde_json::from_str(&player_raw).map_err(|e| format!("Parse: {}", e))?;
    let party_id = player_json["CurrentPartyID"].as_str().filter(|s| !s.is_empty())
        .ok_or("No party ID")?;
    let invite_path = format!("/parties/v1/parties/{}/invites/name/{}/tag/{}", party_id, name, tag);
    log_info(&format!("[Party] Inviting {}#{} to party {}", name, tag, party_id));
    glz_post(&region, &shard, &invite_path, &access_token, &entitlements, &client_version)
}

pub fn request_to_join_party(state: &Mutex<ConnectionState>, target_puuid: &str) -> Result<String, String> {
    let (access_token, entitlements, puuid, region, shard, client_version) = get_glz_creds(state)?;
    let target_path = format!("/parties/v1/players/{}", target_puuid);
    let target_raw = glz_get(&region, &shard, &target_path, &access_token, &entitlements, &client_version)?;
    let target_json: serde_json::Value = serde_json::from_str(&target_raw).map_err(|e| format!("Parse: {}", e))?;
    let target_party = target_json["CurrentPartyID"].as_str().filter(|s| !s.is_empty())
        .ok_or("Player has no party")?;
    let path = format!("/parties/v1/parties/{}/request", target_party);
    let body = format!(r#"{{"Subjects":["{}"]}}"#, puuid);
    log_info(&format!("[Party] Requesting to join party {} (player {})", target_party, target_puuid));
    glz_post_body(&region, &shard, &path, &body, &access_token, &entitlements, &client_version)
}

pub fn join_party_by_code(state: &Mutex<ConnectionState>, code: &str) -> Result<String, String> {
    let (access_token, entitlements, puuid, region, shard, client_version) = get_glz_creds(state)?;
    let path = format!("/parties/v1/players/{}/joinbycode/{}", puuid, code);
    glz_post(&region, &shard, &path, &access_token, &entitlements, &client_version)
}

pub fn get_custom_configs(state: &Mutex<ConnectionState>) -> Result<String, String> {
    let (access_token, entitlements, _puuid, region, shard, client_version) = get_glz_creds(state)?;
    let configs_raw = glz_get(&region, &shard, "/parties/v1/parties/customgameconfigs", &access_token, &entitlements, &client_version)?;
    let configs: serde_json::Value = serde_json::from_str(&configs_raw).map_err(|e| format!("Parse configs: {}", e))?;

    let raw_maps: Vec<&str> = configs["EnabledMaps"].as_array()
        .map(|a| a.iter().filter_map(|v| v.as_str()).collect())
        .unwrap_or_default();
    let raw_modes: Vec<&str> = configs["EnabledModes"].as_array()
        .map(|a| a.iter().filter_map(|v| v.as_str()).collect())
        .unwrap_or_default();
    log_info(&format!("[Custom] Raw maps: {:?}", raw_maps));
    log_info(&format!("[Custom] Raw modes: {:?}", raw_modes));

    let known_maps: std::collections::HashMap<&str, &str> = [
        ("Skirmish_A", "/Game/Maps/Duel/Duel_1/Skirmish_A"),
        ("Skirmish_B", "/Game/Maps/Duel/Duel_2/Skirmish_B"),
        ("Skirmish_C", "/Game/Maps/Duel/Duel_3/Skirmish_C"),
        ("Skirmish_D", "/Game/Maps/Duel/Duel_4/Skirmish_D"),
    ].into_iter().collect();

    let maps: Vec<String> = raw_maps.iter().map(|s| {
        if s.starts_with("/Game/") { return s.to_string(); }
        if let Some(full) = known_maps.get(s) { return full.to_string(); }
        if s.starts_with("HURM_") {
            format!("/Game/Maps/HURM/{}/{}", s, s)
        } else {
            format!("/Game/Maps/{}/{}", s, s)
        }
    }).collect();

    let known_modes: std::collections::HashMap<&str, &str> = [
        ("BombGameMode", "/Game/GameModes/Bomb/BombGameMode.BombGameMode_C"),
        ("DeathmatchGameMode", "/Game/GameModes/Deathmatch/DeathmatchGameMode.DeathmatchGameMode_C"),
        ("GunGameTeamsGameMode", "/Game/GameModes/GunGame/GunGameTeamsGameMode.GunGameTeamsGameMode_C"),
        ("QuickBombGameMode", "/Game/GameModes/QuickBomb/QuickBombGameMode.QuickBombGameMode_C"),
        ("OneForAll_GameMode", "/Game/GameModes/OneForAll/OneForAll_GameMode.OneForAll_GameMode_C"),
        ("SnowballGameMode", "/Game/GameModes/Snowball/SnowballGameMode.SnowballGameMode_C"),
        ("NewMapGameMode", "/Game/GameModes/NewMap/NewMapGameMode.NewMapGameMode_C"),
        ("HURM_GameMode", "/Game/GameModes/HURM/HURM_GameMode.HURM_GameMode_C"),
        ("SkirmishGameMode", "/Game/GameModes/Skirmish/SkirmishGameMode.SkirmishGameMode_C"),
        ("AROS_GameMode", "/Game/GameModes/AROS/AROS_GameMode.AROS_GameMode_C"),
        ("Swiftplay_EoRCredits_GameMode", "/Game/GameModes/_Development/Swiftplay_EndOfRoundCredits/Swiftplay_EoRCredits_GameMode.Swiftplay_EoRCredits_GameMode_C"),
        ("SwiftPlayGameMode", "/Game/GameModes/_Development/Swiftplay_EndOfRoundCredits/Swiftplay_EoRCredits_GameMode.Swiftplay_EoRCredits_GameMode_C"),
    ].into_iter().collect();

    let skip_modes: [&str; 0] = [];

    let modes: Vec<String> = raw_modes.iter().filter_map(|s| {
        if skip_modes.contains(s) { return None; }
        if s.starts_with("/Game/") { return Some(s.to_string()); }
        if let Some(full) = known_modes.get(s) { return Some(full.to_string()); }
        let folder = s.replace("_GameMode", "").replace("GameMode", "");
        Some(format!("/Game/GameModes/{}/{}.{}_C", folder, s, s))
    }).collect();

    let pods: Vec<String> = configs["GamePodPingServiceInfo"].as_object()
        .map(|o| o.keys().cloned().collect())
        .unwrap_or_default();

    log_info(&format!("[Custom] Converted maps: {:?}", maps));
    log_info(&format!("[Custom] Converted modes: {:?}", modes));

    Ok(serde_json::json!({ "maps": maps, "modes": modes, "pods": pods }).to_string())
}

pub fn set_custom_settings(
    state: &Mutex<ConnectionState>,
    map: &str,
    mode: &str,
    pod: &str,
    allow_cheats: bool,
    play_out_all_rounds: bool,
    skip_match_history: bool,
    tournament_mode: bool,
    overtime_win_by_two: bool,
) -> Result<String, String> {
    let (access_token, entitlements, puuid, region, shard, client_version) = get_glz_creds(state)?;
    let player_path = format!("/parties/v1/players/{}", puuid);
    let player_raw = glz_get(&region, &shard, &player_path, &access_token, &entitlements, &client_version)?;
    let player_json: serde_json::Value = serde_json::from_str(&player_raw).map_err(|e| format!("Parse: {}", e))?;
    let party_id = player_json["CurrentPartyID"].as_str().filter(|s| !s.is_empty())
        .ok_or("No party ID")?;

    let body = serde_json::json!({
        "Map": map,
        "Mode": mode,
        "UseBots": false,
        "GamePod": pod,
        "GameRules": {
            "AllowGameModifiers": if allow_cheats { "true" } else { "false" },
            "PlayOutAllRounds": if play_out_all_rounds { "true" } else { "false" },
            "SkipMatchHistory": if skip_match_history { "true" } else { "false" },
            "TournamentMode": if tournament_mode { "true" } else { "false" },
            "IsOvertimeWinByTwo": if overtime_win_by_two { "true" } else { "false" }
        }
    });

    let path = format!("/parties/v1/parties/{}/customgamesettings", party_id);
    let body_str = body.to_string();
    log_info(&format!("[Custom] POST {} body={}", path, body_str));
    let resp = glz_post_body(&region, &shard, &path, &body_str, &access_token, &entitlements, &client_version);
    match &resp {
        Ok(r) => log_info(&format!("[Custom] Response: {}", &r[..r.len().min(200)])),
        Err(e) => log_info(&format!("[Custom] Error: {}", e)),
    }
    resp
}

pub fn change_queue(state: &Mutex<ConnectionState>, queue_id: &str) -> Result<String, String> {
    let (access_token, entitlements, puuid, region, shard, client_version) = get_glz_creds(state)?;
    let player_path = format!("/parties/v1/players/{}", puuid);
    let player_raw = glz_get(&region, &shard, &player_path, &access_token, &entitlements, &client_version)?;
    let player_json: serde_json::Value = serde_json::from_str(&player_raw).map_err(|e| format!("Parse: {}", e))?;
    let party_id = player_json["CurrentPartyID"].as_str().filter(|s| !s.is_empty())
        .ok_or("No party ID")?;
    let path = format!("/parties/v1/parties/{}/queue", party_id);
    let body = format!("{{\"queueID\": \"{}\"}}", queue_id);
    log_info(&format!("[Party] Changing queue to {}", queue_id));
    glz_post_body(&region, &shard, &path, &body, &access_token, &entitlements, &client_version)
}

pub fn start_custom_game_match(state: &Mutex<ConnectionState>) -> Result<String, String> {
    let (access_token, entitlements, puuid, region, shard, client_version) = get_glz_creds(state)?;
    let player_path = format!("/parties/v1/players/{}", puuid);
    let player_raw = glz_get(&region, &shard, &player_path, &access_token, &entitlements, &client_version)?;
    let player_json: serde_json::Value = serde_json::from_str(&player_raw).map_err(|e| format!("Parse: {}", e))?;
    let party_id = player_json["CurrentPartyID"].as_str().filter(|s| !s.is_empty())
        .ok_or("No party ID")?;
    let path = format!("/parties/v1/parties/{}/startcustomgame", party_id);
    log_info("[Custom] Starting custom game");
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
