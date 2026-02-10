use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use base64::Engine;

pub struct XmppLog {
    pub direction: String,
    pub data: String,
    pub timestamp: u64,
}

pub struct FriendPresence {
    pub puuid: String,
    pub game_name: String,
    pub game_tag: String,
    pub show: String,
    pub valorant_data: Option<serde_json::Value>,
    pub last_updated: u64,
}

pub struct XmppState {
    pub connected: bool,
    pub stream: Option<native_tls::TlsStream<TcpStream>>,
    pub logs: Vec<XmppLog>,
    pub jid: String,
    pub puuid: String,
    pub xmpp_region: String,
    pub connected_at: Option<Instant>,
    pub real_valorant_data: Option<serde_json::Value>,
    pub real_keystone_ts: Option<u64>,
    pub friends: HashMap<String, FriendPresence>,
}

impl Default for XmppState {
    fn default() -> Self {
        Self {
            connected: false,
            stream: None,
            logs: Vec::new(),
            jid: String::new(),
            puuid: String::new(),
            xmpp_region: String::new(),
            connected_at: None,
            real_valorant_data: None,
            real_keystone_ts: None,
            friends: HashMap::new(),
        }
    }
}

fn format_json_tabs(val: &serde_json::Value) -> String {
    let pretty = serde_json::to_string_pretty(val).unwrap_or_default();
    let mut result = String::new();
    for line in pretty.lines() {
        let trimmed = line.trim_start();
        let spaces = line.len() - trimmed.len();
        let tabs = spaces / 4;
        for _ in 0..tabs { result.push('\t'); }
        if spaces % 4 > 0 { result.push('\t'); }
        result.push_str(trimmed);
        result.push_str("\r\n");
    }
    if result.ends_with("\r\n") {
        result.truncate(result.len() - 2);
    }
    result
}

fn extract_real_valorant_payload(data: &str, puuid: &str) -> Option<(serde_json::Value, u64)> {
    if puuid.is_empty() { return None; }
    let marker = format!("{}@", puuid);
    let mut search_from = 0;
    while let Some(pos) = data[search_from..].find(&marker) {
        let abs_pos = search_from + pos;
        let before = &data[..abs_pos];
        let pres_start = before.rfind("<presence ")?;
        let after = &data[pres_start..];
        let pres_end = after.find("</presence>").map(|p| pres_start + p + "</presence>".len())?;
        let stanza = &data[pres_start..pres_end];

        if stanza.contains("<valorant>") && stanza.contains("<keystone>") {
            if let Some(p_start) = stanza.find("<valorant>") {
                let val_section = &stanza[p_start..];
                if let Some(b64_start) = val_section.find("<p>") {
                    let b64_data = &val_section[b64_start + 3..];
                    if let Some(b64_end) = b64_data.find("</p>") {
                        let b64 = &b64_data[..b64_end];
                        if let Ok(decoded) = base64::engine::general_purpose::STANDARD.decode(b64) {
                            if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&decoded) {
                                let mut ks_ts: u64 = 0;
                                if let Some(ks_start) = stanza.find("<keystone>") {
                                    let ks = &stanza[ks_start..];
                                    if let Some(ts_start) = ks.find("<s.t>") {
                                        let ts_str = &ks[ts_start + 5..];
                                        if let Some(ts_end) = ts_str.find("</s.t>") {
                                            ks_ts = ts_str[..ts_end].parse().unwrap_or(0);
                                        }
                                    }
                                }
                                return Some((json, ks_ts));
                            }
                        }
                    }
                }
            }
        }
        search_from = abs_pos + 1;
    }
    None
}

fn extract_puuid_from_presence(stanza: &str) -> String {
    if let Some(pos) = stanza.find("from=\"") {
        let after = &stanza[pos + 6..];
        if let Some(at) = after.find('@') {
            return after[..at].to_string();
        }
    }
    String::new()
}

fn extract_show(stanza: &str) -> String {
    if stanza.contains("type=\"unavailable\"") {
        return "offline".to_string();
    }
    if let Some(start) = stanza.find("<show>") {
        let after = &stanza[start + 6..];
        if let Some(end) = after.find("</show>") {
            return after[..end].to_string();
        }
    }
    "online".to_string()
}

fn extract_valorant_b64(stanza: &str) -> Option<serde_json::Value> {
    let val_start = stanza.find("<valorant>")?;
    let val_section = &stanza[val_start..];
    let p_start = val_section.find("<p>")?;
    let b64_data = &val_section[p_start + 3..];
    let b64_end = b64_data.find("</p>")?;
    let decoded = base64::engine::general_purpose::STANDARD.decode(&b64_data[..b64_end]).ok()?;
    serde_json::from_slice(&decoded).ok()
}

