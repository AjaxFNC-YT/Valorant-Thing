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

#[cfg(target_os = "windows")]
pub fn is_valorant_foreground() -> bool {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;

    extern "system" {
        fn GetForegroundWindow() -> isize;
        fn GetWindowThreadProcessId(hwnd: isize, process_id: *mut u32) -> u32;
        fn OpenProcess(access: u32, inherit: i32, pid: u32) -> isize;
        fn CloseHandle(handle: isize) -> i32;
        fn QueryFullProcessImageNameW(process: isize, flags: u32, name: *mut u16, size: *mut u32) -> i32;
    }

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd == 0 { return false; }
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == 0 { return false; }
        let handle = OpenProcess(0x1000, 0, pid);
        if handle == 0 { return false; }
        let mut buf = [0u16; 260];
        let mut size = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(handle, 0, buf.as_mut_ptr(), &mut size);
        CloseHandle(handle);
        if ok == 0 { return false; }
        let name = OsString::from_wide(&buf[..size as usize]);
        name.to_string_lossy().to_lowercase().contains("valorant")
    }
}

#[cfg(not(target_os = "windows"))]
pub fn is_valorant_foreground() -> bool {
    false
}

#[cfg(target_os = "windows")]
pub fn get_valorant_monitor() -> Result<(i32, i32, u32, u32), String> {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;

    #[repr(C)]
    struct Rect { left: i32, top: i32, right: i32, bottom: i32 }
    #[repr(C)]
    struct MonitorInfo { cb_size: u32, rc_monitor: Rect, rc_work: Rect, flags: u32 }

    extern "system" {
        fn FindWindowW(class: *const u16, title: *const u16) -> isize;
        fn MonitorFromWindow(hwnd: isize, flags: u32) -> isize;
        fn GetMonitorInfoW(monitor: isize, info: *mut MonitorInfo) -> i32;
        fn EnumWindows(callback: extern "system" fn(isize, isize) -> i32, lparam: isize) -> i32;
        fn GetWindowThreadProcessId(hwnd: isize, pid: *mut u32) -> u32;
        fn OpenProcess(access: u32, inherit: i32, pid: u32) -> isize;
        fn CloseHandle(handle: isize) -> i32;
        fn QueryFullProcessImageNameW(process: isize, flags: u32, name: *mut u16, size: *mut u32) -> i32;
        fn IsWindowVisible(hwnd: isize) -> i32;
    }

    static mut FOUND_HWND: isize = 0;

    extern "system" fn enum_cb(hwnd: isize, _: isize) -> i32 {
        unsafe {
            if IsWindowVisible(hwnd) == 0 { return 1; }
            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, &mut pid);
            if pid == 0 { return 1; }
            let handle = OpenProcess(0x1000, 0, pid);
            if handle == 0 { return 1; }
            let mut buf = [0u16; 260];
            let mut size = buf.len() as u32;
            let ok = QueryFullProcessImageNameW(handle, 0, buf.as_mut_ptr(), &mut size);
            CloseHandle(handle);
            if ok == 0 { return 1; }
            let name = OsString::from_wide(&buf[..size as usize]);
            let lower = name.to_string_lossy().to_lowercase();
            if lower.contains("valorant") && !lower.contains("riot client") {
                FOUND_HWND = hwnd;
                return 0;
            }
            1
        }
    }

    unsafe {
        FOUND_HWND = 0;
        EnumWindows(enum_cb, 0);
        let hwnd = FOUND_HWND;
        if hwnd == 0 {
            return Err("Valorant window not found".into());
        }
        let hmon = MonitorFromWindow(hwnd, 2);
        if hmon == 0 { return Err("Monitor not found".into()); }
        let mut info = MonitorInfo {
            cb_size: std::mem::size_of::<MonitorInfo>() as u32,
            rc_monitor: Rect { left: 0, top: 0, right: 0, bottom: 0 },
            rc_work: Rect { left: 0, top: 0, right: 0, bottom: 0 },
            flags: 0,
        };
        if GetMonitorInfoW(hmon, &mut info) == 0 { return Err("GetMonitorInfo failed".into()); }
        let x = info.rc_monitor.left;
        let y = info.rc_monitor.top;
        let w = (info.rc_monitor.right - info.rc_monitor.left) as u32;
        let h = (info.rc_monitor.bottom - info.rc_monitor.top) as u32;
        Ok((x, y, w, h))
    }
}

#[cfg(not(target_os = "windows"))]
pub fn get_valorant_monitor() -> Result<(i32, i32, u32, u32), String> {
    Ok((0, 0, 1920, 1080))
}

