// Small descriptive statistics helpers. All functions ignore null/NaN values.

export const clean = (values: (number | null | undefined)[]) => values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

export function mean(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN;
}

/** Sample standard deviation (n − 1). */
export function sd(values: number[]) {
  if (values.length < 2) return NaN;
  const m = mean(values);
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1));
}

export function quantile(values: number[], q: number) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (pos - lo);
}

/** Two-sided 95 % confidence interval of the mean (normal approximation; t for small n). */
export function ci95(values: number[]) {
  const n = values.length;
  const t = n > 30 ? 1.96 : [NaN, NaN, 12.71, 4.3, 3.18, 2.78, 2.57, 2.45, 2.36, 2.31, 2.26, 2.23, 2.2, 2.18, 2.16, 2.14, 2.13, 2.12, 2.11, 2.1, 2.09, 2.09, 2.08, 2.07, 2.07, 2.06, 2.06, 2.06, 2.05, 2.05, 2.05][n];
  const half = t * sd(values) / Math.sqrt(n);
  return [mean(values) - half, mean(values) + half] as const;
}

/** Wilson score interval for a proportion k/n (95 %). */
export function wilson(k: number, n: number) {
  if (!n) return [NaN, NaN] as const;
  const z = 1.96;
  const p = k / n;
  const centre = (p + z * z / (2 * n)) / (1 + z * z / n);
  const half = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / (1 + z * z / n);
  return [centre - half, centre + half] as const;
}

export function regression(xs: number[], ys: number[]) {
  const pairs = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const n = pairs.length;
  if (n < 3) return null;
  const mx = mean(pairs.map((p) => p[0]));
  const my = mean(pairs.map((p) => p[1]));
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pairs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  if (!sxx || !syy) return null;
  const slope = sxy / sxx;
  const r = sxy / Math.sqrt(sxx * syy);
  // t statistic for H0: r = 0, two-sided p from Student's t with n − 2 degrees of freedom.
  const t = r * Math.sqrt((n - 2) / (1 - r * r));
  return { n, slope, intercept: my - slope * mx, r, r2: r * r, t, p: pFromT(t, n - 2) };
}

/** Two-sided p value of a Student t statistic. */
export function pFromT(t: number, df: number) {
  if (!Number.isFinite(t)) return 0;
  const x = df / (df + t * t);
  return incompleteBeta(x, df / 2, 0.5);
}

/** Regularized incomplete beta function I_x(a, b) (Numerical Recipes, continued fraction). */
function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

function betacf(a: number, b: number, x: number) {
  const tiny = 1e-300;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-14) break;
  }
  return h;
}

function lgamma(z: number): number {
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

export function describe(values: number[]) {
  const v = clean(values);
  return { n: v.length, mean: mean(v), sd: sd(v), min: Math.min(...v), q1: quantile(v, 0.25), median: quantile(v, 0.5), q3: quantile(v, 0.75), max: Math.max(...v) };
}
