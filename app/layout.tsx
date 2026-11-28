import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import ServiceWorker from "@/components/ServiceWorker";

export const metadata: Metadata = {
  title: "Grocerly: know what's in your food",
  description: "Scan packaged food in India, get a transparent 0-100 score, allergens, regulatory status and better alternatives.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Grocerly", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#1F7A5A", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Loaded at runtime (not build time) so builds work offline; system fonts are the fallback. */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" />
      </head>
      <body>
        <main className="mx-auto w-full max-w-md px-4 pt-3">{children}</main>
        <BottomNav />
        <ServiceWorker />
      </body>
    </html>
  );
}
