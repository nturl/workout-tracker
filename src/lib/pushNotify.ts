/**
 * Fire-and-forget client helper for triggering server-side pushes on events.
 * The server owns copy + filtering via user preferences.
 */

type NotifyEvent =
  | { kind: "session-complete"; sessionTitle: string }
  | { kind: "week-complete"; weekLabel?: string }
  | { kind: "streak-milestone"; days: number }
  | { kind: "streak-nudge"; streak: number };

const STREAK_MILESTONES = new Set([3, 7, 14, 30, 60, 90, 180, 365]);
const LAST_NOTIFIED_KEY = "workout-push-last-streak";

export function notify(event: NotifyEvent): void {
  // Don't block UI on the network call
  fetch("/api/push/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "fetch" },
    body: JSON.stringify(event),
  }).catch(() => {});
}

export function maybeNotifyStreakMilestone(streak: number): void {
  if (!STREAK_MILESTONES.has(streak)) return;
  try {
    const last = Number(localStorage.getItem(LAST_NOTIFIED_KEY) || "0");
    if (last === streak) return; // already notified today
    localStorage.setItem(LAST_NOTIFIED_KEY, String(streak));
  } catch {}
  notify({ kind: "streak-milestone", days: streak });
}

export function notifySessionComplete(sessionTitle: string): void {
  notify({ kind: "session-complete", sessionTitle });
}

export function notifyWeekComplete(weekLabel?: string): void {
  notify({ kind: "week-complete", weekLabel });
}
