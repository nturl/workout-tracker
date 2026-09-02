"use client";

import type { SyncStatus } from "@/hooks/useSync";

export function SyncIndicator({ status }: { status: SyncStatus }) {
  const colors: Record<SyncStatus, string> = {
    idle: "var(--accent)",
    syncing: "var(--warning)",
    // BUG-20: a rate limit or a server blip clears itself. Only a permanent
    // rejection (bad payload, signed out) earns the danger colour and the
    // "Sync failed" text.
    delayed: "var(--warning)",
    error: "var(--danger)",
  };

  const labels: Record<SyncStatus, string> = {
    idle: "Synced",
    syncing: "Syncing...",
    delayed: "Sync delayed",
    error: "Sync failed",
  };

  return (
    <div className="flex items-center gap-1.5" title={labels[status]}>
      <div
        className="w-2 h-2 rounded-full transition-colors"
        style={{
          backgroundColor: colors[status],
          animation: status === "syncing" || status === "delayed" ? "pulse 1.5s infinite" : undefined,
        }}
      />
      {status === "error" && (
        <span className="text-[10px] font-medium" style={{ color: colors.error }}>
          Sync failed
        </span>
      )}
    </div>
  );
}
