import type { CapacitorConfig } from "@capacitor/cli";

// Native shell around the hosted web app (same code as the PWA). Change the URL, then `npm run sync`.
const url = process.env.CAP_SERVER_URL ?? "https://panel.iranglassfleet.ir";
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?(\/|$)/;
if (!url.startsWith("https://") && !LOCAL.test(url)) throw new Error(`CAP_SERVER_URL must be https:// (got ${url})`);

const config: CapacitorConfig = {
  appId: "ir.iranglassfleet.app",
  appName: "ایران‌گلس",
  webDir: "www",
  // Plain HTTP only for local development hosts; a release build pointed at http:// anywhere else fails here.
  server: { url, cleartext: LOCAL.test(url), errorPath: "error.html" },
  backgroundColor: "#f5f5f7",
};

export default config;
