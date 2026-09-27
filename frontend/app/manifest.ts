import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ایران‌گلس‌فلیت · IranGlassFleet",
    short_name: "ایران‌گلس",
    description: "بازدید، تعمیر و SLA شیشه خودرو برای ناوگان سازمانی",
    start_url: "/",
    scope: "/",
    display: "standalone",
    dir: "rtl",
    lang: "fa",
    categories: ["business", "productivity"],
    background_color: "#f5f5f7",
    theme_color: "#f5f5f7",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "پیش‌خوان", short_name: "Dashboard", url: "/dashboard" },
      { name: "درخواست بازدید", short_name: "Request", url: "/#request" },
    ],
  };
}
