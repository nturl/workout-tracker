import { describe, it, expect } from "vitest";
import {
  splitPrescription,
  weeklyPlan,
  legacyWeeklyPlan,
  planForWeek,
  shiftDayNames,
  SCHEDULE_SHIFT_WEEK,
  superSlowExercises,
  superSlowRepProtocol,
  parseTimedExercise,
  parseTimedExercises,
  type WorkoutSession,
  type DayPlan,
} from "@/lib/workoutData";

// These helpers read the plan that ran through 2026-11-14 (lift Monday/Friday);
// the suites below pin its content by the day names it used. The plan in
// effect from 2026-11-15 is covered by the "schedule shift" suite at the end.
function findSession(day: string, title: string): WorkoutSession {
  const plan = legacyWeeklyPlan.find((d) => d.day === day);
  if (!plan) throw new Error(`Day not found: ${day}`);
  const session = plan.sessions.find((s) => s.title === title);
  if (!session) throw new Error(`Session not found: ${day} / ${title}`);
  return session;
}

function findDay(day: string): DayPlan {
  const plan = legacyWeeklyPlan.find((d) => d.day === day);
  if (!plan) throw new Error(`Day not found: ${day}`);
  return plan;
}

describe("workoutData - Super-Slow Strength shared exercises (P1)", () => {
  it("Monday and Friday Super-Slow Strength share the same beginner exercise array", () => {
    const monday = findSession("Monday", "Super-Slow Strength");
    const friday = findSession("Friday", "Super-Slow Strength");
    expect(monday.levels.beginner.exercises).toBe(superSlowExercises.beginner);
    expect(friday.levels.beginner.exercises).toBe(superSlowExercises.beginner);
  });

  it("Monday and Friday Super-Slow Strength share the same intermediate exercise array", () => {
    const monday = findSession("Monday", "Super-Slow Strength");
    const friday = findSession("Friday", "Super-Slow Strength");
    expect(monday.levels.intermediate.exercises).toBe(superSlowExercises.intermediate);
    expect(friday.levels.intermediate.exercises).toBe(superSlowExercises.intermediate);
  });

  it("Friday Super-Slow Strength has exercises at all three levels (regression: was missing intermediate/advanced)", () => {
    const friday = findSession("Friday", "Super-Slow Strength");
    expect(friday.levels.beginner.exercises?.length).toBeGreaterThan(0);
    expect(friday.levels.intermediate.exercises?.length).toBeGreaterThan(0);
    expect(friday.levels.advanced.exercises?.length).toBeGreaterThan(0);
  });

  it("superSlowExercises.beginner contains the six core lifts", () => {
    const names = superSlowExercises.beginner.map((e) => e.name);
    expect(names).toContain("Machine Chest Press");
    expect(names).toContain("Machine Pull-Down");
    expect(names).toContain("Machine Shoulder Press");
    expect(names).toContain("Machine Seated Row");
    expect(names).toContain("Leg Press");
    expect(names).toContain("Dead Lift");
  });
});

describe("workoutData - rep protocol (P2)", () => {
  it("superSlowRepProtocol matches Body by Science: 10s up, 10s down, 6 reps fallback to failure", () => {
    // 6 reps at 10/10 cadence = 120s, the slow-twitch TUT ceiling per McGuff.
    // Individual exercises override via Exercise.tutTargetSeconds (80/100/120).
    expect(superSlowRepProtocol.upSeconds).toBe(10);
    expect(superSlowRepProtocol.downSeconds).toBe(10);
    expect(superSlowRepProtocol.targetReps).toBe(6);
    expect(superSlowRepProtocol.toFailure).toBe(true);
  });

  it("super-slow exercises tag TUT targets for fast-twitch (80s) vs mixed (100s) vs slow-twitch (120s)", () => {
    const monday = findSession("Monday", "Super-Slow Strength");
    const byName = Object.fromEntries(
      (monday.levels.beginner.exercises || []).map((ex) => [ex.name, ex.tutTargetSeconds])
    );
    expect(byName["Machine Chest Press"]).toBe(80);
    expect(byName["Machine Shoulder Press"]).toBe(80);
    expect(byName["Machine Pull-Down"]).toBe(100);
    expect(byName["Machine Seated Row"]).toBe(100);
    expect(byName["Leg Press"]).toBe(120);
    expect(byName["Dead Lift"]).toBe(120);
  });

  it("Monday Super-Slow Strength has the rep protocol attached", () => {
    const monday = findSession("Monday", "Super-Slow Strength");
    expect(monday.repProtocol).toBe(superSlowRepProtocol);
    expect(monday.protocolType).toBe("strength");
  });

  it("Friday Super-Slow Strength has the rep protocol attached", () => {
    const friday = findSession("Friday", "Super-Slow Strength");
    expect(friday.repProtocol).toBe(superSlowRepProtocol);
    expect(friday.protocolType).toBe("strength");
  });
});

