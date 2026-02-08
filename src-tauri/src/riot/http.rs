use std::process::Command;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

pub fn local_get(port: u16, auth: &str, path: &str) -> Result<String, String> {
    let script = format!(
        r#"const https=require('https');const r=https.request('https://127.0.0.1:{}{}',{{headers:{{Authorization:'{}'}},agent:new https.Agent({{rejectUnauthorized:false}})}},res=>{{let d='';res.on('data',c=>d+=c);res.on('end',()=>process.stdout.write(d))}});r.on('error',e=>{{process.stderr.write(e.message);process.exit(1)}});r.setTimeout(5000,()=>{{r.destroy();process.stderr.write('timeout');process.exit(1)}});r.end()"#,
        port, path, auth
    );

    let mut cmd = Command::new("node");
    cmd.args(["-e", &script]);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    let output = cmd.output().map_err(|e| format!("node failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("{}: {}", path, stderr.trim()));
    }

    let body = String::from_utf8_lossy(&output.stdout).to_string();
    if body.is_empty() {
        return Err(format!("Empty response from {}", path));
    }
    Ok(body)
}

pub fn local_put(port: u16, auth: &str, path: &str, body: &str) -> Result<String, String> {
    let escaped_body = body.replace('\\', "\\\\").replace('\'', "\\'").replace('\n', "\\n");
    let script = format!(
        r#"const https=require('https');const d='{body}';const r=https.request('https://127.0.0.1:{port}{path}',{{method:'PUT',headers:{{Authorization:'{auth}','Content-Type':'application/json','Content-Length':Buffer.byteLength(d)}},agent:new https.Agent({{rejectUnauthorized:false}})}},res=>{{let b='';res.on('data',c=>b+=c);res.on('end',()=>process.stdout.write(res.statusCode+'\n'+b))}});r.on('error',e=>{{process.stderr.write(e.message);process.exit(1)}});r.setTimeout(5000,()=>{{r.destroy();process.stderr.write('timeout');process.exit(1)}});r.write(d);r.end()"#,
        port = port, path = path, auth = auth, body = escaped_body
    );

    let mut cmd = Command::new("node");
    cmd.args(["-e", &script]);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    let output = cmd.output().map_err(|e| format!("node failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("PUT {}: {}", path, stderr.trim()));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

pub fn https_get(url: &str) -> Result<String, String> {
    let script = format!(
        r#"const https=require('https');https.get('{}',res=>{{let d='';res.on('data',c=>d+=c);res.on('end',()=>process.stdout.write(d))}}).on('error',e=>{{process.stderr.write(e.message);process.exit(1)}})"#,
        url
    );

    let mut cmd = Command::new("node");
    cmd.args(["-e", &script]);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    let output = cmd.output().map_err(|e| format!("node failed: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

pub fn authed_get(url: &str, access_token: &str) -> Result<String, String> {
    let script = format!(
        r#"const https=require('https');const u=new URL('{}');const r=https.request({{hostname:u.hostname,path:u.pathname,headers:{{'Authorization':'Bearer {}'}}}},res=>{{let d='';res.on('data',c=>d+=c);res.on('end',()=>process.stdout.write(d))}});r.on('error',e=>{{process.stderr.write(e.message);process.exit(1)}});r.setTimeout(5000,()=>{{r.destroy();process.stderr.write('timeout');process.exit(1)}});r.end()"#,
        url, access_token
    );

    let mut cmd = Command::new("node");
    cmd.args(["-e", &script]);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    let output = cmd.output().map_err(|e| format!("node failed: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

pub fn authed_get_with_entitlements(url: &str, access_token: &str, entitlements: &str) -> Result<String, String> {
    let script = format!(
        r#"const https=require('https');const u=new URL('{}');const r=https.request({{hostname:u.hostname,path:u.pathname+u.search,headers:{{'Authorization':'Bearer {}','X-Riot-Entitlements-JWT':'{}','User-Agent':''}}}},res=>{{let d='';res.on('data',c=>d+=c);res.on('end',()=>process.stdout.write(d))}});r.on('error',e=>{{process.stderr.write(e.message);process.exit(1)}});r.setTimeout(10000,()=>{{r.destroy();process.stderr.write('timeout');process.exit(1)}});r.end()"#,
        url, access_token, entitlements
    );

    let mut cmd = Command::new("node");
    cmd.args(["-e", &script]);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    let output = cmd.output().map_err(|e| format!("node failed: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

pub fn henrik_api_get(path: &str, api_key: &str) -> Result<String, String> {
    let url = format!("https://api.henrikdev.xyz{}", path);
    let script = format!(
        r#"const https=require('https');const u=new URL('{}');const r=https.request({{hostname:u.hostname,path:u.pathname,headers:{{'Authorization':'{}'}}}},res=>{{let d='';res.on('data',c=>d+=c);res.on('end',()=>process.stdout.write(d))}});r.on('error',e=>{{process.stderr.write(e.message);process.exit(1)}});r.setTimeout(10000,()=>{{r.destroy();process.stderr.write('timeout');process.exit(1)}});r.end()"#,
        url, api_key
    );

    let mut cmd = Command::new("node");
    cmd.args(["-e", &script]);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    let output = cmd.output().map_err(|e| format!("node failed: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

const PLATFORM: &str = "ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9";

pub fn pd_get(shard: &str, path: &str, access_token: &str, entitlements: &str, client_version: &str) -> Result<String, String> {
    let url = format!("https://pd.{}.a.pvp.net{}", shard, path);
    let script = format!(
        r#"const https=require('https');const zlib=require('zlib');const u=new URL('{}');const r=https.request({{hostname:u.hostname,path:u.pathname,headers:{{'Authorization':'Bearer {}','X-Riot-Entitlements-JWT':'{}','X-Riot-ClientPlatform':'{}','X-Riot-ClientVersion':'{}'}}}},res=>{{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{{let buf=Buffer.concat(chunks);const enc=res.headers['content-encoding'];process.stderr.write('HTTP '+res.statusCode+' enc='+(enc||'none')+' raw='+buf.length+' ');if(enc==='gzip'){{try{{buf=zlib.gunzipSync(buf)}}catch(e){{process.stderr.write('gunzip err:'+e.message+' ')}}}}else if(enc==='deflate'){{try{{buf=zlib.inflateSync(buf)}}catch(e){{}}}}const out=buf.toString();process.stderr.write('len='+out.length);process.stdout.write(out)}})}});r.on('error',e=>{{process.stderr.write('err:'+e.message);process.exit(1)}});r.setTimeout(15000,()=>{{r.destroy();process.stderr.write('timeout');process.exit(1)}});r.end()"#,
        url, access_token, entitlements, PLATFORM, client_version
    );

    let mut cmd = Command::new("node");
    cmd.args(["-e", &script]);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    let output = cmd.output().map_err(|e| format!("node failed: {}", e))?;

    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if !stderr.is_empty() {
        eprintln!("[pd_get] {} -> {}", path, stderr.trim());
    }

    if !output.status.success() {
        return Err(format!("{}: {}", path, stderr.trim()));
    }

    let body = String::from_utf8_lossy(&output.stdout).to_string();
    if body.is_empty() {
        return Err(format!("Empty response from {} (debug: {})", path, stderr.trim()));
    }
    Ok(body)
}

pub fn pd_put(shard: &str, path: &str, body: &str, access_token: &str, entitlements: &str, client_version: &str) -> Result<String, String> {
    let url = format!("https://pd.{}.a.pvp.net{}", shard, path);
    let escaped_body = body.replace('\\', "\\\\").replace('\'', "\\'");
    let script = format!(
        r#"const https=require('https');const u=new URL('{}');const b='{}';const r=https.request({{hostname:u.hostname,path:u.pathname,method:'PUT',headers:{{'Authorization':'Bearer {}','X-Riot-Entitlements-JWT':'{}','X-Riot-ClientPlatform':'{}','X-Riot-ClientVersion':'{}','Content-Type':'application/json','Content-Length':Buffer.byteLength(b)}}}},res=>{{let d='';res.on('data',c=>d+=c);res.on('end',()=>process.stdout.write(d))}});r.on('error',e=>{{process.stderr.write(e.message);process.exit(1)}});r.setTimeout(5000,()=>{{r.destroy();process.stderr.write('timeout');process.exit(1)}});r.end(b)"#,
        url, escaped_body, access_token, entitlements, PLATFORM, client_version
    );

    let mut cmd = Command::new("node");
    cmd.args(["-e", &script]);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    let output = cmd.output().map_err(|e| format!("node failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("{}: {}", path, stderr.trim()));
    }

    let body_out = String::from_utf8_lossy(&output.stdout).to_string();
    if body_out.is_empty() {
        return Err(format!("Empty response from {}", path));
    }
    Ok(body_out)
}

pub fn glz_get(region: &str, shard: &str, path: &str, access_token: &str, entitlements: &str, client_version: &str) -> Result<String, String> {
    let url = format!("https://glz-{}-1.{}.a.pvp.net{}", region, shard, path);
    let script = format!(
        r#"const https=require('https');const u=new URL('{}');const r=https.request({{hostname:u.hostname,path:u.pathname,headers:{{'Authorization':'Bearer {}','X-Riot-Entitlements-JWT':'{}','X-Riot-ClientPlatform':'{}','X-Riot-ClientVersion':'{}'}}}},res=>{{let d='';res.on('data',c=>d+=c);res.on('end',()=>process.stdout.write(d))}});r.on('error',e=>{{process.stderr.write(e.message);process.exit(1)}});r.setTimeout(5000,()=>{{r.destroy();process.stderr.write('timeout');process.exit(1)}});r.end()"#,
        url, access_token, entitlements, PLATFORM, client_version
    );

    let mut cmd = Command::new("node");
    cmd.args(["-e", &script]);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    let output = cmd.output().map_err(|e| format!("node failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("{}: {}", path, stderr.trim()));
    }

    let body = String::from_utf8_lossy(&output.stdout).to_string();
    if body.is_empty() {
        return Err(format!("Empty response from {}", path));
    }
    Ok(body)
}

pub fn glz_delete(region: &str, shard: &str, path: &str, access_token: &str, entitlements: &str, client_version: &str) -> Result<String, String> {
    let url = format!("https://glz-{}-1.{}.a.pvp.net{}", region, shard, path);
    let script = format!(
        r#"const https=require('https');const u=new URL('{}');const r=https.request({{hostname:u.hostname,path:u.pathname,method:'DELETE',headers:{{'Authorization':'Bearer {}','X-Riot-Entitlements-JWT':'{}','X-Riot-ClientPlatform':'{}','X-Riot-ClientVersion':'{}'}}}},res=>{{let d='';res.on('data',c=>d+=c);res.on('end',()=>process.stdout.write(d))}});r.on('error',e=>{{process.stderr.write(e.message);process.exit(1)}});r.setTimeout(5000,()=>{{r.destroy();process.stderr.write('timeout');process.exit(1)}});r.end()"#,
        url, access_token, entitlements, PLATFORM, client_version
    );

    let mut cmd = Command::new("node");
    cmd.args(["-e", &script]);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    let output = cmd.output().map_err(|e| format!("node failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("{}: {}", path, stderr.trim()));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

pub fn glz_post_body(region: &str, shard: &str, path: &str, body: &str, access_token: &str, entitlements: &str, client_version: &str) -> Result<String, String> {
    let url = format!("https://glz-{}-1.{}.a.pvp.net{}", region, shard, path);
    let escaped_body = body.replace('\\', "\\\\").replace('\'', "\\'");
    let script = format!(
        r#"const https=require('https');const u=new URL('{}');const b='{}';const r=https.request({{hostname:u.hostname,path:u.pathname,method:'POST',headers:{{'Authorization':'Bearer {}','X-Riot-Entitlements-JWT':'{}','X-Riot-ClientPlatform':'{}','X-Riot-ClientVersion':'{}','Content-Type':'application/json','Content-Length':Buffer.byteLength(b)}}}},res=>{{let d='';res.on('data',c=>d+=c);res.on('end',()=>{{process.stderr.write('HTTP '+res.statusCode+' ');process.stdout.write(d)}})}});r.on('error',e=>{{process.stderr.write(e.message);process.exit(1)}});r.setTimeout(5000,()=>{{r.destroy();process.stderr.write('timeout');process.exit(1)}});r.end(b)"#,
        url, escaped_body, access_token, entitlements, PLATFORM, client_version
    );

    let mut cmd = Command::new("node");
    cmd.args(["-e", &script]);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    let output = cmd.output().map_err(|e| format!("node failed: {}", e))?;

    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let body_out = String::from_utf8_lossy(&output.stdout).to_string();
    eprintln!("[glz_post_body] {} -> {} body={}", path, stderr.trim(), &body_out[..body_out.len().min(200)]);

    if !output.status.success() {
        return Err(format!("{}: {}", path, stderr.trim()));
    }

    Ok(body_out)
}

pub fn pd_batch_get(shard: &str, paths: &[String], access_token: &str, entitlements: &str, client_version: &str) -> Result<Vec<serde_json::Value>, String> {
    if paths.is_empty() {
        return Ok(vec![]);
    }
    let base_url = format!("https://pd.{}.a.pvp.net", shard);
    let paths_json = serde_json::to_string(paths).map_err(|e| format!("json: {}", e))?;

    let script = format!(
        r#"const https=require('https');const zlib=require('zlib');const b='{}';const ps={};const h={{'Authorization':'Bearer {}','X-Riot-Entitlements-JWT':'{}','X-Riot-ClientPlatform':'{}','X-Riot-ClientVersion':'{}'}};function f(p){{return new Promise((ok,no)=>{{const u=new URL(b+p);const r=https.request({{hostname:u.hostname,path:u.pathname+u.search,headers:h}},res=>{{const c=[];res.on('data',d=>c.push(d));res.on('end',()=>{{let buf=Buffer.concat(c);const e=res.headers['content-encoding'];if(e==='gzip')try{{buf=zlib.gunzipSync(buf)}}catch(_){{}}else if(e==='deflate')try{{buf=zlib.inflateSync(buf)}}catch(_){{}};try{{ok(JSON.parse(buf.toString()))}}catch(_){{ok(null)}}}});}});r.on('error',()=>ok(null));r.setTimeout(15000,()=>{{r.destroy();ok(null)}});r.end()}})}};Promise.all(ps.map(p=>f(p))).then(r=>process.stdout.write(JSON.stringify(r)))"#,
        base_url, paths_json, access_token, entitlements, PLATFORM, client_version
    );

    let mut cmd = Command::new("node");
    cmd.args(["-e", &script]);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    let output = cmd.output().map_err(|e| format!("batch node failed: {}", e))?;

    if !output.status.success() {
        return Err(format!("batch fetch failed: {}", String::from_utf8_lossy(&output.stderr).trim()));
    }

    let body = String::from_utf8_lossy(&output.stdout).to_string();
    serde_json::from_str(&body).map_err(|e| format!("parse batch: {}", e))
}

pub fn glz_post(region: &str, shard: &str, path: &str, access_token: &str, entitlements: &str, client_version: &str) -> Result<String, String> {
    let url = format!("https://glz-{}-1.{}.a.pvp.net{}", region, shard, path);
    let script = format!(
        r#"const https=require('https');const u=new URL('{}');const r=https.request({{hostname:u.hostname,path:u.pathname+u.search,method:'POST',headers:{{'Authorization':'Bearer {}','X-Riot-Entitlements-JWT':'{}','X-Riot-ClientPlatform':'{}','X-Riot-ClientVersion':'{}','Content-Length':'0'}}}},res=>{{let d='';res.on('data',c=>d+=c);res.on('end',()=>{{process.stderr.write('HTTP '+res.statusCode+' ');process.stdout.write(d)}})}});r.on('error',e=>{{process.stderr.write(e.message);process.exit(1)}});r.setTimeout(5000,()=>{{r.destroy();process.stderr.write('timeout');process.exit(1)}});r.end()"#,
        url, access_token, entitlements, PLATFORM, client_version
    );

    let mut cmd = Command::new("node");
    cmd.args(["-e", &script]);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    let output = cmd.output().map_err(|e| format!("node failed: {}", e))?;

    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let body = String::from_utf8_lossy(&output.stdout).to_string();
    eprintln!("[glz_post] {} -> {} body={}", path, stderr.trim(), &body[..body.len().min(200)]);

    if !output.status.success() {
        return Err(format!("{}: {}", path, stderr.trim()));
    }

    if let Some(code) = stderr.trim().strip_prefix("HTTP ").and_then(|s| s.split_whitespace().next()).and_then(|s| s.parse::<u16>().ok()) {
        if code >= 400 {
            return Err(format!("{}: HTTP {} {}", path, code, body.trim()));
        }
    }

    Ok(body)
}
