import { useState, useEffect } from "react";
import Tooltip from "./Tooltip";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import { open } from "@tauri-apps/plugin-dialog";
import { appDataDir } from "@tauri-apps/api/path";

const MENU_VIDEO_SUBPATH = "ShooterGame\\Content\\Movies\\Menu";
const MENU_VIDEO_FILE_REGEX = /\.(mp4|webm)$/i;
const MENU_VIDEO_EXCLUDED_FILES = new Set([
  "battle pass glitches.webm",
  "contract glitches.webm",
]);
const MENU_VIDEO_CONFIG_KEY = "menu_video_config";
const noAnim = () => localStorage.getItem("disable_animations") === "true";
const T0 = { duration: 0 };

const trimSlashes = (value) => String(value || "").replace(/[\\/]+$/g, "");
const normalizeFileName = (value) => String(value || "").trim().toLowerCase();
const sanitizeBackupName = (value) => String(value || "video").replace(/[^a-z0-9._-]+/gi, "_");
const joinWinPath = (...parts) =>
  parts
    .filter(Boolean)
    .map((part, index) =>
      index === 0
        ? String(part).replace(/[\\/]+$/g, "")
        : String(part).replace(/^[\\/]+|[\\/]+$/g, "")
    )
    .join("\\");

function getMenuDir(valorantPath) {
  return joinWinPath(valorantPath, MENU_VIDEO_SUBPATH);
}

function getVideoConfig() {
  try {
    return normalizeVideoConfig(JSON.parse(localStorage.getItem(MENU_VIDEO_CONFIG_KEY)));
  } catch {
    return null;
  }
}

function setVideoConfigStorage(config) {
  localStorage.setItem(MENU_VIDEO_CONFIG_KEY, JSON.stringify(config));
}

function clearVideoConfigStorage() {
  localStorage.removeItem(MENU_VIDEO_CONFIG_KEY);
}

function normalizeVideoConfig(config) {
  if (!config || typeof config !== "object") return null;

  if (Array.isArray(config.replacedFiles)) {
    return {
      menuDir: config.menuDir || "",
      sourceBackupPath: config.sourceBackupPath || config.backupPath || "",
      replacedFiles: config.replacedFiles
        .filter((file) => file?.name && file?.destPath && file?.originalPath)
        .map((file) => ({
          name: file.name,
          destPath: file.destPath,
          originalPath: file.originalPath,
          hash: file.hash || "",
        })),
    };
  }

  if (config.destPath && config.originalPath) {
    const name = String(config.destPath).split(/[\\/]/).pop() || "menu_video.mp4";
    return {
      menuDir: String(config.destPath).replace(/[\\/][^\\/]+$/, ""),
      sourceBackupPath: config.backupPath || "",
      replacedFiles: [
        {
          name,
          destPath: config.destPath,
          originalPath: config.originalPath,
          hash: config.hash || "",
        },
      ],
    };
  }

  return null;
}

function getReplaceableMenuFiles(entries) {
  return (entries || []).filter(
    (name) =>
      MENU_VIDEO_FILE_REGEX.test(name) &&
      !MENU_VIDEO_EXCLUDED_FILES.has(normalizeFileName(name))
  );
}

function getBackupPaths(baseDir, name, sourceExt = ".mp4") {
  const safeName = sanitizeBackupName(name);
  return {
    originalPath: joinWinPath(baseDir, `original_${safeName}`),
    sourceBackupPath: joinWinPath(baseDir, `custom_menu_video${sourceExt}`),
  };
}

async function fileExists(path) {
  if (!path) return false;
  return invoke("compute_file_hash", { path }).then(() => true).catch(() => false);
}

