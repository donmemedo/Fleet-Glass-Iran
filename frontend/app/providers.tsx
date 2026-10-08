"use client";
import { createContext, useContext, useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { dict, type Dict, type Lang } from "./i18n";

type Theme = "light" | "dark";
type Ctx = { lang: Lang; t: Dict; theme: Theme; toggleLang: () => void; toggleTheme: (e: MouseEvent) => void };
const AppCtx = createContext<Ctx>(null!);
export const useApp = () => useContext(AppCtx);

export function Providers({ lang: initial, children }: { lang: Lang; children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(initial);
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme as Theme);
    addEventListener("touchstart", () => {}, { passive: true }); // iOS Safari only applies :active press styles with a touch listener
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  const toggleLang = () => {
    const l: Lang = lang === "fa" ? "en" : "fa";
    document.cookie = `lang=${l};path=/;max-age=31536000;samesite=lax`;
    const html = document.documentElement;
    html.lang = l;
    html.dir = l === "fa" ? "rtl" : "ltr";
    setLang(l);
  };

  // Circular reveal from the toggle via the View Transitions API; plain swap where unsupported.
  const toggleTheme = (e: MouseEvent) => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    const apply = () => {
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("theme", next); } catch {}
      setTheme(next);
    };
    const html = document.documentElement;
    html.style.setProperty("--vx", `${e.clientX}px`);
    html.style.setProperty("--vy", `${e.clientY}px`);
    if (!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return apply();
    document.startViewTransition(apply);
  };

  return <AppCtx.Provider value={{ lang, t: dict[lang], theme, toggleLang, toggleTheme }}>{children}</AppCtx.Provider>;
}