fn update_friends_from_xml(data: &str, own_puuid: &str, friends: &mut HashMap<String, FriendPresence>) -> Vec<(String, String)> {
    let mut debug_logs: Vec<(String, String)> = Vec::new();
    let mut parsed = 0u32;
    let mut search_from = 0;
    while let Some(pos) = data[search_from..].find("<presence") {
        let abs = search_from + pos;
        let rest = &data[abs..];
        let end = match rest.find("</presence>") {
            Some(e) => e + "</presence>".len(),
            None => break,
        };
        let stanza = &rest[..end];
        let puuid = extract_puuid_from_presence(stanza);
        if !puuid.is_empty() && puuid != own_puuid {
            let show = extract_show(stanza);
            let val_data = extract_valorant_b64(stanza);
            let has_val = val_data.is_some();
            let entry = friends.entry(puuid.clone()).or_insert_with(|| FriendPresence {
                puuid: puuid.clone(),
                game_name: String::new(),
                game_tag: String::new(),
                show: String::new(),
                valorant_data: None,
                last_updated: 0,
            });
            entry.show = show.clone();
            if val_data.is_some() {
                entry.valorant_data = val_data;
            }
            entry.last_updated = now_ms();
            parsed += 1;
            debug_logs.push(("f_debug".to_string(), format!("{}.. show={} val_data={}", &puuid[..8.min(puuid.len())], show, has_val)));
        }
        search_from = abs + end;
    }
    if parsed > 0 {
        debug_logs.push(("f_debug".to_string(), format!("Parsed {} friend stanzas, total tracked: {}", parsed, friends.len())));
    }
    debug_logs
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64
}

fn add_log(logs: &mut Vec<XmppLog>, direction: &str, data: &str) {
    super::logging::log_info(&format!("[XMPP] {} {}", direction, &data[..data.len().min(300)]));
    logs.push(XmppLog {
        direction: direction.to_string(),
        data: data.to_string(),
        timestamp: now_ms(),
    });
    if logs.len() > 500 {
        logs.drain(0..100);
    }
}

fn xmpp_write(stream: &mut native_tls::TlsStream<TcpStream>, data: &str) -> Result<(), String> {
    stream.write_all(data.as_bytes()).map_err(|e| format!("write: {}", e))?;
    stream.flush().map_err(|e| format!("flush: {}", e))
}