#[cfg(target_os = "windows")]
pub fn list_monitors() -> Result<String, String> {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use std::sync::Mutex;

    #[repr(C)]
    struct Rect { left: i32, top: i32, right: i32, bottom: i32 }
    #[repr(C)]
    #[allow(non_snake_case)]
    struct MonitorInfoExW {
        cbSize: u32, rcMonitor: Rect, rcWork: Rect, dwFlags: u32,
        szDevice: [u16; 32],
    }
    #[repr(C)]
    #[allow(non_snake_case)]
    struct DevModeW {
        dmDeviceName: [u16; 32],
        dmSpecVersion: u16, dmDriverVersion: u16, dmSize: u16, dmDriverExtra: u16,
        dmFields: u32,
        _union1: [u8; 16],
        dmColor: i16, dmDuplex: i16, dmYResolution: i16, dmTTOption: i16,
        dmCollate: i16, dmFormName: [u16; 32], dmLogPixels: u16, dmBitsPerPel: u32,
        dmPelsWidth: u32, dmPelsHeight: u32,
        _union2: u32,
        dmDisplayFrequency: u32,
        _rest: [u8; 40],
    }

    const MONITORINFOF_PRIMARY: u32 = 1;
    const ENUM_CURRENT_SETTINGS: u32 = 0xFFFFFFFF;

    extern "system" {
        fn EnumDisplayMonitors(hdc: isize, clip: *const Rect, proc: extern "system" fn(isize, isize, *const Rect, isize) -> i32, data: isize) -> i32;
        fn GetMonitorInfoW(monitor: isize, info: *mut MonitorInfoExW) -> i32;
        fn EnumDisplaySettingsW(device: *const u16, mode: u32, devmode: *mut DevModeW) -> i32;
    }

    struct MonEntry { device: String, x: i32, y: i32, w: u32, h: u32, hz: u32, primary: bool }
    static MONITORS: Mutex<Option<Vec<MonEntry>>> = Mutex::new(None);

    extern "system" fn enum_cb(hmon: isize, _hdc: isize, _rect: *const Rect, _data: isize) -> i32 {
        unsafe {
            let mut info: MonitorInfoExW = std::mem::zeroed();
            info.cbSize = std::mem::size_of::<MonitorInfoExW>() as u32;
            if GetMonitorInfoW(hmon, &mut info) == 0 { return 1; }

            let name_len = info.szDevice.iter().position(|&c| c == 0).unwrap_or(32);
            let device = OsString::from_wide(&info.szDevice[..name_len]).to_string_lossy().to_string();
            let x = info.rcMonitor.left;
            let y = info.rcMonitor.top;
            let w = (info.rcMonitor.right - info.rcMonitor.left) as u32;
            let h = (info.rcMonitor.bottom - info.rcMonitor.top) as u32;
            let primary = (info.dwFlags & MONITORINFOF_PRIMARY) != 0;

            let mut dm: DevModeW = std::mem::zeroed();
            dm.dmSize = std::mem::size_of::<DevModeW>() as u16;
            let hz = if EnumDisplaySettingsW(info.szDevice.as_ptr(), ENUM_CURRENT_SETTINGS, &mut dm) != 0 {
                dm.dmDisplayFrequency
            } else { 0 };

            if let Ok(mut guard) = MONITORS.lock() {
                guard.as_mut().map(|v| v.push(MonEntry { device, x, y, w, h, hz, primary }));
            }
        }
        1
    }

    {
        let mut guard = MONITORS.lock().map_err(|e| e.to_string())?;
        *guard = Some(Vec::new());
    }
    unsafe { EnumDisplayMonitors(0, std::ptr::null(), enum_cb, 0); }
    let guard = MONITORS.lock().map_err(|e| e.to_string())?;
    let list = guard.as_ref().ok_or("No monitors found")?;
    let arr: Vec<_> = list.iter().enumerate().map(|(i, m)| {
        serde_json::json!({
            "index": i, "device": m.device,
            "x": m.x, "y": m.y, "width": m.w, "height": m.h,
            "hz": m.hz, "primary": m.primary
        })
    }).collect();
    Ok(serde_json::json!(arr).to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn list_monitors() -> Result<String, String> {
    Ok(serde_json::json!([{"index":0,"device":"Monitor 1","x":0,"y":0,"width":1920,"height":1080,"hz":60,"primary":true}]).to_string())
}

pub fn find_valorant_path() -> Result<String, String> {
    let programdata = std::env::var("ALLUSERSPROFILE").unwrap_or_else(|_| "C:\\ProgramData".to_string());
    let settings_path = format!("{}\\Riot Games\\Metadata\\valorant.live\\valorant.live.product_settings.yaml", programdata);
    let contents = std::fs::read_to_string(&settings_path)
        .map_err(|_| "Could not read Valorant product settings. Is Valorant installed?".to_string())?;
    for line in contents.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("product_install_full_path:") {
            let val = trimmed.trim_start_matches("product_install_full_path:").trim().trim_matches('"');
            if !val.is_empty() {
                return Ok(val.to_string());
            }
        }
    }
    Err("Could not find Valorant install path in product settings".to_string())
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
