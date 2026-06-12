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
  description: "Weekly workout schedule and tracker based on the Boundless fitness blueprint",
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
      <html lang="en" className={`${inter.className} ${spaceGrotesk.variable} h-full antialiased`}>
        <head>
          <link rel="apple-touch-icon" href="/icon-192.png?v=2" />
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
