// lines(w, h, angleDeg) -> Uint32Array[]. Each entry is the pixel indices
// (y*w+x) of one traversal line, ordered by position along it.
//
// Bucket-and-sort: lineId = round(-x*sinθ + y*cosθ), t = x*cosθ + y*sinθ.
// Every pixel lands in exactly one bucket -> full coverage, no gaps, no resample.
// Axis-aligned angles get a direct rows/columns fast path.
// Cached per (w, h, angle); traversal only changes when the angle moves.

const cache = new Map();

export function lines(w, h, angleDeg) {
  const a = ((angleDeg % 360) + 360) % 360;
  const ck = w + ':' + h + ':' + a;
  let v = cache.get(ck);
  if (!v) { v = a % 90 === 0 ? axis(w, h, a) : bucket(w, h, a); cache.set(ck, v); }
  return v;
}

function axis(w, h, a) {
  const out = [];
  if (a === 0 || a === 180) {
    for (let y = 0; y < h; y++) {
      const row = new Uint32Array(w);
      for (let x = 0; x < w; x++) row[x] = a === 0 ? y * w + x : y * w + (w - 1 - x);
      out.push(row);
    }
  } else { // 90 | 270 -> columns
    for (let x = 0; x < w; x++) {
      const col = new Uint32Array(h);
      for (let y = 0; y < h; y++) col[y] = a === 90 ? y * w + x : (h - 1 - y) * w + x;
      out.push(col);
    }
  }
  return out;
}

function bucket(w, h, a) {
  const t = (a * Math.PI) / 180, s = Math.sin(t), c = Math.cos(t);
  const buckets = new Map();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const id = Math.round(-x * s + y * c);
      let b = buckets.get(id);
      if (!b) buckets.set(id, (b = []));
      b.push(y * w + x);
    }
  }
  const out = [];
  for (const [, idxs] of [...buckets].sort((p, q) => p[0] - q[0])) {
    idxs.sort((i, j) => ((i % w) * c + ((i / w) | 0) * s) - ((j % w) * c + ((j / w) | 0) * s));
    out.push(Uint32Array.from(idxs));
  }
  return out;
}