fn xmpp_read_timeout(stream: &mut native_tls::TlsStream<TcpStream>, timeout_ms: u64) -> Result<String, String> {
    stream.get_ref().set_read_timeout(Some(Duration::from_millis(timeout_ms)))
        .map_err(|e| format!("set timeout: {}", e))?;

    let mut buf = vec![0u8; 16384];
    let mut result = String::new();

    loop {
        match stream.read(&mut buf) {
            Ok(0) => {
                if result.is_empty() {
                    return Err("connection closed".to_string());
                }
                break;
            }
            Ok(n) => {
                result.push_str(&String::from_utf8_lossy(&buf[..n]));
                if n < buf.len() { break; }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock
                    || e.kind() == std::io::ErrorKind::TimedOut => break,
            Err(e) => return Err(format!("read: {}", e)),
        }
    }

    Ok(result)
}

fn xmpp_read_until(stream: &mut native_tls::TlsStream<TcpStream>, marker: &str, timeout_secs: u64) -> Result<String, String> {
    stream.get_ref().set_read_timeout(Some(Duration::from_millis(500)))
        .map_err(|e| format!("set timeout: {}", e))?;

    let start = Instant::now();
    let mut result = String::new();
    let mut buf = vec![0u8; 16384];

    while start.elapsed().as_secs() < timeout_secs {
        match stream.read(&mut buf) {
            Ok(0) => return Err("connection closed during handshake".to_string()),
            Ok(n) => {
                result.push_str(&String::from_utf8_lossy(&buf[..n]));
                if result.contains(marker) { return Ok(result); }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock
                    || e.kind() == std::io::ErrorKind::TimedOut => {
                if result.contains(marker) { return Ok(result); }
                continue;
            }
            Err(e) => return Err(format!("read: {}", e)),
        }
    }

    if result.contains(marker) {
        Ok(result)
    } else {
        Err(format!("timeout waiting for '{}', got: {}", marker, &result[..result.len().min(500)]))
    }
}

fn fetch_pas_token(access_token: &str) -> Result<String, String> {
    let raw = super::http::authed_get(
        "https://riot-geo.pas.si.riotgames.com/pas/v1/service/chat",
        access_token,
    )?;
    Ok(raw.trim().to_string())
}

fn decode_affinity(pas_token: &str) -> Result<String, String> {
    let parts: Vec<&str> = pas_token.trim().split('.').collect();
    if parts.len() < 2 {
        return Err("Invalid PAS JWT format".to_string());
    }

    let payload = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(parts[1])
        .or_else(|_| base64::engine::general_purpose::STANDARD_NO_PAD.decode(parts[1]))
        .or_else(|_| base64::engine::general_purpose::STANDARD.decode(parts[1]))
        .map_err(|e| format!("base64 decode PAS payload: {}", e))?;

    let json: serde_json::Value = serde_json::from_slice(&payload)
        .map_err(|e| format!("parse PAS payload: {}", e))?;

    json["affinity"].as_str()
        .ok_or("No affinity in PAS token".to_string())
        .map(|s| s.to_string())
}

fn fetch_chat_config(access_token: &str, entitlements: &str, affinity: &str) -> Result<(String, String), String> {
    let url = "https://clientconfig.rpg.riotgames.com/api/v1/config/player?app=Riot%20Client";
    let raw = super::http::authed_get_with_entitlements(url, access_token, entitlements)?;
    let config: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| format!("parse client config: {}", e))?;

    let host = config["chat.affinities"][affinity].as_str()
        .ok_or(format!("No chat.affinities entry for affinity '{}'", affinity))?
        .to_string();

    let domain = config["chat.affinity_domains"][affinity].as_str()
        .ok_or(format!("No chat.affinity_domains entry for affinity '{}'", affinity))?
        .to_string();

    Ok((host, domain))
}

fn extract_jid(xml: &str) -> String {
    if let Some(start) = xml.find("<jid>") {
        if let Some(end) = xml[start..].find("</jid>") {
            return xml[start + 5..start + end].to_string();
        }
    }
    String::new()
}

pub fn xmpp_connect(xmpp_state: &Mutex<XmppState>, riot_state: &Mutex<super::types::ConnectionState>) -> Result<String, String> {
    let access_token = {
        let s = riot_state.lock().map_err(|e| format!("lock riot: {}", e))?;
        s.access_token.clone().ok_or("Not connected to Riot — connect first")?
    };

    {
        let mut s = xmpp_state.lock().map_err(|e| format!("lock xmpp: {}", e))?;
        if s.connected {
            if let Some(ref mut stream) = s.stream {
                let _ = xmpp_write(stream, "</stream:stream>");
            }
            s.stream = None;
            s.connected = false;
        }
        s.logs.clear();
        s.friends.clear();
        add_log(&mut s.logs, "system", "Fetching PAS token...");
    }

    let pas_token = fetch_pas_token(&access_token)?;
    {
        let mut s = xmpp_state.lock().map_err(|e| format!("lock: {}", e))?;
        add_log(&mut s.logs, "system", &format!("PAS token received ({} chars)", pas_token.len()));
    }

    let affinity = decode_affinity(&pas_token)?;

    let (access_tok, entitlements_jwt) = {
        let s = riot_state.lock().map_err(|e| format!("lock riot: {}", e))?;
        (
            s.access_token.clone().unwrap_or_default(),
            s.entitlements.clone().unwrap_or_default(),
        )
    };

    {
        let mut s = xmpp_state.lock().map_err(|e| format!("lock: {}", e))?;
        add_log(&mut s.logs, "system", &format!("Affinity: {}, fetching client config...", affinity));
    }

    let (host, domain) = fetch_chat_config(&access_tok, &entitlements_jwt, &affinity)?;

    {
        let mut s = xmpp_state.lock().map_err(|e| format!("lock: {}", e))?;
        add_log(&mut s.logs, "system", &format!("Host: {}:5223, Domain: {}.pvp.net", host, domain));
        s.xmpp_region = domain.clone();
    }

    let connector = native_tls::TlsConnector::builder()
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| format!("TLS build: {}", e))?;

    let addr = format!("{}:5223", host)
        .to_socket_addrs()
        .map_err(|e| format!("DNS resolve {}: {}", host, e))?
        .next()
        .ok_or(format!("No addresses for {}", host))?;

    let tcp = TcpStream::connect_timeout(&addr, Duration::from_secs(10))
        .map_err(|e| format!("TCP connect to {}: {}", host, e))?;

    let mut stream = connector.connect(&host, tcp)
        .map_err(|e| format!("TLS handshake: {}", e))?;

    {
        let mut s = xmpp_state.lock().map_err(|e| format!("lock: {}", e))?;
        add_log(&mut s.logs, "system", "TLS connected");
    }

    let stream_open = format!(
        "<?xml version=\"1.0\"?><stream:stream to=\"{}.pvp.net\" version=\"1.0\" xmlns:stream=\"http://etherx.jabber.org/streams\">",
        domain
    );

    xmpp_write(&mut stream, &stream_open)?;
    {
        let mut s = xmpp_state.lock().map_err(|e| format!("lock: {}", e))?;
        add_log(&mut s.logs, "sent", &stream_open);
    }

    let resp = xmpp_read_until(&mut stream, "</stream:features>", 10)?;
    {
        let mut s = xmpp_state.lock().map_err(|e| format!("lock: {}", e))?;
        add_log(&mut s.logs, "recv", &resp);
    }

    let auth_xml = format!(
        "<auth mechanism=\"X-Riot-RSO-PAS\" xmlns=\"urn:ietf:params:xml:ns:xmpp-sasl\"><rso_token>{}</rso_token><pas_token>{}</pas_token></auth>",
        access_token, pas_token
    );
    xmpp_write(&mut stream, &auth_xml)?;
    {
        let mut s = xmpp_state.lock().map_err(|e| format!("lock: {}", e))?;
        add_log(&mut s.logs, "sent", "<auth mechanism=\"X-Riot-RSO-PAS\">[tokens redacted]</auth>");
    }

    let resp = xmpp_read_timeout(&mut stream, 10000)?;
    {
        let mut s = xmpp_state.lock().map_err(|e| format!("lock: {}", e))?;
        add_log(&mut s.logs, "recv", &resp);
    }
    if resp.contains("<failure") || resp.contains("not-authorized") {
        return Err(format!("XMPP auth failed: {}", resp));
    }

    xmpp_write(&mut stream, &stream_open)?;
    {
        let mut s = xmpp_state.lock().map_err(|e| format!("lock: {}", e))?;
        add_log(&mut s.logs, "sent", &stream_open);
    }

    let resp = xmpp_read_until(&mut stream, "</stream:features>", 10)?;
    {
        let mut s = xmpp_state.lock().map_err(|e| format!("lock: {}", e))?;
        add_log(&mut s.logs, "recv", &resp);
    }

    let rc_resource = format!("RC-{}", now_ms() % 10_000_000_000u64);
    let bind = format!("<iq id=\"_xmpp_bind1\" type=\"set\"><bind xmlns=\"urn:ietf:params:xml:ns:xmpp-bind\"><resource>{}</resource></bind></iq>", rc_resource);
    xmpp_write(&mut stream, &bind)?;
    {
        let mut s = xmpp_state.lock().map_err(|e| format!("lock: {}", e))?;
        add_log(&mut s.logs, "sent", &bind);
    }

    let resp = xmpp_read_until(&mut stream, "</iq>", 10)?;
    let jid = extract_jid(&resp);
    {
        let mut s = xmpp_state.lock().map_err(|e| format!("lock: {}", e))?;
        add_log(&mut s.logs, "recv", &resp);
        if !jid.is_empty() {
            add_log(&mut s.logs, "system", &format!("Bound JID: {}", jid));
        }
        s.jid = jid;
    }

    let session = "<iq id=\"_xmpp_session1\" type=\"set\"><session xmlns=\"urn:ietf:params:xml:ns:xmpp-session\"/></iq>";
    xmpp_write(&mut stream, session)?;
    {
        let mut s = xmpp_state.lock().map_err(|e| format!("lock: {}", e))?;
        add_log(&mut s.logs, "sent", session);
    }

    let resp = xmpp_read_until(&mut stream, "</iq>", 10)?;
    {
        let mut s = xmpp_state.lock().map_err(|e| format!("lock: {}", e))?;
        add_log(&mut s.logs, "recv", &resp);
    }

    let entitlements_xml = format!(
        "<iq id=\"xmpp_entitlements_0\" type=\"set\"><entitlements xmlns=\"urn:riotgames:entitlements\"><token xmlns=\"\">{}</token></entitlements></iq>",
        entitlements_jwt
    );
    xmpp_write(&mut stream, &entitlements_xml)?;
    {
        let mut s = xmpp_state.lock().map_err(|e| format!("lock: {}", e))?;
        add_log(&mut s.logs, "sent", "<iq id=\"xmpp_entitlements_0\"> [entitlements token]</iq>");
    }

    let resp = xmpp_read_timeout(&mut stream, 2000)?;
    {
        let mut s = xmpp_state.lock().map_err(|e| format!("lock: {}", e))?;
        if !resp.is_empty() {
            add_log(&mut s.logs, "recv", &resp);
        }
    }

    xmpp_write(&mut stream, "<presence/>")?;
    {
        let mut s = xmpp_state.lock().map_err(|e| format!("lock: {}", e))?;
        add_log(&mut s.logs, "sent", "<presence/>");
    }

    let puuid_clone = {
        let cs = riot_state.lock().map_err(|e| format!("lock: {}", e))?;
        cs.puuid.clone().unwrap_or_default()
    };

    let mut all_chunks = String::new();
    for _ in 0..8 {
        let chunk = xmpp_read_timeout(&mut stream, 1500)?;
        if chunk.is_empty() { break; }
        all_chunks.push_str(&chunk);
        let mut s = xmpp_state.lock().map_err(|e| format!("lock: {}", e))?;
        if !puuid_clone.is_empty() && chunk.contains(&puuid_clone) {
            add_log(&mut s.logs, "own_presence", &chunk);
        } else {
            add_log(&mut s.logs, "recv", &chunk);
        }
    }

    {
        let mut s = xmpp_state.lock().map_err(|e| format!("lock: {}", e))?;
        if let Some(real_data) = extract_real_valorant_payload(&all_chunks, &puuid_clone) {
            add_log(&mut s.logs, "system", &format!("Captured real valorant data: {} fields", real_data.0.as_object().map(|o| o.len()).unwrap_or(0)));
            s.real_valorant_data = Some(real_data.0);
            s.real_keystone_ts = Some(real_data.1);
        }
        let f_logs = update_friends_from_xml(&all_chunks, &puuid_clone, &mut s.friends);
        for (dir, msg) in f_logs { add_log(&mut s.logs, &dir, &msg); }
        let friend_count = s.friends.len();
        add_log(&mut s.logs, "system", &format!("Captured {} friend presences", friend_count));
    }

    {
        let mut s = xmpp_state.lock().map_err(|e| format!("lock: {}", e))?;
        add_log(&mut s.logs, "system", "Connected and authenticated!");
        s.puuid = puuid_clone;
        s.stream = Some(stream);
        s.connected = true;
        s.connected_at = Some(Instant::now());
    }

    Ok("connected".to_string())
}

