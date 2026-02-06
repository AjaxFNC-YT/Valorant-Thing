use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};

const APP_ID: &str = "1469359571637108931";

pub struct DiscordState {
    client: Option<DiscordIpcClient>,
}

impl Default for DiscordState {
    fn default() -> Self {
        Self { client: None }
    }
}

pub fn start_rpc(state: &Mutex<DiscordState>) -> Result<(), String> {
    let mut s = state.lock().map_err(|e| e.to_string())?;
    if s.client.is_some() {
        return Ok(());
    }
    let mut client = DiscordIpcClient::new(APP_ID).map_err(|e| format!("RPC init: {}", e))?;
    client.connect().map_err(|e| format!("RPC connect: {}", e))?;
    eprintln!("[discord] IPC connected, waiting for pipe...");
    thread::sleep(Duration::from_millis(500));

    let payload = activity::Activity::new()
        .state("Active")
        .details("In Lobby")
        .assets(
            activity::Assets::new()
                .large_image("valorant")
                .large_text("Valorant")
                .small_image("logo")
                .small_text("Valorant Thing"),
        );
    match client.set_activity(payload) {
        Ok(_) => eprintln!("[discord] Activity set successfully"),
        Err(e) => eprintln!("[discord] set_activity failed: {}", e),
    }
    s.client = Some(client);
    eprintln!("[discord] RPC connected");
    Ok(())
}

pub fn stop_rpc(state: &Mutex<DiscordState>) -> Result<(), String> {
    let mut s = state.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut client) = s.client {
        let _ = client.clear_activity();
        let _ = client.close();
        eprintln!("[discord] RPC disconnected");
    }
    s.client = None;
    Ok(())
}

pub fn update_rpc(state: &Mutex<DiscordState>, details: &str, rpc_state: &str, large_image: &str, large_text: &str, small_image: &str, small_text: &str) -> Result<(), String> {
    let mut s = state.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut client) = s.client {
        let mut assets = activity::Assets::new()
            .large_image(large_image)
            .large_text(large_text);
        if !small_image.is_empty() {
            assets = assets.small_image(small_image).small_text(small_text);
        }
        let payload = activity::Activity::new()
            .state(rpc_state)
            .details(details)
            .assets(assets);
        client.set_activity(payload).map_err(|e| format!("RPC update: {}", e))?;
    }
    Ok(())
}
