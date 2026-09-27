"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, CountUp, fmt, Icon, LeadForm, Nav, Plate, useFx, useMoney } from "../components";
import { useApp } from "../providers";

type Vehicle = { id: number; plate: string; model: string; year: number; city: string; risk: "low" | "medium" | "high"; status: string; crack_mm: number; last_check: string };
type Fleet = { vehicles: Vehicle[]; risk: Record<string, number>; months: { m: number; repair: number; replace: number }[]; kpi: { covered: number; open: number; repaired: number; saved: number } };
type Req = { id: number; company: string; name: string; fleet_size: number; city: string; created: string };

const ORDER = { high: 0, medium: 1, low: 2 };

export default function Dashboard() {
  const { t, lang } = useApp();
  const money = useMoney();
  const [fleet, setFleet] = useState<Fleet | null>(null);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [risk, setRisk] = useState<string>("all");
  const [q, setQ] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const [formKey, setFormKey] = useState(0);
  const openForm = () => (setFormKey((k) => k + 1), dialog.current?.showModal());

  const loadReqs = useCallback(() => api<Req[]>("/requests").then(setReqs).catch(() => {}), []);
  useEffect(() => {
    api<Fleet>("/fleet").then(setFleet).catch(() => {});
    loadReqs();
  }, [loadReqs]);
  useFx(`${lang}${!!fleet}`);

  const date = (s: string) => new Intl.DateTimeFormat(lang === "fa" ? "fa-IR-u-ca-persian" : "en-US", { dateStyle: "medium" }).format(new Date(s));
  const name = (m: Record<string, string>, k: string) => m[k] ?? k;

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
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
        <div className="dash-head reveal">
          <div>
            <p className="muted">{t.dash.hello}</p>
            <h1>{t.dash.title}</h1>
            <p className="dash-co">{t.dash.company} <span className="badge-soft">{t.dash.demo}</span></p>
          </div>
          <button className="btn" onClick={openForm}><Icon name="plus" size={18} />{t.dash.newRequest}</button>
        </div>

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
          {!fleet && [0, 1, 2, 3].map((i) => <div key={i} className="kpi"><span className="skeleton tall" /></div>)}
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
                  <div className="bar-pair">
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
                <div><strong>{fmt(total, lang)}</strong><span>{t.dash.vehicles}</span></div>
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
              <div className="segmented" role="tablist">
                {["all", "high", "medium", "low"].map((k) => (
                  <button key={k} role="tab" aria-selected={risk === k} className={risk === k ? "on" : ""} onClick={() => setRisk(k)}>
                    {k === "all" ? t.dash.all : t.risk[k]}
                  </button>
                ))}
              </div>
              <label className="search"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.dash.search} /></label>
            </div>
          </header>
          <div className="table">
            <div className="tr th">
              <span>{t.dash.cols.plate}</span><span>{t.dash.cols.model}</span><span>{t.dash.cols.city}</span><span>{t.dash.cols.risk}</span>
              <span>{t.dash.cols.crack}</span><span>{t.dash.cols.status}</span><span>{t.dash.cols.last}</span>
            </div>
            {rows.map((v) => (
              <div key={v.id} className="tr">
                <span><Plate value={v.plate} /></span>
                <span className="strong">{name(t.models, v.model)} <small className="muted">{fmt(v.year, lang, 0).replace(/[,٬]/g, "")}</small></span>
                <span data-l={t.dash.cols.city}>{name(t.cities, v.city)}</span>
                <span data-l={t.dash.cols.risk}><span className={`pill r-${v.risk}`}>{t.risk[v.risk]}</span></span>
                <span data-l={t.dash.cols.crack}>{v.crack_mm ? `${fmt(v.crack_mm, lang)} ${t.dash.mm}` : "—"}</span>
                <span data-l={t.dash.cols.status}>{t.status[v.status]}</span>
                <span data-l={t.dash.cols.last} className="muted">{date(v.last_check)}</span>
              </div>
            ))}
            {fleet && !rows.length && <p className="empty">{t.dash.empty}</p>}
          </div>
        </section>

        <section className="panel reveal">
          <header className="panel-head"><h2>{t.dash.requests}</h2></header>
          {reqs.length ? (
            <ul className="reqs">
              {reqs.map((r) => (
                <li key={r.id}>
                  <span className="avatar">{r.company.slice(0, 1)}</span>
                  <div><b>{r.company}</b><small className="muted">{r.name} · {name(t.cities, r.city)}</small></div>
                  <span className="pill">{fmt(r.fleet_size, lang)} {t.dash.vehicles}</span>
                  <small className="muted">{date(r.created.replace(" ", "T") + "Z")}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">{t.dash.noRequests}</p>
          )}
        </section>
      </main>

      <dialog ref={dialog} className="sheet" onClick={(e) => e.target === dialog.current && dialog.current.close()}>
        <div className="sheet-in">
          <header className="panel-head">
            <h2>{t.form.title}</h2>
            <button className="icon-btn" onClick={() => dialog.current?.close()} aria-label={t.dash.close}><Icon name="close" size={18} /></button>
          </header>
          <LeadForm key={formKey} onDone={loadReqs} />
        </div>
      </dialog>
    </>
  );
}