pub fn xmpp_disconnect(state: &Mutex<XmppState>) -> Result<(), String> {
    let mut s = state.lock().map_err(|e| format!("lock: {}", e))?;
    if let Some(ref mut stream) = s.stream {
        let _ = xmpp_write(stream, "</stream:stream>");
    }
    s.stream = None;
    s.connected = false;
    add_log(&mut s.logs, "system", "Disconnected");
    Ok(())
}

pub fn xmpp_poll(state: &Mutex<XmppState>) -> Result<String, String> {
    let mut s = state.lock().map_err(|e| format!("lock: {}", e))?;
    if !s.connected {
        return Ok("not_connected".to_string());
    }

    let puuid = s.puuid.clone();

    let read_result = {
        let stream = match s.stream.as_mut() {
            Some(st) => st,
            None => {
                s.connected = false;
                return Ok("no_stream".to_string());
            }
        };
        xmpp_read_timeout(stream, 150)
    };

    match read_result {
        Ok(data) if !data.is_empty() => {
            if !puuid.is_empty() && data.contains(&puuid) {
                add_log(&mut s.logs, "own_presence", &data);
            } else {
                add_log(&mut s.logs, "recv", &data);
            }
            let f_logs = update_friends_from_xml(&data, &puuid, &mut s.friends);
            for (dir, msg) in f_logs { add_log(&mut s.logs, &dir, &msg); }
        }
        Ok(_) => {}
        Err(e) if e.contains("connection closed") => {
            add_log(&mut s.logs, "error", "Connection closed by server");
            s.connected = false;
            s.stream = None;
        }
        Err(e) => {
            add_log(&mut s.logs, "error", &e);
        }
    }

    Ok("ok".to_string())
}

