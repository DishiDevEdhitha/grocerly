/** @type {import('next').NextConfig} */
const nextConfig = {
  // Shown on the About page so you can tell WHICH version the installed app is running.
  env: { NEXT_PUBLIC_BUILD_ID: (process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 7), NEXT_PUBLIC_BUILD_TIME: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC" },
  reactStrictMode: true,
  images: { unoptimized: true },
  // The Firebase Admin SDK must stay a server-side external package.
  serverExternalPackages: ["firebase-admin", "@google-cloud/firestore"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Camera is needed for the barcode scanner and label photos.
          { key: "Permissions-Policy", value: "camera=(self), microphone=()" },
        ],
      },
    ];
  },
};
export default nextConfig;
