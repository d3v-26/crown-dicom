import { Dcm2niix } from './vendor/dcm2niix/index.jpeg.js';
import { unzipSync, zipSync } from './vendor/fflate/browser.js';
import { readHeader, readVolume, displayWindow, drawSlice } from './nifti.js';

const $ = (id) => document.getElementById(id);
const MAX_UNZIPPED = 4 * 1024 ** 3;
const mb = (n) => (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB';

function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}

let files = [];
let rows = [];

// ---------- input ----------

const isJunk = (path) => /(^|\/)(\.[^/]*|__MACOSX)(\/|$)/.test(path);

function withPath(file, path) {
  file._webkitRelativePath = path;
  return file;
}

async function expand(list) {
  const out = [];
  let unzipped = 0;
  for (const f of list) {
    const path = f.webkitRelativePath || f._webkitRelativePath || f.name;
    if (isJunk(path)) continue;
    if (/\.zip$/i.test(f.name)) {
      const entries = unzipSync(new Uint8Array(await f.arrayBuffer()), {
        filter: (e) => {
          unzipped += e.originalSize;
          if (unzipped > MAX_UNZIPPED) throw new Error('Zip is larger than 4 GB when unpacked');
          return !e.name.endsWith('/') && !isJunk(e.name);
        },
      });
      for (const [name, data] of Object.entries(entries)) {
        out.push(withPath(new File([data], name.split('/').pop()), name));
      }
    } else {
      out.push(withPath(f, path));
    }
  }
  return out;
}

async function walk(entry, prefix = '') {
  if (entry.isFile) {
    const file = await new Promise((res, rej) => entry.file(res, rej));
    return [withPath(file, prefix + entry.name)];
  }
  const reader = entry.createReader();
  const out = [];
  for (;;) {
    const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
    if (!batch.length) break;
    for (const child of batch) out.push(...(await walk(child, prefix + entry.name + '/')));
  }
  return out;
}

async function setSelection(promise) {
  hideError();
  $('selection').textContent = 'Reading files...';
  try {
    files = await expand(await promise);
  } catch (err) {
    files = [];
    showError(err.message || String(err));
  }
  const bytes = files.reduce((s, f) => s + f.size, 0);
  $('selection').textContent = files.length
    ? `${files.length.toLocaleString()} files selected (${mb(bytes)}).`
    : 'No usable files found.';
  $('run').disabled = files.length === 0;
  $('step-results').hidden = true;
}

$('pick-folder').onclick = () => $('in-folder').click();
$('pick-files').onclick = () => $('in-files').click();
$('in-folder').onchange = (e) => setSelection(Promise.resolve([...e.target.files]));
$('in-files').onchange = (e) => setSelection(Promise.resolve([...e.target.files]));

const drop = $('drop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  // Entries must be taken synchronously; the DataTransfer is cleared after the handler returns.
  const entries = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  const loose = [...e.dataTransfer.files];
  setSelection(entries.length
    ? Promise.all(entries.map((en) => walk(en))).then((a) => a.flat())
    : Promise.resolve(loose));
});

// ---------- options ----------

function options() {
  return {
    gz: $('o-gz').checked,
    derived: $('o-derived').checked,
    fmt: $('o-fmt').value.trim() || 'series%s',
    merge: $('o-merge').value,
    crop: $('o-crop').value,
    level: $('o-level').value,
  };
}

function updateCli() {
  const o = options();
  $('cli').textContent =
    `dcm2niix -b y -ba y -z ${o.gz ? 'y' : 'n'}${o.gz ? ` -${o.level}` : ''} -i ${o.derived ? 'y' : 'n'} ` +
    `-m ${o.merge} -x ${o.crop} -f "${o.fmt}" -o <output_folder> <dicom_folder>`;
}
for (const id of ['o-gz', 'o-derived', 'o-fmt', 'o-merge', 'o-crop', 'o-level']) $(id).addEventListener('input', updateCli);
updateCli();

// ---------- conversion ----------

function showError(msg) { $('error').textContent = msg; $('error').hidden = false; }
function hideError() { $('error').hidden = true; }