pub fn xmpp_send_fake_presence(state: &Mutex<XmppState>, presence_json: &str) -> Result<(), String> {
    let mut s = state.lock().map_err(|e| format!("lock: {}", e))?;
    if !s.connected {
        return Err("Not connected to XMPP".to_string());
    }

    let params: serde_json::Value = serde_json::from_str(presence_json)
        .map_err(|e| format!("parse presence params: {}", e))?;

    let show = params["show"].as_str().unwrap_or("chat");
    let timestamp = now_ms();

    let mut valorant_data = match &s.real_valorant_data {
        Some(real) => real.clone(),
        None => {
            add_log(&mut s.logs, "error", "No real valorant data captured - connect XMPP while in game first");
            return Err("No real valorant data captured. Reconnect XMPP.".to_string());
        }
    };

    let ks_ts = s.real_keystone_ts.unwrap_or(timestamp - 5000);

    if let Some(obj) = valorant_data.as_object_mut() {
        if let Some(pd) = obj.get_mut("playerPresenceData").and_then(|v| v.as_object_mut()) {
            if let Some(v) = params["competitiveTier"].as_u64() { pd.insert("competitiveTier".into(), serde_json::json!(v)); }
            if let Some(v) = params["accountLevel"].as_u64() { pd.insert("accountLevel".into(), serde_json::json!(v)); }
            if let Some(v) = params["leaderboardPosition"].as_u64() { pd.insert("leaderboardPosition".into(), serde_json::json!(v)); }
            if let Some(v) = params["playerCardId"].as_str().filter(|s| !s.is_empty()) { pd.insert("playerCardId".into(), serde_json::json!(v)); }
            if let Some(v) = params["playerTitleId"].as_str().filter(|s| !s.is_empty()) { pd.insert("playerTitleId".into(), serde_json::json!(v)); }
        }

        if !obj.contains_key("matchPresenceData") || !obj["matchPresenceData"].is_object() {
            obj.insert("matchPresenceData".into(), serde_json::json!({}));
        }

        if let Some(session) = params["sessionLoopState"].as_str() {
            if let Some(md) = obj.get_mut("matchPresenceData").and_then(|v| v.as_object_mut()) {
                md.insert("sessionLoopState".into(), serde_json::json!(session));
            }
        }

        if let Some(queue) = params["queueId"].as_str().filter(|s| !s.is_empty()) {
            obj.insert("queueId".into(), serde_json::json!(queue));
            if let Some(md) = obj.get_mut("matchPresenceData").and_then(|v| v.as_object_mut()) {
                md.insert("queueId".into(), serde_json::json!(queue));
                let flow = if queue == "newmap" || queue.is_empty() { "Invalid" } else { "Matchmaking" };
                md.insert("provisioningFlow".into(), serde_json::json!(flow));
            }
        }

        if let Some(v) = params["partySize"].as_u64() {
            obj.insert("partySize".into(), serde_json::json!(v));
            if let Some(ppd) = obj.get_mut("partyPresenceData").and_then(|v| v.as_object_mut()) {
                ppd.insert("partySize".into(), serde_json::json!(v));
            }
        }
        if let Some(v) = params["maxPartySize"].as_u64() {
            obj.insert("maxPartySize".into(), serde_json::json!(v));
            if let Some(ppd) = obj.get_mut("partyPresenceData").and_then(|v| v.as_object_mut()) {
                ppd.insert("maxPartySize".into(), serde_json::json!(v));
            }
        }

        if let Some(v) = params["partyOwnerMatchScoreAllyTeam"].as_u64() {
            obj.insert("partyOwnerMatchScoreAllyTeam".into(), serde_json::json!(v));
            if let Some(ppd) = obj.get_mut("partyPresenceData").and_then(|v| v.as_object_mut()) {
                ppd.insert("partyOwnerMatchScoreAllyTeam".into(), serde_json::json!(v));
            }
        }
        if let Some(v) = params["partyOwnerMatchScoreEnemyTeam"].as_u64() {
            obj.insert("partyOwnerMatchScoreEnemyTeam".into(), serde_json::json!(v));
            if let Some(ppd) = obj.get_mut("partyPresenceData").and_then(|v| v.as_object_mut()) {
                ppd.insert("partyOwnerMatchScoreEnemyTeam".into(), serde_json::json!(v));
            }
        }

        if let Some(prem) = obj.get_mut("premierPresenceData").and_then(|v| v.as_object_mut()) {
            if let Some(v) = params["premierDivision"].as_u64() { prem.insert("division".into(), serde_json::json!(v)); }
            if let Some(v) = params["premierTag"].as_str().filter(|s| !s.is_empty()) { prem.insert("rosterTag".into(), serde_json::json!(v)); }
            if let Some(v) = params["rosterName"].as_str().filter(|s| !s.is_empty()) { prem.insert("rosterName".into(), serde_json::json!(v)); }
        }
    }

    let json_str = format_json_tabs(&valorant_data);
    let b64 = base64::engine::general_purpose::STANDARD.encode(json_str.as_bytes());

    let xml = format!(
        concat!(
            "<presence>",
            "<games>",
            "<keystone><st>chat</st><s.t>{ks_ts}</s.t><m/><s.p>keystone</s.p><pty/></keystone>",
            "<valorant><s.r>PC</s.r><st>{show}</st><p>{b64}</p><s.p>valorant</s.p><s.t>{ts}</s.t><pty/></valorant>",
            "</games>",
            "<show>{show}</show>",
            "<status/>",
            "</presence>"
        ),
        show = show,
        ks_ts = ks_ts,
        ts = timestamp,
        b64 = b64,
    );

    let stream = s.stream.as_mut().ok_or("No stream")?;
    xmpp_write(stream, &xml)?;
    add_log(&mut s.logs, "sent", &format!("[FAKE PRESENCE] show={} tier={} xml_len={}", show, valorant_data["playerPresenceData"]["competitiveTier"], xml.len()));
    add_log(&mut s.logs, "debug", &xml);
    Ok(())
}

