// keyField(imageData, key) -> Float32Array, one scalar per pixel.
// Values need only be order-consistent; scale is arbitrary per key.
// keys: lightness, hue, saturation, r, g, b, intensity.

export function keyField(imageData, key) {
  const { data, width, height } = imageData;
  const n = width * height;
  const out = new Float32Array(n);

  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    switch (key) {
      case 'r': out[i] = r; break;
      case 'g': out[i] = g; break;
      case 'b': out[i] = b; break;
      case 'intensity': out[i] = r + g + b; break;
      default: {
        const max = r > g ? (r > b ? r : b) : (g > b ? g : b);
        const min = r < g ? (r < b ? r : b) : (g < b ? g : b);
        // HSV to match satyarth/pixelsort: "lightness" is HSV value = max.
        if (key === 'lightness') { out[i] = max; break; }
        if (key === 'saturation') { out[i] = max === 0 ? 0 : (max - min) / max; break; }
        // hue, 0..360
        if (max === min) { out[i] = 0; break; }
        const d = max - min;
        let h;
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
        out[i] = h < 0 ? h + 360 : h;
      }
    }
  }
  return out;
}
