import { useRef, useState, useCallback, useEffect } from "react";
import { HexColorPicker, HexColorInput } from "react-colorful";
import { open } from "@tauri-apps/plugin-shell";

const THEMES = [
  { id: "crimson-moon", name: "Crimson Moon", bg: "#1C1212", accent: "#ED4245", vars: {
    '--base-900':'16 10 10','--base-800':'28 18 18','--base-700':'34 24 24','--base-600':'44 32 32','--base-500':'56 42 42','--base-400':'68 54 54','--border':'80 62 62','--border-light':'96 76 76','--val-red':'237 66 69','--val-red-dark':'200 50 55','--accent-blue':'237 66 69','--accent-blue-dark':'200 50 55',
  }},
  { id: "radianite", name: "Radianite", bg: "#061828", accent: "#00E6B4", vars: {
    '--base-900':'4 12 16','--base-800':'8 20 28','--base-700':'12 28 36','--base-600':'18 38 48','--base-500':'26 50 62','--base-400':'36 64 78','--border':'44 76 90','--border-light':'56 92 108','--val-red':'0 230 180','--val-red-dark':'0 190 148','--accent-blue':'0 230 180','--accent-blue-dark':'0 190 148',
  }},
  { id: "midnight-blurple", name: "Midnight Blurple", bg: "#161624", accent: "#5865F2", vars: {
    '--base-900':'12 12 22','--base-800':'22 22 36','--base-700':'28 28 44','--base-600':'36 36 56','--base-500':'46 46 68','--base-400':'58 58 82','--border':'66 66 94','--border-light':'80 80 112','--val-red':'88 101 242','--val-red-dark':'68 81 210','--accent-blue':'88 101 242','--accent-blue-dark':'68 81 210',
  }},
  { id: "chroma-glow", name: "Chroma Glow", bg: "#1C161C", accent: "#FF73FA", vars: {
    '--base-900':'16 12 16','--base-800':'28 22 28','--base-700':'36 28 36','--base-600':'46 36 46','--base-500':'58 46 58','--base-400':'72 58 72','--border':'84 68 84','--border-light':'100 82 100','--val-red':'255 115 250','--val-red-dark':'220 90 215','--accent-blue':'255 115 250','--accent-blue-dark':'220 90 215',
  }},
  { id: "forest", name: "Forest", bg: "#121C16", accent: "#43B581", vars: {
    '--base-900':'10 16 12','--base-800':'18 28 22','--base-700':'24 36 28','--base-600':'32 46 36','--base-500':'42 58 46','--base-400':'54 70 58','--border':'64 82 68','--border-light':'78 98 82','--val-red':'67 181 129','--val-red-dark':'52 150 105','--accent-blue':'67 181 129','--accent-blue-dark':'52 150 105',
  }},
  { id: "mars", name: "Mars", bg: "#200C06", accent: "#F26522", vars: {
    '--base-900':'18 10 6','--base-800':'32 18 12','--base-700':'40 24 18','--base-600':'52 34 26','--base-500':'64 44 34','--base-400':'78 56 44','--border':'92 68 54','--border-light':'108 82 66','--val-red':'242 101 34','--val-red-dark':'210 82 24','--accent-blue':'242 101 34','--accent-blue-dark':'210 82 24',
  }},
  { id: "dusk", name: "Dusk", bg: "#282C32", accent: "#99AAB5", vars: {
    '--base-900':'28 30 34','--base-800':'40 44 50','--base-700':'48 52 60','--base-600':'58 64 72','--base-500':'70 76 86','--base-400':'84 90 102','--border':'96 104 116','--border-light':'112 120 134','--val-red':'153 170 181','--val-red-dark':'128 142 152','--accent-blue':'153 170 181','--accent-blue-dark':'128 142 152',
  }},
];

function Toggle({ enabled, onChange }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0 ${
        enabled ? "bg-val-red" : "bg-base-500"
      }`}
    >
      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
        enabled ? "translate-x-[18px]" : "translate-x-0.5"
      }`} />
    </button>
  );
}

function DelaySlider({ label, desc, value, onChange }) {
  const clamp = (v) => Math.max(0, Math.min(10000, v));
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-display font-medium text-text-primary">{label}</p>
        <p className="text-xs font-body text-text-muted mt-0.5">{desc}</p>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={10000}
          step={100}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="w-24 h-1.5 rounded-full appearance-none cursor-pointer bg-base-500 accent-val-red"
        />
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={10000}
            step={100}
            value={value}
            onChange={(e) => onChange(clamp(parseInt(e.target.value, 10) || 0))}
            className="w-14 px-1.5 py-0.5 rounded bg-base-600 border border-border text-text-primary text-xs text-right font-body tabular-nums outline-none focus:border-val-red/60 transition-colors [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span className="text-xs font-body text-text-muted">ms</span>
        </div>
      </div>
    </div>
  );
}

