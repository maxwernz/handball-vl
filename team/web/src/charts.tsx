// Small SVG charts drawn at the container's real pixel width, so text never scales.
// Series colors: --we (us) and --opp (opponent); text always uses text tokens.

import { useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { fmtClock, fmtPct } from './ui.tsx';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    setWidth(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

interface Tip {
  x: number;
  y: number;
  content: ReactNode;
}

function TipBox({ tip, width }: { tip: Tip | null; width: number }) {
  if (!tip) return null;
  const left = Math.min(Math.max(tip.x, 90), width - 90);
  return (
    <div className="chart-tip" style={{ left, top: tip.y }} role="status">
      {tip.content}
    </div>
  );
}

function niceMax(v: number) {
  if (v <= 5) return 5;
  const step = v <= 20 ? 5 : v <= 50 ? 10 : 20;
  return Math.ceil(v / step) * step;
}

/** Rounded top, square bottom: the 4px data-end. */
function barPath(x: number, y: number, w: number, h: number) {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
/** Rounded right end for horizontal bars. */
function hbarPath(x: number, y: number, w: number, h: number) {
  if (w <= 0) return '';
  const r = Math.min(4, h / 2, w);
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
}

export interface PairGroup {
  key: string;
  label: string;
  sub?: string;
  a: number;
  b: number;
  tip: ReactNode;
  onClick?: () => void;
}

/** Grouped columns: us vs. opponent per group (games, segments …). */
export function PairColumns({ groups, height = 220, ariaLabel }: { groups: PairGroup[]; height?: number; ariaLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const pad = { l: 28, r: 4, t: 10, b: groups.some((g) => g.sub) ? 40 : 26 };
  const max = niceMax(Math.max(1, ...groups.flatMap((g) => [g.a, g.b])));
  const ih = height - pad.t - pad.b;
  const band = groups.length ? (width - pad.l - pad.r) / groups.length : 0;
  const bw = Math.max(3, Math.min(24, (band - 10) / 2));
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const ticks = [0, max / 2, max].map((v) => Math.round(v));
  const showEvery = Math.max(1, Math.ceil(64 / Math.max(band, 1)));
  return (
    <div ref={ref} className="chart" onMouseLeave={() => { setTip(null); setHover(null); }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} className="grid" />
              <text x={pad.l - 6} y={y(t)} dy="0.32em" textAnchor="end" className="axis">{t}</text>
            </g>
          ))}
          {groups.map((g, i) => {
            const cx = pad.l + band * i + band / 2;
            const dim = hover && hover !== g.key;
            return (
              <g key={g.key} opacity={dim ? 0.45 : 1}>
                <path d={barPath(cx - bw - 1, y(g.a), bw, y(0) - y(g.a))} className="fill-we" />
                <path d={barPath(cx + 1, y(g.b), bw, y(0) - y(g.b))} className="fill-opp" />
                {i % showEvery === 0 && (
                  <>
                    <text x={cx} y={height - pad.b + 16} textAnchor="middle" className="axis">{g.label}</text>
                    {g.sub && <text x={cx} y={height - pad.b + 30} textAnchor="middle" className="axis muted">{g.sub}</text>}
                  </>
                )}
                <rect
                  x={cx - band / 2}
                  y={pad.t}
                  width={band}
                  height={ih + pad.b}
                  fill="transparent"
                  style={{ cursor: g.onClick ? 'pointer' : 'default' }}
                  onMouseEnter={() => { setHover(g.key); setTip({ x: cx, y: Math.min(y(g.a), y(g.b)) - 8, content: g.tip }); }}
                  onClick={g.onClick}
                />
              </g>
            );
          })}
          <line x1={pad.l} x2={width - pad.r} y1={y(0)} y2={y(0)} className="baseline" />
        </svg>
      )}
      <TipBox tip={tip} width={width} />
    </div>
  );
}

export interface ZoneRow {
  label: string;
  a: [number, number];
  b?: [number, number];
}

