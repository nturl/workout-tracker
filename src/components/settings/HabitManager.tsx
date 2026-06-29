"use client";

import { useState, useRef, useEffect } from "react";
import { useWorkoutStore } from "@/hooks/useWorkoutStore";
import { Icon } from "@/components/ui/Icon";

const MAX_HABITS = 30;

interface HabitManagerProps {
  /** Push the change to the server (debounced) after an edit. */
  syncNow: () => void;
}

/**
 * Per-user daily-habit list editor: reorder, rename, delete, and add habits.
 * Reads/writes `habitDefs` on the store; completion streaks (the `habits` map)
 * are keyed by habit id and are left untouched by list edits.
 */
export function HabitManager({ syncNow }: HabitManagerProps) {
  const habitDefs = useWorkoutStore((s) => s.habitDefs);
  const addHabit = useWorkoutStore((s) => s.addHabit);
  const renameHabit = useWorkoutStore((s) => s.renameHabit);
  const removeHabit = useWorkoutStore((s) => s.removeHabit);
  const moveHabit = useWorkoutStore((s) => s.moveHabit);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const removeBtnRef = useRef<HTMLButtonElement>(null);

  const atLimit = habitDefs.length >= MAX_HABITS;
  // Never let the user delete down to an empty list (see store removeHabit).
  const canDelete = habitDefs.length > 1;

  // Move focus to the destructive control when a delete confirm opens, so
  // keyboard / screen-reader users aren't dropped to <body>.
  useEffect(() => {
    if (confirmDeleteId) removeBtnRef.current?.focus();
  }, [confirmDeleteId]);

  const startEdit = (id: string, label: string) => {
    setConfirmDeleteId(null);
    setEditingId(id);
    setDraftLabel(label);
  };

  const commitEdit = () => {
    if (!editingId) return;
    const trimmed = draftLabel.trim();
    if (trimmed) {
      renameHabit(editingId, trimmed);
      syncNow();
    }
    setEditingId(null);
    setDraftLabel("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraftLabel("");
  };

  const confirmDelete = (id: string) => {
    removeHabit(id);
    syncNow();
    setConfirmDeleteId(null);
  };

  const move = (id: string, direction: "up" | "down") => {
    moveHabit(id, direction);
    syncNow();
  };

  const commitAdd = () => {
    const trimmed = newLabel.trim();
    if (!trimmed || atLimit) return;
    addHabit(trimmed);
    syncNow();
    setNewLabel("");
  };

  const iconBtn =
    "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-30 disabled:hover:scale-100";

  return (
    <div>
      <p className="text-xs font-semibold tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Daily Habits</p>
      <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
        Reorder, rename, or remove the habits on your Workouts tab.
      </p>

      <div className="space-y-1.5">
        {habitDefs.map((h, i) => {
          const isEditing = editingId === h.id;
          const isConfirming = confirmDeleteId === h.id;
          return (
            <div
              key={h.id}
              className="flex items-center gap-2 rounded-xl px-2.5 py-2"
              style={{ background: "var(--bg-elevated)" }}
            >
              {/* Reorder */}
              <div className="flex flex-col -my-1">
                <button
                  type="button"
                  onClick={() => move(h.id, "up")}
                  disabled={i === 0}
                  aria-label={`Move ${h.label} up`}
                  className="w-6 h-4 flex items-center justify-center transition-opacity disabled:opacity-20 hover:opacity-70"
                  style={{ color: "var(--text-muted)" }}
                >
                  <Icon name="arrow-up" size={13} strokeWidth={2.4} />
                </button>
                <button
                  type="button"
                  onClick={() => move(h.id, "down")}
                  disabled={i === habitDefs.length - 1}
                  aria-label={`Move ${h.label} down`}
                  className="w-6 h-4 flex items-center justify-center transition-opacity disabled:opacity-20 hover:opacity-70"
                  style={{ color: "var(--text-muted)" }}
                >
                  <Icon name="arrow-down" size={13} strokeWidth={2.4} />
                </button>
              </div>

              {/* Label / edit input */}
              {isEditing ? (
                <input
                  autoFocus
                  value={draftLabel}
                  onChange={(e) => setDraftLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit();
                    if (e.key === "Escape") cancelEdit();
                  }}
                  maxLength={100}
                  aria-label="Habit name"
                  className="flex-1 min-w-0 bg-transparent text-sm font-semibold outline-none border-b"
                  style={{ color: "var(--text-primary)", borderColor: "var(--accent)" }}
                />
              ) : (
                <span className="flex-1 min-w-0 truncate text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  {h.label}
                </span>
              )}

              {/* Actions */}
              {isEditing ? (
                <>
                  <button type="button" onClick={commitEdit} aria-label="Save name" className={iconBtn}
                    style={{ background: "var(--accent)", color: "#fff" }}>
                    <Icon name="check" size={15} strokeWidth={2.6} />
                  </button>
                  <button type="button" onClick={cancelEdit} aria-label="Cancel" className={iconBtn}
                    style={{ background: "var(--bg-card)", color: "var(--text-secondary)" }}>
                    <Icon name="close" size={14} strokeWidth={2.4} />
                  </button>
                </>
              ) : isConfirming ? (
                <>
                  <button ref={removeBtnRef} type="button" onClick={() => confirmDelete(h.id)} aria-label={`Confirm remove ${h.label}`}
                    onKeyDown={(e) => { if (e.key === "Escape") setConfirmDeleteId(null); }}
                    className="shrink-0 h-8 px-3 rounded-lg text-xs font-bold transition-all hover:scale-105 active:scale-95"
                    style={{ background: "#ef4444", color: "#fff" }}>
                    Remove
                  </button>
                  <button type="button" onClick={() => setConfirmDeleteId(null)} aria-label="Cancel" className={iconBtn}
                    style={{ background: "var(--bg-card)", color: "var(--text-secondary)" }}>
                    <Icon name="close" size={14} strokeWidth={2.4} />
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => startEdit(h.id, h.label)} aria-label={`Rename ${h.label}`} className={iconBtn}
                    style={{ background: "var(--bg-card)", color: "var(--text-secondary)" }}>
                    <Icon name="pencil" size={14} strokeWidth={2.2} />
                  </button>
                  <button type="button" onClick={() => { setEditingId(null); setConfirmDeleteId(h.id); }}
                    disabled={!canDelete}
                    aria-label={canDelete ? `Remove ${h.label}` : "Keep at least one habit"}
                    title={canDelete ? undefined : "Keep at least one habit"}
                    className={iconBtn}
                    style={{ background: "var(--bg-card)", color: "var(--text-secondary)" }}>
                    <Icon name="trash" size={14} strokeWidth={2.2} />
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Add habit */}
      <div className="mt-3 flex items-center gap-2">
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commitAdd(); }}
          placeholder={atLimit ? "Habit limit reached" : "Add a habit…"}
          disabled={atLimit}
          maxLength={100}
          aria-label="New habit name"
          className="flex-1 min-w-0 rounded-xl px-3 py-2.5 text-sm font-medium outline-none border disabled:opacity-50"
          style={{ background: "var(--bg-card)", color: "var(--text-primary)", borderColor: "var(--border)" }}
        />
        <button
          type="button"
          onClick={commitAdd}
          disabled={!newLabel.trim() || atLimit}
          aria-label="Add habit"
          className="shrink-0 h-10 px-4 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          <Icon name="plus" size={16} strokeWidth={2.6} />
          Add
        </button>
      </div>
    </div>
  );
}