$('run').onclick = async () => {
  hideError();
  const o = options();
  $('run').disabled = true;
  $('step-results').hidden = true;
  const t0 = performance.now();
  const tick = setInterval(() => {
    $('progress').textContent = `Converting... ${Math.round((performance.now() - t0) / 1000)}s`;
  }, 500);
  let d;
  try {
    $('progress').textContent = 'Starting converter...';
    d = new Dcm2niix(); // one instance per run: the worker's virtual folders can't be reused
    await d.init();
    let p = d.input(files)
      .bids('y').bidsAnonymize('y')
      .gzip(o.gz ? 'i' : 'n')
      .ignoreDerived(o.derived ? 'y' : 'n')
      .merge2DSlices(o.merge)
      .crop(o.crop)
      .filenameformat(o.fmt)
      .verbose('1');
    if (o.gz) p = p.compressionLevel(o.level);
    const out = await p.run();
    await showResults(out, out.log || [], (performance.now() - t0) / 1000);
  } catch (err) {
    $('log').textContent = (err.log || []).join('\n');
    showError(`Conversion failed: ${err.message || err}`
      + (err.log && err.log.length ? ' See the conversion log below for details.' : ''));
    if (err.log && err.log.length) { $('step-results').hidden = false; $('series').hidden = true; }
  } finally {
    clearInterval(tick);
    $('progress').textContent = '';
    $('run').disabled = false;
    if (d && d.worker) d.worker.terminate();
  }
};

// ---------- results ----------

function groupOutputs(outFiles) {
  const groups = new Map();
  for (const f of outFiles) {
    const m = f.name.match(/^(.*?)(\.nii\.gz|\.nii|\.json|\.bval|\.bvec)$/);
    if (!m) continue;
    const g = groups.get(m[1]) || { base: m[1] };
    if (m[2].startsWith('.nii')) g.nii = f;
    else if (m[2] === '.json') g.json = f;
    else (g.extra ||= []).push(f);
    groups.set(m[1], g);
  }
  return [...groups.values()].filter((g) => g.nii);
}

function t1Score(h, j, desc) {
  if (h.dims[3] > 1 || Math.min(h.dims[0], h.dims[1], h.dims[2]) < 64) return 0;
  let s = 0;
  const v = h.pixdim;
  if (j.MRAcquisitionType === '3D') s += 2;
  if (Math.max(...v) / Math.min(...v) < 1.5 && Math.max(...v) <= 1.6) s += 2;
  if (/t1|mp-?rage|bravo|spgr|tfl|fspgr/i.test(desc)) s += 3;
  if (/t2|flair|dwi|dti|swi|bold|localizer|scout|angio|tof/i.test(desc)) s -= 4;
  if (Array.isArray(j.ImageType) && j.ImageType.includes('DERIVED')) s -= 3;
  return s;
}

