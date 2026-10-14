"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent, type RefObject } from "react";
import { CountUp, fmt, Icon, LeadForm, LoadError, Nav, Plate, toLatin, useApi, useFx, useMoney } from "../components";
import { useApp } from "../providers";

type Vehicle = { id: number; plate: string; model: string; year: number; city: string; risk: "low" | "medium" | "high"; status: string; crack_mm: number; last_check: string };
type Fleet = { vehicles: Vehicle[]; risk: Record<string, number>; months: { m: number; repair: number; replace: number }[]; kpi: { covered: number; open: number; repaired: number; saved: number } };
type Req = { id: number; company: string; name: string; fleet_size: number; city: string; created: string };

const ORDER = { high: 0, medium: 1, low: 2 };
const KEY = "igf-admin"; // sessionStorage: cleared when the tab closes

// Apple's momentum projection (Designing Fluid Interfaces): where a flick would come to rest.
const project = (v: number, d = 0.998) => ((v / 1000) * d) / (1 - d);
// Soft resistance past the top edge instead of a hard stop.
const rubberband = (x: number, size: number, c = 0.55) => (x * size * c) / (size + c * Math.abs(x));

/** Drag the sheet's header down to dismiss: 1:1 tracking, interruptible, release velocity handed to the spring. */
function useSheetDrag(dialog: RefObject<HTMLDialogElement | null>) {
  const s = useRef({ y: 0, v: 0, grab: 0, last: 0, t: 0, raf: 0, on: false });
  const move = (y: number) => {
    s.current.y = y;
    dialog.current!.style.transform = y ? `translateY(${y}px)` : "";
  };
  // Critically damped spring (damping 1, response 0.3 s) in closed form, starting from the live offset and velocity.
  const settle = (to: number, done?: () => void) => {
    const w = (2 * Math.PI) / 0.3, x0 = s.current.y - to, v0 = s.current.v, t0 = performance.now();
    const step = (now: number) => {
      const t = (now - t0) / 1000, k = Math.exp(-w * t);
      const x = (x0 + (v0 + w * x0) * t) * k, v = (v0 - w * (v0 + w * x0) * t) * k;
      if (Math.abs(x) < 0.5 && Math.abs(v) < 20) {
        move(to);
        return done?.();
      }
      move(to + x);
      s.current.raf = requestAnimationFrame(step);
    };
    s.current.raf = requestAnimationFrame(step);
  };
  return {
    reset() {
      cancelAnimationFrame(s.current.raf);
      Object.assign(s.current, { y: 0, v: 0, on: false });
      dialog.current!.style.transform = dialog.current!.style.transition = "";
    },
    onPointerDown(e: PointerEvent<HTMLElement>) {
      // Phones only: there the dialog is a bottom sheet, so dragging down matches where it came from.
      if ((e.target as HTMLElement).closest("button") || !matchMedia("(max-width: 600px)").matches) return;
      cancelAnimationFrame(s.current.raf); // grab it mid-flight and keep going from where it is
      s.current.y = new DOMMatrix(getComputedStyle(dialog.current!).transform).m42; // the presentation value, even mid-entry
      e.currentTarget.setPointerCapture(e.pointerId);
      Object.assign(s.current, { on: true, grab: e.clientY - s.current.y, last: e.clientY, t: e.timeStamp, v: 0 });
      dialog.current!.style.transition = "none";
      move(s.current.y);
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      if (!s.current.on) return;
      const dt = e.timeStamp - s.current.t;
      if (dt > 0) s.current.v = 0.8 * (((e.clientY - s.current.last) / dt) * 1000) + 0.2 * s.current.v;
      Object.assign(s.current, { last: e.clientY, t: e.timeStamp });
      const y = e.clientY - s.current.grab;
      move(y >= 0 ? y : rubberband(y, dialog.current!.offsetHeight));
    },
    onPointerUp(e: PointerEvent<HTMLElement>) {
      if (!s.current.on) return;
      s.current.on = false;
      if (e.timeStamp - s.current.t > 80) s.current.v = 0; // finger stopped before lifting: no throw
      const h = dialog.current!.offsetHeight;
      const close = () => {
        dialog.current!.style.transition = "";
        dialog.current!.close(); // the inline offset keeps it offscreen while it closes; reset() clears it on the next open
      };
      if (s.current.y + project(s.current.v) > h / 2) settle(h, close);
      else settle(0, () => void (dialog.current!.style.transition = ""));
    },
  };
}

