// pixelSort(imageData, params, onProgress) -> new ImageData-like {data,w,h}.
// Never mutates the input. params.passes is an array; a single pass is [pass].
//
// pass: { angle, key, order:'asc'|'desc',
//         method:'threshold'|'full'|'random'|'wave'|'fixed'|'edge',
//         lo, hi, clength, minLen, maxLen, seed, intensity, overlay }
// onProgress(fraction 0..1) is optional; called periodically during sorting.

import { keyField } from './keys.js';
import { lines } from './traverse.js';
import { sobel } from './edge.js';
import { xorshift32 } from './rng.js';
import {
  full, threshold, runsFromSplits, randomSplits, waveSplits, fixedSplits, splitsWhere, clampRuns,
} from './intervals.js';
import { sortRun } from './sort.js';

const DEFAULT = {
  angle: 0, key: 'lightness', order: 'asc', method: 'threshold',
  lo: 64, hi: 204, invert: false, clength: 50, minLen: 0, maxLen: 0, seed: 1, intensity: 1, overlay: false,
};

export function pixelSort(imageData, params = {}, onProgress) {
  const { width, height } = imageData;
  let cur = new Uint8ClampedArray(imageData.data); // working copy, never touch input

  const passes = params.passes || [params];
  for (let pi = 0; pi < passes.length; pi++) {
    const p = { ...DEFAULT, ...passes[pi] };
    if (p.intensity <= 0) continue;

    const out = new Uint8ClampedArray(cur);
    const sortField = keyField({ data: cur, width, height }, p.key);
    const pix = new Uint32Array(out.buffer);
    const desc = p.order === 'desc';
    const ls = lines(width, height, p.angle);

    // per-method field / rng prep
    const thrField = p.method === 'threshold'
      ? (p.key === 'lightness' ? sortField : keyField({ data: cur, width, height }, 'lightness')) : null;
    const edgeField = p.method === 'edge' ? sobel({ data: cur, width, height }) : null;
    const rand = (p.method === 'random' || p.method === 'wave') ? xorshift32(p.seed >>> 0 || 1) : null;

    if (p.overlay) desaturate(out);

    const step = Math.max(1, ls.length >> 5);
    for (let li = 0; li < ls.length; li++) {
      const line = ls[li], len = line.length;
      let runs;
      switch (p.method) {
        case 'full': runs = full(line); break;
        case 'random': runs = runsFromSplits(line, randomSplits(len, p.clength, rand)); break;
        case 'wave': runs = runsFromSplits(line, waveSplits(len, p.clength, rand)); break;
        case 'fixed': runs = runsFromSplits(line, fixedSplits(len, p.clength)); break;
        case 'edge': runs = runsFromSplits(line, splitsWhere(line, edgeField, (v) => v > p.lo)); break;
        default: runs = threshold(line, thrField, p.lo, p.hi, p.invert);
      }
      runs = clampRuns(runs, p.minLen, p.maxLen);

      if (p.overlay) paintOverlay(out, line, runs);
      else for (const [s, e] of runs) sortRun(pix, line, sortField, s, e, desc);

      if (onProgress && li % step === 0) onProgress((pi + li / ls.length) / passes.length);
    }

    if (p.intensity >= 1 || p.overlay) cur = out;
    else {
      const t = p.intensity, inv = 1 - t;
      for (let i = 0; i < cur.length; i++) cur[i] = cur[i] * inv + out[i] * t + 0.5;
    }
  }

  if (onProgress) onProgress(1);
  return { data: cur, width, height };
}

// --- overlay: diagnostic view of which spans get sorted -------------------
function desaturate(buf) {
  for (let p = 0; p < buf.length; p += 4) {
    const g = (buf[p] * 0.3 + buf[p + 1] * 0.59 + buf[p + 2] * 0.11) * 0.6;
    buf[p] = buf[p + 1] = buf[p + 2] = g;
  }
}

function paintOverlay(buf, line, runs) {
  for (const [s, e] of runs) {
    for (let i = s; i < e; i++) {
      const p = line[i] * 4, g = buf[p];
      buf[p] = g * 0.25; buf[p + 1] = Math.min(255, g + 45); buf[p + 2] = g * 0.25; // green wash
    }
    for (const i of [s, e - 1]) { // red endpoints
      const p = line[i] * 4;
      buf[p] = 200; buf[p + 1] = 30; buf[p + 2] = 30;
    }
  }
}
