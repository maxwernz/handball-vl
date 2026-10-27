import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ci95, pFromT, regression, sd, wilson } from '../analysis/web/src/stats.ts';

const close = (actual: number, expected: number, digits = 3) => assert.ok(Math.abs(actual - expected) < 10 ** -digits, `${actual} ≠ ${expected}`);

test('two-sided p values match Student t tables', () => {
  close(pFromT(2, 10), 0.0734);
  close(pFromT(3, 5), 0.0301);
  close(pFromT(1.96, 1000), 0.0503);
  close(pFromT(-0.5, 40), 0.6198);
});

test('regression, sample SD, confidence intervals', () => {
  const r = regression([1, 2, 3, 4, 5], [2, 4, 5, 4, 5])!;
  close(r.slope, 0.6); close(r.intercept, 2.2); close(r.r2, 0.6); close(r.p, 0.124);
  close(sd([2, 4, 4, 4, 5, 5, 7, 9]), 2.138);
  const [lo, hi] = ci95([1, 2, 3]);
  close(lo, -0.484, 2); close(hi, 4.484, 2);
  const [wl, wh] = wilson(5, 10);
  close(wl, 0.237); close(wh, 0.763);
});
