import { useRef, useEffect, useState } from "react";
import { motion } from "framer-motion";

export default function LogsPage({ logs, onClear }) {
  const bottomRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  const handleCopy = (log) => {
    const text = log.data
      ? `[${log.time}] ${log.message}\n${typeof log.data === "string" ? log.data : JSON.stringify(log.data, null, 2)}`
      : `[${log.time}] ${log.message}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">
      <div className="flex items-center justify-between shrink-0">
        <h1 className="text-sm font-display font-semibold text-text-primary">Logs</h1>
        <div className="flex items-center gap-3">
          {copied && <span className="text-[10px] font-body text-status-green">Copied!</span>}
          <span className="text-xs font-body text-text-muted">{logs.length} entries</span>
          <button
            onClick={onClear}
            className="px-2 py-0.5 text-[10px] font-display font-medium rounded bg-base-600 hover:bg-base-500 text-text-muted hover:text-text-secondary transition-colors"
          >
            Clear
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden rounded-lg bg-base-700 border border-border">
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-muted text-xs font-body">
            No logs yet.
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {logs.map((log, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.15 }} onClick={() => handleCopy(log)} className="text-[11px] font-mono leading-relaxed cursor-pointer rounded px-1 -mx-1 hover:bg-base-600/50 transition-colors break-all">
                <span className="text-text-muted">[{log.time}]</span>{" "}
                <span className={log.type === "error" ? "text-status-red" : log.type === "match" ? "text-status-green" : "text-text-secondary"}>
                  {log.type === "error" ? "ERR" : log.type === "match" ? "MATCH" : "INFO"}
                </span>{" "}
                <span className="text-text-primary break-all">{log.message}</span>
                {log.data && (
                  <pre className="mt-0.5 text-[10px] text-text-muted/70 whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                    {typeof log.data === "string" ? log.data : JSON.stringify(log.data, null, 2)}
                  </pre>
                )}
              </motion.div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  );
}
