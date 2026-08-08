// Engine in a Worker. ImageData buffer comes in and goes out as a transferable.
// Preview cancellation is handled on the main thread by dropping stale ids;
// the heavy export gets its own worker that the UI can terminate to cancel.
import { pixelSort } from './engine/index.js';

self.onmessage = (e) => {
  const { id, data, width, height, params, progress } = e.data;
  const img = { data: new Uint8ClampedArray(data), width, height };
  const onProgress = progress ? (f) => self.postMessage({ id, progress: f }) : undefined;
  const out = pixelSort(img, params, onProgress);
  self.postMessage({ id, data: out.data.buffer, width: out.width, height: out.height }, [out.data.buffer]);
};
