"use client";

import { useState, useEffect } from "react";
import { calculateSunTimes, formatSunTime, getWorkoutTimeRec } from "@/lib/sun";

export function SunBanner() {
  const [sunTimes, setSunTimes] = useState<ReturnType<typeof calculateSunTimes> | null>(null);
  const [timeRec, setTimeRec] = useState<ReturnType<typeof getWorkoutTimeRec> | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const times = calculateSunTimes(pos.coords.latitude, pos.coords.longitude);
        setSunTimes(times);
        setTimeRec(getWorkoutTimeRec(times));
      },
      () => {
        // Fallback to NYC if geolocation denied
        const times = calculateSunTimes(40.7128, -74.006);
        setSunTimes(times);
        setTimeRec(getWorkoutTimeRec(times));
      },
      { timeout: 5000 }
    );
  }, []);

  if (!sunTimes || !timeRec) return null;

  const now = new Date();
  const totalDay = sunTimes.sunset.getTime() - sunTimes.sunrise.getTime();
  const elapsed = Math.max(0, now.getTime() - sunTimes.sunrise.getTime());
  const pct = Math.min(100, (elapsed / totalDay) * 100);

  return (
    <div className="rounded-card p-4 bg-surface-elevated anim-fade-up">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{timeRec.icon}</span>
          <div>
            <p className="text-[15px] leading-[22px] font-semibold text-content-primary">{timeRec.label}</p>
            <p className="text-xs font-medium leading-4 text-content-muted">{timeRec.detail}</p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-2">
        <span className="text-xs font-medium leading-4 tabular-nums text-content-muted">
          🌅 {formatSunTime(sunTimes.sunrise)}
        </span>
        <div className="flex-1 h-1.5 rounded-full overflow-hidden relative bg-surface-base">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${pct}%`,
              background: pct > 80
                ? "linear-gradient(90deg, #fbbf24, #f97316)"
                : "linear-gradient(90deg, #fbbf24, #60a5fa)",
            }}
          />
        </div>
        <span className="text-xs font-medium leading-4 tabular-nums text-content-muted">
          🌇 {formatSunTime(sunTimes.sunset)}
        </span>
      </div>
    </div>
  );
}