describe("workoutData - Tabata session (P6)", () => {
  it("Thursday and Saturday have a Tabata session", () => {
    const thursday = findSession("Thursday", "Tabata");
    const saturday = findSession("Saturday", "Tabata");
    expect(thursday.protocolType).toBe("hiit");
    expect(saturday.protocolType).toBe("hiit");
  });

  it("Tabata is a single 4-min block at every level", () => {
    const tabata = findSession("Thursday", "Tabata");
    expect(tabata.levels.beginner.duration).toMatch(/4 min/);
    expect(tabata.levels.intermediate.duration).toMatch(/4 min/);
    expect(tabata.levels.advanced.duration).toMatch(/4 min/);
  });

  it("Tabata is NOT scheduled on Monday or Friday (concurrent training rule)", () => {
    const monday = findDay("Monday");
    const friday = findDay("Friday");
    expect(monday.sessions.find((s) => s.title === "Tabata")).toBeUndefined();
    expect(friday.sessions.find((s) => s.title === "Tabata")).toBeUndefined();
  });
});

describe("workoutData - parseTimedExercise (V23)", () => {
  it("parses Tabata-style 'N rounds × Xs/Ys' into multi-round work+rest", () => {
    const parsed = parseTimedExercise({ name: "Block 1: 8 rounds × 20s/10s" }, 0);
    expect(parsed).not.toBeNull();
    expect(parsed!.circuit).toMatchObject({
      name: "Block 1: 8 rounds × 20s/10s",
      workSeconds: 20,
      restSeconds: 10,
      rounds: 8,
      restOnly: false,
    });
  });

  it("flags 'Rest (1 min)' as restOnly so the timer renders it as the rest phase", () => {
    const parsed = parseTimedExercise({ name: "Rest (1 min)" }, 1);
    expect(parsed).not.toBeNull();
    expect(parsed!.circuit).toMatchObject({
      name: "Rest",
      workSeconds: 60,
      restOnly: true,
    });
    expect(parsed!.circuit.restSeconds).toBe(60);
  });

  it("parses '(30s)' as a single-round work phase with default rest", () => {
    const parsed = parseTimedExercise({ name: "Jumping Jacks (30s)" }, 0);
    expect(parsed).not.toBeNull();
    expect(parsed!.circuit).toMatchObject({
      name: "Jumping Jacks",
      workSeconds: 30,
      restSeconds: 10,
      rounds: 1,
      restOnly: false,
    });
  });

  it("derives bilateral from notes matching 'each side'", () => {
    const parsed = parseTimedExercise(
      { name: "Side Plank (30s)", notes: "15s each side, hips high" },
      0
    );
    expect(parsed!.circuit.bilateral).toBe(true);
  });

  it("returns null for untimed exercises", () => {
    expect(parseTimedExercise({ name: "Burpees until failure" }, 0)).toBeNull();
  });

  it("parses VO2 Max Norwegian 4x4 'N rounds × X min/Y min' into multi-round work+rest", () => {
    const parsed = parseTimedExercise({ name: "4 rounds × 4 min/4 min" }, 0);
    expect(parsed).not.toBeNull();
    expect(parsed!.circuit).toMatchObject({
      name: "4 rounds × 4 min/4 min",
      workSeconds: 240,
      restSeconds: 240,
      rounds: 4,
      restOnly: false,
    });
  });

  it("parses mixed-unit Tabata 'N rounds × X min/Ys' (work in min, rest in sec)", () => {
    const parsed = parseTimedExercise({ name: "3 rounds × 1 min/30s" }, 0);
    expect(parsed).not.toBeNull();
    expect(parsed!.circuit).toMatchObject({
      workSeconds: 60,
      restSeconds: 30,
      rounds: 3,
    });
  });

  it("flags 'Round N: Recovery (4 min)' as restOnly so it renders as rest, not GO!", () => {
    const parsed = parseTimedExercise({ name: "Round 1: Recovery (4 min)" }, 1);
    expect(parsed).not.toBeNull();
    expect(parsed!.circuit).toMatchObject({
      name: "Round 1: Recovery",
      restOnly: true,
      restSeconds: 240,
    });
  });
});

