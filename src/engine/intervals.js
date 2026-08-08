// Two interval primitives. A run is a [start, end) pair of offsets into a line.
//
//   runsFromField  — field + predicate -> runs of pixels passing the predicate
//   runsFromSplits — sorted split offsets -> runs between them
//
// Methods are thin: `full` is one run; `threshold` is runsFromField with a band.

export function runsFromField(line, field, keep) {
  const runs = [];
  let start = -1;
  for (let i = 0; i < line.length; i++) {
    const on = keep(field[line[i]]);
    if (on && start < 0) start = i;
    else if (!on && start >= 0) { runs.push([start, i]); start = -1; }
  }
  if (start >= 0) runs.push([start, line.length]);
  return runs;
}

export function runsFromSplits(line, splits) {
  const len = line.length, runs = [];
  let prev = 0;
  for (const s of splits) if (s > prev && s < len) { runs.push([prev, s]); prev = s; }
  runs.push([prev, len]);
  return runs;
}

export function full(line) {
  return line.length ? [[0, line.length]] : [];
}

// --- split generators (offsets into a line) ------------------------------
// `rand` is a seeded xorshift32 instance, consumed across all lines of a pass.
export function randomSplits(len, clength, rand) {
  const s = [];
  for (let x = Math.max(1, Math.floor(clength * rand())); x < len; x += Math.max(1, Math.floor(clength * rand())))
    s.push(x);
  return s;
}

export function waveSplits(len, clength, rand) {
  const s = [];
  for (let x = clength + Math.floor(rand() * 11); x < len; x += clength + Math.floor(rand() * 11))
    s.push(x);
  return s;
}

export function fixedSplits(len, clength) {
  const s = [];
  for (let x = clength; x < len; x += clength) s.push(x);
  return s;
}

// offsets where the field passes `keep` — boundaries for edge/mask methods.
export function splitsWhere(line, field, keep) {
  const s = [];
  for (let i = 0; i < line.length; i++) if (keep(field[line[i]])) s.push(i);
  return s;
}

// min/max length clamp over any method's runs. Short runs are left unsorted
// (dropped); long runs are chopped into maxLen pieces. 0 disables a bound.
export function clampRuns(runs, minLen, maxLen) {
  if (!minLen && !maxLen) return runs;
  const out = [];
  for (const [s, e] of runs) {
    if (minLen && e - s < minLen) continue;
    if (maxLen && e - s > maxLen) for (let a = s; a < e; a += maxLen) out.push([a, Math.min(a + maxLen, e)]);
    else out.push([s, e]);
  }
  return out;
}

// satyarth semantics: every out-of-band pixel is a breakpoint; the runs
// *between* breakpoints are sorted (so the in-band region gets sorted).
// invert: break at in-band pixels instead, sorting the out-of-band region.
export function threshold(line, field, lo, hi, invert) {
  const splits = [];
  for (let i = 0; i < line.length; i++) {
    const v = field[line[i]];
    if ((v < lo || v > hi) !== invert) splits.push(i);
  }
  return runsFromSplits(line, splits);
}
