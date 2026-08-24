"use client";

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-button animate-shimmer ${className}`}
      style={{
        background: "linear-gradient(90deg, var(--bg-elevated) 25%, var(--bg-card) 50%, var(--bg-elevated) 75%)",
        backgroundSize: "200% 100%",
      }}
    />
  );
}

export function DashboardSkeleton() {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg-primary)" }}>
      {/* Header skeleton */}
      <div className="border-b" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="max-w-lg mx-auto px-5 pt-6 pb-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-40" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="w-10 h-10 rounded-button" />
              <Skeleton className="w-10 h-10 rounded-button" />
              <Skeleton className="w-8 h-8 rounded-full" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-card" />
            ))}
          </div>
          <Skeleton className="h-2.5 rounded-full" />
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <Skeleton key={i} className="flex-1 h-16 rounded-button" />
            ))}
          </div>
        </div>
      </div>
      {/* Content skeleton */}
      <div className="max-w-lg mx-auto px-5 mt-5 space-y-4">
        <Skeleton className="h-6 w-32" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40 rounded-card" />
        ))}
      </div>
    </div>
  );
}