pub fn xmpp_send_raw(state: &Mutex<XmppState>, data: &str) -> Result<(), String> {
    let mut s = state.lock().map_err(|e| format!("lock: {}", e))?;
    if !s.connected {
        return Err("Not connected".to_string());
    }

    let stream = s.stream.as_mut().ok_or("No stream")?;
    xmpp_write(stream, data)?;
    add_log(&mut s.logs, "sent", data);
    Ok(())
}

pub fn xmpp_get_status(state: &Mutex<XmppState>) -> String {
    let s = match state.lock() {
        Ok(s) => s,
        Err(_) => return serde_json::json!({"connected": false}).to_string(),
    };

    let uptime = s.connected_at
        .filter(|_| s.connected)
        .map(|t| t.elapsed().as_secs())
        .unwrap_or(0);

    let real_card = s.real_valorant_data.as_ref()
        .and_then(|d| d["playerPresenceData"]["playerCardId"].as_str())
        .unwrap_or("");
    let real_title = s.real_valorant_data.as_ref()
        .and_then(|d| d["playerPresenceData"]["playerTitleId"].as_str())
        .unwrap_or("");

    let premier_data = s.real_valorant_data.as_ref()
        .and_then(|d| d.get("premierPresenceData"))
        .cloned()
        .unwrap_or(serde_json::json!(null));

    serde_json::json!({
        "connected": s.connected,
        "jid": s.jid,
        "region": s.xmpp_region,
        "uptime_secs": uptime,
        "log_count": s.logs.len(),
        "realCardId": real_card,
        "realTitleId": real_title,
        "premierData": premier_data,
    }).to_string()
}

