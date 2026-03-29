export type Level = "beginner" | "intermediate" | "advanced";

export interface Exercise {
  name: string;
  alternatives?: string[];
  notes?: string;
}

export interface WorkoutSession {
  title: string;
  subtitle?: string;
  category: "strength" | "cardio" | "recovery" | "flexibility" | "adventure" | "social" | "brain";
  timeOfDay: string;
  icon: string;
  levels: {
    beginner: {
      warmup?: string;
      instructions: string;
      exercises?: Exercise[];
      duration?: string;
    };
    intermediate: {
      warmup?: string;
      instructions: string;
      exercises?: Exercise[];
      duration?: string;
    };
    advanced: {
      warmup?: string;
      instructions: string;
      exercises?: Exercise[];
      duration?: string;
    };
  };
}

export interface DayPlan {
  day: string;
  theme: string;
  focus: string;
  sessions: WorkoutSession[];
}

export const weeklyPlan: DayPlan[] = [
  {
    day: "Monday",
    theme: "Build",
    focus: "Super-Slow Strength — progressive overload with controlled tempo",
    sessions: [
      {
        title: "Super-Slow Strength",
        subtitle: "Body by Science Protocol",
        category: "strength",
        icon: "🏋️",
        timeOfDay: "Late afternoon / early evening (3+ hrs before bed)",
        levels: {
          beginner: {
            warmup: "5–10 minutes of aerobic exercise",
            instructions:
              "Complete each exercise very slowly with an 8-to-10-second count up and an 8-to-10-second count down. Keep muscles tight and tense for each rep. Do not rest between reps — maintain constant muscle tension. Complete a single round of the entire circuit. Each exercise is one single set to complete failure. Each exercise should take a minimum of 90 seconds, ideally 2 to 2.5 minutes.",
            exercises: [
              {
                name: "Machine Chest Press",
                alternatives: ["Dumbbell chest press", "Push-up", "Other horizontal pushing variation"],
              },
              {
                name: "Machine Pull-Down",
                alternatives: ["Pull-up", "Assisted pull-up", "Other vertical pulling variation"],
              },
              {
                name: "Machine Shoulder Press",
                alternatives: ["Dumbbell shoulder press", "Handstand push-up", "Other vertical pushing variation"],
              },
              {
                name: "Machine Seated Row",
                alternatives: ["Cable row", "Bent-over dumbbell row", "Other horizontal pulling variation"],
              },
              {
                name: "Leg Press",
                alternatives: ["Squat", "Goblet squat", "Dumbbell squat", "Other squatting or lunging variation"],
              },
            ],
          },
          intermediate: {
            warmup: "1–2 sets of 3–6 fast, explosive reps for each exercise",
            instructions:
              "Complete the beginner routine, then finish each super-slow set with as many fast, explosive, partial-range reps as you can complete.",
            exercises: [
              {
                name: "Machine Chest Press",
                alternatives: ["Dumbbell chest press", "Push-up", "Other horizontal pushing variation"],
              },
              {
                name: "Machine Pull-Down",
                alternatives: ["Pull-up", "Assisted pull-up", "Other vertical pulling variation"],
              },
              {
                name: "Machine Shoulder Press",
                alternatives: ["Dumbbell shoulder press", "Handstand push-up", "Other vertical pushing variation"],
              },
              {
                name: "Machine Seated Row",
                alternatives: ["Cable row", "Bent-over dumbbell row", "Other horizontal pulling variation"],
              },
              {
                name: "Leg Press",
                alternatives: ["Squat", "Goblet squat", "Dumbbell squat", "Other squatting or lunging variation"],
              },
            ],
          },
          advanced: {
            warmup: "5–10 min gymnastics, Animal Flow, Foundation Training, or dynamic warm-up",
            instructions:
              "Choose one upper-body push, one upper-body pull, and one lower-body push. For each, pair a Strength exercise with a Power exercise. Perform a Strength set, then immediately a Power set (20–30 seconds as explosively as possible). Recover 2–3 minutes. Repeat for 3–5 sets, then move to the next category. Cool down with deep breathing, box breathing, sauna, or walking.",
            exercises: [
              { name: "Upper-Body Push", alternatives: ["Overhead press", "Push-ups", "Chest press"] },
              { name: "Upper-Body Pull", alternatives: ["Bent or upright rows", "Lat pull-downs", "Pull-ups"] },
              { name: "Lower-Body Push", alternatives: ["Leg press", "Squats"] },
            ],
          },
        },
      },
    ],
  },
  {
    day: "Tuesday",
    theme: "Burn",
    focus: "Functional fitness and VO2 max — cardiovascular power and endurance",
    sessions: [
      {
        title: "Functional Fitness",
        subtitle: "7-Minute Workout Circuit",
        category: "cardio",
        icon: "⚡",
        timeOfDay: "Late afternoon / early evening (3+ hrs before bed)",
        levels: {
          beginner: {
            instructions: "Perform the 7-minute workout. If time permits, attempt 2–3 rounds. Use good form on every exercise and move as quickly and explosively as possible!",
            duration: "7–21 minutes",
          },
          intermediate: {
            instructions: "Perform 2–3 rounds of the 7-minute workout. If possible, use blood-flow restriction or Kaatsu bands on both arms and legs. Start or finish with a mitochondrial training set: 4 rounds of 30–60 seconds all-out effort followed by 4 minutes active recovery.",
            duration: "14–21 min + mitochondrial training",
          },
          advanced: {
            instructions: "Perform 2–3 rounds of the 7-minute workout with blood-flow restriction bands. Include mitochondrial training set: 4 rounds of 30–60 seconds all-out effort followed by 4 minutes active recovery.",
            duration: "14–21 min + mitochondrial training",
          },
        },
      },
      {
        title: "VO2 Max Training",
        subtitle: "High-Intensity Intervals",
        category: "cardio",
        icon: "🫁",
        timeOfDay: "Can combine with Functional Fitness or do separately",
        levels: {
          beginner: {
            instructions: "Complete 4 rounds of 4 minutes of intense intervals (maximum sustainable pace without form suffering) with 4 minutes of easy aerobic active-recovery between each round. Choose: bike, treadmill, rowing machine, swimming, elliptical, or running outdoors.",
            duration: "~32 minutes",
          },
          intermediate: {
            instructions: "Do the beginner workout, but for the first 2 rounds wear a Training Mask during work efforts, and for the next 2 rounds wear a Training Mask during recovery efforts.",
            duration: "~32 minutes",
          },
          advanced: {
            instructions: "Do the intermediate workout, or use a LiveO2 trainer set at hyperoxia for the first 2 rounds of work efforts and hypoxia for recovery, and hypoxia for the next 2 rounds of work with hyperoxia for recovery.",
            duration: "~32 minutes",
          },
        },
      },
    ],
  },
  {
    day: "Wednesday",
    theme: "Restore",
    focus: "Detox and brain training — recovery for the body, stimulus for the mind",
    sessions: [
      {
        title: "Morning Detox Session",
        category: "recovery",
        icon: "🧘",
        timeOfDay: "Late afternoon / early evening (or Thursday if unavailable)",
        levels: {
          beginner: {
            instructions: "Do 5–15 minutes of tai chi shaking, rebounding on a mini trampoline, or vibration platform work.",
            duration: "5–15 minutes",
          },
          intermediate: {
            instructions: "Do a clay mask. While it dries, do 5–15 minutes of rebounding or vibration platform. Rinse off the mask, then sauna for 20–30 minutes with full-body dry skin brushing and yoga/stretching. Finish with a 2-to-5-minute cold shower or cold soak. Apply topical magnesium to joints and sore spots afterward.",
            duration: "45–60 minutes",
          },
          advanced: {
            instructions: "Do a clay mask. While it dries, do 5–15 minutes of rebounding or vibration platform. Rinse off the mask, then sauna for 20–30 minutes with full-body dry skin brushing and stretching. Finish with cold exposure. Apply topical magnesium afterward.",
            duration: "45–60+ minutes",
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
    focus: "Thermogenesis and deep tissue recovery — sauna, massage, cold exposure",
    sessions: [
      {
        title: "Hot and Cold",
        subtitle: "Sauna & Cold Exposure",
        category: "recovery",
        icon: "🔥",
        timeOfDay: "Any time",
        levels: {
          beginner: {
            instructions: "Spend 10–30 minutes in a dry sauna, steam sauna, or (preferably) an infrared sauna. Stay in at least long enough to begin sweating, and preferably until you get uncomfortably hot.",
            duration: "10–30 minutes",
          },
          intermediate: {
            instructions: "Get a 30-to-90-minute full-body massage, if possible while lying on a PEMF or earthing device (Biomat, BodyBalance PEMF mat, or Pulse Center's Pulse XL Pro table) and while listening to sound healing tracks.",
            duration: "30–90 minutes",
          },
          advanced: {
            instructions: "Get the intermediate massage or do the full-body foam-roller workout. Use a RumbleRoller and Training Mask. Bonus points for doing this in a dry or infrared sauna.",
            duration: "30–90 minutes",
          },
        },
      },
    ],
  },
  {
    day: "Friday",
    theme: "Build",
    focus: "Super-Slow Strength round 2 — reinforcing Monday's work",
    sessions: [
      {
        title: "Super-Slow Strength",
        subtitle: "Repeat Monday's Routine",
        category: "strength",
        icon: "💪",
        timeOfDay: "Late afternoon / early evening (3+ hrs before bed)",
        levels: {
          beginner: {
            instructions: "Repeat Monday's Super-Slow Strength routine. Focus on beating last session's time-under-tension or weight.",
            exercises: [
              { name: "Machine Chest Press", alternatives: ["Dumbbell chest press", "Push-up", "Other horizontal pushing variation"] },
              { name: "Machine Pull-Down", alternatives: ["Pull-up", "Assisted pull-up", "Other vertical pulling variation"] },
              { name: "Machine Shoulder Press", alternatives: ["Dumbbell shoulder press", "Handstand push-up", "Other vertical pushing variation"] },
              { name: "Machine Seated Row", alternatives: ["Cable row", "Bent-over dumbbell row", "Other horizontal pulling variation"] },
              { name: "Leg Press", alternatives: ["Squat", "Goblet squat", "Dumbbell squat", "Other squatting or lunging variation"] },
            ],
          },
          intermediate: {
            instructions: "Repeat Monday's Super-Slow Strength routine with explosive finishers.",
          },
          advanced: {
            instructions: "Repeat Monday's routine. Alternatively, perform the complex sets routine (Strength + Power paired sets, 3–5 sets per movement category).",
          },
        },
      },
    ],
  },
  {
    day: "Saturday",
    theme: "Explore",
    focus: "Outdoor adventure — nature therapy, novelty, and low-intensity movement",
    sessions: [
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
    ],
  },
  {
    day: "Sunday",
    theme: "Connect",
    focus: "Social sport and brain training — community, play, and learning",
    sessions: [
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
  adventure: { gradient: "from-amber-500 to-orange-500", bg: "bg-amber-50", text: "text-amber-700", badge: "bg-amber-100 text-amber-700" },
  social: { gradient: "from-teal-500 to-cyan-500", bg: "bg-teal-50", text: "text-teal-700", badge: "bg-teal-100 text-teal-700" },
  brain: { gradient: "from-violet-500 to-purple-500", bg: "bg-violet-50", text: "text-violet-700", badge: "bg-violet-100 text-violet-700" },
};

export const categoryLabels: Record<string, string> = {
  strength: "Strength",
  cardio: "Cardio",
  recovery: "Recovery",
  flexibility: "Flexibility",
  adventure: "Adventure",
  social: "Social",
  brain: "Brain",
};
