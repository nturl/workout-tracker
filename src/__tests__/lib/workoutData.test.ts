import { describe, it, expect } from "vitest";
import {
  weeklyPlan,
  superSlowExercises,
  superSlowRepProtocol,
  parseTimedExercise,
  parseTimedExercises,
  type WorkoutSession,
  type DayPlan,
} from "@/lib/workoutData";

function findSession(day: string, title: string): WorkoutSession {
  const plan = weeklyPlan.find((d) => d.day === day);
  if (!plan) throw new Error(`Day not found: ${day}`);
  const session = plan.sessions.find((s) => s.title === title);
  if (!session) throw new Error(`Session not found: ${day} / ${title}`);
  return session;
}

function findDay(day: string): DayPlan {
  const plan = weeklyPlan.find((d) => d.day === day);
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

describe("workoutData - PT shoulder rehab (V30, HEP2go 52JD3S2)", () => {
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

  it("parses into a 6-station timed circuit: bilateral thread-the-needle, 2-set ER 90/90", () => {
    const pt = weeklyPlan[0].sessions.find((s) => s.title === "PT Shoulder Rehab")!;
    const parsed = parseTimedExercises(pt.levels.beginner.exercises!);
    expect(parsed).toHaveLength(6);
    // Every station is work, none parse as rest blocks.
    expect(parsed.every((p) => !p.circuit.restOnly)).toBe(true);
    // Thread the Needle alternates sides - halfway switch cue.
    expect(parsed[1].circuit.bilateral).toBe(true);
    // ER 90/90 is prescribed as 2 sets of 10: a 2-round block with set rest.
    expect(parsed[3].circuit).toMatchObject({ rounds: 2, workSeconds: 45, restSeconds: 15 });
    // Sub-60s stations keep the 10s transition for band/roller setup.
    expect(parsed[0].circuit.restSeconds).toBe(10);
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
