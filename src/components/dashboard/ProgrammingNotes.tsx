"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { ProgrammingNotes as ProgrammingNotesType } from "@/lib/workoutData";

export function ProgrammingNotes({ notes }: { notes: ProgrammingNotesType }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3 glass-card rounded-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 flex items-center justify-between text-left pressable"
        aria-expanded={open}
        aria-controls="programming-notes-body"
      >
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-content-secondary">
          Why this day?
        </span>
        <span className="inline-flex transition-transform text-content-muted" style={{ transform: open ? "rotate(180deg)" : undefined }}>
          <Icon name="chevron" size={13} strokeWidth={2.4} />
        </span>
      </button>

      {open && (
        <div id="programming-notes-body" className="px-4 pb-4 space-y-3 anim-fade-up">
          <p className="text-[15px] leading-[22px] text-content-secondary">
            {notes.reasoning}
          </p>

          {notes.doOnThisDay.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] mb-1.5 text-content-secondary">
                Do
              </p>
              <ul className="space-y-1">
                {notes.doOnThisDay.map((item, i) => (
                  <li key={i} className="text-[15px] leading-[22px] flex gap-2 text-content-primary">
                    <span aria-hidden className="text-accent">+</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {notes.avoidOnThisDay.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] mb-1.5 text-content-secondary">
                Avoid
              </p>
              <ul className="space-y-1">
                {notes.avoidOnThisDay.map((item, i) => (
                  <li key={i} className="text-[15px] leading-[22px] flex gap-2 text-content-primary">
                    <span aria-hidden className="text-content-muted">-</span>
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
