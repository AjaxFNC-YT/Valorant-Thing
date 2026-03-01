use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::Emitter;

static RUNNING: AtomicBool = AtomicBool::new(false);

const MIN_RED: u8 = 120;
const MAX_GREEN: u8 = 30;
const MAX_BLUE: u8 = 30;
const RED_DOMINANCE: u8 = 90;
const REQUIRED_HITS: u32 = 2;
const COOLDOWN_SECS: u64 = 50;
const POLL_MS: u64 = 16;
const FG_CHECK_MS: u64 = 250;
const MONITOR_CACHE_MS: u64 = 10_000;

#[cfg(target_os = "windows")]
extern "system" {
    fn GetDC(hwnd: isize) -> isize;
    fn ReleaseDC(hwnd: isize, hdc: isize) -> i32;
    fn GetPixel(hdc: isize, x: i32, y: i32) -> u32;
}

#[cfg(target_os = "windows")]
fn is_red_at(hdc: isize, x: i32, y: i32) -> bool {
    let color = unsafe { GetPixel(hdc, x, y) };
    if color == 0xFFFFFFFF { return false; }
    let r = (color & 0xFF) as u8;
    let g = ((color >> 8) & 0xFF) as u8;
    let b = ((color >> 16) & 0xFF) as u8;
    r >= MIN_RED && g <= MAX_GREEN && b <= MAX_BLUE && r.saturating_sub(g) >= RED_DOMINANCE
}

#[cfg(target_os = "windows")]
fn scan_spike_region(mx: i32, my: i32, mw: u32, mh: u32) -> bool {
    unsafe {
        let hdc = GetDC(0);
        if hdc == 0 { return false; }
        let mut hits = 0u32;
        let x_offsets: [f64; 3] = [0.49, 0.50, 0.51];
        let y_offsets: [f64; 5] = [0.03, 0.06, 0.09, 0.12, 0.16];
        for &ry in &y_offsets {
            for &rx in &x_offsets {
                let px = mx + (rx * mw as f64) as i32;
                let py = my + (ry * mh as f64) as i32;
                if is_red_at(hdc, px, py) {
                    hits += 1;
                    if hits >= REQUIRED_HITS {
                        ReleaseDC(0, hdc);
                        return true;
                    }
                }
            }
        }
        ReleaseDC(0, hdc);
        false
    }
}

#[cfg(not(target_os = "windows"))]
fn scan_spike_region(_mx: i32, _my: i32, _mw: u32, _mh: u32) -> bool {
    false
}

#[tauri::command]
pub fn start_bomb_tracker(app: tauri::AppHandle) -> Result<(), String> {
    if RUNNING.swap(true, Ordering::SeqCst) {
        return Ok(());
    }

    std::thread::spawn(move || {
        let mut cooldown_until: Option<Instant> = None;
        let mut cached_monitor: Option<(i32, i32, u32, u32)> = None;
        let mut monitor_fetched_at = Instant::now() - Duration::from_secs(999);
        let mut fg_result = false;
        let mut fg_checked_at = Instant::now() - Duration::from_secs(999);

        while RUNNING.load(Ordering::Relaxed) {
            if let Some(until) = cooldown_until {
                if Instant::now() < until {
                    std::thread::sleep(Duration::from_millis(500));
                    continue;
                }
                cooldown_until = None;
            }

            let now = Instant::now();
            if now.duration_since(fg_checked_at).as_millis() as u64 >= FG_CHECK_MS {
                fg_result = crate::riot::is_valorant_foreground();
                fg_checked_at = now;
            }
            if !fg_result {
                std::thread::sleep(Duration::from_millis(FG_CHECK_MS));
                continue;
            }

            if now.duration_since(monitor_fetched_at).as_millis() as u64 >= MONITOR_CACHE_MS || cached_monitor.is_none() {
                cached_monitor = crate::riot::get_valorant_monitor().ok();
                monitor_fetched_at = now;
            }
            let (mx, my, mw, mh) = match cached_monitor {
                Some(v) => v,
                None => {
                    std::thread::sleep(Duration::from_secs(2));
                    continue;
                }
            };

            if scan_spike_region(mx, my, mw, mh) {
                let epoch_ms = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64;

                let _ = app.emit("bomb-planted", serde_json::json!({
                    "epochMs": epoch_ms,
                    "monitor": { "x": mx, "y": my, "w": mw, "h": mh },
                }));

                cooldown_until = Some(Instant::now() + Duration::from_secs(COOLDOWN_SECS));
            }

            std::thread::sleep(Duration::from_millis(POLL_MS));
        }
    });

    Ok(())
}

#[tauri::command]
pub fn stop_bomb_tracker() {
    RUNNING.store(false, Ordering::SeqCst);
}

#[tauri::command]
pub fn is_bomb_tracker_running() -> bool {
    RUNNING.load(Ordering::Relaxed)
}
