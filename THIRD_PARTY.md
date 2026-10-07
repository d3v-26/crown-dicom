# Third-party code (vendored in `vendor/`)

- **@niivue/dcm2niix 1.3.20260724** (`vendor/dcm2niix/`), BSD-2-Clause. dcm2niix compiled to WebAssembly.
  dcm2niix is by Chris Rorden et al., https://github.com/rordenlab/dcm2niix (BSD-style license).
  Local modification: `worker.jpeg.js` and `index.jpeg.js` are patched (marked `crown-dicom patch`) to
  return dcm2niix's console output alongside the converted files.
- **fflate 0.8.3** (`vendor/fflate/`), MIT. Used for reading and writing zip files in the browser.
