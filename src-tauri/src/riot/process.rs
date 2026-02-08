use std::process::Command;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use super::logging::log_info;

pub fn read_lockfile() -> Result<(u32, u16, String), String> {
    let local_app_data =
        std::env::var("LOCALAPPDATA").map_err(|_| "LOCALAPPDATA not found".to_string())?;
    let path = format!(
        "{}\\Riot Games\\Riot Client\\Config\\lockfile",
        local_app_data
    );
    let contents = std::fs::read_to_string(&path)
        .map_err(|_| "Could not read lockfile. Is Riot Client running?".to_string())?;
    let parts: Vec<&str> = contents.trim().split(':').collect();
    if parts.len() < 5 {
        return Err("Invalid lockfile format".to_string());
    }
    let pid: u32 = parts[1].parse().map_err(|_| "Invalid PID".to_string())?;
    let port: u16 = parts[2].parse().map_err(|_| "Invalid port".to_string())?;
    let password = parts[3].to_string();
    Ok((pid, port, password))
}

pub fn is_pid_alive(pid: u32) -> bool {
    let mut cmd = Command::new("tasklist");
    cmd.args(["/FI", &format!("PID eq {}", pid), "/NH"]);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    match cmd.output() {
        Ok(o) => String::from_utf8_lossy(&o.stdout).contains(&pid.to_string()),
        Err(_) => false,
    }
}

pub fn is_riot_client_running() -> bool {
    match read_lockfile() {
        Ok((pid, _, _)) => is_pid_alive(pid),
        Err(_) => false,
    }
}

fn is_valorant_game_running() -> bool {
    let mut cmd = Command::new("tasklist");
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    match cmd.output() {
        Ok(o) => String::from_utf8_lossy(&o.stdout).contains("VALORANT-Win64-Shi"),
        Err(_) => false,
    }
}

pub fn is_valorant_running() -> bool {
    is_riot_client_running() && is_valorant_game_running()
}

pub fn parse_region_shard() -> Result<(String, String), String> {
    let local_app_data =
        std::env::var("LOCALAPPDATA").map_err(|_| "LOCALAPPDATA not found".to_string())?;
    let path = format!(
        "{}\\VALORANT\\Saved\\Logs\\ShooterGame.log",
        local_app_data
    );
    let log = std::fs::read_to_string(&path)
        .map_err(|_| "Could not read ShooterGame.log. Is Valorant installed?".to_string())?;
    let re = regex::Regex::new(r"https://glz-(.+?)-1\.(.+?)\.a\.pvp\.net")
        .map_err(|e| e.to_string())?;
    let last = re.captures_iter(&log).last()
        .ok_or("Could not find region/shard in ShooterGame.log")?;
    let region = last[1].to_string();
    let shard = last[2].to_string();
    log_info(&format!("[Connect] Parsed region={} shard={} from ShooterGame.log", region, shard));
    Ok((region, shard))
}
