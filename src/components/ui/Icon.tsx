import type { ReactNode, SVGProps } from "react";

// Inline icon set for app chrome (nav, controls, buttons). 24x24 viewBox,
// stroke-based, inherits currentColor so icons recolor with their parent.
// Session emojis in workoutData stay as content; chrome never uses emoji.
export type IconName =
  | "dumbbell"
  | "flask"
  | "heart-pulse"
  | "sliders"
  | "chat"
  | "flame"
  | "play"
  | "pause"
  | "reset"
  | "skip"
  | "stop"
  | "check"
  | "chevron"
  | "close"
  | "plus"
  | "trash"
  | "pencil"
  | "arrow-up"
  | "arrow-down";

const FILLED: Partial<Record<IconName, true>> = {
  play: true,
  pause: true,
  skip: true,
  stop: true,
};

const PATHS: Record<IconName, ReactNode> = {
  dumbbell: (
    <>
      <path d="M6.5 6.5v11" />
      <path d="M3.5 9v6" />
      <path d="M17.5 6.5v11" />
      <path d="M20.5 9v6" />
      <path d="M6.5 12h11" />
    </>
  ),
  flask: (
    <>
      <path d="M10 2.5v6L4.7 18.4a2 2 0 0 0 1.8 2.9h11a2 2 0 0 0 1.8-2.9L14 8.5v-6" />
      <path d="M8.5 2.5h7" />
      <path d="M7 15.5h10" />
    </>
  ),
  "heart-pulse": (
    <>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      <path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 21v-7" />
      <path d="M4 10V3" />
      <path d="M12 21v-9" />
      <path d="M12 8V3" />
      <path d="M20 21v-5" />
      <path d="M20 12V3" />
      <path d="M2 14h4" />
      <path d="M10 8h4" />
      <path d="M18 16h4" />
    </>
  ),
  chat: (
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  ),
  flame: (
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  ),
  play: <path d="M8 5.6v12.8a1 1 0 0 0 1.53.85l10.18-6.4a1 1 0 0 0 0-1.7L9.53 4.75A1 1 0 0 0 8 5.6Z" />,
  pause: (
    <>
      <rect x="6" y="5" width="4.5" height="14" rx="1.5" />
      <rect x="13.5" y="5" width="4.5" height="14" rx="1.5" />
    </>
  ),
  reset: (
    <>
      <path d="M3 12a9 9 0 1 0 2.64-6.36L3 8" />
      <path d="M3 3v5h5" />
    </>
  ),
  skip: (
    <path d="M6 5.7v12.6a.9.9 0 0 0 1.4.75L16.5 13v4.9a1.1 1.1 0 0 0 2.2 0V6.1a1.1 1.1 0 0 0-2.2 0V11L7.4 4.95A.9.9 0 0 0 6 5.7Z" />
  ),
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  check: <path d="M4.5 12.5l5 5L19.5 6.5" />,
  chevron: <path d="M6 9l6 6 6-6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7" />
      <path d="M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20h4L19 9a2 2 0 0 0-2.83-2.83L5 17v3Z" />
      <path d="M14.5 7.5l2 2" />
    </>
  ),
  "arrow-up": <path d="M12 19V5M6 11l6-6 6 6" />,
  "arrow-down": <path d="M12 5v14M6 13l6 6 6-6" />,
};

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}

export function Icon({ name, size = 20, strokeWidth = 2, ...props }: IconProps) {
  const filled = !!FILLED[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {PATHS[name]}
    </svg>
  );
}
