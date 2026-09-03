// Native share where it exists (every phone, Safari/Chrome on macOS),
// clipboard fallback elsewhere.
export async function sharePage(): Promise<"shared" | "copied" | "failed"> {
  const data = {
    title: "Workout Tracker",
    text: "My weekly workout schedule and tracker.",
    url: "https://workout-tracker-two-alpha.vercel.app",
  };
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share(data);
    } catch {
      /* user closed the share sheet; nothing to do */
    }
    return "shared";
  }
  try {
    await navigator.clipboard.writeText(data.url);
    return "copied";
  } catch {
    return "failed";
  }
}
