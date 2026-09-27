import type { Metadata, Viewport } from "next";
import { Inter, Vazirmatn } from "next/font/google";
import { cookies } from "next/headers";
import { Providers } from "./providers";
import type { Lang } from "./i18n";
import "./globals.css";

const vazir = Vazirmatn({ subsets: ["arabic", "latin"], variable: "--font-fa", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-en", display: "swap" });

export const metadata: Metadata = {
  title: "IranGlassFleet — ایران‌گلس‌فلیت",
  description: "Windshield inspection, repair and SLA service for company fleets in Iran.",
  appleWebApp: { capable: true, title: "ایران‌گلس", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

// Runs before paint so the saved/system theme never flashes.
const themeScript = `try{var t=localStorage.getItem('theme')}catch(e){}document.documentElement.dataset.theme=t||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang: Lang = (await cookies()).get("lang")?.value === "en" ? "en" : "fa";
  return (
    <html lang={lang} dir={lang === "fa" ? "rtl" : "ltr"} className={`${vazir.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers lang={lang}>{children}</Providers>
      </body>
    </html>
  );
}
