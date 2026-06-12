"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { ProgrammingNotes as ProgrammingNotesType } from "@/lib/workoutData";

export function ProgrammingNotes({ notes }: { notes: ProgrammingNotesType }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3 rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 flex items-center justify-between text-left"
        aria-expanded={open}
        aria-controls="programming-notes-body"
      >
        <span className="text-xs font-display font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
          Why this day?
        </span>
        <span className="inline-flex transition-transform" style={{ color: "var(--text-muted)", transform: open ? "rotate(180deg)" : undefined }}>
          <Icon name="chevron" size={13} strokeWidth={2.4} />
        </span>
      </button>

      {open && (
        <div id="programming-notes-body" className="px-4 pb-4 space-y-3">
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {notes.reasoning}
          </p>

          {notes.doOnThisDay.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
                Do
              </p>
              <ul className="space-y-1">
                {notes.doOnThisDay.map((item, i) => (
                  <li key={i} className="text-sm flex gap-2" style={{ color: "var(--text-primary)" }}>
                    <span aria-hidden style={{ color: "var(--accent)" }}>+</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {notes.avoidOnThisDay.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
                Avoid
              </p>
              <ul className="space-y-1">
                {notes.avoidOnThisDay.map((item, i) => (
                  <li key={i} className="text-sm flex gap-2" style={{ color: "var(--text-primary)" }}>
                    <span aria-hidden style={{ color: "var(--text-muted)" }}>-</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
