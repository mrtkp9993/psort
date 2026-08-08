import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lines } from '../src/engine/traverse.js';
import { keyField } from '../src/engine/keys.js';
import { pixelSort } from '../src/engine/index.js';
import { xorshift32 } from '../src/engine/rng.js';
import { clampRuns, fixedSplits, runsFromSplits, threshold } from '../src/engine/intervals.js';
import { sobel } from '../src/engine/edge.js';

// Build an ImageData-like object; fn(x,y) -> [r,g,b,a].
function makeImage(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = fn(x, y);
      const p = (y * w + x) * 4;
      data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = a ?? 255;
    }
  return { data, width: w, height: h };
}

test('traversal covers every pixel exactly once', () => {
  const w = 23, h = 17;
  for (const angle of [0, 90, 180, 270, 45, 30, 135, 200]) {
    const seen = new Uint8Array(w * h);
    let count = 0;
    for (const line of lines(w, h, angle))
      for (const idx of line) { assert.equal(seen[idx], 0, `dup at ${angle}`); seen[idx] = 1; count++; }
    assert.equal(count, w * h, `coverage at ${angle}`);
  }
});

test('a sorted interval is monotonic in its key', () => {
  // noisy image, full-line sort ascending -> lightness non-decreasing along each row
  const w = 40, h = 8;
  let s = 12345;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) % 256);
  const img = makeImage(w, h, () => [rnd(), rnd(), rnd(), 255]);
  const out = pixelSort(img, { angle: 0, key: 'lightness', order: 'asc', method: 'full', intensity: 1 });
  const field = keyField(out, 'lightness');
  for (let y = 0; y < h; y++)
    for (let x = 1; x < w; x++)
      assert.ok(field[y * w + x] >= field[y * w + x - 1] - 1e-3, `row ${y} not sorted at ${x}`);
});

test('descending flips the order', () => {
  const w = 16, h = 2;
  let s = 7;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) % 256);
  const img = makeImage(w, h, () => [rnd(), rnd(), rnd(), 255]);
  const out = pixelSort(img, { angle: 0, key: 'r', order: 'desc', method: 'full', intensity: 1 });
  const field = keyField(out, 'r');
  for (let x = 1; x < w; x++) assert.ok(field[x] <= field[x - 1] + 1e-3);
});

test('identity: intensity 0 returns the input unchanged', () => {
  const img = makeImage(10, 10, (x, y) => [x * 20, y * 20, 100, 255]);
  const out = pixelSort(img, { method: 'full', intensity: 0 });
  assert.deepEqual([...out.data], [...img.data]);
});

test('empty passes returns the input unchanged', () => {
  const img = makeImage(6, 6, (x) => [x, x, x, 255]);
  const out = pixelSort(img, { passes: [] });
  assert.deepEqual([...out.data], [...img.data]);
});

test('rng is deterministic, seed-sensitive, and in range', () => {
  const a = xorshift32(1), b = xorshift32(1), c = xorshift32(2);
  let diverged = false;
  for (let i = 0; i < 100; i++) {
    const va = a(), vb = b(), vc = c();
    assert.equal(va, vb);           // same seed -> same sequence
    assert.ok(va >= 0 && va < 1);   // range
    if (va !== vc) diverged = true; // different seed -> different sequence
  }
  assert.ok(diverged);
});

test('clampRuns drops short runs and chops long ones', () => {
  const runs = clampRuns([[0, 3], [3, 20]], 4, 8); // [0,3) too short; [3,20) len 17 -> 8+8+1
  assert.deepEqual(runs, [[3, 11], [11, 19], [19, 20]]);
});

test('fixedSplits -> runs tile the line', () => {
  const line = new Uint32Array(10).map((_, i) => i);
  assert.deepEqual(runsFromSplits(line, fixedSplits(10, 4)), [[0, 4], [4, 8], [8, 10]]);
});

test('random method is deterministic per seed, differs across seeds', () => {
  const w = 30, h = 6;
  let s = 99;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) % 256);
  const img = makeImage(w, h, () => [rnd(), rnd(), rnd(), 255]);
  const a = pixelSort(img, { method: 'random', clength: 8, seed: 5, intensity: 1 });
  const b = pixelSort(img, { method: 'random', clength: 8, seed: 5, intensity: 1 });
  const c = pixelSort(img, { method: 'random', clength: 8, seed: 6, intensity: 1 });
  assert.deepEqual([...a.data], [...b.data]);
  assert.notDeepEqual([...a.data], [...c.data]);
});

test('threshold invert flips which side is a breakpoint', () => {
  const line = Uint32Array.from({ length: 6 }, (_, i) => i);
  const field = new Float32Array([10, 200, 200, 10, 10, 200]); // lo100 hi255 -> in-band idx 1,2,5
  const normal = threshold(line, field, 100, 255, false); // breaks at out-of-band 0,3,4
  const inv = threshold(line, field, 100, 255, true);     // breaks at in-band 1,2,5
  assert.deepEqual(normal, [[0, 3], [3, 4], [4, 6]]);
  assert.deepEqual(inv, [[0, 1], [1, 2], [2, 5], [5, 6]]);
});

test('sobel fires on a vertical edge, quiet on flat areas', () => {
  const w = 8, h = 8;
  const img = makeImage(w, h, (x) => (x < 4 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
  const g = sobel(img);
  assert.ok(g[3 * w + 3] + g[3 * w + 4] > 0, 'edge column has magnitude');
  assert.equal(g[3 * w + 1], 0, 'flat interior is zero');
});

test('overlay changes the image and forces full opacity output', () => {
  const img = makeImage(20, 5, (x, y) => [(x * 12 + y) & 255, 90, 60, 255]);
  const out = pixelSort(img, { method: 'threshold', overlay: true, intensity: 0.5 });
  assert.notDeepEqual([...out.data], [...img.data]);
});

test('does not mutate the input buffer', () => {
  const img = makeImage(12, 4, (x, y) => [(x * 13 + y) & 255, x & 255, y & 255, 255]);
  const before = [...img.data];
  pixelSort(img, { method: 'full', intensity: 1, angle: 90 });
  assert.deepEqual([...img.data], before);
});