pub fn xmpp_check_local_presences(riot_state: &Mutex<super::types::ConnectionState>) -> Result<String, String> {
    let s = riot_state.lock().map_err(|e| format!("lock: {}", e))?;
    let port = s.port.ok_or("No port")?;
    let auth = s.local_auth.clone().ok_or("No local auth")?;
    let puuid = s.puuid.clone().unwrap_or_default();
    drop(s);

    let raw = super::http::local_get(port, &auth, "/chat/v4/presences")?;
    let json: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| format!("parse presences: {}", e))?;

    let presences = json["presences"].as_array().ok_or("No presences array")?;
    let mut own: Vec<serde_json::Value> = Vec::new();
    let mut all: Vec<serde_json::Value> = Vec::new();
    for p in presences {
        let mut entry = serde_json::json!({
            "puuid": p["puuid"],
            "product": p["product"],
            "resource": p["resource"],
            "state": p["state"],
            "time": p["time"],
            "game_name": p["game_name"],
            "game_tag": p["game_tag"],
            "pid": p["pid"],
        });
        if let Some(priv_b64) = p["private"].as_str().filter(|s| !s.is_empty()) {
            if let Ok(decoded) = base64::engine::general_purpose::STANDARD.decode(priv_b64) {
                if let Ok(priv_json) = serde_json::from_slice::<serde_json::Value>(&decoded) {
                    entry["private_decoded"] = priv_json;
                }
            }
        }
        if let Some(basic_b64) = p["basic"].as_str().filter(|s| !s.is_empty()) {
            entry["basic"] = serde_json::Value::String(basic_b64.to_string());
        }
        let is_own = p["puuid"].as_str() == Some(&puuid);
        if is_own {
            own.push(entry.clone());
        }
        all.push(entry);
    }

    Ok(serde_json::json!({
        "total_presences": presences.len(),
        "own_presences": own,
        "all_presences": all,
        "my_puuid": puuid,
    }).to_string())
}