async function showResults(outFiles, log, seconds) {
  $('log').textContent = log.join('\n');
  const groups = groupOutputs(outFiles);
  rows = [];
  for (const g of groups) {
    let h = null, j = {};
    try { h = await readHeader(g.nii); } catch (e) { g.problem = e.message; }
    if (g.json) { try { j = JSON.parse(await g.json.text()); } catch { /* sidecar is optional */ } }
    const desc = j.SeriesDescription || j.ProtocolName || '';
    rows.push({ g, h, j, desc, series: j.SeriesNumber ?? null, score: h ? t1Score(h, j, desc) : 0 });
  }
  rows.sort((a, b) => (a.series ?? 1e9) - (b.series ?? 1e9) || a.g.base.localeCompare(b.g.base));

  const warnings = log.filter((l) => /warn/i.test(l)).length;
  $('summary').textContent = rows.length
    ? `Converted ${rows.length} image${rows.length > 1 ? 's' : ''} in ${seconds.toFixed(1)}s.`
      + (warnings ? ` dcm2niix reported ${warnings} warning${warnings > 1 ? 's' : ''}; see the conversion log.` : '')
    : 'No images were produced. This usually means no readable DICOM images were found. See the conversion log.';

  const tbody = $('series').tBodies[0];
  tbody.replaceChildren();
  $('series').hidden = rows.length === 0;
  for (const r of rows) {
    const tr = tbody.insertRow();
    if (r.score >= 5) tr.className = 'likely';
    const cb = el('input', { type: 'checkbox', ariaLabel: `Select ${r.g.base}` });
    cb.onchange = updateDownloadButton;
    r.cb = cb;
    tr.insertCell().append(cb);
    tr.insertCell().textContent = r.series ?? '';
    const dcell = tr.insertCell();
    dcell.append(r.desc || r.g.base);
    if (r.score >= 5) dcell.append(el('span', { className: 'badge', textContent: 'Likely T1' }));
    if (r.h && r.h.dims[3] > 1) dcell.append(el('span', { className: 'warn', textContent: `4D series (${r.h.dims[3]} volumes)` }));
    if (r.g.problem) dcell.append(el('span', { className: 'warn', textContent: r.g.problem }));
    tr.insertCell().textContent = r.h ? r.h.dims.slice(0, r.h.dims[3] > 1 ? 4 : 3).join(' × ') : '';
    tr.insertCell().textContent = r.h ? r.h.pixdim.map((x) => x.toFixed(2)).join(' × ') : '';
    tr.insertCell().textContent = mb(r.g.nii.size);
    const actions = tr.insertCell();
    const pv = el('button', { type: 'button', textContent: 'Preview' });
    pv.onclick = () => preview(r);
    const dl = el('button', { type: 'button', textContent: 'Download' });
    dl.onclick = () => download([r]);
    actions.append(pv, ' ', dl);
  }
  $('preview').hidden = true;
  updateDownloadButton();
  $('step-results').hidden = false;
  $('step-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updateDownloadButton() {
  const n = rows.filter((r) => r.cb && r.cb.checked).length;
  $('dl-selected').disabled = n === 0;
  $('dl-selected').textContent = n > 1 ? `Download ${n} selected (.zip)` : 'Download selected';
}
$('dl-selected').onclick = () => download(rows.filter((r) => r.cb.checked));

function save(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// dcm2niix's anonymization removes patient fields and dates, but the sidecar still carries these.
const SIDECAR_IDENTIFIERS = ['InstitutionName', 'InstitutionAddress', 'InstitutionalDepartmentName', 'StationName', 'DeviceSerialNumber'];

async function cleanSidecar(file) {
  if (!$('o-strip').checked) return file;
  try {
    const j = JSON.parse(await file.text());
    for (const k of SIDECAR_IDENTIFIERS) delete j[k];
    return new File([JSON.stringify(j, null, 2) + '\n'], file.name, { type: file.type });
  } catch {
    return file;
  }
}

async function download(selected) {
  const withJson = $('o-json').checked;
  const list = [];
  for (const r of selected) {
    list.push(r.g.nii);
    if (withJson && r.g.json) list.push(await cleanSidecar(r.g.json));
    if (withJson) list.push(...(r.g.extra || []));
  }
  if (list.length === 1) return save(list[0], list[0].name);
  const entries = {};
  for (const f of list) entries[f.name] = new Uint8Array(await f.arrayBuffer());
  save(new Blob([zipSync(entries, { level: 0 })], { type: 'application/zip' }), 'nifti.zip');
}

async function preview(r) {
  $('pv-title').textContent = `Loading ${r.g.base}...`;
  $('preview').hidden = false;
  const views = $('preview').querySelector('.views');
  views.replaceChildren();
  try {
    const { data, header } = await readVolume(r.g.nii);
    const win = displayWindow(data);
    $('pv-title').textContent = `Quick look: ${r.g.nii.name}`;
    const [nx, ny, nz] = header.dims;
    for (const [plane, n] of [['axial', nz], ['coronal', ny], ['sagittal', nx]]) {
      const canvas = el('canvas');
      const slider = el('input', { type: 'range', min: 0, max: n - 1, value: n >> 1, ariaLabel: `${plane} slice` });
      const draw = () => drawSlice(canvas, data, header, plane, Number(slider.value), win);
      slider.oninput = draw;
      draw();
      views.append(el('div', { className: 'view' }, canvas, slider, el('div', { textContent: plane })));
    }
  } catch (err) {
    $('pv-title').textContent = `Could not preview ${r.g.base}: ${err.message || err}`;
  }
}
