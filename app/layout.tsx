import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SpisakApp — Zajednička kupovina",
  description: "Spiskovi za kupovinu koje deliš sa porodicom.",
  referrer: "no-referrer",
  appleWebApp: { capable: true, title: "SpisakApp", statusBarStyle: "default" }
};
export const viewport: Viewport = { themeColor: "#f8f8f2", viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="sr-Latn"><body>{children}</body></html>;
}
