// psort UI — native Canvas 2D display; the engine runs in a Worker.
// Preview: one persistent worker, stale requests dropped by id.
// Export: a throwaway worker so Cancel can terminate it mid-run.
const PREVIEW_MAX = 900;
const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const stage = $('stage');

const DEFAULT_PASS = {
  angle: 0, key: 'lightness', order: 'asc', method: 'threshold',
  lo: 64, hi: 204, invert: false, clength: 50, minLen: 0, maxLen: 0, intensity: 1,
};
const PASS_FIELDS = ['angle', 'key', 'order', 'method', 'lo', 'hi', 'clength', 'minLen', 'maxLen', 'intensity'];
const NUM = new Set(['angle', 'lo', 'hi', 'clength', 'minLen', 'maxLen', 'intensity']);

let state = { seed: 1, overlay: false, active: 0, passes: [{ ...DEFAULT_PASS }] };
let srcFull = null, srcPreview = null;

const active = () => state.passes[state.active];
const buildParams = () => ({ passes: state.passes.map((p) => ({ ...p, seed: state.seed, overlay: state.overlay })) });

// --- image helpers -------------------------------------------------------
function toImageData(source, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const cx = c.getContext('2d');
  cx.drawImage(source, 0, 0, w, h);
  return cx.getImageData(0, 0, w, h);
}
function downscale(img, max) {
  const s = Math.min(1, max / Math.max(img.width, img.height));
  if (s === 1) return img;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  c.getContext('2d').putImageData(img, 0, 0);
  return toImageData(c, Math.round(img.width * s), Math.round(img.height * s));
}
function setSource(img) { srcFull = img; srcPreview = downscale(img, PREVIEW_MAX); render(); }

// --- preview worker (stale-drop cancellation) ----------------------------
const previewWorker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
let reqId = 0;
previewWorker.onmessage = (e) => {
  if (e.data.progress !== undefined || e.data.id !== reqId) return; // ignore progress + stale
  const { data, width, height } = e.data;
  canvas.width = width; canvas.height = height;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
};

let timer = null;
function render() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (!srcPreview) return;
    const id = ++reqId;
    const buf = new Uint8ClampedArray(srcPreview.data); // copy: transfer detaches
    previewWorker.postMessage(
      { id, data: buf.buffer, width: srcPreview.width, height: srcPreview.height, params: buildParams() },
      [buf.buffer],
    );
  }, 80);
}

// --- default image so the canvas is never empty --------------------------
function defaultImage(w = 640, h = 420) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4, n = ((x * 2654435761 + y * 40503) >>> 0) % 90;
      d[p] = (x / w) * 255; d[p + 1] = (y / h) * 255; d[p + 2] = 180 - n; d[p + 3] = 255;
    }
  return new ImageData(d, w, h);
}

// --- controls (edit the active pass) -------------------------------------
function updateVisibility(m) {
  $('g-lo').classList.toggle('hidden', !(m === 'threshold' || m === 'edge'));
  $('g-hi').classList.toggle('hidden', m !== 'threshold');
  $('g-invert').classList.toggle('hidden', m !== 'threshold');
  $('g-clength').classList.toggle('hidden', !(m === 'random' || m === 'wave' || m === 'fixed'));
}
function syncInputs() {
  const p = active();
  for (const k of PASS_FIELDS) $(k).value = p[k];
  $('angleVal').textContent = p.angle + '°';
  $('loVal').textContent = p.lo; $('hiVal').textContent = p.hi;
  $('clengthVal').textContent = p.clength;
  $('minLenVal').textContent = p.minLen; $('maxLenVal').textContent = p.maxLen;
  $('intensityVal').textContent = Number(p.intensity).toFixed(2);
  $('invert').checked = p.invert;
  $('seed').value = state.seed;
  $('overlay').checked = state.overlay;
  updateVisibility(p.method);
  renderPasses();
}
function onInput(k) {
  return (e) => { active()[k] = NUM.has(k) ? Number(e.target.value) : e.target.value; syncInputs(); writeHash(); render(); };
}
for (const k of PASS_FIELDS) $(k).addEventListener('input', onInput(k));

document.querySelectorAll('[data-angle]').forEach((b) =>
  b.addEventListener('click', () => { active().angle = Number(b.dataset.angle); syncInputs(); writeHash(); render(); }));

$('invert').addEventListener('change', (e) => { active().invert = e.target.checked; writeHash(); render(); });
$('seed').addEventListener('input', (e) => { state.seed = Number(e.target.value) || 0; writeHash(); render(); });
$('randomize').addEventListener('click', () => { state.seed = (Math.random() * 1e9) | 0; syncInputs(); writeHash(); render(); });
$('overlay').addEventListener('change', (e) => { state.overlay = e.target.checked; writeHash(); render(); });
$('reset').addEventListener('click', () => { state = { seed: 1, overlay: false, active: 0, passes: [{ ...DEFAULT_PASS }] }; syncInputs(); writeHash(); render(); });

