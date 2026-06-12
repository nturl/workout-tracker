export type Level = "beginner" | "intermediate" | "advanced";

export interface Exercise {
  name: string;
  alternatives?: string[];
  notes?: string;
  equipment?: string[];
  // Per-exercise time-under-tension target for super-slow strength.
  // Body by Science: 60-90s for fast-twitch-dominant muscles (upper-body push),
  // 90-120s for slow-twitch-dominant (legs, back, posterior chain).
  // When set, the RepTimer derives targetReps = round(tutTargetSeconds / (up+down)).
  tutTargetSeconds?: number;
}

export interface LevelDetail {
  warmup?: string;
  instructions: string;
  exercises?: Exercise[];
  duration?: string;
  keyPoints?: string[];
}

export interface RepProtocol {
  upSeconds: number;
  downSeconds: number;
  targetReps: number;
  toFailure: boolean;
}

// Timer spec derived from an exercise name. `rounds > 1` means Tabata-style
// multi-round work/rest cycling before advancing. `restOnly` means the
// exercise renders as the rest phase directly (e.g. "Rest (1 min)" between
// Tabata blocks) rather than as a work phase labeled "GO!".
export interface CircuitExercise {
  name: string;
  workSeconds: number;
  restSeconds: number;
  bilateral?: boolean;
  rounds?: number;
  restOnly?: boolean;
}

export interface ParsedTimedExercise {
  circuit: CircuitExercise;
  originalIndex: number;
}

