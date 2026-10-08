"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CountUp, fmt, Icon, LeadForm, LoadError, Nav, perFrame, useApi, useFx, useMoney } from "./components";
import { useApp } from "./providers";
import { quote } from "./quote";

type Stats = { fleets: number; vehicles_checked: number; sla_minutes: number; renewal: number };
type Plan = { id: string; price: number; unit: string; features: string[]; featured?: boolean };

function Car() {
  const { t } = useApp();
  // Tilt tracks the pointer 1:1, with one layout read per frame.
  const tilt = useMemo(() => perFrame((el: HTMLElement, x: number, y: number) => {
    const r = el.getBoundingClientRect();
    el.style.setProperty("--ry", `${((x - r.left) / r.width - 0.5) * 14}deg`);
    el.style.setProperty("--rx", `${((y - r.top) / r.height - 0.5) * -10}deg`);
  }), []);
  const cracks = ["M0 0l-18-22-9-14", "M0 0l24-16 14-3", "M0 0l20 20 6 16", "M0 0l-22 14-18 4", "M0 0l4-28", "M0 0l-6 26 -8 10", "M0 0l30 4"];
  return (
    <div className="car-wrap" onPointerMove={(e) => tilt(e.currentTarget, e.clientX, e.clientY)} onPointerLeave={(e) => (e.currentTarget.style.setProperty("--rx", "0deg"), e.currentTarget.style.setProperty("--ry", "0deg"))}>
      <svg className="car" viewBox="0 0 600 360" role="img" aria-label="Windshield inspection">
        <defs>
          <linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--car-1)" /><stop offset="1" stopColor="var(--car-2)" /></linearGradient>
          <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--glass-1)" /><stop offset=".55" stopColor="var(--glass-2)" /><stop offset="1" stopColor="var(--glass-3)" /></linearGradient>
          <linearGradient id="glint" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".55" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
          <linearGradient id="scan" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#5ac8fa" stopOpacity="0" /><stop offset=".8" stopColor="#5ac8fa" stopOpacity=".35" /><stop offset="1" stopColor="#5ac8fa" /></linearGradient>
          <clipPath id="ws"><path d="M150 72Q300 50 450 72L502 214Q300 238 98 214Z" /></clipPath>
        </defs>
        <ellipse cx="300" cy="342" rx="250" ry="14" className="shadow" />
        <path d="M130 80Q300 30 470 80L520 214 60 214Z" fill="url(#body)" />
        <path d="M44 214Q300 250 556 214L574 300Q576 332 544 336H56Q24 332 26 300Z" fill="url(#body)" />
        <path d="M60 176q-26 0-28 14 0 12 30 10z M540 176q26 0 28 14 0 12-30 10z" fill="url(#body)" />
        <rect x="76" y="252" width="118" height="30" rx="15" className="lamp" />
        <rect x="406" y="252" width="118" height="30" rx="15" className="lamp" />
        <rect x="236" y="266" width="128" height="36" rx="12" className="grille" />
        <path d="M150 72Q300 50 450 72L502 214Q300 238 98 214Z" fill="url(#glass)" stroke="var(--frame)" strokeWidth="7" strokeLinejoin="round" />
        <g clipPath="url(#ws)">
          <rect className="glint" x="-200" y="40" width="120" height="220" fill="url(#glint)" transform="skewX(-20)" />
          <rect className="scanner" x="-80" y="50" width="80" height="200" fill="url(#scan)" />
          <g transform="translate(380 142)" className="crack">
            {cracks.map((d) => <path key={d} d={d} pathLength={100} />)}
            <circle r="3.5" className="impact" />
            <circle r="22" className="resin" />
          </g>
        </g>
        <g transform="translate(380 142)">
          <g className="reticle"><path d="M-34-20v-14h14M20-34h14v14M34 20v14H20M-20 34h-14V20" /></g>
          <g className="healed"><circle r="16" /><path d="M-7 0l5 5 9-10" /></g>
        </g>
      </svg>
      <div className="chip chip-a"><span className="dot dot-o" />{t.hero.chip1}</div>
      <div className="chip chip-b"><Icon name="shield" size={16} />{t.hero.chip2}</div>
      <div className="chip chip-c"><span className="dot dot-g" />{t.hero.chip3}</div>
    </div>
  );
}

