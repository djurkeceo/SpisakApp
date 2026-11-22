import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NašSpisak — Zajednička kupovina",
  description: "Spiskovi za kupovinu koje deliš sa porodicom.",
  icons: { icon: { url: "/icon-nas-spisak.svg", type: "image/svg+xml" }, apple: { url: "/icon-nas-spisak-180.png", sizes: "180x180" } },
  referrer: "no-referrer",
  appleWebApp: { capable: true, title: "NašSpisak", statusBarStyle: "default" }
};
export const viewport: Viewport = { themeColor: "#f8f8f2", viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="sr-Latn" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: `try{const t=localStorage.getItem("spisak:theme");document.documentElement.dataset.theme=t||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")}catch{}` }} /></head><body>{children}</body></html>;
}
