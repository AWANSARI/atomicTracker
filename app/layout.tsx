import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "AtomicTracker — Weekly Meal Planner",
    template: "%s · AtomicTracker",
  },
  description:
    "Mobile-first weekly meal planner. Sign in with Google, plug in your AI of choice, and let your own Drive be the source of truth.",
  applicationName: "AtomicTracker",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
      { url: "/icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icon-192.svg", sizes: "192x192", type: "image/svg+xml" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AtomicTracker",
  },
  openGraph: {
    title: "AtomicTracker — Weekly Meal Planner",
    description:
      "Mobile-first weekly meal planner with Google Drive + Calendar + AI.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
