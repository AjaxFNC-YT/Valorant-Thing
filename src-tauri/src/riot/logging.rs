use std::sync::OnceLock;
use tauri::{AppHandle, Emitter};
use serde::Serialize;

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

#[derive(Clone, Serialize)]
struct LogPayload {
    log_type: String,
    message: String,
}

pub fn init(handle: AppHandle) {
    let _ = APP_HANDLE.set(handle);
}

pub fn emit_log(log_type: &str, message: &str) {
    if let Some(handle) = APP_HANDLE.get() {
        let _ = handle.emit("backend-log", LogPayload {
            log_type: log_type.to_string(),
            message: message.to_string(),
        });
    }
}

pub fn log_info(msg: &str) {
    emit_log("info", msg);
}

pub fn log_error(msg: &str) {
    emit_log("error", msg);
}
