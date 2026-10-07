#!/usr/bin/env bash
# Download public sample DICOM sets into data/ (never committed).
set -euo pipefail
cd "$(dirname "$0")/../data"

# UK Biobank example T1 (Siemens, ~39 MB zip, 417 files).
# Source: https://biobank.ctsu.ox.ac.uk/ukb/refer.cgi?id=346
if [ ! -d ukb_t1 ]; then
  curl -fL -o ukb_t1.zip https://biobank.ctsu.ox.ac.uk/crystal/ukb/examples/eg_brain_t1.zip
  mkdir ukb_t1 && unzip -q ukb_t1.zip -d ukb_t1 && rm ukb_t1.zip
fi

# Multi-vendor / edge-case DICOM from the dcm2niix author's QA repo.
if [ ! -d dcm_qa ]; then
  git clone --depth 1 https://github.com/neurolabusc/dcm_qa dcm_qa
fi