describe("workoutData - PT shoulder rehab (PT Session 1, 2026-10-14)", () => {
  it("is scheduled every day of the week", () => {
    for (const day of weeklyPlan) {
      expect(
        day.sessions.find((s) => s.title === "PT Shoulder Rehab"),
        `${day.day} should include PT Shoulder Rehab`
      ).toBeDefined();
    }
  });

  it("prescribes the identical protocol at every level (PT homework does not scale)", () => {
    const pt = weeklyPlan[0].sessions.find((s) => s.title === "PT Shoulder Rehab")!;
    expect(pt.levels.intermediate).toBe(pt.levels.beginner);
    expect(pt.levels.advanced).toBe(pt.levels.beginner);
  });

  it("parses into a 12-station timed circuit where every station runs its prescribed sets", () => {
    const pt = weeklyPlan[0].sessions.find((s) => s.title === "PT Shoulder Rehab")!;
    const exercises = pt.levels.beginner.exercises!;
    const parsed = parseTimedExercises(exercises);
    // Every exercise is timed - nothing silently drops out of the timer.
    expect(parsed).toHaveLength(exercises.length);
    expect(parsed).toHaveLength(12);
    expect(parsed.every((p) => !p.circuit.restOnly)).toBe(true);
    // Left/right are separate stations, so no halfway switch cue.
    expect(parsed.every((p) => !p.circuit.bilateral)).toBe(true);
    // Upper trap stretch: 3 sets of 30s holds.
    expect(parsed[0].circuit).toMatchObject({ rounds: 3, workSeconds: 30, restSeconds: 15 });
    // 90/90 ER walk out: 2 sets of 10 reps.
    expect(parsed[3].circuit).toMatchObject({ rounds: 2, workSeconds: 45, restSeconds: 15 });
    // Whole session lands near the stated ~25 minutes.
    const total = parsed.reduce((t, p) => t + p.circuit.rounds! * (p.circuit.workSeconds + p.circuit.restSeconds), 0);
    expect(total).toBe(1515);
  });
});

describe("workoutData - parseTimedExercises (mitochondrial sequencing)", () => {
  const mito = [
    { name: "Round 1: All-out (30-60s)", notes: "Max effort." },
    { name: "Round 1: Recovery (4 min)", notes: "Easy active recovery." },
    { name: "Round 2: All-out (30-60s)", notes: "Match round 1." },
    { name: "Round 2: Recovery (4 min)", notes: "Easy pace." },
  ];

  it("drops the phantom 10s rest from a sprint followed by an explicit recovery row", () => {
    const parsed = parseTimedExercises(mito);
    expect(parsed).toHaveLength(4);
    // Sprint flows straight into the 4-min recovery: no default rest.
    expect(parsed[0].circuit).toMatchObject({ workSeconds: 30, restSeconds: 0, restOnly: false });
    expect(parsed[1].circuit).toMatchObject({ restOnly: true, restSeconds: 240 });
    expect(parsed[2].circuit.restSeconds).toBe(0);
  });

  it("keeps originalIndex mapping for checklist slug lookups", () => {
    const withUntimed = [{ name: "Warm-up walk" }, ...mito];
    const parsed = parseTimedExercises(withUntimed);
    expect(parsed[0].originalIndex).toBe(1);
    expect(parsed[3].originalIndex).toBe(4);
  });

  it("keeps the default 10s transition rest inside back-to-back work circuits", () => {
    const circuit = [
      { name: "Jumping Jacks (30s)" },
      { name: "Wall Sit (30s)" },
    ];
    const parsed = parseTimedExercises(circuit);
    expect(parsed[0].circuit.restSeconds).toBe(10);
  });

  it("keeps a Tabata block's inner rest when followed by a restOnly block", () => {
    const tabata = [
      { name: "Block 1: 8 rounds × 20s/10s" },
      { name: "Rest (1 min)" },
      { name: "Block 2: 8 rounds × 20s/10s" },
    ];
    const parsed = parseTimedExercises(tabata);
    // 20s/10s cycling is the protocol itself - must survive the pass.
    expect(parsed[0].circuit.restSeconds).toBe(10);
    expect(parsed[1].circuit.restOnly).toBe(true);
  });
});

