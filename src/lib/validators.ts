import { z } from "zod";

const exerciseLogSchema = z.object({
  weight: z.number().nonnegative().optional(),
  reps: z.number().nonnegative().optional(),
  sets: z.number().nonnegative().optional(),
  notes: z.string().max(500).optional(),
  completed: z.boolean().optional(),
  tutSeconds: z.number().nonnegative().optional(),
});

export const logEntrySchema = z.object({
  notes: z.string().max(2000).optional(),
  duration: z.number().nonnegative().optional(),
  feeling: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional(),
  completedAt: z.string().optional(),
  exerciseLogs: z.record(z.string(), exerciseLogSchema).optional(),
});

const recoveryEntrySchema = z.object({
  date: z.string(),
  eightSleep: z.object({
    sleepFitnessScore: z.number().optional(),
    timeSlept: z.string().optional(),
    deepSleep: z.string().optional(),
    deepSleepPct: z.number().optional(),
    remSleep: z.string().optional(),
    remSleepPct: z.number().optional(),
    rhr: z.number().optional(),
    hrv: z.number().optional(),
    screenshotDataUrl: z.string().optional(),
    autoImported: z.boolean().optional(),
    importedAt: z.string().optional(),
  }).optional(),
  oura: z.object({
    readinessScore: z.number().optional(),
    sleepScore: z.number().optional(),
    totalSleep: z.string().optional(),
    efficiency: z.number().optional(),
    restfulness: z.string().optional(),
    remSleep: z.string().optional(),
    remSleepPct: z.number().optional(),
    deepSleep: z.string().optional(),
    deepSleepPct: z.number().optional(),
    latency: z.number().optional(),
    timing: z.string().optional(),
    lightSleep: z.string().optional(),
    lightSleepPct: z.number().optional(),
    awakeTime: z.string().optional(),
    timeInBed: z.string().optional(),
    hrv: z.number().optional(),
    rhr: z.number().optional(),
    averageHR: z.number().optional(),
    bodyTemp: z.number().optional(),
    respiratoryRate: z.number().optional(),
    spo2: z.number().optional(),
    screenshotDataUrl: z.string().optional(),
  }).optional(),
}).passthrough();

export const syncBodySchema = z.object({
  completions: z.record(z.string(), z.boolean()).optional(),
  logs: z.record(z.string(), logEntrySchema).optional(),
  level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  recovery: z.record(z.string(), recoveryEntrySchema).optional(),
  habits: z.record(z.string(), z.record(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.boolean())).optional(),
});

export const recoveryActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set-phone"), phone: z.string().min(10) }),
  z.object({ action: z.literal("get-phone") }),
  z.object({ action: z.literal("get-completions") }),
  z.object({ action: z.literal("test-sms") }),
  z.object({ action: z.literal("set-ntfy-topic"), topic: z.string().min(3).max(100) }),
  z.object({ action: z.literal("get-ntfy-topic") }),
  z.object({ action: z.literal("test-ntfy") }),
]);

export const extractMetricsSchema = z.object({
  imageDataUrl: z.string().min(1).max(7_000_000, "Image too large (max 5MB)").regex(/^data:image\/[\w+]+;base64,/, "Invalid image data URL format"),
  source: z.enum(["eightSleep", "oura"]),
});

// ---------------------------------------------------------------------------
// Biomarker / Lab schemas
// ---------------------------------------------------------------------------

const markerInputSchema = z.object({
  biomarkerId: z.string().min(1).max(100),
  value: z.number().finite(),
  unit: z.string().min(1).max(50),
  flag: z.string().max(20).optional(),
  refRangeRaw: z.string().max(100).optional(),
});

export const labImportSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  source: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  importMethod: z.enum(["manual", "photo", "pdf"]),
  markers: z.array(markerInputSchema).min(1, "At least one marker required").max(200, "Too many markers"),
  notes: z.string().max(2000).optional(),
});

export const labsActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }),
  z.object({ action: z.literal("get"), labId: z.string().min(1) }),
  z.object({ action: z.literal("import"), data: labImportSchema }),
  z.object({ action: z.literal("delete"), labId: z.string().min(1) }),
  z.object({ action: z.literal("summary") }),
]);

export const biomarkersQuerySchema = z.object({
  id: z.string().optional(),
  category: z.string().optional(),
});

export const extractLabSchema = z.object({
  imageDataUrl: z.string().min(1).max(10_000_000, "File too large (max ~7MB)").regex(/^data:(image\/[\w+]+|application\/pdf);base64,/, "Invalid file data URL format"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD").optional(),
  source: z.string().max(200).optional(),
});
