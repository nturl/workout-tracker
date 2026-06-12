"use client";

export function SyncIndicator({ status }: { status: "idle" | "syncing" | "error" }) {
  const colors = {
    idle: "#22c55e",
    syncing: "#f59e0b",
    error: "#ef4444",
  };

  const labels = {
    idle: "Synced",
    syncing: "Syncing...",
    error: "Sync failed",
  };

  return (
    <div className="flex items-center gap-1.5" title={labels[status]}>
      <div
        className="w-2 h-2 rounded-full transition-colors"
        style={{
          backgroundColor: colors[status],
          animation: status === "syncing" ? "pulse 1.5s infinite" : undefined,
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
