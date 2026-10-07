# Third-party code (vendored in `vendor/`)

- **@niivue/dcm2niix 1.3.20260724** (`vendor/dcm2niix/`), BSD-2-Clause. dcm2niix compiled to WebAssembly.
  dcm2niix is by Chris Rorden et al., https://github.com/rordenlab/dcm2niix (BSD-style license).
  Local modification: `worker.jpeg.js` and `index.jpeg.js` are patched (marked `crown-dicom patch`) to
  return dcm2niix's console output alongside the converted files.
- **fflate 0.8.3** (`vendor/fflate/`), MIT. Used for reading and writing zip files in the browser.
- **Space Grotesk** and **JetBrains Mono** (`assets/fonts/`), SIL Open Font License 1.1 (see the `OFL-*.txt` files).
  Variable `latin` woff2 files from the `@fontsource-variable` packages, self-hosted so the page makes no requests to Google.
- **Lucide icons** (inlined as SVG symbols in `index.html`), ISC license (`assets/fonts/LICENSE-lucide.txt`). Same icon set as CROWN.
- **NiiVue 0.69.0** (`vendor/niivue/niivue.umd.js`), BSD-2-Clause, https://github.com/niivue/niivue. The same viewer CROWN uses. Loaded on first preview.
