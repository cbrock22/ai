/**
 * Upload route test — proves the request does the cheap work only.
 *
 * The whole point of the change this guards: POST /api/images must respond
 * after storing the original and the grid thumbnail, and must NOT build the
 * AVIF/WebP rendition ladder (8-50 CPU-seconds per photo) before replying. If
 * that work creeps back into the request, a 500-1000 image batch stops fitting
 * inside the browser's per-request timeout and uploads hang again.
 *
 * The model, the storage layer and the auth/permission middleware are mocked,
 * so there is no DB and no S3 — but Multer and Sharp are real, so the thumbnail
 * is genuinely encoded from a real JPEG.
 *
 * Run from the backend directory:
 *   node test/upload.test.js
 */
const Module = require('module');
const express = require('express');
const http = require('http');
const realSharp = require('sharp');

// ---- Mocks ----------------------------------------------------------------
let stored = [];
let deleted = [];
let savedDoc = null;
let saveShouldThrow = false;
let duplicateToReturn = null;

function ImageMock(doc) {
  Object.assign(this, doc);
  savedDoc = doc;
}
ImageMock.prototype.save = async function () {
  if (saveShouldThrow) throw new Error('simulated db failure');
  return this;
};
ImageMock.prototype.populate = async function () {
  return this;
};
// `await Image.findOne(...).populate(..).populate(..)` — chainable + thenable.
ImageMock.findOne = () => {
  const chain = {
    populate: () => chain,
    then: (resolve) => resolve(duplicateToReturn)
  };
  return chain;
};

const origLoad = Module._load;
Module._load = function (request) {
  if (request.endsWith('/models/Image')) return ImageMock;
  if (request.endsWith('/services/storage')) {
    return {
      USE_S3: false,
      uploadsDir: '/tmp',
      generateFilename: (ext) => `stored-${stored.length}.${ext}`,
      putObject: async (buffer, filename, contentType) => {
        stored.push({ filename, contentType, bytes: buffer.length, buffer });
        return `https://example.test/${filename}`;
      },
      getObject: async () => Buffer.alloc(0),
      deleteObjects: async (names) => {
        deleted.push(...names);
      }
    };
  }
  if (request.endsWith('/middleware/auth')) {
    return {
      authenticateToken: (req, res, next) => {
        req.user = { _id: 'user1', role: 'user' };
        next();
      },
      optionalAuthentication: (req, res, next) => next()
    };
  }
  if (request.endsWith('/middleware/folderPermission')) {
    return {
      checkFolderAccess: () => (req, res, next) => {
        req.folder = { _id: 'folder1', name: 'Trip' };
        next();
      }
    };
  }
  return origLoad.apply(this, arguments);
};

const imageRouter = require('../routes/images');
const app = express();
app.use('/api/images', imageRouter);
const server = http.createServer(app);

