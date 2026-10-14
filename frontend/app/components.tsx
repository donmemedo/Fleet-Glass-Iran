"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useApp } from "./providers";
import type { Lang } from "./i18n";

export const api = <T,>(path: string, init?: RequestInit): Promise<T> =>
  fetch(`/api${path}`, { headers: { "Content-Type": "application/json" }, ...init }).then((r) => (r.ok ? r.json() : Promise.reject(r)));

/** GET with loading and error state; `path` null skips the call. `status` is set on failure (0 = network). */
export function useApi<T>(path: string | null, token?: string) {
  const [res, setRes] = useState<{ data?: T; status?: number }>({});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!path) return setRes({});
    let live = true;
    setRes((r) => ({ data: r.data }));
    api<T>(path, token ? { headers: { authorization: `Bearer ${token}` } } : undefined).then(
      (data) => live && setRes({ data }),
      (r: unknown) => live && setRes({ status: r instanceof Response ? r.status : 0 }),
    );
    return () => void (live = false);
  }, [path, token, attempt]);
  return { ...res, retry: () => setAttempt((n) => n + 1) };
}

export function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useApp();
  return (
    <p className="load-error" role="alert">
      {t.load.fail}
      <button className="btn btn-sm btn-ghost" onClick={onRetry}>{t.load.retry}</button>
    </p>
  );
}

/** Calls fn at most once per animation frame, with the latest arguments: one layout read per frame, not per event. */
export function perFrame<A extends unknown[]>(fn: (...a: A) => void) {
  let id = 0;
  let last: A;
  return (...a: A) => {
    last = a;
    id ||= requestAnimationFrame(() => ((id = 0), fn(...last)));
  };
}

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export const fmt = (n: number, lang: Lang, digits = 1) =>
  new Intl.NumberFormat(lang === "fa" ? "fa-IR" : "en-US", { maximumFractionDigits: digits }).format(n);

/** Amount in million Toman → human string. */
export function useMoney() {
  const { lang, t } = useApp();
  return (m: number) => (m >= 1000 ? `${fmt(m / 1000, lang)} ${t.money.b}` : m < 1 ? `${fmt(m * 1000, lang, 0)} ${t.money.k}` : `${fmt(m, lang)} ${t.money.m}`);
}

const paths: Record<string, ReactNode> = {
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  drop: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />,
  scan: <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  chart: <path d="M5 20V11M12 20V5M19 20v-6" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
};

export const Icon = ({ name, size = 20, className = "" }: { name: string; size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    {paths[name]}
  </svg>
);

export const Logo = () => (
  <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
    <defs>
      <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#5ac8fa" />
        <stop offset="1" stopColor="#0a60ff" />
      </linearGradient>
    </defs>
    <path d="M5 11.5Q16 3.5 27 11.5L24.6 25Q16 21.8 7.4 25Z" fill="url(#lg)" />
    <path d="M10 12.5Q14 10 18 9.6" stroke="#fff" strokeOpacity=".75" strokeWidth="1.6" strokeLinecap="round" fill="none" />
  </svg>
);

export function Nav({ links = true }: { links?: boolean }) {
  const { t, lang, theme, toggleLang, toggleTheme } = useApp();
  const [scrolled, setScrolled] = useState(false);
  // Chromium/Android install prompt; iOS installs via Share → Add to Home Screen.
  const [install, setInstall] = useState<(Event & { prompt: () => void }) | null>(null);
  useEffect(() => {
    const on = () => setScrolled(scrollY > 8);
    const ask = (e: Event) => (e.preventDefault(), setInstall(e as Event & { prompt: () => void }));
    on();
    addEventListener("scroll", on, { passive: true });
    addEventListener("beforeinstallprompt", ask);
    return () => (removeEventListener("scroll", on), removeEventListener("beforeinstallprompt", ask));
  }, []);
  return (
    <header className={`nav ${scrolled ? "scrolled" : ""}`}>
      <div className="nav-in">
        <Link href="/" className="brand"><Logo /><span>{t.brand}</span></Link>
        {links && (
          <nav className="nav-links">
            <a href="/#services">{t.nav.services}</a>
            <a href="/#calc">{t.nav.calc}</a>
            <a href="/#pricing">{t.nav.pricing}</a>
          </nav>
        )}
        <div className="nav-actions">
          {install && <button className="icon-btn" onClick={() => (install.prompt(), setInstall(null))}><Icon name="download" size={18} /><span>{t.nav.install}</span></button>}
          <button className="icon-btn" onClick={toggleLang} aria-label={t.nav.langLabel}><Icon name="globe" size={18} /><span lang={lang === "fa" ? "en" : "fa"}>{t.nav.lang}</span></button>
          <button className="icon-btn" onClick={toggleTheme} aria-label={t.nav.theme}><Icon name={theme === "dark" ? "sun" : "moon"} size={18} /></button>
          {links ? (
            <Link href="/dashboard" className="btn btn-sm">{t.nav.dashboard}</Link>
          ) : (
            <Link href="/" className="btn btn-sm btn-ghost">{t.nav.home}</Link>
          )}
        </div>
      </div>
    </header>
  );
}

/** Scroll reveal + pointer spotlight for `.reveal` / `.spot` elements. Re-scan when `dep` changes. */
export function useFx(dep?: unknown) {
  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), io.unobserve(e.target))),
      { rootMargin: "0px 0px -8% 0px" },
    );
    document.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));
    const move = perFrame((e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.<HTMLElement>(".spot");
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    });
    addEventListener("pointermove", move, { passive: true });
    return () => (io.disconnect(), removeEventListener("pointermove", move));
  }, [dep]);
}

