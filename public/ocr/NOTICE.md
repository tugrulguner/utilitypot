# Local recognition assets

This directory contains third-party browser recognition assets, not uploaded images.
They are served by UtilityPot itself; the client specifies explicit same-origin paths.

- Tesseract.js 7.0.0 worker: Apache-2.0; see TESSERACT-LICENSE.txt.
- Tesseract.js-core 7.0.0 LSTM WebAssembly builds: Apache-2.0; see CORE-LICENSE.txt.
- English Tesseract language data, Apache-2.0: https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz (upstream https://github.com/tesseract-ocr/tessdata).

MANIFEST.json records exact byte counts and SHA-256 checksums. Do not format generated JavaScript. Portable, SIMD and relaxed-SIMD LSTM builds are supplied; Tesseract selects the supported build. Browser caching may retain recognition files, not source images or recognized results.

When updating, pin npm versions and the language-data source, retain licenses, regenerate the manifest from actual bytes, and repeat genuine browser OCR plus extracted-Worker tests. Never substitute a third-party inference endpoint or send images to a fallback service.
