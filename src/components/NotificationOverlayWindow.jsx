import { useState, useEffect, useCallback, useRef } from "react";
import { listen, emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { motion, AnimatePresence } from "framer-motion";
import NotificationToast from "./NotificationToast";

export default function NotificationOverlayWindow() {
  const [notifications, setNotifications] = useState([]);
  const [position, setPosition] = useState("top-right");
  const hideTimer = useRef(null);

  useEffect(() => {
    document.documentElement.classList.add("notif-overlay");
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";

    const applyTheme = (t) => {
      document.documentElement.setAttribute("data-theme", t || "crimson-moon");
      if (t === "custom") {
        try {
          const ct = JSON.parse(localStorage.getItem("custom_theme"));
          if (ct?.vars) Object.entries(ct.vars).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
        } catch {}
      }
    };
    applyTheme(localStorage.getItem("app_theme"));
    const unlisten = listen("notif-theme", (e) => applyTheme(e.payload));
    return () => { unlisten.then(fn => fn()); };
  }, []);

  useEffect(() => {
    let unsubs = [];
    (async () => {
      unsubs.push(await listen("notif-push", async (e) => {
        const data = e.payload;
        if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
        try { await getCurrentWindow().show(); } catch {}
        if (data.position) setPosition(data.position);
        setNotifications(prev => {
          const idx = prev.findIndex(n => n.id === data.id);
          if (idx >= 0) return prev.map((n, i) => i === idx ? data : n);
          return [...prev, data];
        });
      }));
      unsubs.push(await listen("notif-dismiss-all", () => {
        setNotifications([]);
      }));
      emit("notif-ready", {});
    })();
    return () => { unsubs.forEach(fn => fn()); };
  }, []);

  useEffect(() => {
    if (notifications.length === 0) {
      hideTimer.current = setTimeout(() => {
        getCurrentWindow().hide().catch(() => {});
      }, 400);
    }
    return () => { if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; } };
  }, [notifications.length]);

  const handleDismiss = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const isRight = position.includes("right");
  const isBottom = position.includes("bottom");

  return (
    <div style={{ width: "100vw", height: "100vh", background: "transparent", overflow: "hidden", pointerEvents: "none" }}>
      <div
        className="absolute flex flex-col gap-2"
        style={{
          [isBottom ? "bottom" : "top"]: 0,
          [isRight ? "right" : "left"]: 0,
          pointerEvents: "none",
        }}
      >
        <AnimatePresence>
          {notifications.map(n => (
            <motion.div
              key={n.id}
              layout
              initial={{ x: isRight ? 340 : -340, opacity: 0, scale: 0.92 }}
              animate={{ x: 0, opacity: 1, scale: 1, transition: { type: "spring", stiffness: 400, damping: 22, mass: 0.8 } }}
              exit={{ x: isRight ? 340 : -340, opacity: 0, transition: { duration: 0.25, ease: "easeIn" } }}
              style={{ pointerEvents: "auto" }}
            >
              <NotificationToast notification={n} onDismiss={handleDismiss} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
