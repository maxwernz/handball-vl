import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { MatchEvent } from '../../../shared/types.ts';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceMax(value: number) {
  const step = value > 20 ? 10 : value > 8 ? 5 : 2;
  return Math.max(step, Math.ceil(value / step) * step);
}

function ticks(max: number) {
  const step = max > 20 ? 10 : max > 8 ? 5 : max > 4 ? 2 : 1;
  const out: number[] = [];
  for (let v = 0; v <= max; v += step) out.push(v);
  return out;
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-(--color-ink-2)">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(x, 70), width - 70);
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-(--color-line) bg-(--color-surface) px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg"
      style={{ left, top: y - 8 }}
    >
      {children}
    </div>
  );
}

const AXIS = 'var(--color-ink-3)';
const GRID = 'var(--color-line)';

/** Running score of both teams over the game clock. */
export function ScoreFlowChart({ events, home, guest }: { events: MatchEvent[]; home: string; guest: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const goals = events.filter((e) => e.type === 'goal' || e.type === 'sevenGoal');
  const height = 220;
  const m = { top: 12, right: 44, bottom: 26, left: 30 };
  const end = Math.max(3600, ...goals.map((g) => g.t));
  const yMax = niceMax(Math.max(1, ...goals.map((g) => Math.max(g.homeScore, g.guestScore))));
  const innerW = Math.max(0, width - m.left - m.right);
  const innerH = height - m.top - m.bottom;
  const x = (t: number) => m.left + (t / end) * innerW;
  const y = (v: number) => m.top + innerH - (v / yMax) * innerH;

  const path = (pick: (e: MatchEvent) => number) => {
    let d = `M${x(0)},${y(0)}`;
    let last = 0;
    for (const g of goals) {
      d += `H${x(g.t)}V${y(pick(g))}`;
      last = pick(g);
    }
    return { d: `${d}H${x(end)}`, last };
  };
  const homeLine = path((e) => e.homeScore);
  const guestLine = path((e) => e.guestScore);

  const scoreAt = (t: number) => {
    const before = goals.filter((g) => g.t <= t).at(-1);
    return before ? `${before.homeScore}:${before.guestScore}` : '0:0';
  };
  const onMove = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect();
    const t = ((clientX - rect.left - m.left) / innerW) * end;
    setHover(t < 0 || t > end ? null : t);
  };

  return (
    <div>
      <Legend items={[{ label: home, color: 'var(--color-home)' }, { label: guest, color: 'var(--color-guest)' }]} />
      <div
        ref={ref}
        className="relative touch-pan-y select-none"
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={`Spielverlauf ${home} gegen ${guest}`}>
            {ticks(yMax).map((v) => (
              <g key={v}>
                <line x1={m.left} x2={width - m.right} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={1} />
                <text x={m.left - 6} y={y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill={AXIS}>
                  {v}
                </text>
              </g>
            ))}
            {[0, 10, 20, 30, 40, 50, 60].map((min) => (
              <text key={min} x={x(min * 60)} y={height - 8} textAnchor="middle" fontSize={11} fill={AXIS}>
                {min}'
              </text>
            ))}
            <line x1={x(1800)} x2={x(1800)} y1={m.top} y2={m.top + innerH} stroke={AXIS} strokeDasharray="3 4" />
            <text x={x(1800) + 4} y={m.top + 10} fontSize={10} fill={AXIS}>
              Halbzeit
            </text>
            <path d={guestLine.d} fill="none" stroke="var(--color-guest)" strokeWidth={2} strokeLinejoin="round" />
            <path d={homeLine.d} fill="none" stroke="var(--color-home)" strokeWidth={2} strokeLinejoin="round" />
            <text x={width - m.right + 6} y={y(homeLine.last)} dy="0.32em" fontSize={12} fontWeight={700} fill="var(--color-ink)">
              {homeLine.last}
            </text>
            <text
              x={width - m.right + 6}
              y={y(guestLine.last) + (Math.abs(homeLine.last - guestLine.last) < 2 ? (guestLine.last > homeLine.last ? -12 : 12) : 0)}
              dy="0.32em"
              fontSize={12}
              fontWeight={700}
              fill="var(--color-ink-2)"
            >
              {guestLine.last}
            </text>
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={m.top} y2={m.top + innerH} stroke="var(--color-ink-2)" />}
          </svg>
        )}
        {hover !== null && (
          <Tooltip x={x(hover)} y={m.top + 10} width={width}>
            <strong>{Math.floor(hover / 60) + 1}. Minute</strong> · {scoreAt(hover)}
          </Tooltip>
        )}
      </div>
    </div>
  );
}

const PERIOD_LABELS = ["1–10'", "11–20'", "21–30'", "31–40'", "41–50'", "51–60'"];