export function CountUp({ to, digits = 0 }: { to: number; digits?: number }) {
  const { lang } = useApp();
  const ref = useRef<HTMLSpanElement>(null);
  const [v, setV] = useState(0);
  useEffect(() => {
    const el = ref.current!;
    if (reducedMotion()) return setV(to);
    let raf = 0, timer = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min((now - t0) / 1400, 1);
        setV(to * (1 - Math.pow(1 - p, 4)));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      timer = window.setTimeout(() => setV(to), 1500); // rAF pauses in background tabs
    });
    io.observe(el);
    return () => (io.disconnect(), cancelAnimationFrame(raf), clearTimeout(timer));
  }, [to]);
  return <span ref={ref}>{fmt(v, lang, digits)}</span>;
}

/** Iranian license plate: "12ب345-68". Plates always read LTR with Persian digits. */
export function Plate({ value }: { value: string }) {
  const m = value.match(/^(\d{2})(\D)(\d{3})-(\d{2})$/);
  if (!m) return <span>{value}</span>;
  const d = (s: string) => Number(s).toLocaleString("fa-IR", { useGrouping: false });
  return (
    <span className="plate" dir="ltr">
      <span className="plate-flag"><i /><b>I.R.<br />IRAN</b></span>
      <span className="plate-main">{d(m[1])}<em>{m[2]}</em>{d(m[3])}</span>
      <span className="plate-reg"><small>ایران</small>{d(m[4])}</span>
    </span>
  );
}

const PHONE = /^(\+98|0)?9\d{9}$/;
const toLatin = (s: string) => s.replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c))).replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)));

export function LeadForm({ onDone }: { onDone?: () => void }) {
  const { t } = useApp();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "sending" | "ok" | "fail" | "busy">("idle");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, toLatin(String(v).trim())]));
    data.phone = data.phone.replace(/[\s-]/g, "");
    const errs: Record<string, string> = {};
    for (const k of ["company", "name", "phone", "fleet_size", "city"]) if (!data[k]) errs[k] = t.form.required;
    if (data.fleet_size && !/^\d+$/.test(data.fleet_size)) errs.fleet_size = t.form.badNumber;
    if (data.phone && !PHONE.test(data.phone)) errs.phone = t.form.badPhone;
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setState("sending");
    try {
      await api("/requests", { method: "POST", body: JSON.stringify({ ...data, fleet_size: Number(data.fleet_size) }) });
      setState("ok");
      form.reset();
      onDone?.();
    } catch (r) {
      setState(r instanceof Response && r.status === 429 ? "busy" : "fail");
    }
  }

  const field = (name: string, label: string, props: Record<string, unknown> = {}) => (
    <label className={`field ${errors[name] ? "has-error" : ""}`}>
      <span>{label}</span>
      <input
        name={name}
        {...props}
        aria-invalid={!!errors[name]}
        onInput={() => errors[name] && setErrors(({ [name]: _, ...rest }) => rest)}
      />
      {errors[name] && <small role="alert">{errors[name]}</small>}
    </label>
  );

  if (state === "ok")
    return (
      <div className="form-ok" role="status">
        <span className="ok-badge"><Icon name="check" size={34} /></span>
        <p>{t.form.ok}</p>
      </div>
    );

  return (
    <form className="lead-form" onSubmit={submit} noValidate>
      {field("company", t.form.company, { autoComplete: "organization" })}
      {field("name", t.form.name, { autoComplete: "name" })}
      <div className="row2">
        {field("phone", t.form.phone, { inputMode: "tel", autoComplete: "tel", dir: "ltr", placeholder: "09xx xxx xxxx" })}
        {field("fleet_size", t.form.fleet, { inputMode: "numeric", dir: "ltr", placeholder: "120" })}
      </div>
      {field("city", t.form.city)}
      {/* Honeypot: invisible to people and skipped by keyboard; bots that fill it get a fake success. */}
      <input name="website" className="hp" tabIndex={-1} autoComplete="off" aria-hidden />
      {(state === "fail" || state === "busy") && <p className="form-fail" role="alert">{state === "busy" ? t.form.tooMany : t.form.fail}</p>}
      <button className="btn btn-lg btn-block" disabled={state === "sending"}>{state === "sending" ? t.form.sending : t.form.submit}</button>
    </form>
  );
}
