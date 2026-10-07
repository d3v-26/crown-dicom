// Minimal NIfTI-1 reader: header parsing and mid-slice rendering for a quick look.
// Handles the little-endian NIfTI-1 files that dcm2niix writes, plain or gzipped.

const TYPES = {
  2: Uint8Array, 4: Int16Array, 8: Int32Array, 16: Float32Array, 64: Float64Array,
  256: Int8Array, 512: Uint16Array, 768: Uint32Array,
};

function decompressed(file) {
  const s = file.stream();
  return file.name.endsWith('.gz') ? s.pipeThrough(new DecompressionStream('gzip')) : s;
}

async function readPrefix(file, n) {
  const reader = decompressed(file).getReader();
  const chunks = [];
  let total = 0;
  while (total < n) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  reader.cancel().catch(() => {});
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

function parseHeader(bytes) {
  if (bytes.length < 352) throw new Error('File too short to be NIfTI');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getInt32(0, true) !== 348) throw new Error('Not a little-endian NIfTI-1 file');
  const ndim = dv.getInt16(40, true);
  const dims = [];
  for (let i = 1; i <= 7; i++) dims.push(Math.max(1, dv.getInt16(40 + 2 * i, true)));
  const pixdim = [];
  for (let i = 1; i <= 7; i++) pixdim.push(dv.getFloat32(76 + 4 * i, true));
  const slope = dv.getFloat32(112, true);
  return {
    ndim,
    dims: dims.slice(0, 4), // nx, ny, nz, nt
    pixdim: pixdim.slice(0, 3),
    datatype: dv.getInt16(70, true),
    voxOffset: dv.getFloat32(108, true) || 352,
    slope: slope && Number.isFinite(slope) ? slope : 1,
    inter: Number.isFinite(dv.getFloat32(116, true)) ? dv.getFloat32(116, true) : 0,
  };
}

export async function readHeader(file) {
  return parseHeader(await readPrefix(file, 352));
}

/** Decode the first 3D volume. Returns { data: Float32Array, header }. */
export async function readVolume(file) {
  const buf = new Uint8Array(await new Response(decompressed(file)).arrayBuffer());
  const header = parseHeader(buf);
  const T = TYPES[header.datatype];
  if (!T) throw new Error(`Unsupported NIfTI datatype ${header.datatype}`);
  const [nx, ny, nz] = header.dims;
  const nvox = nx * ny * nz;
  const start = Math.round(header.voxOffset);
  const raw = new T(buf.buffer.slice(start, start + nvox * T.BYTES_PER_ELEMENT));
  const data = new Float32Array(nvox);
  for (let i = 0; i < nvox; i++) data[i] = raw[i] * header.slope + header.inter;
  return { data, header };
}

/** Display window: 2nd to 99.5th percentile of a subsample. */
export function displayWindow(data) {
  const step = Math.max(1, Math.floor(data.length / 200000));
  const s = [];
  for (let i = 0; i < data.length; i += step) s.push(data[i]);
  s.sort((a, b) => a - b);
  const lo = s[Math.floor(s.length * 0.02)];
  let hi = s[Math.floor(s.length * 0.995)];
  if (!(hi > lo)) hi = lo + 1;
  return [lo, hi];
}

/** Draw one slice. plane: 'axial' | 'coronal' | 'sagittal'. Voxel order, no reorientation. */
export function drawSlice(canvas, data, header, plane, idx, [lo, hi]) {
  const [nx, ny, nz] = header.dims;
  const [vx, vy, vz] = header.pixdim;
  let w, h, px, py, at;
  if (plane === 'axial') {
    [w, h, px, py] = [nx, ny, vx, vy];
    at = (x, y) => x + nx * (ny - 1 - y) + nx * ny * idx;
  } else if (plane === 'coronal') {
    [w, h, px, py] = [nx, nz, vx, vz];
    at = (x, y) => x + nx * idx + nx * ny * (nz - 1 - y);
  } else {
    [w, h, px, py] = [ny, nz, vy, vz];
    at = (x, y) => idx + nx * x + nx * ny * (nz - 1 - y);
  }
  canvas.width = w;
  canvas.height = h;
  const img = new ImageData(w, h);
  const k = 255 / (hi - lo);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.max(0, Math.min(255, (data[at(x, y)] - lo) * k));
      const o = 4 * (y * w + x);
      img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
      img.data[o + 3] = 255;
    }
  }
  canvas.getContext('2d').putImageData(img, 0, 0);
  const s = 280 / Math.max(w * px, h * py);
  canvas.style.width = `${Math.round(w * px * s)}px`;
  canvas.style.height = `${Math.round(h * py * s)}px`;
}