/** Grouped bars per 10-minute window, e.g. goals scored vs. conceded. */
export function PeriodBars({ series }: { series: { label: string; values: number[]; color: string }[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const height = 190;
  const m = { top: 14, right: 8, bottom: 24, left: 30 };
  const yMax = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const innerW = Math.max(0, width - m.left - m.right);
  const innerH = height - m.top - m.bottom;
  const group = innerW / PERIOD_LABELS.length;
  const barW = Math.min(28, (group * 0.7) / series.length);
  const y = (v: number) => m.top + innerH - (v / yMax) * innerH;

  return (
    <div>
      {series.length > 1 && <Legend items={series} />}
      <div ref={ref} className="relative" onPointerLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={`Tore nach Spielabschnitt: ${series.map((s) => s.label).join(', ')}`}>
            {ticks(yMax).map((v) => (
              <g key={v}>
                <line x1={m.left} x2={width - m.right} y1={y(v)} y2={y(v)} stroke={GRID} />
                <text x={m.left - 6} y={y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill={AXIS}>
                  {v}
                </text>
              </g>
            ))}
            {PERIOD_LABELS.map((label, i) => {
              const cx = m.left + group * i + group / 2;
              const start = cx - (barW * series.length + 2 * (series.length - 1)) / 2;
              return (
                <g key={label} onPointerEnter={() => setHover(i)}>
                  <rect x={m.left + group * i} y={m.top} width={group} height={innerH} fill={hover === i ? 'var(--color-surface-2)' : 'transparent'} />
                  {series.map((s, j) => {
                    const v = s.values[i];
                    const h = Math.max(0, y(0) - y(v));
                    const r = Math.min(4, h, barW / 2);
                    const bx = start + j * (barW + 2);
                    const top = y(v);
                    return (
                      <path
                        key={s.label}
                        d={`M${bx},${y(0)}V${top + r}Q${bx},${top} ${bx + r},${top}H${bx + barW - r}Q${bx + barW},${top} ${bx + barW},${top + r}V${y(0)}Z`}
                        fill={s.color}
                      />
                    );
                  })}
                  <text x={cx} y={height - 6} textAnchor="middle" fontSize={11} fill={AXIS}>
                    {label}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
        {hover !== null && (
          <Tooltip x={m.left + group * hover + group / 2} y={m.top + 14} width={width}>
            <div className="font-semibold">Minute {PERIOD_LABELS[hover]}</div>
            {series.map((s) => (
              <div key={s.label} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                {s.label}: <strong>{s.values[hover]}</strong>
              </div>
            ))}
          </Tooltip>
        )}
      </div>
    </div>
  );
}

/** One bar per game (single series), labelled below with a short opponent name. */
export function GameBars({ data }: { data: { label: string; value: number; detail: string }[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const height = 180;
  const m = { top: 18, right: 6, bottom: 26, left: 26 };
  const yMax = niceMax(Math.max(1, ...data.map((d) => d.value)));
  const innerW = Math.max(0, width - m.left - m.right);
  const innerH = height - m.top - m.bottom;
  const slot = data.length ? innerW / data.length : 0;
  const barW = Math.max(4, Math.min(26, slot - 4));
  const y = (v: number) => m.top + innerH - (v / yMax) * innerH;
  const labelEvery = Math.ceil(data.length / Math.max(1, Math.floor(innerW / 44)));

  return (
    <div ref={ref} className="relative" onPointerLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Tore pro Spiel">
          {ticks(yMax).map((v) => (
            <g key={v}>
              <line x1={m.left} x2={width - m.right} y1={y(v)} y2={y(v)} stroke={GRID} />
              <text x={m.left - 6} y={y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill={AXIS}>
                {v}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const bx = m.left + slot * i + (slot - barW) / 2;
            const top = y(d.value);
            const h = y(0) - top;
            const r = Math.min(4, h, barW / 2);
            return (
              <g key={i} onPointerEnter={() => setHover(i)}>
                <rect x={m.left + slot * i} y={m.top} width={slot} height={innerH + m.bottom} fill="transparent" />
                {h > 0 && (
                  <path
                    d={`M${bx},${y(0)}V${top + r}Q${bx},${top} ${bx + r},${top}H${bx + barW - r}Q${bx + barW},${top} ${bx + barW},${top + r}V${y(0)}Z`}
                    fill="var(--color-brand)"
                    opacity={hover === null || hover === i ? 1 : 0.55}
                  />
                )}
                {i % labelEvery === 0 && (
                  <text x={bx + barW / 2} y={height - 8} textAnchor="middle" fontSize={10} fill={AXIS}>
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <Tooltip x={m.left + slot * hover + slot / 2} y={y(data[hover].value)} width={width}>
          {data[hover].detail}: <strong>{data[hover].value}</strong>
        </Tooltip>
      )}
    </div>
  );
}

/** Two-sided comparison bar used for head-to-head match stats. */
export function CompareBar({ label, home, guest, format = String }: { label: string; home: number; guest: number; format?: (n: number) => string }) {
  const total = home + guest;
  const share = total ? (home / total) * 100 : 50;
  return (
    <div className="py-2">
      <div className="mb-1 flex justify-between text-sm">
        <span className="tabular font-semibold">{format(home)}</span>
        <span className="text-(--color-ink-2)">{label}</span>
        <span className="tabular font-semibold">{format(guest)}</span>
      </div>
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
        <div className="rounded-l-full bg-(--color-home)" style={{ width: `${share}%` }} />
        <div className="flex-1 rounded-r-full bg-(--color-guest)" />
      </div>
    </div>
  );
}