describe("workoutData - programming notes (P6)", () => {
  it("Monday avoids HIIT/Tabata to protect strength adaptations", () => {
    const monday = findDay("Monday");
    expect(monday.programmingNotes).toBeDefined();
    const avoid = monday.programmingNotes!.avoidOnThisDay.join(" ").toLowerCase();
    expect(avoid).toMatch(/tabata|hiit/);
  });

  it("Friday avoids HIIT/Tabata for the same reason as Monday", () => {
    const friday = findDay("Friday");
    expect(friday.programmingNotes).toBeDefined();
    const avoid = friday.programmingNotes!.avoidOnThisDay.join(" ").toLowerCase();
    expect(avoid).toMatch(/tabata|hiit/);
  });

  it("Thursday is the recommended day for Tabata", () => {
    const thursday = findDay("Thursday");
    expect(thursday.programmingNotes).toBeDefined();
    const doList = thursday.programmingNotes!.doOnThisDay.join(" ").toLowerCase();
    expect(doList).toMatch(/tabata/);
  });

  it("every day has programming notes with reasoning", () => {
    for (const day of weeklyPlan) {
      expect(day.programmingNotes, `${day.day} should have programming notes`).toBeDefined();
      expect(day.programmingNotes!.reasoning.length).toBeGreaterThan(20);
    }
  });
});

describe("workoutData - exercise demo stills", () => {
  it("every image an exercise names exists on disk and fits the route's name pattern", async () => {
    const { existsSync } = await import("fs");
    const path = await import("path");
    const names = weeklyPlan.flatMap((d) => d.sessions.flatMap((s) =>
      Object.values(s.levels).flatMap((l) => (l.exercises ?? []).map((e) => e.image).filter(Boolean))));
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) {
      expect(n).toMatch(/^[a-z0-9-]+$/);
      expect(existsSync(path.join(process.cwd(), "src/assets/exercises", `${n}.jpg`)), n).toBe(true);
    }
  });
});

describe("workoutData - splitPrescription", () => {
  it("splits 'Name: N rounds × Xs/Ys' into a title and a set chip", () => {
    expect(splitPrescription("Foam Roller Pec Stretch: 3 rounds × 30s/15s")).toEqual({ title: "Foam Roller Pec Stretch", chip: "3 × 30s" });
    expect(splitPrescription("Recovery: 4 rounds × 4 min/4 min")).toEqual({ title: "Recovery", chip: "4 × 4min" });
  });

  it("leaves names without a ': N rounds' suffix whole", () => {
    expect(splitPrescription("8 rounds × 20s/10s")).toEqual({ title: "8 rounds × 20s/10s", chip: null });
    expect(splitPrescription("Wall Sit (30s)")).toEqual({ title: "Wall Sit (30s)", chip: null });
  });
});

