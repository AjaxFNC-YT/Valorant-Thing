import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emitTo, listen } from "@tauri-apps/api/event";

const FG_POLL = 200;
const MATCH_POLL = 1000;

export default function Overlay({ connected, enabled, theme, player, linger = 20 }) {
  const windowRef = useRef(null);
  const themeRef = useRef(theme);
  const lingerRef = useRef(linger);
  const shouldShowRef = useRef(false);
  const dismissedRef = useRef(new Set());

  useEffect(() => { themeRef.current = theme; }, [theme]);
  useEffect(() => { lingerRef.current = linger; }, [linger]);

  useEffect(() => {
    if (!connected || !enabled) {
      if (windowRef.current) {
        windowRef.current.destroy().catch(() => {});
        windowRef.current = null;
      }
      shouldShowRef.current = false;
      dismissedRef.current.clear();
      return;
    }

    let cancelled = false;
    let hideTimer = null;
    let seenPregame = false;
    let sentTheme = false;
    let currentMatchId = null;

    const ensureWindow = async () => {
      if (windowRef.current) return windowRef.current;
      try {
        const existing = await WebviewWindow.getByLabel("overlay");
        if (existing) { windowRef.current = existing; return existing; }
      } catch {}
      const win = new WebviewWindow("overlay", {
        url: "index.html?overlay",
        title: "Valorant Thing Overlay",
        width: 750,
        height: 600,
        decorations: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        focusable: false,
        resizable: false,
        x: 10,
        y: 10,
        visible: false,
      });
      windowRef.current = win;
      win.once("tauri://error", () => { windowRef.current = null; });
      win.once("tauri://destroyed", () => { windowRef.current = null; });
      await new Promise(r => setTimeout(r, 600));
      return win;
    };

    const unlistenDismiss = listen("overlay-dismissed", (e) => {
      const mid = e.payload;
      if (mid) dismissedRef.current.add(mid);
      shouldShowRef.current = false;
      seenPregame = false;
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      if (windowRef.current) windowRef.current.hide().catch(() => {});
    });

    const fgPoll = async () => {
      if (cancelled || !windowRef.current) return;
      const fg = await invoke("is_valorant_foreground").catch(() => false);
      if (cancelled) return;
      if (!fg) {
        windowRef.current.hide().catch(() => {});
      } else if (shouldShowRef.current) {
        windowRef.current.show().catch(() => {});
      }
    };

    const matchPoll = async () => {
      if (cancelled) return;
      try {
        const raw = await invoke("check_current_game");
        const match = JSON.parse(raw);
        const phase = match._phase === "pregame" ? "PREGAME" : "INGAME";
        const matchId = match.ID || match.MatchID;
        currentMatchId = matchId;

        if (dismissedRef.current.has(matchId)) return;

        if (phase === "PREGAME") {
          seenPregame = true;
          if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
          const win = await ensureWindow();
          if (cancelled) return;
          if (!sentTheme) {
            sentTheme = true;
            try { await emitTo("overlay", "overlay-theme", themeRef.current); } catch {}
          }
          shouldShowRef.current = true;
        } else if (seenPregame) {
          const ms = lingerRef.current * 1000;
          if (ms <= 0) {
            shouldShowRef.current = false;
            seenPregame = false;
            if (windowRef.current) windowRef.current.hide().catch(() => {});
          } else if (!hideTimer) {
            hideTimer = setTimeout(() => {
              shouldShowRef.current = false;
              seenPregame = false;
              hideTimer = null;
              if (windowRef.current) windowRef.current.hide().catch(() => {});
            }, ms);
          }
        }
      } catch (err) {
        const msg = typeof err === "string" ? err : err?.message || "";
        if (msg.includes("Not in a match")) {
          if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
          shouldShowRef.current = false;
          seenPregame = false;
          sentTheme = false;
          dismissedRef.current.clear();
          if (windowRef.current) windowRef.current.hide().catch(() => {});
        }
      }
    };

    matchPoll();
    const fgTimer = setInterval(fgPoll, FG_POLL);
    const matchTimer = setInterval(matchPoll, MATCH_POLL);
    return () => {
      cancelled = true;
      clearInterval(fgTimer);
      clearInterval(matchTimer);
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      unlistenDismiss.then(fn => fn());
    };
  }, [connected, enabled, player]);

  useEffect(() => {
    if (windowRef.current) {
      emitTo("overlay", "overlay-theme", theme).catch(() => {});
    }
  }, [theme]);

  return null;
}
