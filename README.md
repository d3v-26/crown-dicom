# crown-dicom

Browser-side DICOM → NIfTI conversion for [CROWN](https://github.com/lab-smile/CROWN),
using [`@niivue/dcm2niix`](https://www.npmjs.com/package/@niivue/dcm2niix) (dcm2niix compiled to WebAssembly).

DICOM headers contain PHI, so conversion runs entirely in the user's browser;
only the anonymized NIfTI is ever sent to a server.

## Status

Feasibility spike: measure conversion time and peak memory on real DICOM sets,
and check series detection across vendors.

## Sample data

Sample DICOM is downloaded, not committed:

    scripts/fetch-data.sh

Sources: UK Biobank example T1 and `neurolabusc/dcm_qa`. Check each source's terms before redistributing.

## License

MIT