describe("workoutData - schedule shift effective 2026-11-15", () => {
  const titles = (plan: DayPlan[], day: string) => plan.find((d) => d.day === day)!.sessions.map((s) => s.title);
  const headline = (day: string) => titles(weeklyPlan, day).filter((t) => t !== "Egoscue E-cises" && t !== "PT Shoulder Rehab");

  it("puts each day's training one day earlier", () => {
    expect(headline("Sunday")).toEqual(["Super-Slow Strength"]);
    expect(headline("Monday")).toEqual(["Functional Fitness", "Mitochondrial Training"]);
    expect(headline("Tuesday")).toEqual(["Morning Detox Session", "Brain Training"]);
    expect(headline("Wednesday")).toEqual(["VO2 Max Training", "Tabata", "Hot and Cold"]);
    expect(headline("Thursday")).toEqual(["Super-Slow Strength"]);
    expect(headline("Friday")).toEqual(["Adventure of Choice", "Tabata"]);
    expect(headline("Saturday")).toEqual(["Social Sport", "Brain Training"]);
  });

  it("Thursday repeats Sunday's lifts", () => {
    const lift = (day: string) => weeklyPlan.find((d) => d.day === day)!.sessions.find((s) => s.title === "Super-Slow Strength")!;
    for (const level of ["beginner", "intermediate", "advanced"] as const) {
      expect(lift("Thursday").levels[level].exercises).toBe(lift("Sunday").levels[level].exercises);
    }
    expect(lift("Thursday").levels.beginner.instructions).toContain("Same exercises as Sunday");
  });

  it("Sunday trains 5:00-5:45 PM ET, Monday-Thursday 7:45-8:30 AM ET; Friday and Saturday have no set time", () => {
    for (const day of ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"]) {
      const plan = weeklyPlan.find((d) => d.day === day)!;
      expect(plan.time, day).toBe(day === "Sunday" ? "5:00-5:45 PM ET" : "7:45-8:30 AM ET");
      for (const s of plan.sessions) expect(s.timeOfDay, `${day} / ${s.title}`).not.toMatch(/afternoon|evening|^Any time$/i);
    }
    const mainTime = (day: string, title: string) => weeklyPlan.find((d) => d.day === day)!.sessions.find((s) => s.title === title)!.timeOfDay;
    expect(mainTime("Sunday", "Super-Slow Strength")).toBe("5:00-5:45 PM");
    expect(mainTime("Monday", "Functional Fitness")).toBe("7:45-8:30 AM");
    expect(mainTime("Tuesday", "Morning Detox Session")).toBe("7:45-8:30 AM (or Wednesday if unavailable)");
    expect(mainTime("Wednesday", "Tabata")).toBe("7:45-8:30 AM");
    expect(mainTime("Wednesday", "Hot and Cold")).toBe("7:45-8:30 AM");
    expect(mainTime("Thursday", "Super-Slow Strength")).toBe("7:45-8:30 AM");
    for (const day of ["Friday", "Saturday"]) {
      const plan = weeklyPlan.find((d) => d.day === day)!;
      expect(plan.time).toBe("No set time");
      for (const s of plan.sessions) expect(s.timeOfDay).not.toMatch(/7:45|5:00/);
    }
  });

  it("carries every session's workout detail over unchanged", () => {
    const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    for (const legacyDay of legacyWeeklyPlan) {
      const newDay = weeklyPlan.find((d) => d.day === DAYS[(DAYS.indexOf(legacyDay.day) + 6) % 7])!;
      expect(newDay.theme).toBe(legacyDay.theme);
      expect(newDay.sessions.map((s) => s.title)).toEqual(legacyDay.sessions.map((s) => s.title));
      legacyDay.sessions.forEach((legacy, i) => {
        // Identical, time of day aside, once the weekday names in the legacy copy are moved back a day
        // (and the evening-timing key point, which the morning block makes false, is dropped).
        const legacyJson = JSON.stringify({ ...legacy, timeOfDay: "" }).replace('"Ideally done late afternoon or early evening, 3+ hours before bed",', "");
        expect(JSON.stringify({ ...newDay.sessions[i], timeOfDay: "" })).toBe(shiftDayNames(legacyJson));
      });
    }
  });

  it("drops timing and spacing claims the new week makes false", () => {
    const text = (plan: DayPlan[]) => JSON.stringify(plan);
    expect(text(weeklyPlan)).not.toMatch(/3\+ hours before bed|48hrs before|hard cardio days are spaced/);
    // The frozen plan keeps them.
    expect(text(legacyWeeklyPlan)).toMatch(/3\+ hours before bed/);
    expect(text(legacyWeeklyPlan)).toMatch(/48hrs before Friday's strength session/);
    expect(text(legacyWeeklyPlan)).toMatch(/hard cardio days are spaced/);
    // The rest of each note survives.
    expect(weeklyPlan.find((d) => d.day === "Wednesday")!.programmingNotes!.reasoning).toMatch(/48hrs from Monday's Mitochondrial work\.$/);
  });

  it("history before 2026-11-15 keeps the old plan; that week onward uses the new one", () => {
    expect(SCHEDULE_SHIFT_WEEK).toBe("2026-11-15");
    expect(planForWeek("2026-11-08")).toBe(legacyWeeklyPlan);
    expect(planForWeek("2026-11-15")).toBe(weeklyPlan);
    expect(planForWeek("2026-11-22")).toBe(weeklyPlan);
    expect(titles(planForWeek("2026-11-08"), "Monday")).toContain("Super-Slow Strength");
    expect(titles(planForWeek("2026-11-08"), "Sunday")).not.toContain("Super-Slow Strength");
    // The frozen plan still says what it always said.
    expect(legacyWeeklyPlan.find((d) => d.day === "Friday")!.focus).toContain("Monday's lifts");
  });
});
