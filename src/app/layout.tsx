import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Providers } from "@/components/Providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

// Display face for headings, wordmark, and phase labels. Numerals stay Inter
// (tabular-nums) - Space Grotesk has no tabular figures, so countdowns would
// jiggle.
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Workout Tracker",
  description: "Weekly workout schedule and tracker",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Workouts",
  },
};

export const viewport: Viewport = {
  themeColor: "#111827",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${inter.className} ${spaceGrotesk.variable} h-full antialiased`}
        suppressHydrationWarning
      >
        <head>
          <link rel="apple-touch-icon" href="/icon-192.png?v=2" />
          {/* Pre-hydration theme bootstrap: BUG-08. Reads the persisted theme
              (legacy "workout-store" key, or any account-scoped key sharing
              that prefix) and sets the .dark class before first paint, so
              dark-OS users don't see a light flash until Settings mounts
              useTheme(). Falls back to matchMedia when nothing is persisted.

              S2: the prefix also matches non-JSON keys under the same
              namespace (e.g. "workout-store:adopted-by", a bare account id
              string — useWorkoutStore.ts's legacy-key claim marker). Its
              JSON.parse throw used to live inside the SAME try as the
              matchMedia fallback and the classList.toggle, so it killed the
              fallback too and a dark-OS user got stuck on light. Each key's
              parse now has its own try (skip non-JSON, keep scanning); the
              matchMedia/toggle fallback is a separate try outside the loop
              so a parse failure can never take it down. */}
          <script
            dangerouslySetInnerHTML={{
              __html: `
                (function () {
                  var theme = null;
                  try {
                    for (var i = 0; i < localStorage.length; i++) {
                      var k = localStorage.key(i);
                      if (!k || k.indexOf('workout-store') !== 0) continue;
                      try {
                        var raw = localStorage.getItem(k);
                        if (!raw) continue;
                        var parsed = JSON.parse(raw);
                        var t = parsed && parsed.state && parsed.state.theme;
                        if (t === 'dark' || t === 'light' || t === 'system') {
                          theme = t;
                          break;
                        }
                      } catch (e) { /* not JSON - skip this key, keep scanning */ }
                    }
                  } catch (e) { /* localStorage unavailable/blocked */ }
                  try {
                    var resolved = theme && theme !== 'system'
                      ? theme
                      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
                    document.documentElement.classList.toggle('dark', resolved === 'dark');
                  } catch (e) {}
                })();
              `,
            }}
          />
        </head>
        <body className="min-h-full flex flex-col" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <Providers>
            {children}
          </Providers>
          <script
            dangerouslySetInnerHTML={{
              __html: `
                if ('serviceWorker' in navigator) {
                  window.addEventListener('load', () => {
                    navigator.serviceWorker.register('/sw.js');
                  });
                }
              `,
            }}
          />
        </body>
      </html>
    </ClerkProvider>
  );
}
