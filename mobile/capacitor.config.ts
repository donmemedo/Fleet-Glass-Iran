import type { CapacitorConfig } from "@capacitor/cli";

// Native shell around the hosted web app (same code as the PWA). Change the URL, then `npm run sync`.
const url = process.env.CAP_SERVER_URL ?? "https://panel.iranglassfleet.ir";

const config: CapacitorConfig = {
  appId: "ir.iranglassfleet.app",
  appName: "ایران‌گلس",
  webDir: "www",
  server: { url, cleartext: url.startsWith("http://"), errorPath: "error.html" },
  backgroundColor: "#f5f5f7",
};

export default config;