/** Horizontal percentage bars per zone, with "made/attempts" at the tip. */
export function ZoneBars({ rows, aLabel, bLabel }: { rows: ZoneRow[]; aLabel: string; bLabel?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const two = rows.some((r) => r.b);
  const labelW = 86, valueW = 92, barH = 12, gap = 4;
  const rowH = two ? barH * 2 + gap + 16 : barH + 18;
  const height = rows.length * rowH + 4;
  const iw = Math.max(40, width - labelW - valueW);
  const bar = (v: [number, number], yy: number, cls: string, who: string, label: string) => {
    const p = v[1] ? v[0] / v[1] : 0;
    return (
      <g>
        <rect x={labelW} y={yy} width={iw} height={barH} rx={4} className="track" />
        <path d={hbarPath(labelW, yy, iw * p, barH)} className={cls} />
        <text x={labelW + iw + 8} y={yy + barH / 2} dy="0.34em" className="value">
          {v[1] ? `${v[0]}/${v[1]} · ${fmtPct(p)}` : '–'}
        </text>
        <rect x={0} y={yy - 2} width={width} height={barH + 4} fill="transparent"
          onMouseEnter={() => setTip({ x: labelW + iw * p, y: yy - 4, content: <><b>{label}</b> · {who}<br />{v[0]} von {v[1]} · {fmtPct(v[1] ? p : null)}</> })} />
      </g>
    );
  };
  return (
    <div ref={ref} className="chart" onMouseLeave={() => setTip(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`Quote je Wurfposition: ${aLabel}${bLabel ? ` und ${bLabel}` : ''}`}>
          {rows.map((r, i) => {
            const top = i * rowH + 2;
            return (
              <g key={r.label}>
                <text x={0} y={top + (two ? barH + gap / 2 : barH / 2)} dy="0.34em" className="label">{r.label}</text>
                {bar(r.a, top, 'fill-we', aLabel, r.label)}
                {r.b && bar(r.b, top + barH + gap, 'fill-opp', bLabel ?? '', r.label)}
              </g>
            );
          })}
        </svg>
      )}
      <TipBox tip={tip} width={width} />
    </div>
  );
}

export interface LeadPoint {
  t: number;
  lead: number;
  for: number;
  against: number;
}

/** Lead over game time as a step line; washes above/below zero; halftime marker. */
export function LeadChart({ points, height = 220 }: { points: LeadPoint[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<LeadPoint | null>(null);
  const pad = { l: 30, r: 10, t: 12, b: 24 };
  const end = Math.max(3600, ...points.map((p) => p.t));
  const m = Math.max(3, ...points.map((p) => Math.abs(p.lead)));
  const max = m <= 5 ? 5 : Math.ceil(m / 2) * 2;
  const iw = width - pad.l - pad.r, ih = height - pad.t - pad.b;
  const x = (t: number) => pad.l + (t / end) * iw;
  const y = (v: number) => pad.t + ih / 2 - (v / max) * (ih / 2);
  let d = `M${x(0)},${y(0)}`;
  for (const p of points.slice(1)) d += `H${x(p.t)}V${y(p.lead)}`;
  d += `H${x(end)}`;
  const area = `${d}V${y(0)}H${x(0)}Z`;
  const ticks = [-max, -max / 2, 0, max / 2, max];
  const onMove = (e: MouseEvent<SVGRectElement>) => {
    const box = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const t = ((e.clientX - box.left) / box.width) * end;
    let cur = points[0];
    for (const p of points) if (p.t <= t) cur = p;
    setHover({ ...cur, t: Math.round(t) });
  };
  return (
    <div ref={ref} className="chart" onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Führung im Spielverlauf">
          <defs>
            <clipPath id="lead-above"><rect x={0} y={0} width={width} height={y(0)} /></clipPath>
            <clipPath id="lead-below"><rect x={0} y={y(0)} width={width} height={height} /></clipPath>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} className={t === 0 ? 'baseline' : 'grid'} />
              <text x={pad.l - 6} y={y(t)} dy="0.32em" textAnchor="end" className="axis">{t > 0 ? `+${t}` : t}</text>
            </g>
          ))}
          {[0, 10, 20, 30, 40, 50, 60].map((mn) => (
            <text key={mn} x={x(mn * 60)} y={height - 6} textAnchor="middle" className="axis">{mn}'</text>
          ))}
          <line x1={x(1800)} x2={x(1800)} y1={pad.t} y2={pad.t + ih} className="halftime" />
          <text x={x(1800) + 4} y={pad.t + 10} className="axis muted">Halbzeit</text>
          <path d={area} className="wash-we" clipPath="url(#lead-above)" />
          <path d={area} className="wash-opp" clipPath="url(#lead-below)" />
          <path d={d} className="lead-line" />
          {hover && (
            <g>
              <line x1={x(hover.t)} x2={x(hover.t)} y1={pad.t} y2={pad.t + ih} className="crosshair" />
              <circle cx={x(hover.t)} cy={y(hover.lead)} r={4.5} className={hover.lead >= 0 ? 'dot-we' : 'dot-opp'} />
            </g>
          )}
          <rect x={pad.l} y={pad.t} width={Math.max(0, iw)} height={ih} fill="transparent" onMouseMove={onMove} />
        </svg>
      )}
      {hover && (
        <TipBox
          width={width}
          tip={{ x: x(hover.t), y: y(hover.lead) - 10, content: <><b>{fmtClock(hover.t)}</b> · Stand {hover.for}:{hover.against}<br />{hover.lead === 0 ? 'Gleichstand' : hover.lead > 0 ? `+${hover.lead} Führung` : `${hover.lead} Rückstand`}</> }}
        />
      )}
    </div>
  );
}

