/**
 * Rendition worker state-transition test.
 *
 * The worker is what makes a 500-1000 image upload survivable: the request
 * stores the original and saves the row as `pending`, and this worker fills in
 * the AVIF/WebP ladder afterwards, one image at a time, reading each original
 * back from storage. Its backlog lives in MongoDB, so the only thing standing
 * between "upload finished" and "image fully processed" is that every pending
 * row eventually leaves the pending state — completed or failed.
 *
 * This checks the three ways a row can leave it. The model, the storage layer
 * and the encoder are mocked, so no DB, no S3 and no real image encoding.
 *
 * Run from the backend directory:
 *   node test/renditionWorker.test.js
 */
const Module = require('module');

// ---- Mocks ----------------------------------------------------------------
let updates = [];
let stored = [];
let readKeys = [];
let renditionsToReturn = [];

function ImageMock() {}
ImageMock.updateOne = async (filter, update) => {
  updates.push({ filter, update });
  return { acknowledged: true };
};

const storageMock = {
  generateFilename: (ext) => `generated.${ext}`,
  putObject: async (buffer, filename, contentType) => {
    stored.push({ filename, contentType, bytes: buffer.length });
    return `https://example.test/${filename}`;
  },
  getObject: async (key) => {
    readKeys.push(key);
    return Buffer.from('original-bytes');
  }
};

const origLoad = Module._load;
Module._load = function (request) {
  if (request.endsWith('/models/Image')) return ImageMock;
  if (request.endsWith('/storage')) return storageMock;
  if (request.endsWith('/renditions')) {
    return { generateRenditions: async () => renditionsToReturn };
  }
  return origLoad.apply(this, arguments);
};

function loadWorker() {
  // The DISPLAY_RENDITIONS toggle is read once at module load, so each case
  // needs a fresh instance.
  delete require.cache[require.resolve('../services/renditionWorker')];
  return require('../services/renditionWorker');
}

function reset() {
  updates = [];
  stored = [];
  readKeys = [];
}

// ---- Assertions -----------------------------------------------------------
let passed = 0;
let failed = 0;
function check(label, cond) {
  if (cond) {
    passed += 1;
    console.log(`  PASS ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label}`);
  }
}

(async () => {
  const image = { _id: 'img1', filename: '1700000000-123.jpg', originalName: 'beach.jpg' };

  // --- 1. Happy path: ladder stored, row marked completed ------------------
  reset();
  renditionsToReturn = [
    { format: 'avif', contentType: 'image/avif', ext: 'avif', width: 640, height: 480, size: 11, buffer: Buffer.alloc(11) },
    { format: 'webp', contentType: 'image/webp', ext: 'webp', width: 640, height: 480, size: 22, buffer: Buffer.alloc(22) }
  ];
  const count = (loadWorker()).processOne;
  const n = await count(image);

  check('reads the original by the row filename', readKeys.length === 1 && readKeys[0] === image.filename);
  check('stores one object per rendition', stored.length === 2);
  check('returns the number of renditions', n === 2);
  check('writes exactly one update', updates.length === 1);
  check('marks the row completed', updates[0].update.processingStatus === 'completed');
  check('saves a record per rendition', (updates[0].update.renditions || []).length === 2);
  check(
    'each record carries url + format + size',
    (updates[0].update.renditions || []).every((r) => r.url && r.format && r.size)
  );

  // --- 2. Encoder produced nothing: must throw, not quietly complete -------
  // generateRenditions swallows its own errors and returns []. If processOne
  // accepted that, the row would be marked completed with no ladder and look
  // identical to a pre-renditions legacy image forever, with nothing to retry.
  reset();
  renditionsToReturn = [];
  let threw = false;
  try {
    await (loadWorker()).processOne(image);
  } catch {
    threw = true;
  }
  check('throws when no renditions were produced', threw);
  check('does not mark the row completed on an empty ladder', updates.length === 0);
  check('stores nothing on an empty ladder', stored.length === 0);

  // --- 3. Renditions switched off: row must still leave `pending` ----------
  // Otherwise every upload stays pending forever and the worker spins on a
  // backlog it will never clear.
  reset();
  process.env.DISPLAY_RENDITIONS = 'false';
  const offResult = await (loadWorker()).processOne(image);
  delete process.env.DISPLAY_RENDITIONS;

  check('returns 0 renditions when disabled', offResult === 0);
  check('still marks the row completed when disabled', updates.length === 1 && updates[0].update.processingStatus === 'completed');
  check('does no storage work when disabled', stored.length === 0 && readKeys.length === 0);

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
