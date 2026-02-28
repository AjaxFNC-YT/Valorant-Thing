use serde_json::Value;

const API_URL: &str = "https://vt-cloud.ajaxfnc.com";

#[tauri::command]
pub async fn cloud_save(save_type: String, data: Value) -> Result<String, String> {
    let body = serde_json::json!({ "type": save_type, "data": data });
    let client = reqwest::Client::new();
    let res = client
        .post(format!("{}/save", API_URL))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let status = res.status();
    let json: Value = res.json().await.map_err(|e| format!("Parse failed: {}", e))?;

    if !status.is_success() {
        return Err(json["error"].as_str().unwrap_or("Save failed").to_string());
    }

    json["code"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "No code in response".to_string())
}

#[tauri::command]
pub async fn cloud_load(code: String) -> Result<Value, String> {
    let url = format!("{}/load/{}", API_URL, code.trim().to_uppercase());
    let client = reqwest::Client::new();
    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let status = res.status();
    let json: Value = res.json().await.map_err(|e| format!("Parse failed: {}", e))?;

    if !status.is_success() {
        return Err(json["error"].as_str().unwrap_or("Load failed").to_string());
    }

    Ok(json)
}
