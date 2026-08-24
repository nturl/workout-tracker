"use client";

import { localDateKey } from "@/components/recovery/RecoveryHistory";

export function useDateOptions() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return {
      key: localDateKey(d),
      label: i === 0 ? "Today" : i === 1 ? "Yesterday" : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
    };
  });
}

export function DateSelector({ dates, selectedDate, onSelect }: {
  dates: { key: string; label: string }[];
  selectedDate: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="px-5 pt-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
      {dates.map((d) => {
        const selected = selectedDate === d.key;
        return (
          <button key={d.key} onClick={() => onSelect(d.key)}
            className={`pressable shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors inline-touch ${
              selected ? "bg-accent text-accent-contrast" : "bg-surface-elevated text-content-secondary"
            }`}>
            {d.label}
          </button>
        );
      })}
    </div>
  );
}
