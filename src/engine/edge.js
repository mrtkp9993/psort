// sobel(imageData) -> Float32Array of edge magnitude per pixel (|gx|+|gy| on
// luma). Borders read as 0. Used by the `edge` interval method as boundaries.
export function sobel(imageData) {
  const { data, width: w, height: h } = imageData;
  const lum = new Float32Array(w * h);
  for (let i = 0, p = 0; i < w * h; i++, p += 4)
    lum[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];

  const g = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = -lum[i - w - 1] - 2 * lum[i - 1] - lum[i + w - 1] + lum[i - w + 1] + 2 * lum[i + 1] + lum[i + w + 1];
      const gy = -lum[i - w - 1] - 2 * lum[i - w] - lum[i - w + 1] + lum[i + w - 1] + 2 * lum[i + w] + lum[i + w + 1];
      g[i] = Math.abs(gx) + Math.abs(gy);
    }
  return g;
}
