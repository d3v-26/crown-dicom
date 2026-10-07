// Minimal NIfTI-1 header reader, used for the series table (dimensions, voxel size).
// Handles the little-endian NIfTI-1 files that dcm2niix writes, plain or gzipped.

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
