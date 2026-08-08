// Golden regression: our app-default threshold pass must reproduce
// satyarth/pixelsort 1.0.1 defaults bit-for-bit at angle 0.
// Fixtures are raw RGBA (src + reference output), so no image decoder is needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pixelSort } from '../src/engine/index.js';

const dir = fileURLToPath(new URL('./fixtures/', import.meta.url));
const W = 64, H = 64;
const src = new Uint8ClampedArray(fs.readFileSync(dir + 'src64.rgba'));
const ref = new Uint8ClampedArray(fs.readFileSync(dir + 'ref64.rgba'));

test('reproduces satyarth defaults bit-for-bit (threshold, lightness, angle 0)', () => {
  const out = pixelSort({ data: src, width: W, height: H },
    { angle: 0, key: 'lightness', order: 'asc', method: 'threshold', lo: 64, hi: 204, intensity: 1 });

  let firstDiff = -1, ndiff = 0;
  for (let i = 0; i < ref.length; i++)
    if (out.data[i] !== ref[i]) { ndiff++; if (firstDiff < 0) firstDiff = i; }

  assert.equal(ndiff, 0, `${ndiff} bytes differ, first at byte ${firstDiff} (pixel ${firstDiff >> 2})`);
});
