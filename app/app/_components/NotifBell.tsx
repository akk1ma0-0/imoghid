"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Notif = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

function fmt(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function NotifBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/notifications");
      if (!r.ok) return;
      const d = await r.json();
      setItems(d.notifications ?? []);
      setUnread(d.unreadCount ?? 0);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Клик вне — закрывает (как у «Informații utile»).
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) load();
  }

  async function markOne(id: string, readAt: string | null) {
    if (readAt) return;
    await fetch(`/api/notifications/${id}/read`, { method: "PATCH" }).catch(() => {});
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, readAt: new Date().toISOString() } : x)));
    setUnread((u) => Math.max(0, u - 1));
  }

  async function markAll() {
    await fetch("/api/notifications/read-all", { method: "PATCH" }).catch(() => {});
    setItems((prev) => prev.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
    setUnread(0);
  }

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button type="button" className="notif-btn" aria-label="Notificări" aria-expanded={open} onClick={toggle}>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M10 5a2 2 0 0 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6" />
          <path d="M9 17v1a3 3 0 0 0 6 0v-1" />
        </svg>
        {unread > 0 && <span className="notif-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className="notif-menu">
          <div className="notif-hd">
            <b>Notificări</b>
            {unread > 0 && (
              <button type="button" className="notif-markall" onClick={markAll}>
                Marchează toate citite
              </button>
            )}
          </div>
          <div>
            {items.length === 0 && <div className="notif-empty">Nu aveți notificări.</div>}
            {items.map((n) => (
              <button
                key={n.id}
                type="button"
                className="notif-item"
                onClick={() => markOne(n.id, n.readAt)}
              >
                <span className={`notif-dot${n.readAt ? " read" : ""}`} aria-hidden />
                <span className="notif-body">
                  <span className="notif-title">{n.title}</span>
                  <span className="notif-text">{n.body}</span>
                  <span className="notif-date">{fmt(n.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