// ---- Multipart helper (what the browser's FormData sends) ------------------
function postImage(jpeg) {
  const boundary = '----uploadtestboundary';
  const head = Buffer.from(
    `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="image"; filename="photo.jpg"\r\n' +
      'Content-Type: image/jpeg\r\n\r\n'
  );
  const tail = Buffer.from(
    `\r\n--${boundary}\r\n` +
      'Content-Disposition: form-data; name="folderId"\r\n\r\n' +
      `folder1\r\n--${boundary}--\r\n`
  );
  const body = Buffer.concat([head, jpeg, tail]);

  return new Promise((resolve) => {
    const r = http.request(
      {
        method: 'POST',
        path: '/api/images',
        port: server.address().port,
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length
        }
      },
      (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => resolve({ status: res.statusCode, body: b }));
      }
    );
    r.write(body);
    r.end();
  });
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
  await new Promise((r) => server.listen(0, r));

  // A real 900x600 JPEG, so Sharp actually decodes and re-encodes something.
  const jpeg = await realSharp({
    create: { width: 900, height: 600, channels: 3, background: { r: 10, g: 120, b: 200 } }
  })
    .jpeg()
    .toBuffer();

  // --- 1. Normal upload ----------------------------------------------------
  stored = [];
  deleted = [];
  savedDoc = null;
  const res = await postImage(jpeg);
  const parsed = JSON.parse(res.body);

  check('responds 201', res.status === 201);
  check('returns the image', !!parsed.image);

  // The core guarantee: two objects only — the original and the thumbnail.
  // A rendition ladder would be nine more.
  check('stores exactly 2 objects (original + thumbnail)', stored.length === 2);
  check('one of them is the webp thumbnail', stored.some((o) => o.contentType === 'image/webp'));
  check('one of them is the raw jpeg original', stored.some((o) => o.contentType === 'image/jpeg'));
  check(
    'thumbnail is much smaller than the original',
    (() => {
      const thumb = stored.find((o) => o.contentType === 'image/webp');
      const orig = stored.find((o) => o.contentType === 'image/jpeg');
      return thumb && orig && thumb.bytes < orig.bytes;
    })()
  );

  // THE guarantee: a download has to hand back exactly what was uploaded, so
  // the stored original must be byte-identical to the bytes that came in — no
  // resize, no re-encode, no metadata stripping.
  check(
    'stored original is byte-identical to the upload',
    (() => {
      const orig = stored.find((o) => o.contentType === 'image/jpeg');
      return !!orig && orig.buffer.equals(jpeg);
    })()
  );

  check('row is saved as pending', savedDoc && savedDoc.processingStatus === 'pending');
  check('row is saved with no renditions yet', savedDoc && Array.isArray(savedDoc.renditions) && savedDoc.renditions.length === 0);
  check('row records the original dimensions', savedDoc && savedDoc.originalWidth === 900 && savedDoc.originalHeight === 600);
  check('row records thumbnail dimensions capped at 300', savedDoc && savedDoc.thumbnailWidth === 300 && savedDoc.thumbnailHeight === 200);
  check('row carries the content hash for dedupe', savedDoc && typeof savedDoc.hash === 'string' && savedDoc.hash.length === 64);
  check('nothing was cleaned up on success', deleted.length === 0);

  // --- 2. Duplicate is skipped before any storage work ---------------------
  stored = [];
  duplicateToReturn = { _id: 'existing', filename: 'already-there.jpg' };
  const dup = await postImage(jpeg);
  duplicateToReturn = null;

  check('duplicate responds 200', dup.status === 200);
  check('duplicate is flagged', JSON.parse(dup.body).duplicate === true);
  check('duplicate stores nothing', stored.length === 0);

  // --- 3. A failed save must not leave orphaned objects -------------------
  // Both files are already in the bucket by the time save() runs, so without
  // cleanup they sit there unreachable and we keep paying to store them.
  stored = [];
  deleted = [];
  saveShouldThrow = true;
  const failRes = await postImage(jpeg);
  saveShouldThrow = false;

  check('save failure responds 500', failRes.status === 500);
  check('both stored objects are cleaned up', deleted.length === 2);
  check(
    'cleanup targets the keys that were written',
    stored.every((o) => deleted.includes(o.filename))
  );

  // --- 4. A file Sharp cannot decode must NOT cost us the original --------
  // Phones shoot HEIC and Sharp's prebuilt binary frequently cannot decode it.
  // The original is the archive copy and the only one that has to be perfect,
  // so failing to build DISPLAY versions must never discard it.
  stored = [];
  deleted = [];
  savedDoc = null;
  const undecodable = await postImage(Buffer.alloc(4096, 0x41));

  check('undecodable file still responds 201', undecodable.status === 201);
  check('the original IS stored', stored.length === 1);
  check('stored as the raw upload, not a re-encode', stored[0] && stored[0].contentType === 'image/jpeg');
  check(
    'undecodable original is byte-identical too',
    stored[0] && stored[0].buffer.equals(Buffer.alloc(4096, 0x41))
  );
  check('the original is NOT cleaned up', deleted.length === 0);
  check('a row is still saved', !!savedDoc);
  check('the row points at the original', savedDoc && !!savedDoc.originalUrl);
  check('the row has no thumbnail', savedDoc && savedDoc.thumbnailUrl === undefined);
  check('the row still carries the dedupe hash', savedDoc && typeof savedDoc.hash === 'string');
  check('the row is left pending for the worker', savedDoc && savedDoc.processingStatus === 'pending');

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  server.close();
  process.exit(failed === 0 ? 0 : 1);
})();