export default function Dashboard() {
  const { t, lang } = useApp();
  const money = useMoney();
  const fleetRes = useApi<Fleet>("/fleet");
  const fleet = fleetRes.data ?? null;
  const [token, setToken] = useState("");
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    try {
      setToken(sessionStorage.getItem(KEY) ?? "");
    } catch {}
    setAdmin(location.hash === "#admin");
  }, []);
  const reqs = useApi<Req[]>(token ? "/requests" : null, token);
  const saveToken = (v: string) => {
    setToken(v);
    try {
      if (v) sessionStorage.setItem(KEY, v);
      else sessionStorage.removeItem(KEY);
    } catch {}
  };
  const unlock = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const v = String(new FormData(e.currentTarget).get("key") ?? "").trim();
    if (v === token) reqs.retry(); // same key again: ask again instead of doing nothing
    saveToken(v);
  };
  const [risk, setRisk] = useState<string>("all");
  const [q, setQ] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const [formKey, setFormKey] = useState(0);
  const drag = useSheetDrag(dialog);
  const { reset, ...dragHandlers } = drag;
  const openForm = () => {
    setFormKey((k) => k + 1);
    reset();
    dialog.current?.showModal();
  };
  const backdropDown = useRef(false); // close on backdrop only when the press also started there (not a text selection ending outside)
  useFx(`${lang}${!!fleet}`);

  const date = (s: string) => new Intl.DateTimeFormat(lang === "fa" ? "fa-IR-u-ca-persian" : "en-US", { dateStyle: "medium" }).format(new Date(s));
  const name = (m: Record<string, string>, k: string) => m[k] ?? k;

  const rows = useMemo(() => {
    const s = toLatin(q.trim().toLowerCase()); // plates are stored with Latin digits; people type Persian ones
    return (fleet?.vehicles ?? [])
      .filter((v) => (risk === "all" || v.risk === risk) && (!s || `${v.plate} ${v.model} ${name(t.models, v.model)}`.toLowerCase().includes(s)))
      .sort((a, b) => ORDER[a.risk] - ORDER[b.risk] || b.crack_mm - a.crack_mm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleet, risk, q, lang]);

  const total = fleet ? fleet.kpi.covered : 1;
  const pct = (k: string) => ((fleet?.risk[k] ?? 0) / total) * 100;
  const max = Math.max(...(fleet?.months.map((m) => m.repair) ?? [1]));
  const kpis = fleet
    ? ([["covered", fleet.kpi.covered, "scan"], ["open", fleet.kpi.open, "drop"], ["repaired", fleet.kpi.repaired, "check"]] as const)
    : [];

  return (
    <>
      <Nav links={false} />
      <main className="dash">
        <div className="dash-head enter">
          <div>
            <p className="muted">{t.dash.hello}</p>
            <h1>{t.dash.title}</h1>
            <p className="dash-co">{t.dash.company} <span className="badge-soft">{t.dash.demo}</span></p>
          </div>
          <button className="btn" onClick={openForm}><Icon name="plus" size={18} />{t.dash.newRequest}</button>
        </div>

        {fleetRes.status !== undefined && <LoadError onRetry={fleetRes.retry} />}
        <div className="kpis">
          {kpis.map(([k, v, icon], i) => (
            <div key={k} className={`kpi spot reveal d${i}`}>
              <span className={`kpi-icon k${i}`}><Icon name={icon} size={20} /></span>
              <strong><CountUp to={v} /></strong>
              <span>{t.dash.kpi[k]}</span>
            </div>
          ))}
          {fleet && (
            <div className="kpi spot reveal d3 kpi-accent">
              <span className="kpi-icon k3"><Icon name="chart" size={20} /></span>
              <strong>{money(fleet.kpi.saved)}</strong>
              <span>{t.dash.kpi.saved}</span>
            </div>
          )}
          {!fleet && fleetRes.status === undefined && [0, 1, 2, 3].map((i) => <div key={i} className="kpi"><span className="skeleton tall" /></div>)}
        </div>

        <div className="dash-grid">
          <section className="panel reveal">
            <header className="panel-head">
              <h2>{t.dash.chart}</h2>
              <div className="legend"><span><i className="lg-repair" />{t.dash.repair}</span><span><i className="lg-replace" />{t.dash.replace}</span></div>
            </header>
            <div className="bars">
              {fleet?.months.map((m, i) => (
                <div key={m.m} className="bar-col">
                  <div className="bar-pair" role="img" aria-label={`${t.dash.months[i]}: ${fmt(m.repair, lang)} ${t.dash.repair} · ${fmt(m.replace, lang)} ${t.dash.replace}`}>
                    <i className="b-repair" style={{ height: `${(m.repair / max) * 100}%`, transitionDelay: `${i * 80}ms` }} title={`${fmt(m.repair, lang)}`} />
                    <i className="b-replace" style={{ height: `${(m.replace / max) * 100}%`, transitionDelay: `${i * 80 + 40}ms` }} title={`${fmt(m.replace, lang)}`} />
                  </div>
                  <span>{t.dash.months[i]}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel reveal d1">
            <header className="panel-head"><h2>{t.dash.riskMix}</h2></header>
            <div className="donut-wrap">
              <div className="donut" style={{ "--a": pct("low"), "--b": pct("low") + pct("medium") } as React.CSSProperties}>
                <div><strong>{fleet ? fmt(total, lang) : fleetRes.status === undefined ? <span className="skeleton" /> : "—"}</strong><span>{t.dash.unit}</span></div>
              </div>
              <ul className="donut-legend">
                {(["low", "medium", "high"] as const).map((k) => (
                  <li key={k}><i className={`r-${k}`} />{t.risk[k]}<b>{fmt(fleet?.risk[k] ?? 0, lang)}</b></li>
                ))}
              </ul>
            </div>
          </section>
        </div>

        <section className="panel reveal">
          <header className="panel-head wrap">
            <h2>{t.dash.vehicles}</h2>
            <div className="tools">
              <div className="segmented" role="group" aria-label={t.dash.filter}>
                {["all", "high", "medium", "low"].map((k) => (
                  <button key={k} aria-pressed={risk === k} className={risk === k ? "on" : ""} onClick={() => setRisk(k)}>
                    {k === "all" ? t.dash.all : t.risk[k]}
                  </button>
                ))}
              </div>
              <label className="search"><Icon name="search" size={16} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.dash.search} aria-label={t.dash.search} /></label>
            </div>
          </header>
          <div className="table" role="table" aria-label={t.dash.vehicles}>
            <div className="tr th" role="row">
              {(["plate", "model", "city", "risk", "crack", "status", "last"] as const).map((k) => <span key={k} role="columnheader">{t.dash.cols[k]}</span>)}
            </div>
            {rows.map((v) => (
              <div key={v.id} className="tr" role="row">
                <span role="cell"><Plate value={v.plate} /></span>
                <span role="cell" className="strong">{name(t.models, v.model)} <small className="muted">{fmt(v.year, lang, 0).replace(/[,٬]/g, "")}</small></span>
                <span role="cell" data-l={t.dash.cols.city}>{name(t.cities, v.city)}</span>
                <span role="cell" data-l={t.dash.cols.risk}><span className={`pill r-${v.risk}`}>{t.risk[v.risk]}</span></span>
                <span role="cell" data-l={t.dash.cols.crack}>{v.crack_mm ? `${fmt(v.crack_mm, lang)} ${t.dash.mm}` : "—"}</span>
                <span role="cell" data-l={t.dash.cols.status}>{t.status[v.status]}</span>
                <span role="cell" data-l={t.dash.cols.last} className="muted">{date(v.last_check)}</span>
              </div>
            ))}
          </div>
          <p className="empty" role="status">{fleet && !rows.length ? t.dash.empty : ""}</p>
        </section>

        {(admin || token) && (
          <section className="panel">
            <header className="panel-head">
              <h2>{t.dash.requests}</h2>
              {token && <button className="btn btn-sm btn-ghost" onClick={() => saveToken("")}>{t.dash.logout}</button>}
            </header>
            {!token || reqs.status === 401 ? (
              <form className="unlock" onSubmit={unlock}>
                <label className="field">
                  <span>{t.dash.adminHint}</span>
                  <input name="key" type="password" autoComplete="off" dir="ltr" placeholder={t.dash.adminKey} required autoFocus={!!token} aria-invalid={!!token} />
                  {token && <small role="alert">{t.dash.badKey}</small>}
                </label>
                <button className="btn">{t.dash.unlock}</button>
              </form>
            ) : reqs.status === 404 ? (
              <p className="empty">{t.dash.adminOff}</p>
            ) : reqs.status !== undefined ? (
              <LoadError onRetry={reqs.retry} />
            ) : !reqs.data ? (
              <span className="skeleton tall" />
            ) : reqs.data.length ? (
              <ul className="reqs">
                {reqs.data.map((r) => (
                  <li key={r.id}>
                    <span className="avatar">{r.company.slice(0, 1)}</span>
                    <div><b>{r.company}</b><small className="muted">{r.name} · {name(t.cities, r.city)}</small></div>
                    <span className="pill">{fmt(r.fleet_size, lang)} {t.dash.unit}</span>
                    <small className="muted">{date(r.created.replace(" ", "T") + "Z")}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">{t.dash.noRequests}</p>
            )}
          </section>
        )}
      </main>

      <dialog
        ref={dialog}
        className="sheet"
        aria-labelledby="sheet-title"
        onPointerDown={(e) => (backdropDown.current = e.target === e.currentTarget)}
        onClick={(e) => backdropDown.current && e.target === e.currentTarget && dialog.current?.close()}
      >
        <div className="sheet-in">
          <header className="panel-head sheet-drag" {...dragHandlers} onPointerCancel={drag.onPointerUp}>
            <span className="grabber" aria-hidden />
            <h2 id="sheet-title">{t.form.title}</h2>
            <button className="icon-btn" onClick={() => dialog.current?.close()} aria-label={t.dash.close}><Icon name="close" size={18} /></button>
          </header>
          <LeadForm key={formKey} onDone={token ? reqs.retry : undefined} />
        </div>
      </dialog>
    </>
  );
}
