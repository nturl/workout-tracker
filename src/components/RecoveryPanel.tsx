"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ── Types ────────────────────────────────────────────────────────────

export interface RecoveryEntry {
  date: string; // YYYY-MM-DD
  // Eight Sleep metrics
  eightSleep?: {
    sleepFitnessScore?: number;
    timeSlept?: string;
    deepSleep?: string;
    deepSleepPct?: number;
    remSleep?: string;
    remSleepPct?: number;
    rhr?: number;
    hrv?: number;
    screenshotDataUrl?: string;
  };
  // Oura metrics
  oura?: {
    readinessScore?: number;
    sleepScore?: number;
    hrv?: number;
    rhr?: number;
    bodyTemp?: number;
    respiratoryRate?: number;
    screenshotDataUrl?: string;
  };
}

export interface RecoveryData {
  [date: string]: RecoveryEntry;
}

// ── Helpers ──────────────────────────────────────────────────────────

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getRecoveryLevel(entry: RecoveryEntry): { label: string; color: string; emoji: string; advice: string } {
  // Use best available score
  const score = entry.oura?.readinessScore || entry.eightSleep?.sleepFitnessScore || 0;
  const hrv = entry.oura?.hrv || entry.eightSleep?.hrv || 0;

  if (score >= 85 || hrv >= 60) {
    return { label: "Well Recovered", color: "#22c55e", emoji: "🟢", advice: "You're primed — go hard today. Push intensity and volume." };
  }
  if (score >= 70 || hrv >= 40) {
    return { label: "Moderate Recovery", color: "#f59e0b", emoji: "🟡", advice: "Solid baseline. Follow the program as written, listen to your body." };
  }
  if (score > 0 || hrv > 0) {
    return { label: "Low Recovery", color: "#ef4444", emoji: "🔴", advice: "Consider dialing back intensity. Focus on form over weight, skip burnout sets." };
  }
  return { label: "No Data", color: "#6b7280", emoji: "⚪", advice: "Log your recovery data to get personalized recommendations." };
}

// ── Screenshot Upload ────────────────────────────────────────────────

function ScreenshotUpload({ label, currentUrl, onUpload, onClear }: {
  label: string;
  currentUrl?: string;
  onUpload: (dataUrl: string) => void;
  onClear: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be under 5MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      // Compress by drawing to canvas
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxW = 600;
        const scale = Math.min(1, maxW / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          onUpload(canvas.toDataURL("image/jpeg", 0.7));
        }
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
        {label} Screenshot
      </p>
      {currentUrl ? (
        <div className="relative">
          <button onClick={() => setPreviewOpen(!previewOpen)}
            className="w-full rounded-xl overflow-hidden border transition-all hover:opacity-90"
            style={{ borderColor: "var(--border)" }}>
            <img src={currentUrl} alt={label} className="w-full h-auto" style={{ maxHeight: previewOpen ? "none" : "120px", objectFit: "cover" }} />
          </button>
          <div className="flex gap-2 mt-2">
            <button onClick={() => fileInputRef.current?.click()}
              className="flex-1 text-xs py-2 rounded-lg border font-medium transition-all hover:opacity-80"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              Replace
            </button>
            <button onClick={onClear}
              className="text-xs py-2 px-3 rounded-lg font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all">
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => fileInputRef.current?.click()}
          className="w-full py-6 rounded-xl border-2 border-dashed flex flex-col items-center gap-2 transition-all hover:opacity-80"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          <span className="text-2xl">📸</span>
          <span className="text-sm font-medium">Tap to upload screenshot</span>
          <span className="text-xs">from your {label} app</span>
        </button>
      )}
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
    </div>
  );
}

// ── Metric Input ─────────────────────────────────────────────────────

function MetricInput({ label, value, onChange, unit, placeholder, min, max }: {
  label: string; value: number | undefined; onChange: (v: number | undefined) => void;
  unit?: string; placeholder?: string; min?: number; max?: number;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <label className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
          placeholder={placeholder || "—"}
          min={min}
          max={max}
          className="w-20 text-right px-2 py-1.5 rounded-lg border text-sm font-mono outline-none transition-all"
          style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
        />
        {unit && <span className="text-xs w-8" style={{ color: "var(--text-muted)" }}>{unit}</span>}
      </div>
    </div>
  );
}

// ── Recovery Status Banner (exported for main page) ──────────────────

export function RecoveryBanner({ data }: { data: RecoveryData }) {
  const today = todayKey();
  const entry = data[today];
  if (!entry) return null;

  const level = getRecoveryLevel(entry);
  const score = entry.oura?.readinessScore || entry.eightSleep?.sleepFitnessScore;
  const hrv = entry.oura?.hrv || entry.eightSleep?.hrv;

  return (
    <div className="rounded-2xl p-4 border flex items-start gap-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
      <span className="text-2xl mt-0.5">{level.emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold" style={{ color: level.color }}>{level.label}</span>
          {score && <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}>Score: {score}</span>}
          {hrv && <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}>HRV: {hrv}ms</span>}
        </div>
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{level.advice}</p>
      </div>
    </div>
  );
}

// ── Main Recovery Panel ──────────────────────────────────────────────

