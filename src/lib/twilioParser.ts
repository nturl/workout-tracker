// ── Eight Sleep SMS Parser ──────────────────────────────────────────
// Parses metrics from Eight Sleep daily text messages.
// Example formats:
//   "Your Sleep Fitness Score is 86."
//   "You slept 8h 21m"
//   "Deep sleep: 14%"
//   "REM sleep: 35%"
//   "RHR: 61 bpm"
//   "HRV: 36 ms"

export interface ParsedEightSleepData {
  sleepFitnessScore?: number;
  timeSlept?: string;
  deepSleep?: string;
  deepSleepPct?: number;
  remSleep?: string;
  remSleepPct?: number;
  rhr?: number;
  hrv?: number;
}

export function parseEightSleepSMS(body: string): ParsedEightSleepData | null {
  const text = body.toLowerCase();

  // Check if this looks like an Eight Sleep message
  if (!text.includes("sleep") && !text.includes("hrv") && !text.includes("rhr")) {
    return null;
  }

  const data: ParsedEightSleepData = {};
  let matched = false;

  // Sleep Fitness Score - various formats
  const scoreMatch = text.match(/(?:sleep\s*fitness\s*score|sleep\s*score|fitness\s*score)[:\s]*(?:is\s*)?(\d+)/i);
  if (scoreMatch) { data.sleepFitnessScore = parseInt(scoreMatch[1]); matched = true; }

  // Also try just a standalone score pattern like "Score: 86" or "86/100"
  if (!data.sleepFitnessScore) {
    const altScore = text.match(/score[:\s]+(\d+)/i);
    if (altScore) { data.sleepFitnessScore = parseInt(altScore[1]); matched = true; }
  }

  // Time slept - "8h 21m", "8 hours 21 minutes", "8:21"
  const timeMatch = text.match(/(?:slept|total\s*sleep|time\s*slept)[:\s]*(\d+)\s*h(?:ours?)?\s*(\d+)\s*m/i)
    || text.match(/(?:slept|total\s*sleep)[:\s]*(\d+):(\d+)/i);
  if (timeMatch) { data.timeSlept = `${timeMatch[1]}h ${timeMatch[2]}m`; matched = true; }

  // Deep sleep - duration and percentage (handles "Deep sleep: 1h 16m (18%)" and "Deep sleep: 18%")
  const deepDurMatch = text.match(/deep\s*sleep[:\s]*(\d+)\s*h\s*(\d+)\s*m/i);
  if (deepDurMatch) { data.deepSleep = `${deepDurMatch[1]}h ${deepDurMatch[2]}m`; matched = true; }
  const deepMatch = text.match(/deep\s*sleep[:\s]*(\d+)\s*%/i)
    || text.match(/deep\s*sleep[:\s]*\d+h?\s*\d+m?\s*\((\d+)%\)/i);
  if (deepMatch) { data.deepSleepPct = parseInt(deepMatch[1]); matched = true; }

  // REM sleep - duration and percentage (handles "REM sleep: 2h 22m (34%)" and "REM sleep: 34%")
  const remDurMatch = text.match(/rem\s*sleep[:\s]*(\d+)\s*h\s*(\d+)\s*m/i);
  if (remDurMatch) { data.remSleep = `${remDurMatch[1]}h ${remDurMatch[2]}m`; matched = true; }
  const remMatch = text.match(/rem\s*sleep[:\s]*(\d+)\s*%/i)
    || text.match(/rem\s*sleep[:\s]*\d+h?\s*\d+m?\s*\((\d+)%\)/i);
  if (remMatch) { data.remSleepPct = parseInt(remMatch[1]); matched = true; }

  // RHR
  const rhrMatch = text.match(/rhr[:\s]*(\d+)/i)
    || text.match(/resting\s*heart\s*rate[:\s]*(\d+)/i);
  if (rhrMatch) { data.rhr = parseInt(rhrMatch[1]); matched = true; }

  // HRV
  const hrvMatch = text.match(/hrv[:\s]*(\d+)/i)
    || text.match(/heart\s*rate\s*variability[:\s]*(\d+)/i);
  if (hrvMatch) { data.hrv = parseInt(hrvMatch[1]); matched = true; }

  return matched ? data : null;
}

// ── "DONE" Command Parser ──────────────────────────────────────────
// Detects if the SMS is a workout completion command

export interface ParsedWorkoutDone {
  type: "done";
  dayName?: string; // Optional: "Monday", "Tuesday", etc.
  notes?: string;
}

export function parseWorkoutDone(body: string): ParsedWorkoutDone | null {
  const text = body.trim().toLowerCase();

  // Match "DONE", "done", "DONE Monday", "done - felt great", etc.
  if (!text.startsWith("done")) return null;

  const result: ParsedWorkoutDone = { type: "done" };

  // Check for day name
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  for (const day of days) {
    if (text.includes(day)) {
      result.dayName = day.charAt(0).toUpperCase() + day.slice(1);
      break;
    }
  }

  // Everything after "done" (minus the day) is notes
  let notes = text.replace(/^done\s*/i, "").trim();
  for (const day of days) {
    notes = notes.replace(new RegExp(day, "i"), "").trim();
  }
  // Remove leading dashes/colons
  notes = notes.replace(/^[-:]\s*/, "").trim();
  if (notes) result.notes = notes;

  return result;
}