// Parse a single exercise entry into a CircuitExercise if it encodes a timer
// spec. Three patterns, in priority order:
//   1. Tabata-style block: "N rounds × Xs/Ys" or "N rounds × X min/Y min"
//   2. Duration in parens: "(X s)" or "(X min)"
//   3. Nothing -> not a timed exercise
// A name starting with "Rest" maps to restOnly, which renders as the between-
// block rest phase (amber) instead of the work phase (green "GO!").
export function parseTimedExercise(ex: Exercise, index: number): ParsedTimedExercise | null {
  // Tabata regex accepts s/sec/min units independently for work and rest, so
  // VO2 Max ("4 rounds × 4 min/4 min") and Tabata ("8 rounds × 20s/10s") share
  // the same path.
  const tabata = ex.name.match(
    /(\d+)\s*rounds?\s*[×x*]\s*(\d+)\s*(s(?:ec)?|min)\s*[/∕]\s*(\d+)\s*(s(?:ec)?|min)/i
  );
  const parenSec = ex.name.match(/\((\d+)(?:-\d+)?\s*s(?:ec)?\b/);
  const parenMin = ex.name.match(/\((\d+)(?:-\d+)?\s*min\b/);
  if (!tabata && !parenSec && !parenMin) return null;

  let workSeconds: number;
  let restSeconds: number;
  let rounds = 1;
  let cleanName = ex.name;

  if (tabata) {
    const toSeconds = (n: string, unit: string) =>
      /^min/i.test(unit) ? parseInt(n) * 60 : parseInt(n);
    rounds = parseInt(tabata[1]);
    workSeconds = toSeconds(tabata[2], tabata[3]);
    restSeconds = toSeconds(tabata[4], tabata[5]);
  } else {
    workSeconds = parenSec ? parseInt(parenSec[1]) : parseInt(parenMin![1]) * 60;
    restSeconds = workSeconds >= 60 ? 0 : 10;
    cleanName = ex.name.replace(/\s*\(\d+(?:-\d+)?\s*(?:s|sec|min)\b[^)]*\)/, "").trim();
  }

  const bilateral = !!(ex.notes && /each side/i.test(ex.notes));
  // "Rest (1 min)" and "Round 2: Recovery (4 min)" are both rest blocks: the
  // timer renders them as the amber rest phase, never as work.
  const restOnly = /^rest\b|\brecovery\b/i.test(cleanName.trim());

  return {
    originalIndex: index,
    circuit: {
      name: cleanName,
      workSeconds,
      restSeconds: restOnly ? workSeconds : restSeconds,
      rounds,
      bilateral,
      restOnly,
    },
  };
}

// Parse a session's full exercise list into timer specs. After the
// per-exercise pass, drop the default trailing rest from any single-round
// work phase that is immediately followed by a restOnly block - the explicit
// recovery row IS the rest (Mitochondrial: "All-out (30-60s)" must flow
// straight into "Recovery (4 min)" with no 10s filler between). Multi-round
// blocks keep their inner rest; it is part of the protocol (Tabata 20s/10s).
export function parseTimedExercises(exercises: Exercise[]): ParsedTimedExercise[] {
  const parsed = exercises
    .map(parseTimedExercise)
    .filter((x): x is ParsedTimedExercise => x !== null);
  for (let i = 0; i < parsed.length - 1; i++) {
    const cur = parsed[i].circuit;
    if (!cur.restOnly && (cur.rounds ?? 1) <= 1 && parsed[i + 1].circuit.restOnly) {
      cur.restSeconds = 0;
    }
  }
  return parsed;
}

export type ProtocolType = "strength" | "hiit" | "vo2max" | "recovery" | "skill";

export interface WorkoutSession {
  title: string;
  subtitle?: string;
  category: "strength" | "cardio" | "recovery" | "flexibility" | "posture" | "meditation" | "adventure" | "social" | "brain";
  timeOfDay: string;
  icon: string;
  repProtocol?: RepProtocol;
  protocolType?: ProtocolType;
  // When true, session is only scheduled on alternating weeks. See isBiWeeklyOn() in helpers.ts.
  isBiWeekly?: boolean;
  levels: {
    beginner: LevelDetail;
    intermediate: LevelDetail;
    advanced: LevelDetail;
  };
}

export interface ProgrammingNotes {
  doOnThisDay: string[];
  avoidOnThisDay: string[];
  reasoning: string;
}

export interface DayPlan {
  day: string;
  theme: string;
  focus: string;
  programmingNotes?: ProgrammingNotes;
  sessions: WorkoutSession[];
}

// ── Super-Slow Strength shared exercises ─────────────────────────
// Monday and Friday reference the same arrays so they cannot drift.

const superSlowBeginnerExercises: Exercise[] = [
  {
    name: "Machine Chest Press",
    notes: "Upper-body horizontal push",
    alternatives: ["Dumbbell chest press", "Push-up", "Other horizontal pushing variation"],
    tutTargetSeconds: 80,
  },
  {
    name: "Machine Pull-Down",
    notes: "Upper-body vertical pull",
    alternatives: ["Pull-up", "Assisted pull-up", "Other vertical pulling variation"],
    tutTargetSeconds: 100,
  },
  {
    name: "Machine Shoulder Press",
    notes: "Upper-body vertical push",
    alternatives: ["Dumbbell shoulder press", "Handstand push-up", "Other vertical pushing variation"],
    tutTargetSeconds: 80,
  },
  {
    name: "Machine Seated Row",
    notes: "Upper-body horizontal pull",
    alternatives: ["Cable row", "Bent-over dumbbell row", "Other horizontal pulling variation"],
    tutTargetSeconds: 100,
  },
  {
    name: "Leg Press",
    notes: "Lower-body push",
    alternatives: ["Squat", "Goblet squat", "Dumbbell squat", "Other squatting or lunging variation"],
    tutTargetSeconds: 120,
  },
  {
    name: "Dead Lift",
    notes: "Lower-body pull",
    alternatives: ["Romanian dead lift", "Lower back extension", "Reverse hyperextension"],
    tutTargetSeconds: 120,
  },
];

const superSlowAdvancedExercises: Exercise[] = [
  { name: "Upper-Body Push", alternatives: ["Overhead press", "Push-ups", "Chest press"], tutTargetSeconds: 80 },
  { name: "Upper-Body Pull", alternatives: ["Bent or upright rows", "Lat pull-downs", "Pull-ups"], tutTargetSeconds: 100 },
  { name: "Lower-Body Push", alternatives: ["Leg press", "Squats"], tutTargetSeconds: 120 },
  { name: "Lower-Body Pull", alternatives: ["Dead lifts", "Romanian dead lifts", "Reverse hyperextensions"], tutTargetSeconds: 120 },
];

export const superSlowExercises = {
  beginner: superSlowBeginnerExercises,
  intermediate: superSlowBeginnerExercises, // Intermediate uses the same exercises as beginner with different technique
  advanced: superSlowAdvancedExercises,
};

// Body by Science protocol: 10s up, 10s down cadence.
// TUT target is set per-exercise via Exercise.tutTargetSeconds (60-90s fast-twitch,
// 90-120s slow-twitch). This session-level targetReps is the fallback when an
// exercise has no explicit target; 6 reps = 120s covers the slow-twitch ceiling.
export const superSlowRepProtocol: RepProtocol = {
  upSeconds: 10,
  downSeconds: 10,
  targetReps: 6,
  toFailure: true,
};

// ── Egoscue Postural Therapy ──────────────────────────────────────
// Daily corrective exercise routine for alignment and pain-free movement.

const egoscueSession: WorkoutSession = {
  title: "Egoscue E-cises",
  subtitle: "Postural Alignment Therapy",
  category: "posture",
  icon: "🧍",
  timeOfDay: "Morning (before other activities)",
  levels: {
    beginner: {
      instructions:
        "Perform each e-cise in order, holding static positions for the full duration. Focus on letting gravity do the work — don't force your body into position. Breathe deeply and relax into each hold.",
      duration: "15–20 minutes",
      exercises: [
        { name: "Static Back (5–10 min)", notes: "Lie on floor, calves on chair at 90°. Arms at 45° palms up. Let lower back settle into floor." },
        { name: "Static Wall (3 min)", notes: "Lie on floor, legs straight up wall. Feet hip-width, toes pulled back. Tighten thighs, hold." },
        { name: "Standing Arm Circles (2×20 each)", notes: "Stand against wall, arms at shoulder height with fists. Circle forward 20, backward 20. Repeat." },
        { name: "Standing Elbow Curls (2×15)", notes: "Fingertips on temples, bring elbows together in front then pull back. Squeeze shoulder blades." },
        { name: "Gravity Drop (3×1 min)", notes: "Stand on step, balls of feet on edge. Let heels drop, relax. Hold 1 min, step off, repeat." },
      ],
    },
    intermediate: {
      instructions:
        "Complete the beginner routine plus these additional e-cises. Focus on symmetry — notice differences between left and right sides. Hold positions longer for deeper correction.",
      duration: "25–35 minutes",
      exercises: [
        { name: "Static Back (5–10 min)", notes: "Lie on floor, calves on chair at 90°. Arms at 45° palms up. Let lower back settle." },
        { name: "Static Wall (5 min)", notes: "Legs up wall, tighten thighs, flex feet back. Hold longer for deeper hip release." },
        { name: "Supine Groin Progressive (10–15 min per side)", notes: "Lie on floor, one leg on chair, other leg straight on a step ladder progressively lowered. Let hip settle." },
        { name: "Air Bench (2–3 min)", notes: "Back flat against wall, slide down to 90° at knees. Feet hip-width, weight in heels." },
        { name: "Standing Arm Circles (3×25 each)", notes: "Against wall, circle arms forward then backward." },
        { name: "Standing Elbow Curls (3×20)", notes: "Fingertips on temples, elbows together and apart." },
        { name: "Cats and Dogs (2×10)", notes: "On all fours, alternate arching back up (cat) and dropping belly down (dog)." },
        { name: "Gravity Drop (3×1 min)", notes: "Heels off step edge, relax and let gravity pull." },
      ],
    },
    advanced: {
      instructions:
        "Full Egoscue menu targeting all load joints (ankles, knees, hips, shoulders). Add Tower exercises if you have an Egoscue Tower. Focus on bilateral symmetry and functional position of pelvis.",
      duration: "35–50 minutes",
      exercises: [
        { name: "Static Back (10 min)", notes: "Deep relaxation hold. Focus on bilateral hip/shoulder alignment." },
        { name: "Supine Groin Progressive (15 min per side)", notes: "Full progressive series on step ladder. Let hip fully release on each level." },
        { name: "Hip Crossover Stretch (1 min each side ×3)", notes: "Supine, knees bent, feet on floor. Cross one ankle over opposite knee, let knees fall to side." },
        { name: "Air Bench (3–5 min)", notes: "Back on wall, 90° bend. Press lower back flat. Hold as long as possible." },
        { name: "Wall Stork (30 sec each side ×3)", notes: "Stand facing wall, one foot on wall at hip height. Keep hips level." },
        { name: "Standing Arm Circles (3×40 each)", notes: "Full range, against wall." },
        { name: "Standing Elbow Curls (3×25)", notes: "Controlled tempo, full range." },
        { name: "Cats and Dogs (3×15)", notes: "Slow, deliberate spinal flexion/extension." },
        { name: "Runner's Stretch (1 min each side ×2)", notes: "Lunge position, back knee on floor. Square hips forward." },
        { name: "Gravity Drop (3×2 min)", notes: "Extended hold for full ankle/calf release." },
      ],
    },
  },
};

// Daily shoulder + t-spine rehab, prescribed 2026-06-09 (HEP2go program
// 52JD3S2, Ryan Guy). One prescription at every level - PT homework does not
// scale with training tier. Each exercise name encodes a timed window sized
// to its rep count so the CircuitTimer drives the whole session; the actual
// reps live in the notes.
const ptRehabDetail: LevelDetail = {
  instructions:
    "Six daily rehab moves for shoulder and thoracic spine. Hit play and follow the reps inside each timed window - the clock paces the stations, the reps pace you. Quality over speed; stop shy of pain. Use a light band with controlled returns.",
  duration: "~7 minutes",
  keyPoints: [
    "10 reps inside each timed window - do not race the clock",
    "Thoracic extension: easy over the lower ribs, no low-back arch",
    "Band work: set the shoulder blade back and down before every rep",
  ],
  exercises: [
    {
      name: "Thoracic Extension (50s)",
      notes: "Foam roller under the shoulder blades, arms behind head, hips down. 10 reps with a 3s hold, walking the roller along the blades.",
      equipment: ["Foam Roller"],
    },
    {
      name: "Thread the Needle (50s)",
      notes: "All fours, roller out to one side. Reach the free arm under and rotate for a gentle spine stretch. 5 reps each side.",
      equipment: ["Foam Roller"],
    },
    {
      name: "Band External Rotation (45s)",
      notes: "Band anchored at elbow height, towel between elbow and ribs. Rotate out from the stomach, 10 reps with a 1s hold.",
      equipment: ["Bands"],
    },
    {
      name: "ER 90/90: 2 rounds × 45s/15s",
      notes: "Arm flexed to 90, elbow bent 90. Bring the forearm up to point at the ceiling, shoulder blade retracted and down the whole time. 10 reps per set.",
      equipment: ["Bands"],
    },
    {
      name: "ER Uppercut (45s)",
      notes: "Elbow tucked to the side, rotate out to neutral, then punch up. Wrist, elbow, and shoulder in one straight line. 10 reps.",
      equipment: ["Bands"],
    },
    {
      name: "Serratus Wall Slide (45s)",
      notes: "Band around the wrists, forearms on the wall. Protract the shoulder blades, slide the arms up, return. 10 reps with a 1s hold.",
      equipment: ["Bands"],
    },
  ],
};

const ptShoulderSession: WorkoutSession = {
  title: "PT Shoulder Rehab",
  subtitle: "Daily - HEP2go 52JD3S2",
  category: "posture",
  icon: "🦾",
  timeOfDay: "Anytime daily (pairs well with Egoscue)",
  protocolType: "skill",
  levels: { beginner: ptRehabDetail, intermediate: ptRehabDetail, advanced: ptRehabDetail },
};

export const weeklyPlan: DayPlan[] = [
  {
    day: "Monday",
    theme: "Build",
    focus: "Strength anchor. No Tabata, HIIT, or VO2 max.",
    programmingNotes: {
      doOnThisDay: [
        "Super-Slow Strength as the main session",
        "Sauna, cold plunge, or breathwork after lifting",
        "Zone 1-2 walks (nose breathing only)",
      ],
      avoidOnThisDay: [
        "Tabata, HIIT, or VO2 max work",
        "Additional cardio beyond easy walking",
        "Heavy second strength session",
      ],
      reasoning:
        "Concurrent training interference: stacking high-intensity cardio on a strength day blunts the strength adaptation. The cardiovascular benefit you would get from Tabata is already baked into super-slow lifting to failure.",
    },
    sessions: [
      egoscueSession,
      ptShoulderSession,
      {
        title: "Super-Slow Strength",
        subtitle: "Body by Science Protocol",
        category: "strength",
        icon: "🏋️",
        timeOfDay: "Late afternoon / early evening (3+ hrs before bed)",
        protocolType: "strength",
        repProtocol: superSlowRepProtocol,
        levels: {
          beginner: {
            warmup: "5-10 minutes of aerobic exercise",
            instructions:
              "Complete each exercise very slowly with a 10-second count up and a 10-second count down. Time-under-tension target varies by exercise: 80s for upper-body push (chest, shoulders), 100s for upper-body pull (back, lats), 120s for legs and posterior chain. Stop at the target OR at muscular failure, whichever comes first. Do not rest between reps - maintain constant tension. One set per exercise.",
            keyPoints: [
              "Target TUT: 80s upper push, 100s upper pull, 120s legs and posterior chain",
              "Do NOT rest between reps - maintain constant tension throughout",
              "One set per exercise, to the TUT target or muscular failure (whichever comes first)",
              "Failure inside the TUT window is the real ceiling - Body by Science protocol",
              "Super-slow lifting to failure produces the same cardiovascular adaptations as a long run",
            ],
            exercises: superSlowExercises.beginner,
          },
          intermediate: {
            warmup: "1-2 sets of 3-6 fast, explosive reps for each exercise",
            instructions:
              "Complete the beginner routine with the same super-slow tempo (10s up, 10s down, target 10 reps). After reaching failure on each set, immediately perform as many fast, explosive, partial-range reps as you can complete.",
            keyPoints: [
              "Explosive warm-up sets prime the nervous system before the slow work",
              "The partial-range burnout reps at the end recruit remaining muscle fibers",
              "Same exercises and tempo as beginner, with added intensity techniques",
            ],
            exercises: superSlowExercises.intermediate,
          },
          advanced: {
            warmup: "5-10 min gymnastics, Animal Flow, Foundation Training, or dynamic warm-up",
            instructions:
              "Complex sets: pick one exercise from each category below. For each, pair a Strength exercise with a Power exercise. Do one Strength set, then immediately do 20-30 seconds of the Power move as explosively as possible. Recover 2-3 minutes. Repeat for 3-5 sets, then move to the next category.",
            keyPoints: [
              "Strength move = heavy, controlled. Power move = explosive, fast",
              "2-3 minutes recovery between each Strength + Power pair",
              "3-5 sets per movement category before moving on",
              "Cool down with deep breathing, box breathing, sauna, or walking",
            ],
            exercises: superSlowExercises.advanced,
          },
        },
      },
    ],
  },
  {
    day: "Tuesday",
    theme: "Burn",
    focus: "Aerobic anchor day. Functional Fitness + Mitochondrial. No Tabata or VO2 here.",
    programmingNotes: {
      doOnThisDay: [
        "7-Minute Workout circuit",
        "Mitochondrial Training (4 rounds × 30-60s all-out + 4 min easy)",
        "Bookend the circuit with the mitochondrial block",
      ],
      avoidOnThisDay: [
        "Tabata blocks (those live on Thursday and Saturday)",
        "VO2 max intervals (those live on Thursday)",
        "Heavy strength work that would compete with the conditioning stimulus",
      ],
      reasoning:
        "Tuesday is the aerobic conditioning anchor. Tabata and VO2 max moved to Thursday/Saturday so the week's hard cardio days are spaced from Monday and Friday strength sessions.",
    },
    sessions: [
      egoscueSession,
      ptShoulderSession,
      {
        title: "Functional Fitness",
        subtitle: "7-Minute Workout Circuit",
        category: "cardio",
        icon: "⚡",
        timeOfDay: "Late afternoon / early evening (3+ hrs before bed)",
        levels: {
          beginner: {
            instructions: "7-Minute Workout: 12 exercises, 30 seconds each, 10 seconds rest between. Do 1-3 rounds. Move fast and explosive - the goal is max reps in each 30-second window.",
            duration: "7-21 minutes",
            keyPoints: [
              "Perform each exercise as explosively as possible (except wall sit - isometric hold)",
              "Use the timer above to pace yourself through the circuit",
              "Start with 1 round, work up to 2-3 rounds as fitness improves",
            ],
            exercises: [
              { name: "Jumping Jacks (30s)", notes: "Full range of motion, arms overhead" },
              { name: "Wall Sit (30s)", notes: "Back flat on wall, thighs parallel to floor" },
              { name: "Push-ups (30s)", notes: "Chest to floor, full lockout at top" },
              { name: "Crunches (30s)", notes: "Shoulder blades off floor, controlled" },
              { name: "Step-ups (30s)", notes: "Alternate legs, use a chair or bench" },
              { name: "Squats (30s)", notes: "Below parallel, weight in heels" },
              { name: "Tricep Dips (30s)", notes: "Off a chair, elbows to 90 degrees" },
              { name: "Plank (30s)", notes: "Straight line from head to heels" },
              { name: "High Knees (30s)", notes: "Drive knees to chest, pump arms" },
              { name: "Lunges (30s)", notes: "Alternate legs, knee tracks over toes" },
              { name: "Push-up with Rotation (30s)", notes: "Push-up, then rotate to side plank, alternate" },
              { name: "Side Plank (30s)", notes: "15s each side, hips high" },
            ],
          },
          intermediate: {
            instructions: "2-3 rounds of the 7-Minute Workout with BFR bands on arms and legs. Mitochondrial Training has its own session - run it before or after this circuit, not embedded.",
            duration: "14-21 minutes",
            keyPoints: [
              "Apply BFR/Kaatsu bands at moderate pressure before starting the circuit",
              "Move fast and explosive - max reps in each 30-second window",
              "Pair with the standalone Mitochondrial Training session as a bookend",
            ],
            exercises: [
              { name: "Jumping Jacks (30s)", notes: "Full range of motion, arms overhead", equipment: ["Bands"] },
              { name: "Wall Sit (30s)", notes: "Back flat on wall, thighs parallel to floor", equipment: ["Bands"] },
              { name: "Push-ups (30s)", notes: "Chest to floor, full lockout at top", equipment: ["Bands"] },
              { name: "Crunches (30s)", notes: "Shoulder blades off floor, controlled", equipment: ["Bands"] },
              { name: "Step-ups (30s)", notes: "Alternate legs, use a chair or bench", equipment: ["Bands"] },
              { name: "Squats (30s)", notes: "Below parallel, weight in heels", equipment: ["Bands"] },
              { name: "Tricep Dips (30s)", notes: "Off a chair, elbows to 90 degrees", equipment: ["Bands"] },
              { name: "Plank (30s)", notes: "Straight line from head to heels", equipment: ["Bands"] },
              { name: "High Knees (30s)", notes: "Drive knees to chest, pump arms", equipment: ["Bands"] },
              { name: "Lunges (30s)", notes: "Alternate legs, knee tracks over toes", equipment: ["Bands"] },
              { name: "Push-up with Rotation (30s)", notes: "Push-up, then rotate to side plank, alternate", equipment: ["Bands"] },
              { name: "Side Plank (30s)", notes: "15s each side, hips high", equipment: ["Bands"] },
            ],
          },
          advanced: {
            instructions: "2-3 rounds of the 7-Minute Workout with BFR bands. Run the standalone Mitochondrial Training session as a bookend before or after.",
            duration: "14-21 minutes",
            keyPoints: [
              "Push for faster transitions and higher intensity each round",
              "Mitochondrial Training is now a separate session - bookend the circuit with it",
              "Combined block (circuit + mito) covers the full Tuesday cardio anchor",
            ],
            exercises: [
              { name: "Jumping Jacks (30s)", notes: "Full range of motion, arms overhead", equipment: ["Bands"] },
              { name: "Wall Sit (30s)", notes: "Back flat on wall, thighs parallel to floor", equipment: ["Bands"] },
              { name: "Push-ups (30s)", notes: "Chest to floor, full lockout at top", equipment: ["Bands"] },
              { name: "Crunches (30s)", notes: "Shoulder blades off floor, controlled", equipment: ["Bands"] },
              { name: "Step-ups (30s)", notes: "Alternate legs, use a chair or bench", equipment: ["Bands"] },
              { name: "Squats (30s)", notes: "Below parallel, weight in heels", equipment: ["Bands"] },
              { name: "Tricep Dips (30s)", notes: "Off a chair, elbows to 90 degrees", equipment: ["Bands"] },
              { name: "Plank (30s)", notes: "Straight line from head to heels", equipment: ["Bands"] },
              { name: "High Knees (30s)", notes: "Drive knees to chest, pump arms", equipment: ["Bands"] },
              { name: "Lunges (30s)", notes: "Alternate legs, knee tracks over toes", equipment: ["Bands"] },
              { name: "Push-up with Rotation (30s)", notes: "Push-up, then rotate to side plank, alternate", equipment: ["Bands"] },
              { name: "Side Plank (30s)", notes: "15s each side, hips high", equipment: ["Bands"] },
            ],
          },
        },
      },
      {
        title: "Mitochondrial Training",
        subtitle: "Bike/Row/Treadmill HIIT",
        category: "cardio",
        icon: "🔥",
        timeOfDay: "Bookend the Functional Fitness circuit (before or after)",
        protocolType: "hiit",
        levels: {
          beginner: {
            instructions:
              "3 rounds of 30-60 seconds all-out effort followed by 4 minutes easy active recovery. Pick one mode and stay with it: bike, treadmill, rower, or elliptical. All-out means maximal intensity, not just fast.",
            duration: "~16 minutes",
            keyPoints: [
              "Single mode for the full session - bike, rower, treadmill, or elliptical",
              "Heart rate should drop below 120 bpm during each 4-min recovery",
              "Beginner runs 3 rounds, working up to 4 over time",
            ],
            exercises: [
              { name: "Round 1: All-out (30-60s)", notes: "Max effort on bike, rower, treadmill, or elliptical. Pick the mode and commit." },
              { name: "Round 1: Recovery (4 min)", notes: "Easy active recovery. Walk or light pedal. Get heart rate below 120 bpm." },
              { name: "Round 2: All-out (30-60s)", notes: "Same mode. Match round 1 intensity." },
              { name: "Round 2: Recovery (4 min)", notes: "Easy pace. Full recovery before the next push." },
              { name: "Round 3: All-out (30-60s)", notes: "Final round - empty the tank. Sprint the last 10 seconds." },
              { name: "Round 3: Recovery (4 min)", notes: "Cool down. Easy movement, then stretch." },
            ],
          },
          intermediate: {
            instructions:
              "4 rounds of 30-60 seconds all-out effort followed by 4 minutes easy active recovery. Single mode: bike, rower, treadmill, or elliptical. All-out means you couldn't sustain it for one second longer.",
            duration: "~20 minutes",
            keyPoints: [
              "Single mode for the full session for clean comparison week to week",
              "Heart rate should drop below 120 bpm during each 4-min recovery",
              "Bookend the 7-Minute Workout circuit with this block",
            ],
            exercises: [
              { name: "Round 1: All-out (30-60s)", notes: "Max effort on bike, rower, treadmill, or elliptical." },
              { name: "Round 1: Recovery (4 min)", notes: "Easy active recovery. Heart rate below 120 bpm." },
              { name: "Round 2: All-out (30-60s)", notes: "Same mode. Match round 1 intensity." },
              { name: "Round 2: Recovery (4 min)", notes: "Easy pace. Full recovery." },
              { name: "Round 3: All-out (30-60s)", notes: "Dig in. Pace should match earlier rounds." },
              { name: "Round 3: Recovery (4 min)", notes: "Easy pace. Reset for the final push." },
              { name: "Round 4: All-out (30-60s)", notes: "Final round - dig deep. Sprint the last 10 seconds if you can." },
              { name: "Round 4: Recovery (4 min)", notes: "Cool down. Easy movement, then stretch." },
            ],
          },
          advanced: {
            instructions:
              "4 rounds of 30-60 seconds all-out effort followed by 4 minutes easy active recovery. Optional Training Mask during work intervals to restrict airflow and simulate altitude. Single mode: bike, rower, treadmill, or elliptical.",
            duration: "~20 minutes",
            keyPoints: [
              "Optional Training Mask during work intervals trains breathing muscles",
              "Pace will drop 10-15% with the mask - that's expected",
              "All-out means you couldn't sustain it for one second longer",
            ],
            exercises: [
              { name: "Round 1: All-out (30-60s)", notes: "Max effort on bike, rower, treadmill, or elliptical. Mask optional.", equipment: ["Bands"] },
              { name: "Round 1: Recovery (4 min)", notes: "Easy active recovery. Mask off. Heart rate below 120 bpm." },
              { name: "Round 2: All-out (30-60s)", notes: "Same mode. Match round 1 intensity.", equipment: ["Bands"] },
              { name: "Round 2: Recovery (4 min)", notes: "Easy pace. Mask off. Full recovery." },
              { name: "Round 3: All-out (30-60s)", notes: "Dig in. Pace should match earlier rounds.", equipment: ["Bands"] },
              { name: "Round 3: Recovery (4 min)", notes: "Easy pace. Reset for the final push." },
              { name: "Round 4: All-out (30-60s)", notes: "Final round - empty the tank. Sprint the last 10 seconds.", equipment: ["Bands"] },
              { name: "Round 4: Recovery (4 min)", notes: "Cool down. Easy movement, then stretch." },
            ],
          },
        },
      },
    ],
  },
  {
    day: "Wednesday",
    theme: "Restore",
    focus: "Detox and brain training - recovery for the body, stimulus for the mind",
    programmingNotes: {
      doOnThisDay: [
        "Rebounding, vibration, or tai chi shaking",
        "Sauna + cold contrast",
        "Brain training, novel skill practice",
        "Parasympathetic breathwork",
      ],
      avoidOnThisDay: [
        "High-intensity cardio (HIIT, Tabata, VO2 max)",
        "Heavy strength sessions",
      ],
      reasoning:
        "Mid-week recovery day. Restoring parasympathetic tone here is what makes Thursday-Friday-Saturday productive. Stacking intensity on Wednesday compounds fatigue and dulls the rest of the week.",
    },
    sessions: [
      egoscueSession,
      ptShoulderSession,
      {
        title: "Morning Detox Session",
        category: "recovery",
        icon: "🧘",
        timeOfDay: "Late afternoon / early evening (or Thursday if unavailable)",
        levels: {
          beginner: {
            instructions: "Do 5-15 minutes of tai chi shaking, rebounding on a mini trampoline, or vibration platform work.",
            duration: "5-15 minutes",
            keyPoints: [
              "Ideally done late afternoon or early evening, 3+ hours before bed",
              "If you can't do it Wednesday, move it to Thursday",
            ],
          },
          intermediate: {
            instructions: "Do a clay mask. While it dries, do 5-15 minutes of rebounding or vibration platform. Rinse off the mask, then sauna for 20-30 minutes with full-body dry skin brushing and yoga/stretching. Finish with a 2-to-5-minute cold shower or cold soak. Apply topical magnesium to joints and sore spots afterward.",
            duration: "45-60 minutes",
            keyPoints: [
              "Clay mask + rebounding while it dries is a great time-saver",
              "Dry skin brush in the sauna for lymphatic drainage",
              "Finish with cold exposure, then topical magnesium on joints",
            ],
          },
          advanced: {
            instructions: "Do a clay mask. While it dries, do 5-15 minutes of rebounding or vibration platform. Rinse off the mask, then sauna for 20-30 minutes with full-body dry skin brushing and stretching. Finish with cold exposure. Apply topical magnesium afterward.",
            duration: "45-60+ minutes",
            keyPoints: [
              "Same as intermediate with more aggressive cold exposure",
              "Consider adding a warm magnesium salt bath later in the day",
            ],
          },
        },
      },
      {
        title: "Brain Training",
        category: "brain",
        icon: "🧠",
        timeOfDay: "Any time of day",
        levels: {
          beginner: {
            instructions: "Choose any new skill or hobby, or an existing one where you're learning a new technique — cook a new recipe, play a new board/card game, play guitar, ukulele, harmonica, piano, or any instrument, or create a watercolor or oil painting. Anything on your bucket list counts.",
          },
          intermediate: {
            instructions: "Choose any new skill or hobby, or an existing one where you're learning a new technique — cook a new recipe, play a new board/card game, play guitar, ukulele, harmonica, piano, or any instrument, or create a watercolor or oil painting. Anything on your bucket list counts.",
          },
          advanced: {
            instructions: "Choose any new skill or hobby, or an existing one where you're learning a new technique — cook a new recipe, play a new board/card game, play guitar, ukulele, harmonica, piano, or any instrument, or create a watercolor or oil painting. Anything on your bucket list counts.",
          },
        },
      },
    ],
  },
  {
    day: "Thursday",
    theme: "Heat",
    focus: "HIIT anchor + heat. Tabata weekly, Hot and Cold weekly, VO2 Max bi-weekly.",
    programmingNotes: {
      doOnThisDay: [
        "Tabata block (8 rounds x 20s/10s)",
        "VO2 Max intervals on bi-weekly schedule (every other Thursday)",
        "Sauna (infrared preferred) + cold plunge or cold shower",
        "Optional: massage, foam rolling, RumbleRoller, PEMF",
      ],
      avoidOnThisDay: [
        "Stacking heavy strength on top of Tabata + VO2",
        "Tabata if under-recovered from Tuesday",
      ],
      reasoning:
        "Thursday is the second HIIT anchor of the week, paired with heat for thermogenic recovery. Tabata + VO2 spaced 48hrs from Tuesday's Mitochondrial work and 48hrs before Friday's strength session.",
    },
    sessions: [
      egoscueSession,
      ptShoulderSession,
      {
        title: "VO2 Max Training",
        subtitle: "4x4 Norwegian (bi-weekly)",
        category: "cardio",
        icon: "🫁",
        timeOfDay: "Bi-weekly only - alternating Thursdays",
        protocolType: "vo2max",
        isBiWeekly: true,
        levels: {
          beginner: {
            instructions: "Complete 4 rounds of 4 minutes intense intervals at 87-97% max HR with 4 minutes easy aerobic recovery between each round. Pick a single mode: bike, treadmill, rower, swim, or elliptical.",
            duration: "~32 minutes",
            keyPoints: [
              "Single mode for the full session",
              "Work intervals at 87-97% max HR",
              "Bi-weekly cadence: every other Thursday",
            ],
            exercises: [
              { name: "4 rounds × 4 min/4 min", notes: "4 min hard at 87-97% max HR, then 4 min easy aerobic recovery. Single mode (bike, treadmill, rower, swim, or elliptical) for the full session." },
            ],
          },
          intermediate: {
            instructions: "Do the beginner workout. For the first 2 rounds wear a Training Mask during work efforts. For the next 2 rounds wear it during recovery efforts.",
            duration: "~32 minutes",
            keyPoints: [
              "Training Mask shifts position between work and recovery efforts",
              "Pace will drop with the mask - that's expected",
            ],
            exercises: [
              { name: "4 rounds × 4 min/4 min", notes: "Rounds 1-2: mask during work effort. Rounds 3-4: mask during recovery effort. Pace will drop - expected." },
            ],
          },
          advanced: {
            instructions: "Do the intermediate workout, or use a LiveO2 trainer set at hyperoxia for the first 2 rounds work and hypoxia for recovery, then hypoxia for next 2 rounds work and hyperoxia for recovery.",
            duration: "~32 minutes",
            keyPoints: [
              "LiveO2 hyperoxia/hypoxia alternation maximizes adaptation signal",
              "Form first - if pace suffers, dial back",
            ],
            exercises: [
              { name: "4 rounds × 4 min/4 min", notes: "LiveO2: rounds 1-2 hyperoxia work / hypoxia recovery, rounds 3-4 hypoxia work / hyperoxia recovery. Or run intermediate protocol with Training Mask." },
            ],
          },
        },
      },
      {
        title: "Tabata",
        subtitle: "8 rounds x 20s/10s",
        category: "cardio",
        icon: "⏱️",
        timeOfDay: "Late afternoon / early evening (3+ hrs before bed)",
        protocolType: "hiit",
        levels: {
          beginner: {
            instructions: "1 block: 8 rounds x 20s all-out / 10s rest = 4 min total. Pick a single exercise from the list and commit. All-out means maximum intensity, not just fast.",
            duration: "4 min",
            keyPoints: [
              "Single exercise for the full block",
              "All-out effort each 20s push",
              "Randomize exercise across sessions for variety",
            ],
            exercises: [
              { name: "8 rounds x 20s/10s", notes: "Pick one: burpees, mountain climbers, jumping jacks, squat thrusts, treadmill, rowing, KB swings, or cycling. Commit for full 8 rounds." },
            ],
          },
          intermediate: {
            instructions: "1 block: 8 rounds x 20s/10s. Same protocol as beginner. Push for higher rep counts on bodyweight modes or higher pace on cardio modes.",
            duration: "4 min",
            keyPoints: [
              "Track reps or pace for week-over-week progression",
              "Randomize exercise across sessions",
            ],
            exercises: [
              { name: "8 rounds x 20s/10s", notes: "Pick one: burpees, mountain climbers, jumping jacks, squat thrusts, treadmill, rowing, KB swings, or cycling." },
            ],
          },
          advanced: {
            instructions: "1 block: 8 rounds x 20s/10s. Pick the most demanding mode you have access to (assault bike, rowing sprints, battle ropes). Match or beat last session's volume.",
            duration: "4 min",
            keyPoints: [
              "Most demanding mode you have available",
              "Beat last session's volume or pace",
            ],
            exercises: [
              { name: "8 rounds x 20s/10s", notes: "Assault bike, rowing sprints, battle ropes, or KB swings. All-out per round." },
            ],
          },
        },
      },
      {
        title: "Hot and Cold",
        subtitle: "Sauna & Cold Exposure",
        category: "recovery",
        icon: "🔥",
        timeOfDay: "Any time",
        levels: {
          beginner: {
            instructions: "Spend 10-30 minutes in a dry sauna, steam sauna, or (preferably) an infrared sauna. Stay in at least long enough to begin sweating, and preferably until you get uncomfortably hot.",
            duration: "10-30 minutes",
            keyPoints: [
              "Infrared sauna is preferred if available",
              "Stay until you're uncomfortably hot - that's the adaptation signal",
            ],
          },
          intermediate: {
            instructions: "Get a 30-to-90-minute full-body massage, if possible while lying on a PEMF or earthing device (Biomat, BodyBalance PEMF mat, or Pulse Center's Pulse XL Pro table) and while listening to sound healing tracks.",
            duration: "30-90 minutes",
            keyPoints: [
              "PEMF or earthing device under you during the massage amplifies recovery",
              "Sound healing tracks (e.g., Michael Tyrell's) enhance the session",
            ],
          },
          advanced: {
            instructions: "Get the intermediate massage or do the full-body foam-roller workout. Use a RumbleRoller and Training Mask. Bonus points for doing this in a dry or infrared sauna.",
            duration: "30-90 minutes",
            keyPoints: [
              "RumbleRoller + Training Mask combo for deep tissue work",
              "Do it in a sauna for extra heat stress and tissue pliability",
            ],
          },
        },
      },
    ],
  },
  {
    day: "Friday",
    theme: "Build",
    focus: "Super-Slow Strength round 2 - progressive overload on Monday's lifts",
    programmingNotes: {
      doOnThisDay: [
        "Super-Slow Strength (round 2 of Monday's lifts)",
        "Sauna, cold plunge, or breathwork after lifting",
        "Zone 1-2 walks (nose breathing only)",
      ],
      avoidOnThisDay: [
        "Tabata, HIIT, or VO2 max work",
        "Additional cardio beyond easy walking",
      ],
      reasoning:
        "Same logic as Monday: concurrent training interference. Friday's job is to reinforce Monday's strength stimulus, not to chase a cardio adaptation that Tuesday already covered.",
    },
    sessions: [
      egoscueSession,
      ptShoulderSession,
      {
        title: "Super-Slow Strength",
        subtitle: "Round 2",
        category: "strength",
        icon: "💪",
        timeOfDay: "Late afternoon / early evening (3+ hrs before bed)",
        protocolType: "strength",
        repProtocol: superSlowRepProtocol,
        levels: {
          beginner: {
            warmup: "5-10 minutes of aerobic exercise",
            instructions:
              "Same exercises as Monday. Goal: beat Monday's weight or time-under-tension on at least one exercise. Tempo: 10s up, 10s down. Target 10 reps or failure, whichever comes first.",
            keyPoints: [
              "Try to beat Monday's weight or TUT on at least one lift",
              "Target: 10 reps × 20s per rep = ~200s time-under-tension per exercise",
              "One set per exercise, to failure or to 10 reps",
            ],
            exercises: superSlowExercises.beginner,
          },
          intermediate: {
            warmup: "1-2 sets of 3-6 fast, explosive reps for each exercise",
            instructions:
              "Same exercises as Monday with explosive partial-range finishers after each set. Tempo: 10s up, 10s down, target 10 reps. Goal: beat Monday on at least one lift.",
            keyPoints: [
              "Same warm-up: 1-2 sets of 3-6 fast explosive reps",
              "After failure on each slow set, do max fast partial-range reps",
              "Track progress: weight, TUT, or burnout reps should improve vs Monday",
            ],
            exercises: superSlowExercises.intermediate,
          },
          advanced: {
            warmup: "5-10 min gymnastics, Animal Flow, Foundation Training, or dynamic warm-up",
            instructions:
              "Repeat Monday's complex sets, or swap to fresh exercises in the same movement categories. Strength + Power paired sets, 3-5 sets per category, 2-3 min recovery between pairs.",
            keyPoints: [
              "Option to switch between super-slow and complex sets week to week",
              "If repeating complex sets, use different exercises than Monday for variety",
            ],
            exercises: superSlowExercises.advanced,
          },
        },
      },
    ],
  },
  {
    day: "Saturday",
    theme: "Explore",
    focus: "Adventure + Tabata #2. Skip Tabata if adventure runs more than 90 min hard.",
    programmingNotes: {
      doOnThisDay: [
        "Hiking, cycling, skiing, paddling, or any low-to-moderate outdoor activity",
        "Novelty and nature exposure are the point - go somewhere new if possible",
      ],
      avoidOnThisDay: [
        "Stacking Tabata or HIIT on top of an already hard adventure",
        "Pushing intensity if the adventure is long (over 90 minutes)",
      ],
      reasoning:
        "Adventure should feel restorative, not punishing. If you do something genuinely hard outdoors (heavy hike, surf session), treat it as a Tuesday substitute and skip the Tabata block this week.",
    },
    sessions: [
      egoscueSession,
      ptShoulderSession,
      {
        title: "Adventure of Choice",
        subtitle: "Outdoor Activity",
        category: "adventure",
        icon: "🏔️",
        timeOfDay: "Any time (fasted state for added fat-burning)",
        levels: {
          beginner: {
            instructions: "Choose your own adventure, preferably outdoors. Hiking, skiing, snowboarding, road cycling, mountain biking, or playing on an obstacle course. Keep intensity moderate — use it for nature therapy, challenging your brain, and doing something novel.",
            duration: "45 min – 3 hours",
          },
          intermediate: {
            instructions: "Choose your own adventure, preferably outdoors. Hiking, skiing, snowboarding, road cycling, mountain biking, or playing on an obstacle course. Keep intensity moderate — use it for nature therapy, challenging your brain, and doing something novel.",
            duration: "45 min – 3 hours",
          },
          advanced: {
            instructions: "Choose your own adventure, preferably outdoors. Hiking, skiing, snowboarding, road cycling, mountain biking, or playing on an obstacle course. Keep intensity moderate — use it for nature therapy, challenging your brain, and doing something novel.",
            duration: "45 min – 3 hours",
          },
        },
      },
      {
        title: "Tabata",
        subtitle: "8 rounds x 20s/10s (Tabata #2)",
        category: "cardio",
        icon: "⏱️",
        timeOfDay: "Skip if adventure ran more than 90 min hard",
        protocolType: "hiit",
        levels: {
          beginner: {
            instructions: "1 block: 8 rounds x 20s all-out / 10s rest = 4 min total. Pick a different exercise from Thursday's session for variety.",
            duration: "4 min",
            keyPoints: [
              "Pick a different exercise from Thursday's Tabata",
              "Skip entirely if adventure ran more than 90 min hard",
            ],
            exercises: [
              { name: "8 rounds x 20s/10s", notes: "Different from Thursday: rotate from burpees, mountain climbers, jumping jacks, squat thrusts, treadmill, rowing, KB swings, cycling." },
            ],
          },
          intermediate: {
            instructions: "1 block: 8 rounds x 20s/10s. Same protocol as Thursday but different exercise. Push for higher volume.",
            duration: "4 min",
            keyPoints: [
              "Different exercise from Thursday",
              "Track week-over-week progression on this specific exercise",
            ],
            exercises: [
              { name: "8 rounds x 20s/10s", notes: "Pick a different exercise from Thursday's Tabata. Rotate weekly." },
            ],
          },
          advanced: {
            instructions: "1 block: 8 rounds x 20s/10s. Pick the most demanding mode you have access to. Match or beat last session's volume.",
            duration: "4 min",
            keyPoints: [
              "Different exercise from Thursday",
              "Most demanding mode available",
            ],
            exercises: [
              { name: "8 rounds x 20s/10s", notes: "Assault bike, rowing sprints, battle ropes, or KB swings. Different from Thursday." },
            ],
          },
        },
      },
    ],
  },
  {
    day: "Sunday",
    theme: "Connect",
    focus: "Social sport and brain training - community, play, and learning",
    programmingNotes: {
      doOnThisDay: [
        "Recreational social sport (badminton, volleyball, tennis, frisbee, golf)",
        "Brain training and skill practice",
        "Long walks or easy bike rides",
      ],
      avoidOnThisDay: [
        "High-intensity intervals or competitive grinding",
        "Heavy lifting that would compromise Monday",
      ],
      reasoning:
        "Sunday is the social and cognitive anchor. Keep movement playful so Monday's strength session lands on a fresh nervous system.",
    },
    sessions: [
      egoscueSession,
      ptShoulderSession,
      {
        title: "Social Sport",
        subtitle: "Community Activity",
        category: "social",
        icon: "🤝",
        timeOfDay: "Any time",
        levels: {
          beginner: {
            instructions: "Choose any sport or activity that allows you to be with other people — badminton, volleyball, tennis, frisbee golf, golf, or a group exercise class.",
          },
          intermediate: {
            instructions: "Choose any sport or activity that allows you to be with other people — badminton, volleyball, tennis, frisbee golf, golf, or a group exercise class.",
          },
          advanced: {
            instructions: "Choose any sport or activity that allows you to be with other people — badminton, volleyball, tennis, frisbee golf, golf, or a group exercise class.",
          },
        },
      },
      {
        title: "Brain Training",
        category: "brain",
        icon: "🧠",
        timeOfDay: "Any time of day",
        levels: {
          beginner: {
            instructions: "Choose any new skill or hobby, or an existing one where you're learning a new technique — cook a new recipe, play a new board/card game, play guitar, ukulele, harmonica, piano, or any instrument, or create a watercolor or oil painting.",
          },
          intermediate: {
            instructions: "Choose any new skill or hobby, or an existing one where you're learning a new technique — cook a new recipe, play a new board/card game, play guitar, ukulele, harmonica, piano, or any instrument, or create a watercolor or oil painting.",
          },
          advanced: {
            instructions: "Choose any new skill or hobby, or an existing one where you're learning a new technique — cook a new recipe, play a new board/card game, play guitar, ukulele, harmonica, piano, or any instrument, or create a watercolor or oil painting.",
          },
        },
      },
    ],
  },
];

export const categoryColors: Record<string, { gradient: string; bg: string; text: string; badge: string }> = {
  strength: { gradient: "from-blue-500 to-indigo-600", bg: "bg-blue-50", text: "text-blue-700", badge: "bg-blue-100 text-blue-700" },
  cardio: { gradient: "from-orange-500 to-red-500", bg: "bg-orange-50", text: "text-orange-700", badge: "bg-orange-100 text-orange-700" },
  recovery: { gradient: "from-emerald-500 to-teal-500", bg: "bg-emerald-50", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-700" },
  flexibility: { gradient: "from-purple-500 to-pink-500", bg: "bg-purple-50", text: "text-purple-700", badge: "bg-purple-100 text-purple-700" },
  posture: { gradient: "from-cyan-500 to-blue-400", bg: "bg-cyan-50", text: "text-cyan-700", badge: "bg-cyan-100 text-cyan-700" },
  meditation: { gradient: "from-indigo-400 to-violet-500", bg: "bg-indigo-50", text: "text-indigo-700", badge: "bg-indigo-100 text-indigo-700" },
  adventure: { gradient: "from-amber-500 to-orange-500", bg: "bg-amber-50", text: "text-amber-700", badge: "bg-amber-100 text-amber-700" },
  social: { gradient: "from-teal-500 to-cyan-500", bg: "bg-teal-50", text: "text-teal-700", badge: "bg-teal-100 text-teal-700" },
  brain: { gradient: "from-violet-500 to-purple-500", bg: "bg-violet-50", text: "text-violet-700", badge: "bg-violet-100 text-violet-700" },
};

export const categoryLabels: Record<string, string> = {
  strength: "Strength",
  cardio: "Cardio",
  recovery: "Recovery",
  flexibility: "Flexibility",
  posture: "Posture",
  meditation: "Meditation",
  adventure: "Adventure",
  social: "Social",
  brain: "Brain",
};
