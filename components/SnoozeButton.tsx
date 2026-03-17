"use client";

import { useEffect, useState } from "react";

type ArmedState = {
  armed: boolean;
  snooze_until: number | null;
  snooze_remaining_s?: number;
};

const DURATIONS = [
  { label: "30m", minutes: 30 },
  { label: "1h", minutes: 60 },
  { label: "2h", minutes: 120 },
];

function formatRemaining(seconds: number): string {
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.ceil((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${Math.ceil(seconds / 60)}m`;
}

export default function SnoozeButton() {
  const [state, setState] = useState<ArmedState | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function fetchState() {
    try {
      const res = await fetch("/api/armed", { cache: "no-store" });
      if (res.ok) setState(await res.json());
    } catch {}
  }

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Countdown tick while snoozed
  useEffect(() => {
    if (!state?.snooze_until) return;
    const tick = setInterval(() => {
      const remaining = Math.ceil((state.snooze_until! - Date.now()) / 1000);
      if (remaining <= 0) {
        setState({ armed: true, snooze_until: null });
        clearInterval(tick);
      } else {
        setState((s) => s ? { ...s, snooze_remaining_s: remaining } : s);
      }
    }, 10_000);
    return () => clearInterval(tick);
  }, [state?.snooze_until]);

  async function snooze(minutes: number) {
    setLoading(true);
    setOpen(false);
    try {
      const res = await fetch("/api/snooze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes }),
      });
      if (res.ok) {
        const data = await res.json();
        setState({
          armed: false,
          snooze_until: data.snooze_until,
          snooze_remaining_s: minutes * 60,
        });
      }
    } finally {
      setLoading(false);
    }
  }

  async function resume() {
    setLoading(true);
    try {
      await fetch("/api/snooze", { method: "DELETE" });
      setState({ armed: true, snooze_until: null });
    } finally {
      setLoading(false);
    }
  }

  if (!state) return null;

  if (!state.armed) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-amber-400 font-medium">
          Motion snoozed
          {state.snooze_remaining_s ? ` · ${formatRemaining(state.snooze_remaining_s)} left` : ""}
        </span>
        <button
          onClick={resume}
          disabled={loading}
          className="text-xs px-2 py-1 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors disabled:opacity-40"
        >
          Resume
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={loading}
        className="text-xs px-3 py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors disabled:opacity-40 flex items-center gap-1.5"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        Snooze
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden z-10">
          {DURATIONS.map(({ label, minutes }) => (
            <button
              key={minutes}
              onClick={() => snooze(minutes)}
              className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
