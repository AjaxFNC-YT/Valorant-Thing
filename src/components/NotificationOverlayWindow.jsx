import { useState, useEffect, useCallback, useRef } from "react";
import { listen, emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize, LogicalPosition } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import NotificationToast from "./NotificationToast";

const MAX_VISIBLE = 5;
const NOTIF_W = 340;

export default function NotificationOverlayWindow() {
  const [visible, setVisible] = useState([]);
  const [position, setPosition] = useState("top-right");
  const hideTimer = useRef(null);
  const queueRef = useRef([]);
  const containerRef = useRef(null);
  const anchorRef = useRef(null);

  useEffect(() => {
    document.documentElement.classList.add("notif-overlay");
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";

    const win = getCurrentWindow();
    win.setIgnoreCursorEvents(true).catch(() => {});

    (async () => {
      try {
        const sf = await win.scaleFactor();
        const pos = await win.outerPosition();
        const size = await win.outerSize();
        anchorRef.current = {
          x: pos.x / sf,
          y: pos.y / sf,
          bottom: (pos.y + size.height) / sf,
        };
      } catch {}
    })();

    const blockMenu = (e) => e.preventDefault();
    document.addEventListener("contextmenu", blockMenu);

    const applyTheme = (payload) => {
      const name = typeof payload === "string" ? payload : payload?.name;
      const vars = typeof payload === "object" ? payload?.vars : null;
      document.documentElement.setAttribute("data-theme", name || "crimson-moon");
      if (name === "custom" && vars) {
        Object.entries(vars).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
      }
    };
    applyTheme(localStorage.getItem("app_theme"));
    const unlisten = listen("notif-theme", (e) => applyTheme(e.payload));
    return () => { unlisten.then(fn => fn()); document.removeEventListener("contextmenu", blockMenu); };
  }, []);

  useEffect(() => {
    let unsubs = [];
    (async () => {
      unsubs.push(await listen("notif-push", async (e) => {
        const data = e.payload;
        if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
        try {
          await invoke("show_window_no_focus", { label: "notification-overlay" });
          await getCurrentWindow().setIgnoreCursorEvents(true);
        } catch {}
        if (data.position) setPosition(data.position);
        setVisible(prev => {
          const idx = prev.findIndex(n => n.id === data.id);
          if (idx >= 0) return prev.map((n, i) => i === idx ? data : n);
          if (prev.length >= MAX_VISIBLE) {
            queueRef.current.push(data);
            return prev;
          }
          return [...prev, data];
        });
      }));
      unsubs.push(await listen("notif-dismiss-all", () => {
        queueRef.current = [];
        setVisible([]);
      }));
      emit("notif-ready", {});
    })();
    return () => { unsubs.forEach(fn => fn()); };
  }, []);

  useEffect(() => {
    if (visible.length === 0) {
      hideTimer.current = setTimeout(() => {
        getCurrentWindow().hide().catch(() => {});
      }, 300);
    } else {
      if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    }
    return () => { if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; } };
  }, [visible.length]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const isBottom = position.includes("bottom");
    let resizeFrame = null;

    const ro = new ResizeObserver(() => {
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        const h = el.offsetHeight;
        const newH = Math.max(h + 16, 1);
        const win = getCurrentWindow();
        win.setSize(new LogicalSize(NOTIF_W, newH)).catch(() => {});
        if (isBottom && anchorRef.current) {
          const newY = anchorRef.current.bottom - newH;
          win.setPosition(new LogicalPosition(anchorRef.current.x, newY)).catch(() => {});
        }
      });
    });
    ro.observe(el);
    return () => { ro.disconnect(); if (resizeFrame) cancelAnimationFrame(resizeFrame); };
  }, [position]);

  const handleDismiss = useCallback((id) => {
    setVisible(prev => {
      const next = prev.filter(n => n.id !== id);
      if (queueRef.current.length > 0 && next.length < MAX_VISIBLE) {
        const promoted = queueRef.current.shift();
        return [...next, promoted];
      }
      return next;
    });
  }, []);

  const isRight = position.includes("right");
  const isBottom = position.includes("bottom");

  return (
    <div style={{ background: "transparent", overflow: "hidden", pointerEvents: "none" }}>
      <div
        ref={containerRef}
        className="flex flex-col gap-2"
        style={{
          pointerEvents: "none",
          marginLeft: isRight ? "auto" : 0,
          marginRight: isRight ? 0 : "auto",
        }}
      >
        <AnimatePresence>
          {visible.map(n => (
            <motion.div
              key={n.id}
              layout
              initial={{ x: isRight ? 340 : -340, opacity: 0, scale: 0.92 }}
              animate={{ x: 0, opacity: 1, scale: 1, transition: { type: "spring", stiffness: 400, damping: 22, mass: 0.8 } }}
              exit={{ x: isRight ? 340 : -340, opacity: 0, transition: { duration: 0.25, ease: "easeIn" } }}
              style={{ pointerEvents: "none" }}
            >
              <NotificationToast notification={n} onDismiss={handleDismiss} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
