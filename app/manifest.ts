import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Grocerly", short_name: "Grocerly", description: "Food intelligence for Indian shoppers",
    start_url: "/", display: "standalone", background_color: "#F4F7F5", theme_color: "#1F7A5A",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
