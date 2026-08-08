// sortRun — sort one interval's pixels by key and write them back in place.
// `pix` is a Uint32Array view over the RGBA buffer (one uint32 per pixel), so
// whole pixels move as a unit and channel order / endianness never matter.
// Ascending vs descending is a comparator flip.

export function sortRun(pix, line, field, start, end, descending) {
  const n = end - start;
  if (n < 2) return;
  const order = Array.from(line.subarray(start, end)); // stable Array.sort
  order.sort(descending ? (a, b) => field[b] - field[a] : (a, b) => field[a] - field[b]);
  const snap = new Uint32Array(n);
  for (let i = 0; i < n; i++) snap[i] = pix[order[i]];
  for (let i = 0; i < n; i++) pix[line[start + i]] = snap[i];
}