// --- multi-pass list -----------------------------------------------------
function miniBtn(txt, fn) {
  const b = document.createElement('button');
  b.className = 'mini'; b.textContent = txt;
  b.onclick = (e) => { e.stopPropagation(); fn(); };
  return b;
}
function renderPasses() {
  const el = $('passes'); el.innerHTML = '';
  state.passes.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'pass' + (i === state.active ? ' active' : '');
    const label = document.createElement('span');
    label.className = 'label'; label.textContent = `${i + 1}. ${p.method} ${p.angle}° ${p.key}`;
    label.onclick = () => { state.active = i; syncInputs(); };
    div.appendChild(label);
    div.append(miniBtn('↑', () => move(i, -1)), miniBtn('↓', () => move(i, 1)), miniBtn('✕', () => removePass(i)));
    el.appendChild(div);
  });
}
function move(i, d) {
  const j = i + d;
  if (j < 0 || j >= state.passes.length) return;
  [state.passes[i], state.passes[j]] = [state.passes[j], state.passes[i]];
  state.active = state.active === i ? j : state.active === j ? i : state.active;
  syncInputs(); writeHash(); render();
}
function removePass(i) {
  if (state.passes.length === 1) return;
  state.passes.splice(i, 1);
  state.active = Math.min(state.active, state.passes.length - 1);
  syncInputs(); writeHash(); render();
}
$('addPass').addEventListener('click', () => {
  state.passes.push({ ...active() }); state.active = state.passes.length - 1; syncInputs(); writeHash(); render();
});
$('asendorf').addEventListener('click', () => {
  state.passes = [{ ...DEFAULT_PASS, angle: 90 }, { ...DEFAULT_PASS, angle: 0 }]; // vertical then horizontal
  state.active = 0; syncInputs(); writeHash(); render();
});

// --- URL hash ------------------------------------------------------------
function writeHash() { location.hash = encodeURIComponent(JSON.stringify(state)); }
function readHash() {
  try {
    const h = decodeURIComponent(location.hash.slice(1));
    if (!h) return;
    const s = JSON.parse(h);
    if (s && Array.isArray(s.passes) && s.passes.length) {
      state = { seed: 1, overlay: false, active: 0, ...s, passes: s.passes.map((p) => ({ ...DEFAULT_PASS, ...p })) };
      state.active = Math.min(state.active, state.passes.length - 1);
    }
  } catch { /* ignore malformed hash */ }
}

// --- load: file picker, drag-drop, paste ---------------------------------
async function loadFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const bmp = await createImageBitmap(file);
  setSource(toImageData(bmp, bmp.width, bmp.height));
}
$('load').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', (e) => loadFile(e.target.files[0]));
stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('over'); });
stage.addEventListener('dragleave', () => stage.classList.remove('over'));
stage.addEventListener('drop', (e) => { e.preventDefault(); stage.classList.remove('over'); loadFile(e.dataTransfer.files[0]); });
window.addEventListener('paste', (e) => {
  const item = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'));
  if (item) loadFile(item.getAsFile());
});

// --- export (own worker, progress + cancel) ------------------------------
let exportWorker = null;
function showExportBar(on) { $('exportbar').classList.toggle('hidden', !on); $('export').disabled = on; }
$('export').addEventListener('click', () => {
  if (!srcFull || exportWorker) return;
  showExportBar(true); $('exportProgress').value = 0; $('exportPct').textContent = '0%';
  exportWorker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  exportWorker.onmessage = (e) => {
    if (e.data.progress !== undefined) {
      $('exportProgress').value = e.data.progress;
      $('exportPct').textContent = Math.round(e.data.progress * 100) + '%';
      return;
    }
    const { data, width, height } = e.data;
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
    c.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'psort.png'; a.click();
      URL.revokeObjectURL(a.href);
    });
    endExport();
  };
  const buf = new Uint8ClampedArray(srcFull.data);
  exportWorker.postMessage(
    { id: 1, data: buf.buffer, width: srcFull.width, height: srcFull.height, params: buildParams(), progress: true },
    [buf.buffer],
  );
});
function endExport() { if (exportWorker) { exportWorker.terminate(); exportWorker = null; } showExportBar(false); }
$('cancelExport').addEventListener('click', endExport);

// --- boot ----------------------------------------------------------------
readHash();
syncInputs();
setSource(defaultImage());