export default function RecoveryPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [data, setData] = useState<RecoveryData>({});
  const [selectedDate, setSelectedDate] = useState(todayKey());

  useEffect(() => {
    setData(load("workout-recovery", {}));
  }, []);

  const entry: RecoveryEntry = data[selectedDate] || { date: selectedDate };

  const updateEntry = useCallback((updater: (prev: RecoveryEntry) => RecoveryEntry) => {
    setData((prev) => {
      const current = prev[selectedDate] || { date: selectedDate };
      const updated = updater(current);
      const next = { ...prev, [selectedDate]: updated };
      save("workout-recovery", next);
      return next;
    });
  }, [selectedDate]);

  const updateEightSleep = useCallback((field: string, value: unknown) => {
    updateEntry((prev) => ({
      ...prev,
      eightSleep: { ...prev.eightSleep, [field]: value },
    }));
  }, [updateEntry]);

  const updateOura = useCallback((field: string, value: unknown) => {
    updateEntry((prev) => ({
      ...prev,
      oura: { ...prev.oura, [field]: value },
    }));
  }, [updateEntry]);

  const level = getRecoveryLevel(entry);

  // Recent dates for quick nav
  const recentDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return {
      key: d.toISOString().slice(0, 10),
      label: i === 0 ? "Today" : i === 1 ? "Yesterday" : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
    };
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center backdrop-blur-sm" style={{ backgroundColor: "var(--modal-overlay)" }}>
      <div className="rounded-t-3xl sm:rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto shadow-2xl" style={{ background: "var(--bg-card)" }}>
        {/* Header */}
        <div className="sticky top-0 z-10 p-5 border-b flex items-center justify-between" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <div>
            <h2 className="text-lg font-black" style={{ color: "var(--text-primary)" }}>Recovery</h2>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Eight Sleep + Oura Data</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-all"
            style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}>✕</button>
        </div>

        {/* Date selector */}
        <div className="px-5 pt-4 pb-2 flex gap-2 overflow-x-auto">
          {recentDates.map((d) => (
            <button key={d.key} onClick={() => setSelectedDate(d.key)}
              className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={{
                background: selectedDate === d.key ? "var(--text-primary)" : "var(--bg-elevated)",
                color: selectedDate === d.key ? "var(--bg-primary)" : "var(--text-secondary)",
              }}>
              {d.label}
            </button>
          ))}
        </div>

        {/* Recovery status */}
        <div className="px-5 py-3">
          <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: "var(--bg-elevated)" }}>
            <span className="text-3xl">{level.emoji}</span>
            <div>
              <p className="text-sm font-bold" style={{ color: level.color }}>{level.label}</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{level.advice}</p>
            </div>
          </div>
        </div>

        <div className="px-5 pb-6 space-y-6">
          {/* ── Eight Sleep Section ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🛏️</span>
              <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Eight Sleep</h3>
            </div>

            <ScreenshotUpload
              label="Eight Sleep"
              currentUrl={entry.eightSleep?.screenshotDataUrl}
              onUpload={(url) => updateEightSleep("screenshotDataUrl", url)}
              onClear={() => updateEightSleep("screenshotDataUrl", undefined)}
            />

            <div className="mt-3 rounded-xl border divide-y" style={{ borderColor: "var(--border)" }}>
              <div className="px-3">
                <MetricInput label="Sleep Fitness Score" value={entry.eightSleep?.sleepFitnessScore}
                  onChange={(v) => updateEightSleep("sleepFitnessScore", v)} placeholder="86" min={0} max={100} />
              </div>
              <div className="px-3">
                <MetricInput label="HRV" value={entry.eightSleep?.hrv}
                  onChange={(v) => updateEightSleep("hrv", v)} unit="ms" placeholder="36" />
              </div>
              <div className="px-3">
                <MetricInput label="RHR" value={entry.eightSleep?.rhr}
                  onChange={(v) => updateEightSleep("rhr", v)} unit="bpm" placeholder="61" />
              </div>
              <div className="px-3">
                <MetricInput label="Deep Sleep %" value={entry.eightSleep?.deepSleepPct}
                  onChange={(v) => updateEightSleep("deepSleepPct", v)} unit="%" placeholder="14" />
              </div>
              <div className="px-3">
                <MetricInput label="REM Sleep %" value={entry.eightSleep?.remSleepPct}
                  onChange={(v) => updateEightSleep("remSleepPct", v)} unit="%" placeholder="35" />
              </div>
            </div>
          </div>

          {/* ── Oura Section ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">💍</span>
              <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Oura Ring</h3>
            </div>

            <ScreenshotUpload
              label="Oura"
              currentUrl={entry.oura?.screenshotDataUrl}
              onUpload={(url) => updateOura("screenshotDataUrl", url)}
              onClear={() => updateOura("screenshotDataUrl", undefined)}
            />

            <div className="mt-3 rounded-xl border divide-y" style={{ borderColor: "var(--border)" }}>
              <div className="px-3">
                <MetricInput label="Readiness Score" value={entry.oura?.readinessScore}
                  onChange={(v) => updateOura("readinessScore", v)} placeholder="82" min={0} max={100} />
              </div>
              <div className="px-3">
                <MetricInput label="Sleep Score" value={entry.oura?.sleepScore}
                  onChange={(v) => updateOura("sleepScore", v)} placeholder="88" min={0} max={100} />
              </div>
              <div className="px-3">
                <MetricInput label="HRV" value={entry.oura?.hrv}
                  onChange={(v) => updateOura("hrv", v)} unit="ms" placeholder="45" />
              </div>
              <div className="px-3">
                <MetricInput label="RHR" value={entry.oura?.rhr}
                  onChange={(v) => updateOura("rhr", v)} unit="bpm" placeholder="58" />
              </div>
              <div className="px-3">
                <MetricInput label="Body Temp" value={entry.oura?.bodyTemp}
                  onChange={(v) => updateOura("bodyTemp", v)} unit="°F" placeholder="0.2" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
