import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NašSpisak", short_name: "NašSpisak", start_url: "/", display: "standalone",
    theme_color: "#f8f8f2", background_color: "#f8f8f2", lang: "sr-Latn",
    icons: [
      { src: "/icon-nas-spisak-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-nas-spisak-512.png", sizes: "512x512", type: "image/png" }
    ]
  };
}