export default function MiscPage({ connected, autoUnqueue, onAutoUnqueueChange, autoRequeue, onAutoRequeueChange }) {
  const [isLeader, setIsLeader] = useState(false);
  const [loading, setLoading] = useState(true);
  const [videoStatus, setVideoStatus] = useState("");
  const [isChangingVideo, setIsChangingVideo] = useState(false);
  const [valorantPath, setValorantPath] = useState(null);
  const [videoConfig, setVideoConfig] = useState(getVideoConfig);
  const [videoSrc, setVideoSrc] = useState(null);

  useEffect(() => {
    invoke("find_valorant_path").then(setValorantPath).catch(() => {});
  }, []);

  useEffect(() => {
    if (videoConfig?.sourceBackupPath) {
      setVideoSrc(convertFileSrc(videoConfig.sourceBackupPath) + `?t=${Date.now()}`);
    } else {
      setVideoSrc(null);
    }
  }, [videoConfig]);

  useEffect(() => {
    if (!videoConfig || !valorantPath) return;

    const sync = async () => {
      try {
        const menuDir = getMenuDir(valorantPath);
        const dirEntries = await invoke("list_dir", { path: menuDir }).catch(() => []);
        const liveFiles = new Set(getReplaceableMenuFiles(dirEntries).map(normalizeFileName));
        const sourceBackupPath = videoConfig.sourceBackupPath || "";

        if (!(await fileExists(sourceBackupPath))) {
          clearVideoConfigStorage();
          setVideoConfig(null);
          setVideoStatus("Custom menu video backup missing, so the config was cleared.");
          return;
        }

        const nextFiles = videoConfig.replacedFiles
          .filter((file) => liveFiles.size === 0 || liveFiles.has(normalizeFileName(file.name)))
          .map((file) => ({
            ...file,
            destPath: joinWinPath(menuDir, file.name),
          }));

        if (nextFiles.length === 0) {
          clearVideoConfigStorage();
          setVideoConfig(null);
          setVideoStatus("No replaceable menu videos were found.");
          return;
        }

        let restoredAny = false;
        for (const file of nextFiles) {
          const currentHash = await invoke("compute_file_hash", { path: file.destPath }).catch(() => "");
          if (!currentHash || currentHash === file.hash) continue;

          await invoke("force_copy_file", { source: sourceBackupPath, dest: file.destPath });
          file.hash = await invoke("compute_file_hash", { path: file.destPath }).catch(() => "");
          restoredAny = true;
        }

        const nextConfig = {
          menuDir,
          sourceBackupPath,
          replacedFiles: nextFiles,
        };

        setVideoConfigStorage(nextConfig);
        setVideoConfig(nextConfig);
        if (restoredAny) {
          setVideoStatus(`Restored custom menu video across ${nextFiles.length} file${nextFiles.length === 1 ? "" : "s"}.`);
        }
      } catch {}
    };

    sync();
  }, [videoConfig?.sourceBackupPath, valorantPath]);

  useEffect(() => {
    if (!connected) {
      setIsLeader(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const check = async () => {
      try {
        const raw = await invoke("get_party");
        if (cancelled) return;
        const data = JSON.parse(raw);
        const leader = data.members?.some((m) => m.puuid === data.my_puuid && m.is_owner);
        setIsLeader(!!leader);
      } catch {
        if (!cancelled) setIsLeader(false);
      }
      if (!cancelled) setLoading(false);
    };

    check();
    const interval = setInterval(check, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [connected]);

  const handleChangeMenuVideo = async () => {
    try {
      setIsChangingVideo(true);
      setVideoStatus("");

      const selected = await open({
        multiple: false,
        filters: [{ name: "Video Files", extensions: ["mp4", "webm"] }],
        title: "Select Menu Video",
      });

      if (!selected) return;

      if (!valorantPath) {
        setVideoStatus("Error: Could not detect Valorant install path.");
        return;
      }

      const menuDir = getMenuDir(valorantPath);
      const dirEntries = await invoke("list_dir", { path: menuDir });
      const replaceableFiles = getReplaceableMenuFiles(dirEntries);

      if (replaceableFiles.length === 0) {
        setVideoStatus("Error: No replaceable menu videos were found.");
        return;
      }

      const backupRoot = joinWinPath(trimSlashes(await appDataDir()), "menu-video");
      const sourceExtMatch = String(selected).match(/\.[a-z0-9]+$/i);
      const sourceExt = sourceExtMatch ? sourceExtMatch[0] : ".mp4";
      const sourceBackupPath = getBackupPaths(backupRoot, "custom", sourceExt).sourceBackupPath;

      const existingFiles = new Map(
        (videoConfig?.replacedFiles || []).map((file) => [normalizeFileName(file.name), file])
      );

      const replacedFiles = [];
      for (const name of replaceableFiles) {
        const destPath = joinWinPath(menuDir, name);
        const existing = existingFiles.get(normalizeFileName(name));
        const originalPath = existing?.originalPath || getBackupPaths(backupRoot, name).originalPath;

        if (!(await fileExists(originalPath))) {
          await invoke("force_copy_file", { source: destPath, dest: originalPath });
        }

        await invoke("force_copy_file", { source: selected, dest: destPath });
        const hash = await invoke("compute_file_hash", { path: destPath });

        replacedFiles.push({
          name,
          destPath,
          originalPath,
          hash,
        });
      }

      await invoke("force_copy_file", { source: selected, dest: sourceBackupPath });

      const nextConfig = {
        menuDir,
        sourceBackupPath,
        replacedFiles,
      };

      setVideoConfigStorage(nextConfig);
      setVideoConfig(nextConfig);
      setVideoStatus(`Replaced ${replacedFiles.length} menu video file${replacedFiles.length === 1 ? "" : "s"}.`);
    } catch (err) {
      setVideoStatus(`Error: ${err.message || err}`);
    } finally {
      setIsChangingVideo(false);
    }
  };

  const handleResetMenuVideo = async () => {
    try {
      const files = videoConfig?.replacedFiles || [];

      for (const file of files) {
        if (await fileExists(file.originalPath)) {
          await invoke("force_copy_file", { source: file.originalPath, dest: file.destPath });
        }
      }

      for (const file of files) {
        await invoke("remove_file", { path: file.originalPath }).catch(() => {});
      }

      if (videoConfig?.sourceBackupPath) {
        await invoke("remove_file", { path: videoConfig.sourceBackupPath }).catch(() => {});
      }

      clearVideoConfigStorage();
      setVideoConfig(null);
      setVideoStatus("Original menu videos restored.");
    } catch (err) {
      setVideoStatus(`Error: ${err.message || err}`);
    }
  };

  const disabled = !connected || !isLeader;

  return (
    <div className="flex-1 flex flex-col min-h-0 p-5 gap-4 overflow-y-auto">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="flex items-center gap-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
        <h2 className="text-sm font-display font-semibold text-text-primary">Misc</h2>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={noAnim() ? T0 : { duration: 0.2, delay: 0.05 }} className="p-4 rounded-xl bg-base-700 border border-border space-y-4">
        <h3 className="text-xs font-display font-medium text-text-secondary uppercase tracking-wider">Queue Automation</h3>

        {disabled && connected && !loading && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-status-yellow/10 border border-status-yellow/20">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-status-yellow shrink-0">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
            </svg>
            <span className="text-[11px] font-body text-status-yellow">You must be party leader to use queue automation</span>
          </div>
        )}

        <div className={`flex items-center justify-between ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
          <div>
            <p className="text-sm font-display font-medium text-text-primary">Auto Unqueue on Dodge</p>
            <p className="text-xs font-body text-text-muted mt-0.5">Leave queue when someone dodges your match</p>
          </div>
          <Toggle enabled={autoUnqueue} onChange={onAutoUnqueueChange} />
        </div>

        <div className={`flex items-center justify-between ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
          <div>
            <p className="text-sm font-display font-medium text-text-primary">Auto Requeue</p>
            <p className="text-xs font-body text-text-muted mt-0.5">Automatically requeue when a match ends</p>
          </div>
          <Toggle enabled={autoRequeue} onChange={onAutoRequeueChange} />
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={noAnim() ? T0 : { duration: 0.2, delay: 0.08 }} className="p-4 rounded-xl bg-base-700 border border-border space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <h3 className="text-xs font-display font-medium text-text-secondary uppercase tracking-wider">Menu Video</h3>
            <Tooltip text="This feature can be finicky, and some videos may not display correctly in game.">
              <div className="w-3.5 h-3.5 rounded-full bg-base-500 flex items-center justify-center cursor-help">
                <span className="text-[9px] font-display font-bold text-text-muted">?</span>
              </div>
            </Tooltip>
          </div>
          <div className="flex items-center gap-2">
            {videoConfig && (
              <button
                onClick={handleResetMenuVideo}
                className="px-3 py-1.5 rounded-lg text-xs font-display font-medium bg-base-500 hover:bg-base-400 text-text-secondary transition-all duration-200"
              >
                Restore Original
              </button>
            )}
            <button
              onClick={handleChangeMenuVideo}
              disabled={isChangingVideo}
              className={`px-3 py-1.5 rounded-lg text-xs font-display font-medium transition-all duration-200 ${isChangingVideo ? "bg-base-500 text-text-muted cursor-not-allowed" : "bg-val-red hover:bg-val-red/80 text-white"}`}
            >
              {isChangingVideo ? "Replacing..." : videoConfig ? "Change Video" : "Select Video"}
            </button>
          </div>
        </div>

        {videoSrc ? (
          <div className="rounded-lg overflow-hidden border border-border bg-black">
            <video
              key={videoSrc}
              src={videoSrc}
              autoPlay
              loop
              muted
              playsInline
              className="w-full max-h-48 object-cover"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 rounded-lg border border-dashed border-border bg-base-800/50 gap-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted/30">
              <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
              <path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5" />
            </svg>
            <p className="text-xs font-body text-text-muted">No custom video set</p>
          </div>
        )}

        {videoStatus && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${videoStatus.startsWith("Error") ? "bg-status-red/10 border border-status-red/20" : "bg-status-green/10 border border-status-green/20"}`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`shrink-0 ${videoStatus.startsWith("Error") ? "text-status-red" : "text-status-green"}`}>
              {videoStatus.startsWith("Error") ? (
                <path d="M18 6L6 18M6 6l12 12" />
              ) : (
                <path d="M20 6L9 17l-5-5" />
              )}
            </svg>
            <span className={`text-[11px] font-body ${videoStatus.startsWith("Error") ? "text-status-red" : "text-status-green"}`}>{videoStatus}</span>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function Toggle({ enabled, onChange }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`w-9 h-5 rounded-full transition-colors duration-200 relative shrink-0 ${enabled ? "bg-val-red" : "bg-base-500"}`}
    >
      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200 ${enabled ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}