pub fn local_api_discover(riot_state: &Mutex<super::types::ConnectionState>) -> Result<String, String> {
    let s = riot_state.lock().map_err(|e| format!("lock: {}", e))?;
    let port = s.port.ok_or("No port")?;
    let auth = s.local_auth.clone().ok_or("No local auth")?;
    drop(s);

    let help = super::http::local_get(port, &auth, "/help");
    let chat_me = super::http::local_get(port, &auth, "/chat/v1/me");
    let chat_session = super::http::local_get(port, &auth, "/chat/v1/session");

    let mut results = serde_json::json!({});
    if let Ok(h) = &help {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(h) {
            let mut chat_endpoints: Vec<String> = Vec::new();
            if let Some(obj) = v.as_object() {
                for (key, val) in obj {
                    if key.contains("chat") || key.contains("presence") || key.contains("roster") {
                        chat_endpoints.push(format!("{}: {}", key, val));
                    }
                }
            }
            results["chat_endpoints"] = serde_json::json!(chat_endpoints);
            results["total_endpoints"] = serde_json::json!(v.as_object().map(|o| o.len()).unwrap_or(0));
        } else {
            results["help_raw"] = serde_json::json!(h[..h.len().min(2000)]);
        }
    } else {
        results["help_error"] = serde_json::json!(help.unwrap_err());
    }

    if let Ok(me) = &chat_me {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(me) {
            results["chat_me"] = v;
        }
    }
    if let Ok(sess) = &chat_session {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(sess) {
            results["chat_session"] = v;
        }
    }

    Ok(serde_json::to_string_pretty(&results).unwrap_or_default())
}

pub fn xmpp_get_friends_presences(
    xmpp_state: &Mutex<XmppState>,
    riot_state: &Mutex<super::types::ConnectionState>,
) -> Result<String, String> {
    let unresolved: Vec<String> = {
        let s = xmpp_state.lock().map_err(|e| format!("lock: {}", e))?;
        s.friends.iter()
            .filter(|(_, f)| f.game_name.is_empty())
            .map(|(puuid, _)| puuid.clone())
            .collect()
    };

    if !unresolved.is_empty() {
        if let Ok(names_raw) = super::game::resolve_player_names(riot_state, unresolved) {
            if let Ok(names) = serde_json::from_str::<Vec<serde_json::Value>>(&names_raw) {
                let mut s = xmpp_state.lock().map_err(|e| format!("lock: {}", e))?;
                for entry in &names {
                    let puuid = entry["Subject"].as_str().unwrap_or_default();
                    if let Some(friend) = s.friends.get_mut(puuid) {
                        friend.game_name = entry["GameName"].as_str().unwrap_or_default().to_string();
                        friend.game_tag = entry["TagLine"].as_str().unwrap_or_default().to_string();
                    }
                }
            }
        }
    }

    let s = xmpp_state.lock().map_err(|e| format!("lock: {}", e))?;
    let friends: Vec<serde_json::Value> = s.friends.values().map(|f| {
        let mut obj = serde_json::json!({
            "puuid": f.puuid,
            "game_name": f.game_name,
            "game_tag": f.game_tag,
            "show": f.show,
            "last_updated": f.last_updated,
        });
        if let Some(ref vd) = f.valorant_data {
            obj["valorant_data"] = vd.clone();
        }
        obj
    }).collect();

    Ok(serde_json::json!({
        "friends": friends,
        "total": friends.len(),
    }).to_string())
}

pub fn xmpp_get_logs(state: &Mutex<XmppState>) -> String {
    let s = match state.lock() {
        Ok(s) => s,
        Err(_) => return "[]".to_string(),
    };

    let logs: Vec<serde_json::Value> = s.logs.iter().map(|l| {
        serde_json::json!({
            "direction": l.direction,
            "data": l.data,
            "timestamp": l.timestamp,
        })
    }).collect();

    serde_json::json!(logs).to_string()
}
