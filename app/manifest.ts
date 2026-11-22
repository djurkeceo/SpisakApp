import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SpisakApp", short_name: "SpisakApp", start_url: "/", display: "standalone",
    theme_color: "#f8f8f2", background_color: "#f8f8f2", lang: "sr-Latn",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" }
    ]
  };
}