function Calculator() {
  const { t, lang } = useApp();
  const money = useMoney();
  const [vehicles, setVehicles] = useState(250);
  const [rate, setRate] = useState(25);
  const q = quote(vehicles, rate); // computed locally: the numbers follow the thumb with no network wait
  const range = (label: string, v: number, set: (n: number) => void, min: number, max: number, step: number, suffix = "") => (
    <label className="range">
      <span className="range-top"><span>{label}</span><b>{fmt(v, lang)}{suffix}</b></span>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => set(+e.target.value)} style={{ "--p": `${((v - min) / (max - min)) * 100}%` } as React.CSSProperties} />
    </label>
  );
  return (
    <div className="calc glass reveal">
      <div className="calc-inputs">
        {range(t.calc.vehicles, vehicles, setVehicles, 50, 3000, 10)}
        {range(t.calc.rate, rate, setRate, 5, 60, 1, lang === "fa" ? "٪" : "%")}
        <p className="muted small">{t.calc.note}</p>
      </div>
      <div className="calc-out">
        <div className="out-row"><span>{t.calc.without}</span><s>{money(q.without)}</s></div>
        <div className="out-row"><span>{t.calc.with}</span><b>{money(q.with)}</b></div>
        <div className="out-saved" aria-live="polite">
          <span>{t.calc.saved}</span>
          {q.saved > 0 ? (
            <>
              <strong className="grad-text">{money(q.saved)}</strong>
              <em>{`${fmt(q.downtimeDays, lang)} ${t.calc.downtime}`}</em>
            </>
          ) : (
            <p className="no-save">{t.calc.noSave}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { t, lang } = useApp();
  const money = useMoney();
  const statsRes = useApi<Stats>("/stats");
  const plansRes = useApi<Plan[]>("/plans");
  const stats = statsRes.data;
  const plans = plansRes.data ?? [];
  useFx(`${lang}${plans.length}${!!stats}`);
  // Pause the hero's looping animations while it is offscreen: the SVG loops repaint on the main thread.
  const hero = useRef<HTMLElement>(null);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => hero.current?.classList.toggle("off", !e.isIntersecting));
    io.observe(hero.current!);
    return () => io.disconnect();
  }, []);
  const icons = ["drop", "scan", "user", "chart"];

  return (
    <>
      <Nav />
      <main>
        <section className="hero" ref={hero}>
          <div className="aurora" aria-hidden><i /><i /><i /></div>
          <div className="hero-copy">
            <p className="eyebrow reveal"><span className="pulse" />{t.hero.eyebrow}</p>
            <h1 className="reveal d1">{t.hero.t1}<br /><span className="grad-text">{t.hero.t2}</span></h1>
            <p className="lead reveal d2">{t.hero.sub}</p>
            <div className="cta-row reveal d3">
              <a href="#request" className="btn btn-lg">{t.hero.cta1}<Icon name="arrow" size={18} className="flip" /></a>
              <Link href="/dashboard" className="btn btn-lg btn-ghost">{t.hero.cta2}</Link>
            </div>
          </div>
          <div className="hero-visual reveal d2"><Car /></div>
        </section>

        <section className="stats">
          <p className="caption">{t.stats.caption}</p>
          {statsRes.status !== undefined && <LoadError onRetry={statsRes.retry} />}
          <div className="stats-grid">
            {([["fleets", stats?.fleets], ["vehicles", stats?.vehicles_checked], ["sla", stats?.sla_minutes], ["renewal", stats?.renewal]] as const).map(([k, v], i) => (
              <div key={k} className={`stat reveal d${i}`}>
                <strong>{v != null ? <CountUp to={v} /> : statsRes.status === undefined ? <span className="skeleton" /> : "—"}</strong>
                <span>{t.stats[k]}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="services" className="section">
          <p className="kicker reveal">{t.services.kicker}</p>
          <h2 className="reveal d1">{t.services.title}</h2>
          <div className="bento">
            {t.services.items.map((s, i) => (
              <article key={i} className={`card spot reveal d${i} card-${i}`}>
                <span className="card-icon"><Icon name={icons[i]} size={24} /></span>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
                {i === 0 && <div className="heal-demo" aria-hidden><span className="hd-crack" /><span className="hd-resin" /></div>}
                {i === 3 && <div className="mini-bars" aria-hidden>{[40, 62, 55, 78, 70, 92].map((h, j) => <i key={j} style={{ height: `${h}%`, transitionDelay: `${j * 70}ms` }} />)}</div>}
              </article>
            ))}
          </div>
        </section>

        <section className="section">
          <p className="kicker reveal">{t.steps.kicker}</p>
          <h2 className="reveal d1">{t.steps.title}</h2>
          <ol className="steps reveal d2">
            {t.steps.items.map((s, i) => (
              <li key={i}>
                <span className="step-n">{fmt(i + 1, lang)}</span>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="calc" className="section">
          <p className="kicker reveal">{t.calc.kicker}</p>
          <h2 className="reveal d1">{t.calc.title}</h2>
          <p className="lead center reveal d2">{t.calc.sub}</p>
          <Calculator />
        </section>

        <section id="pricing" className="section">
          <p className="kicker reveal">{t.pricing.kicker}</p>
          <h2 className="reveal d1">{t.pricing.title}</h2>
          {plansRes.status !== undefined && <LoadError onRetry={plansRes.retry} />}
          <div className="plans">
            {!plansRes.data && plansRes.status === undefined && [0, 1, 2].map((i) => <div key={i} className="plan"><span className="skeleton tall" /></div>)}
            {plans.map((p, i) => (
              <article key={p.id} className={`plan spot reveal d${i} ${p.featured ? "featured" : ""}`}>
                {p.featured && <span className="badge">{t.pricing.popular}</span>}
                <h3>{t.pricing.plans[p.id]}</h3>
                <p className="price">{p.id === "enterprise" && <small>{t.pricing.from} </small>}{money(p.price)}</p>
                <p className="muted small">{t.pricing.units[p.unit]}</p>
                <ul>{p.features.map((f) => <li key={f}><Icon name="check" size={16} />{t.pricing.features[f]}</li>)}</ul>
                <a href="#request" className={`btn btn-block ${p.featured ? "" : "btn-ghost"}`}>{t.pricing.choose}</a>
              </article>
            ))}
          </div>
        </section>

        <section id="request" className="section request">
          <div className="request-copy reveal">
            <h2>{t.form.title}</h2>
            <p className="lead">{t.form.sub}</p>
            <ul className="trust">
              {[t.pricing.features.sla, t.pricing.features.photo_report, t.pricing.features.onsite].map((x) => <li key={x}><Icon name="check" size={18} />{x}</li>)}
            </ul>
          </div>
          <div className="glass form-card reveal d1"><LeadForm /></div>
        </section>
      </main>
      <footer className="footer">
        <span>{t.footer.rights}</span>
        <span className="muted">{t.footer.tag}</span>
      </footer>
    </>
  );
}