export interface ColumnItem {
  key: string;
  label: string;
  value: number;
  /** Optional track behind the bar (e.g. shots behind goals). */
  track?: number;
  tip: ReactNode;
  onClick?: () => void;
}

/** Single-series columns with an optional lighter track (attempts) behind each value. */
export function Columns({ items, height = 180, ariaLabel, percent = false }: { items: ColumnItem[]; height?: number; ariaLabel: string; percent?: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const pad = { l: 30, r: 4, t: 10, b: 26 };
  const max = percent ? 1 : niceMax(Math.max(1, ...items.map((i) => Math.max(i.value, i.track ?? 0))));
  const ih = height - pad.t - pad.b;
  const band = items.length ? (width - pad.l - pad.r) / items.length : 0;
  const bw = Math.max(4, Math.min(24, band - 12));
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const ticks = percent ? [0, 0.5, 1] : [0, max / 2, max].map(Math.round);
  const showEvery = Math.max(1, Math.ceil(56 / Math.max(band, 1)));
  return (
    <div ref={ref} className="chart" onMouseLeave={() => setTip(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} className="grid" />
              <text x={pad.l - 6} y={y(t)} dy="0.32em" textAnchor="end" className="axis">{percent ? `${t * 100}%` : t}</text>
            </g>
          ))}
          {items.map((it, i) => {
            const cx = pad.l + band * i + band / 2;
            return (
              <g key={it.key}>
                {it.track !== undefined && <path d={barPath(cx - bw / 2, y(it.track), bw, y(0) - y(it.track))} className="track" />}
                <path d={barPath(cx - bw / 2, y(it.value), bw, y(0) - y(it.value))} className="fill-we" />
                {i % showEvery === 0 && <text x={cx} y={height - 8} textAnchor="middle" className="axis">{it.label}</text>}
                <rect x={cx - band / 2} y={pad.t} width={band} height={ih + pad.b} fill="transparent" style={{ cursor: it.onClick ? 'pointer' : 'default' }}
                  onMouseEnter={() => setTip({ x: cx, y: y(Math.max(it.value, it.track ?? 0)) - 8, content: it.tip })} onClick={it.onClick} />
              </g>
            );
          })}
          <line x1={pad.l} x2={width - pad.r} y1={y(0)} y2={y(0)} className="baseline" />
        </svg>
      )}
      <TipBox tip={tip} width={width} />
    </div>
  );
}

/** Mirrored comparison row: value | bar ← label → bar | value. */
export function CompareRow({ label, a, b, format = String }: { label: string; a: number; b: number; format?: (v: number) => string }) {
  const total = a + b || 1;
  return (
    <div className="compare-row">
      <span className="compare-val">{format(a)}</span>
      <div className="compare-bars">
        <div className="compare-label">{label}</div>
        <div className="compare-track">
          <div className="compare-a" style={{ width: `${(a / total) * 100}%` }} />
          <div className="compare-b" style={{ width: `${(b / total) * 100}%` }} />
        </div>
      </div>
      <span className="compare-val">{format(b)}</span>
    </div>
  );
}
