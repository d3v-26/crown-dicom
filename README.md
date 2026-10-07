# crown-dicom

Browser-side DICOM → NIfTI converter, built to prepare T1 images for [CROWN](https://github.com/lab-smile/CROWN).
It uses [`@niivue/dcm2niix`](https://www.npmjs.com/package/@niivue/dcm2niix) (dcm2niix compiled to WebAssembly).

DICOM headers contain PHI, so everything runs in the user's browser. There is no backend and nothing is uploaded.

## Features

- Four-step wizard like CROWN (Upload, Configure, Converting, Results), with the same look and light/dark theme.
- Drop a folder or a `.zip` (or pick files). Whole studies are fine.
- Every series is listed with description, dimensions and voxel size. Likely T1s are flagged, but never auto-selected.
- Quick-look preview (three slice views) before downloading.
- Per-series or multi-select download (several series download as a `.zip`).
- Options: compression, skip localizers, filename format, 2D merge, crop. The equivalent `dcm2niix` command is shown.
- Optional JSON sidecar, with institution and scanner identifiers stripped by default.
- Full dcm2niix log for debugging.

## Run locally

No build step:

    python3 -m http.server 8000

then open http://localhost:8000. ES modules and WebAssembly need http(s), so opening `index.html` as a `file://` URL won't work.

## Sample data

    scripts/fetch-data.sh

downloads the UK Biobank example T1 and `neurolabusc/dcm_qa` into `data/` (git-ignored). Check each source's terms before redistributing.

## Limitations

- Large studies are limited by browser memory (roughly 1.5 GB). Select just the series you need.
- The NIfTI still contains the face. This tool does not deface.
- The preview is in stored voxel order and is not reoriented.
- Not a medical device; not for clinical use.

## Third-party code

See [THIRD_PARTY.md](THIRD_PARTY.md). dcm2niix and fflate are vendored so the site has no runtime CDN dependency.

## License

MIT
