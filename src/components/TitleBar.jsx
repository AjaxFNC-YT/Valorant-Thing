import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { sendNotification } from "@tauri-apps/plugin-notification";

const appWindow = getCurrentWindow();

function minimizeToTray() {
  appWindow.hide();
  sendNotification({ title: "Valorant Thing", body: "Minimized to system tray." });
}

export default function TitleBar({ simplifiedTheme = true }) {
  return (
    <div
      data-tauri-drag-region
      className={`h-11 flex items-center justify-between px-4 border-b border-border shrink-0 rounded-t-xl ${simplifiedTheme ? "bg-base-800" : ""}`}
    >
      <div className="flex items-center gap-2.5" data-tauri-drag-region>
        <div className="w-5 h-5 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2L2 19h20L12 2z"
              fill="rgb(var(--val-red))"
              opacity="0.9"
            />
          </svg>
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
          onClick={minimizeToTray}
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
