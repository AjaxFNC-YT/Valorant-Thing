import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

export default function Tooltip({ text, children }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const triggerRef = useRef(null);

  const handleEnter = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ x: rect.left + rect.width / 2, y: rect.top });
    setShow(true);
  }, []);

  return (
    <>
      <span ref={triggerRef} onMouseEnter={handleEnter} onMouseLeave={() => setShow(false)} className="inline-flex">
        {children}
      </span>
      {show && createPortal(
        <div
          style={{ position: "fixed", left: pos.x, top: pos.y, transform: "translate(-50%, -100%)", marginTop: -6, pointerEvents: "none", zIndex: 9999 }}
          className="px-2 py-1 rounded bg-base-900 border border-border text-[10px] font-body text-text-secondary whitespace-nowrap shadow-lg"
        >
          {text}
        </div>,
        document.body
      )}
    </>
  );
}
