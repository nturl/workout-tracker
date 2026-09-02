"use client";

import { useWorkoutStore } from "@/hooks/useWorkoutStore";
import type { RecoveryData } from "@/types/workout";

function downloadCSV(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportButton({ data }: { data: RecoveryData }) {
  const completions = useWorkoutStore((s) => s.completions);
  const logs = useWorkoutStore((s) => s.logs);

  const exportCSV = () => {
    // Recovery CSV
    const recoveryRows = Object.entries(data).sort(([a], [b]) => a.localeCompare(b));
    let csv = "Date,Recovery Score,HRV,RHR,Avg HR,Deep %,REM %,Light %,Sleep Score,Body Temp (C),Respiratory Rate,SpO2,Total Sleep,Efficiency,Latency\n";
    for (const [date, entry] of recoveryRows) {
      const score = entry.oura?.readinessScore ?? entry.eightSleep?.sleepFitnessScore ?? "";
      const hrv = entry.oura?.hrv ?? entry.eightSleep?.hrv ?? "";
      const rhr = entry.oura?.rhr ?? entry.eightSleep?.rhr ?? "";
      const avgHR = entry.oura?.averageHR ?? "";
      const deep = entry.oura?.deepSleepPct ?? entry.eightSleep?.deepSleepPct ?? "";
      const rem = entry.oura?.remSleepPct ?? entry.eightSleep?.remSleepPct ?? "";
      const light = entry.oura?.lightSleepPct ?? "";
      const sleep = entry.oura?.sleepScore ?? "";
      const bodyTemp = entry.oura?.bodyTemp ?? "";
      const respRate = entry.oura?.respiratoryRate ?? "";
      const spo2 = entry.oura?.spo2 ?? "";
      const totalSleep = entry.oura?.totalSleep ?? entry.eightSleep?.timeSlept ?? "";
      const efficiency = entry.oura?.efficiency ?? "";
      const latency = entry.oura?.latency ?? "";
      csv += `${date},${score},${hrv},${rhr},${avgHR},${deep},${rem},${light},${sleep},${bodyTemp},${respRate},${spo2},${totalSleep},${efficiency},${latency}\n`;
    }

    // Workouts CSV
    let workoutCsv = "Key,Completed,Feeling,Duration,Notes,Completed At\n";
    const allKeys = new Set([...Object.keys(completions), ...Object.keys(logs)]);
    for (const key of [...allKeys].sort()) {
      const completed = completions[key] ? "Yes" : "No";
      const log = logs[key];
      const feeling = log?.feeling || "";
      const duration = log?.duration || "";
      const notes = (log?.notes || "").replace(/,/g, ";").replace(/\n/g, " ").replace(/"/g, '""');
      const completedAt = log?.completedAt || "";
      workoutCsv += `${key},${completed},${feeling},${duration},"${notes}",${completedAt}\n`;
    }

    // Download both
    downloadCSV("recovery-data.csv", csv);
    downloadCSV("workout-data.csv", workoutCsv);
  };

  return (
    <div className="pt-2">
      <button onClick={exportCSV}
        className="w-full h-11 px-4 rounded-button bg-surface-elevated text-content-primary text-sm font-medium ring-1 ring-[var(--card-border)] transition-all hover:opacity-80 pressable">
        📥 Export All Data (CSV)
      </button>
    </div>
  );
}
