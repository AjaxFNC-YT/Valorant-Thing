import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";

const DISMISS_MS = { "match-found": 8000, "locked": 4000, "dodged": 4000, "queue": 4000 };

export default function NotificationToast({ notification, onDismiss }) {
  const [remaining, setRemaining] = useState(0);
  const rafRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!notification) return;

    if (notification.type === "locking") {
      const { totalMs, startTime } = notification;
      const tick = () => {
        const left = Math.max(0, totalMs - (Date.now() - startTime));
        setRemaining(left);
        if (left > 0) rafRef.current = requestAnimationFrame(tick);
      };
      tick();
      return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }

    const ms = DISMISS_MS[notification.type];
    if (ms) {
      timerRef.current = setTimeout(() => onDismiss?.(notification.id), ms);
      return () => clearTimeout(timerRef.current);
    }
  }, [notification, onDismiss]);

  if (!notification) return null;
  const { type } = notification;

  if (type === "match-found") return <MatchFoundCard n={notification} />;
  if (type === "dodged") return <DodgedCard n={notification} />;
  if (type === "queue") return <QueueCard n={notification} />;

  const stripBg = type === "locked"
    ? "linear-gradient(180deg, rgb(var(--status-green)), rgb(var(--status-green) / 0.4))"
    : "linear-gradient(180deg, rgb(var(--val-red)), rgb(var(--val-red) / 0.3))";

  return (
    <CardShell stripBg={stripBg}>
      <div className="flex-1 px-3.5 py-3 flex flex-col gap-2 min-w-0">
        <VTHeader />
        {type === "locking" && (
          <>
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-body text-text-secondary">Locking agent in</span>
              <span
                className="text-sm font-display font-bold tabular-nums"
                style={{ color: "rgb(var(--val-red))", minWidth: "2.5ch", textAlign: "right" }}
              >
                {(remaining / 1000).toFixed(1)}s
              </span>
              <LoadingDots />
            </div>
            <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: "rgb(var(--base-600))" }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: "rgb(var(--val-red))", transformOrigin: "left" }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: notification.totalMs ? 1 - remaining / notification.totalMs : 0 }}
                transition={{ duration: 0.05, ease: "linear" }}
              />
            </div>
          </>
        )}
        {type === "locked" && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 25 }}
            className="flex items-center gap-1.5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0" style={{ color: "rgb(var(--status-green))" }}>
              <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-sm font-body font-semibold" style={{ color: "rgb(var(--status-green))" }}>
              Locked {notification.agentName}!
            </span>
          </motion.div>
        )}
      </div>
    </CardShell>
  );
}

function CardShell({ stripBg, children }) {
  return (
    <div
      className="flex items-stretch rounded-xl overflow-hidden border border-border backdrop-blur-sm"
      style={{
        background: "rgb(var(--base-800) / 0.95)",
        width: 320,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset",
      }}
    >
      <div className="rounded-l-xl" style={{ width: 4, flexShrink: 0, background: stripBg }} />
      {children}
    </div>
  );
}

function MatchFoundCard({ n }) {
  const { mapName, mapImage, server, canDodge, dodgeKeybind } = n;
  return (
    <CardShell stripBg="linear-gradient(180deg, rgb(var(--accent-blue)), rgb(var(--accent-blue) / 0.3))">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="relative h-20 w-full overflow-hidden">
          {mapImage && <img src={mapImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgb(var(--base-800) / 0.3) 0%, rgb(var(--base-800) / 0.85) 100%)" }} />
          <div className="relative h-full flex flex-col justify-end p-3 gap-1">
            <div className="flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="shrink-0" style={{ color: "rgb(var(--accent-blue))" }}>
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="2" />
              </svg>
              <span className="text-[11px] font-body text-text-secondary">{server || "Unknown Server"}</span>
            </div>
            <p className="text-base font-display font-bold text-text-primary leading-tight tracking-wide">{mapName || "Unknown Map"}</p>
          </div>
        </div>
        <div className="px-3 py-2 flex items-center justify-between">
          <VTHeader />
          <span className="text-[10px] font-display font-bold tracking-widest uppercase" style={{ color: "rgb(var(--accent-blue))" }}>
            Match Found
          </span>
        </div>
        {canDodge && dodgeKeybind && (
          <div className="px-3 pb-2.5 -mt-0.5">
            <span className="text-[10px] font-body text-text-muted">
              Press{" "}
              <kbd
                className="px-1.5 py-0.5 rounded text-[9px] font-display font-semibold border"
                style={{ borderColor: "rgb(var(--border))", background: "rgb(var(--base-600))", color: "rgb(var(--text-secondary))" }}
              >
                {dodgeKeybind}
              </kbd>
              {" "}to dodge
            </span>
          </div>
        )}
      </div>
    </CardShell>
  );
}

function DodgedCard({ n }) {
  const reason = n.reason === "map" ? `${n.mapName || "Map"} was blacklisted`
    : n.reason === "keybind" ? `Dodged via ${n.keybind || "keybind"}`
    : "Manually dodged";
  const title = n.reason === "map" ? "Map Dodged" : "Match Dodged";
  return (
    <CardShell stripBg="linear-gradient(180deg, #f59e0b, #f59e0b80)">
      <div className="flex-1 px-3.5 py-3 flex flex-col gap-2 min-w-0">
        <VTHeader />
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-body font-semibold" style={{ color: "#f59e0b" }}>{title}</span>
          <span className="text-xs font-body text-text-muted">{reason}</span>
        </div>
      </div>
    </CardShell>
  );
}

function QueueCard({ n }) {
  const isRequeue = n.action === "requeue";
  const title = isRequeue ? "Requeued" : "Left Queue";
  const desc = isRequeue ? "Automatically requeued after match" : "Automatically left queue after dodge";
  const color = isRequeue ? "rgb(var(--accent-blue))" : "rgb(var(--val-red))";
  const strip = isRequeue
    ? "linear-gradient(180deg, rgb(var(--accent-blue)), rgb(var(--accent-blue) / 0.3))"
    : "linear-gradient(180deg, rgb(var(--val-red)), rgb(var(--val-red) / 0.3))";
  return (
    <CardShell stripBg={strip}>
      <div className="flex-1 px-3.5 py-3 flex flex-col gap-2 min-w-0">
        <VTHeader />
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-body font-semibold" style={{ color }}>{title}</span>
          <span className="text-xs font-body text-text-muted">{desc}</span>
        </div>
      </div>
    </CardShell>
  );
}

function VTHeader() {
  return (
    <div className="flex items-center gap-2.5">
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
      <span className="font-display font-semibold text-xs tracking-widest uppercase text-text-primary">
        Valorant-Thing
      </span>
    </div>
  );
}

function LoadingDots() {
  return (
    <span className="inline-flex gap-[2px] items-center ml-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-[3px] h-[3px] rounded-full"
          style={{ background: "rgb(var(--text-muted))" }}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}