function rgbToHex(r, g, b) {
  return `#${Math.max(0,Math.min(255,r)).toString(16).padStart(2,"0")}${Math.max(0,Math.min(255,g)).toString(16).padStart(2,"0")}${Math.max(0,Math.min(255,b)).toString(16).padStart(2,"0")}`;
}

function presetToCustom(t) {
  const base = t.vars['--base-900'].split(' ').map(Number);
  const accent = t.vars['--val-red'].split(' ').map(Number);
  const end = base.map((v, i) => Math.round(v + (accent[i] - v) * 0.18));
  return {
    accent: t.accent,
    angle: 135,
    stops: [
      { color: rgbToHex(...base), pos: 0 },
      { color: rgbToHex(...end), pos: 100 },
    ],
    vars: { ...t.vars },
  };
}

function ColorSwatch({ color, onChange, className = "" }) {
  const [open, setOpen] = useState(false);
  const popover = useRef(null);

  const close = useCallback((e) => {
    if (popover.current && !popover.current.contains(e.target)) setOpen(false);
  }, []);

  useEffect(() => {
    if (open) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, close]);

  return (
    <div className={`relative ${className}`} ref={popover}>
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 rounded-lg border border-white/10 shadow-sm hover:border-white/25 transition-colors cursor-pointer shrink-0"
        style={{ background: color }}
      />
      {open && (
        <div className="absolute z-20 top-full left-0 mt-2 p-3 rounded-xl bg-base-600 border border-border shadow-2xl space-y-2" style={{ width: 224 }}>
          <HexColorPicker color={color} onChange={onChange} />
          <div className="flex items-center gap-2">
            <span className="text-xs font-body text-text-muted">#</span>
            <HexColorInput
              color={color}
              onChange={onChange}
              prefixed={false}
              className="flex-1 px-2 py-1 rounded-md bg-base-700 border border-border text-xs font-body text-text-primary outline-none focus:border-val-red/60 transition-colors uppercase tracking-wider"
            />
            <span className="text-[10px] font-mono text-text-muted/60 select-all">{color.toUpperCase()}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function buildPreviewGradient(ct) {
  const sorted = [...ct.stops].sort((a, b) => a.pos - b.pos);
  return `linear-gradient(${ct.angle}deg, ${sorted.map(s => `${s.color} ${s.pos}%`).join(", ")})`;
}

export default function SettingsPage({
  showLogs, onShowLogsChange,
  selectDelay, onSelectDelayChange,
  lockDelay, onLockDelayChange,
  henrikApiKey, onHenrikApiKeyChange,
  theme, onThemeChange,
  startWithWindows, onStartWithWindowsChange,
  startMinimized, onStartMinimizedChange,
  minimizeToTray, onMinimizeToTrayChange,
  simplifiedTheme, onSimplifiedThemeChange,
  customTheme, onCustomThemeChange,
  discordRpc, onDiscordRpcChange,
}) {
  const fileRef = useRef(null);
  const [presetOpen, setPresetOpen] = useState(false);

  const exportTheme = () => {
    const blob = new Blob([JSON.stringify(customTheme, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "custom.theme";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importTheme = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.accent && data.stops?.length >= 2 && typeof data.angle === "number") {
          onCustomThemeChange(data);
          onThemeChange("custom");
        }
      } catch {}
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const clearVarsAndUpdate = (patch) => {
    const { vars, ...rest } = customTheme;
    onCustomThemeChange({ ...rest, ...patch });
  };

  const updateStop = (i, patch) => {
    const stops = customTheme.stops.map((s, j) => j === i ? { ...s, ...patch } : s);
    clearVarsAndUpdate({ stops });
  };

  const removeStop = (i) => {
    if (customTheme.stops.length <= 2) return;
    clearVarsAndUpdate({ stops: customTheme.stops.filter((_, j) => j !== i) });
  };

  const addStop = () => {
    const sorted = [...customTheme.stops].sort((a, b) => a.pos - b.pos);
    let pos = 50;
    if (sorted.length >= 2) {
      let maxGap = 0, gapMid = 50;
      for (let i = 0; i < sorted.length - 1; i++) {
        const gap = sorted[i + 1].pos - sorted[i].pos;
        if (gap > maxGap) { maxGap = gap; gapMid = Math.round((sorted[i].pos + sorted[i + 1].pos) / 2); }
      }
      pos = gapMid;
    }
    clearVarsAndUpdate({ stops: [...customTheme.stops, { color: "#444444", pos }] });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 p-5 gap-3 overflow-y-auto">
      <div className="p-4 rounded-xl bg-base-700 border border-border space-y-3">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted">
            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
          </svg>
          <h2 className="text-sm font-display font-semibold text-text-primary">Henrik API Key</h2>
        </div>
        <p className="text-xs font-body text-text-muted">
          Get a free API key to bypass anonymous mode and see real player names/levels.
        </p>
        <input
          type="password"
          value={henrikApiKey}
          onChange={(e) => onHenrikApiKeyChange(e.target.value)}
          placeholder="HDEV-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          className="w-full px-3 py-2 bg-base-600 border border-border rounded-lg text-xs font-body text-text-primary placeholder:text-text-muted/50 outline-none focus:border-val-red/60 transition-colors"
        />
        <button
          onClick={() => open("https://api.henrikdev.xyz/dashboard/api-keys")}
          className="inline-flex items-center gap-1 text-xs font-body text-val-red hover:text-val-red/80 transition-colors"
        >
          Get free API key
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
          </svg>
        </button>
      </div>

      <div className="p-4 rounded-xl bg-base-700 border border-border space-y-4">
        <h2 className="text-sm font-display font-semibold text-text-primary">Timing</h2>
        <DelaySlider label="Select Delay" desc="Delay before selecting agent" value={selectDelay} onChange={onSelectDelayChange} />
        <DelaySlider label="Lock Delay" desc="Delay between select and lock" value={lockDelay} onChange={onLockDelayChange} />
      </div>

      <div className="rounded-xl bg-base-700 border border-border divide-y divide-border">
        <div className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-display font-medium text-text-primary">Start with Windows</p>
            <p className="text-xs font-body text-text-muted mt-0.5">Launch on system startup</p>
          </div>
          <Toggle enabled={startWithWindows} onChange={onStartWithWindowsChange} />
        </div>
        <div className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-display font-medium text-text-primary">Start Minimized</p>
            <p className="text-xs font-body text-text-muted mt-0.5">Start hidden in system tray</p>
          </div>
          <Toggle enabled={startMinimized} onChange={onStartMinimizedChange} />
        </div>
        <div className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-display font-medium text-text-primary">Minimize to Tray</p>
            <p className="text-xs font-body text-text-muted mt-0.5">Hide to system tray instead of taskbar</p>
          </div>
          <Toggle enabled={minimizeToTray} onChange={onMinimizeToTrayChange} />
        </div>
        <div className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-display font-medium text-text-primary">Show Logs</p>
            <p className="text-xs font-body text-text-muted mt-0.5">Show API polling logs in a separate tab</p>
          </div>
          <Toggle enabled={showLogs} onChange={onShowLogsChange} />
        </div>
      </div>

      <div className="p-4 rounded-xl bg-base-700 border border-border space-y-3">
        <h2 className="text-sm font-display font-semibold text-text-primary">Theme</h2>
        <div className="grid grid-cols-4 gap-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => onThemeChange(t.id)}
              className={`group relative p-2 rounded-lg border transition-all duration-150 ${
                theme === t.id
                  ? "border-val-red bg-base-600"
                  : "border-transparent hover:bg-base-600/50"
              }`}
            >
              <div
                className="w-full h-8 rounded-md mb-1.5"
                style={{ background: `linear-gradient(135deg, ${t.bg} 0%, ${t.accent} 100%)` }}
              />
              <p className={`text-[11px] font-body leading-tight truncate ${
                theme === t.id ? "text-text-primary font-medium" : "text-text-muted group-hover:text-text-secondary"
              }`}>{t.name}</p>
            </button>
          ))}
          <button
            onClick={() => onThemeChange("custom")}
            className={`group relative p-2 rounded-lg border transition-all duration-150 ${
              theme === "custom"
                ? "border-val-red bg-base-600"
                : "border-transparent hover:bg-base-600/50"
            }`}
          >
            <div
              className="w-full h-8 rounded-md mb-1.5 flex items-center justify-center"
              style={{ background: buildPreviewGradient(customTheme) }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="opacity-60">
                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </div>
            <p className={`text-[11px] font-body leading-tight truncate ${
              theme === "custom" ? "text-text-primary font-medium" : "text-text-muted group-hover:text-text-secondary"
            }`}>Custom</p>
          </button>
        </div>

        {theme === "custom" && (
          <div className="space-y-3 pt-2 border-t border-border">
            <div
              className="h-14 rounded-xl border border-border shadow-inner"
              style={{ background: buildPreviewGradient(customTheme) }}
            />

            <div className="space-y-2">
              <p className="text-xs font-display font-medium text-text-secondary uppercase tracking-wider">Color Stops</p>
              {customTheme.stops.map((stop, i) => (
                <div key={i} className="flex items-center gap-2.5 group">
                  <ColorSwatch
                    color={stop.color}
                    onChange={(c) => updateStop(i, { color: c })}
                  />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={stop.pos}
                    onChange={(e) => updateStop(i, { pos: parseInt(e.target.value, 10) })}
                    className="flex-1"
                  />
                  <span className="text-xs font-body text-text-muted w-9 text-right tabular-nums">{stop.pos}%</span>
                  {customTheme.stops.length > 2 && (
                    <button
                      onClick={() => removeStop(i)}
                      className="w-6 h-6 rounded-md flex items-center justify-center text-text-muted hover:text-status-red hover:bg-status-red/10 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={addStop}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-body text-val-red hover:bg-val-red/10 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add Color Stop
              </button>
            </div>

            <div className="flex items-center gap-3">
              <p className="text-xs font-display font-medium text-text-secondary uppercase tracking-wider shrink-0 w-12">Angle</p>
              <input
                type="range"
                min={0}
                max={360}
                value={customTheme.angle}
                onChange={(e) => clearVarsAndUpdate({ angle: parseInt(e.target.value, 10) })}
                className="flex-1"
              />
              <span className="text-xs font-body text-text-muted w-9 text-right tabular-nums">{customTheme.angle}°</span>
            </div>

            <div className="flex items-center gap-3">
              <p className="text-xs font-display font-medium text-text-secondary uppercase tracking-wider shrink-0 w-12">Accent</p>
              <ColorSwatch
                color={customTheme.accent}
                onChange={(c) => clearVarsAndUpdate({ accent: c })}
              />
              <p className="text-[11px] font-body text-text-muted">UI highlights, toggles, icons</p>
            </div>

            <div className="flex items-center gap-2 pt-3 border-t border-border">
              <div className="relative">
                <button
                  onClick={() => setPresetOpen(!presetOpen)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-600 border border-border text-xs font-body text-text-primary hover:bg-base-500 transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
                  Load Preset
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform ${presetOpen ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
                </button>
                {presetOpen && (
                  <div className="absolute bottom-full left-0 mb-1 w-44 py-1 rounded-lg bg-base-600 border border-border shadow-xl z-10">
                    {THEMES.map(t => (
                      <button
                        key={t.id}
                        onClick={() => { onCustomThemeChange(presetToCustom(t)); setPresetOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs font-body text-text-secondary hover:text-text-primary hover:bg-base-500/60 transition-colors"
                      >
                        <div className="w-4 h-4 rounded shrink-0 border border-white/10" style={{ background: `linear-gradient(135deg, ${t.bg}, ${t.accent})` }} />
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={exportTheme}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-600 border border-border text-xs font-body text-text-primary hover:bg-base-500 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                Export
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-600 border border-border text-xs font-body text-text-primary hover:bg-base-500 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
                Import
              </button>
              <input ref={fileRef} type="file" accept=".theme,.json" onChange={importTheme} className="hidden" />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div>
            <p className="text-sm font-display font-medium text-text-primary">Simplified</p>
            <p className="text-xs font-body text-text-muted mt-0.5">Flat colors instead of gradient background</p>
          </div>
          <Toggle enabled={simplifiedTheme} onChange={onSimplifiedThemeChange} />
        </div>
      </div>

      <div className="p-4 rounded-xl bg-base-700 border border-border space-y-3">
        <h2 className="text-sm font-display font-semibold text-text-primary">Integrations</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-display font-medium text-text-primary">Discord Rich Presence</p>
            <p className="text-xs font-body text-text-muted mt-0.5">Show current status on your Discord profile</p>
          </div>
          <Toggle enabled={discordRpc} onChange={onDiscordRpcChange} />
        </div>
      </div>

      <div className="p-4 rounded-xl bg-base-700 border border-border space-y-1">
        <h2 className="text-sm font-display font-semibold text-text-primary">About</h2>
        <p className="text-xs font-body text-text-secondary">Valorant Thing v1.0.1</p>
        <p className="text-xs font-body text-text-muted">
          Created by AjaxFNC · Built with Rust & Tauri · Uses official Valorant APIs
        </p>
      </div>
    </div>
  );
}
