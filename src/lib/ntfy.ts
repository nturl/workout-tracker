/**
 * ntfy.sh - Free push notifications
 * No account, no API key, no signup required.
 * User subscribes to a topic in the ntfy app, we POST to it.
 */

const NTFY_BASE = "https://ntfy.sh";

interface NtfyOptions {
  title?: string;
  priority?: 1 | 2 | 3 | 4 | 5; // 1=min, 3=default, 5=urgent
  tags?: string[]; // emoji shortcodes like "muscle", "fire"
  click?: string; // URL to open on tap
}

export async function sendNotification(
  topic: string,
  message: string,
  options: NtfyOptions = {}
): Promise<{ success: boolean; error?: string }> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "text/plain",
    };

    if (options.title) headers["Title"] = options.title;
    if (options.priority) headers["Priority"] = String(options.priority);
    if (options.tags?.length) headers["Tags"] = options.tags.join(",");
    if (options.click) headers["Click"] = options.click;

    const response = await fetch(`${NTFY_BASE}/${topic}`, {
      method: "POST",
      headers,
      body: message,
    });

    if (!response.ok) {
      const errText = await response.text();
      return { success: false, error: `ntfy ${response.status}: ${errText}` };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Generate a unique topic name for a user.
 * Format: boundless-{short-hash} to keep it memorable but unique.
 */
export function generateTopic(userId: string): string {
  // Simple hash - take first 10 chars of a hex digest
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, "0");
  return `boundless-${hex}`;
}
