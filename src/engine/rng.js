// xorshift32 — one seeded PRNG, threaded through anything random.
// Marsaglia's 32-bit xorshift; plain int ops, returns a float in [0, 1).
export function xorshift32(seed) {
  let x = (seed | 0) || 1; // avoid the zero fixed point
  return function () {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}
