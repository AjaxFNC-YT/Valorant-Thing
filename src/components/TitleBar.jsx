import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { sendNotification } from "@tauri-apps/plugin-notification";

const appWindow = getCurrentWindow();

export default function TitleBar({ simplifiedTheme = true, minimizeToTray = false }) {
  const handleMinimize = () => {
    if (minimizeToTray) {
      appWindow.hide();
      sendNotification({ title: "Valorant Thing", body: "Minimized to system tray." });
    } else {
      appWindow.minimize();
    }
  };
  return (
    <div
      data-tauri-drag-region
      className={`h-11 flex items-center justify-between px-4 border-b border-border shrink-0 rounded-t-xl ${simplifiedTheme ? "bg-base-800" : ""}`}
    >
      <div className="flex items-center gap-2.5" data-tauri-drag-region>
        <div
          className="w-6 h-6 rounded-[6px] flex items-center justify-center shrink-0"
          style={{
            background: "linear-gradient(135deg, rgb(var(--val-red)) 0%, color-mix(in srgb, rgb(var(--val-red)) 45%, black) 64%, color-mix(in srgb, rgb(var(--val-red)) 5%, black) 100%)",
            boxShadow: "0 2px 6px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.08) inset",
          }}
        >
          <span
            style={{
              fontFamily: '"Valorant", sans-serif',
              fontSize: "12.5px",
              lineHeight: 1,
              paddingTop: "3px",
              color: "#fff",
              textShadow: "0 1px 3px rgba(0,0,0,0.6), 0 0 6px rgba(0,0,0,0.3)",
              letterSpacing: "0.5px",
            }}
          >
            VT
          </span>
        </div>
        <span
          className="font-display font-semibold text-sm tracking-widest uppercase text-text-primary"
          data-tauri-drag-region
        >
          Valorant Thing
        </span>
      </div>

      <div className="flex items-center gap-0.5">
        <button
          onClick={handleMinimize}
          className="w-8 h-8 flex items-center justify-center rounded-md text-text-muted hover:text-text-secondary hover:bg-base-600 transition-colors duration-150"
          title="Minimize to tray"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        <button
          onClick={() => invoke("exit_app")}
          className="w-8 h-8 flex items-center justify-center rounded-md text-text-muted hover:text-val-red hover:bg-val-red/10 transition-colors duration-150"
          title="Close"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
