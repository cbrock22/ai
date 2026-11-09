// Background worker that builds each image's responsive rendition ladder.
//
// WHY THIS IS NOT DONE IN THE UPLOAD REQUEST
// Generating the ladder costs 8-50 CPU-seconds per photo (9 encodes: AVIF and
// WebP at four widths plus a JPEG fallback), so doing it before responding made
// every upload wait on every earlier upload. A 500-image batch could not finish
// inside the browser's 5-minute per-request timeout.
//
// WHY THIS IS NOT AN IN-MEMORY QUEUE EITHER
// An in-process queue of pending jobs has to hold each image's bytes until its
// turn comes. At 500-1000 images per batch that is several GB of buffers and an
// out-of-memory kill. Instead the upload request stores the original and saves
// the row as `processingStatus: 'pending'`, and this worker reads the original
// back from storage one image at a time. Memory stays flat no matter how deep
// the backlog gets, and because the backlog lives in MongoDB rather than in a
// variable, a restart or deploy mid-batch resumes instead of losing the work.

const Image = require('../models/Image');
const { generateRenditions } = require('./renditions');
const { generateFilename, putObject, getObject } = require('./storage');

// Toggle for the responsive display ladder (AVIF/WebP/JPEG). On by default; set
// DISPLAY_RENDITIONS=false to skip the encode work entirely, in which case rows
// are marked completed with no renditions and the frontend falls back to the
// thumbnail (grid) and the original (lightbox).
const GENERATE_RENDITIONS = process.env.DISPLAY_RENDITIONS !== 'false';

const IDLE_MS = 15000;   // nothing pending: how long before looking again
const PAUSE_MS = 250;    // breather between images so browsing stays responsive
const ERROR_MS = 5000;   // cooldown before retrying a failed image once

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Build and store the ladder for one image row, then mark it completed.
 * Throws if the original cannot be read or every encode fails; the caller
 * decides whether to retry or mark the row failed.
 */
async function processOne(image) {
  if (!GENERATE_RENDITIONS) {
    await Image.updateOne({ _id: image._id }, { processingStatus: 'completed' });
    return 0;
  }

  // The key the raw original was stored under. For current rows that is
  // `filename`; rows written by the long-removed /bulk route put a COMPRESSED
  // JPEG there and the original under `originalFilename`. Those rows are all
  // `completed` so the worker never sees them today, but if any are ever reset
  // to pending we must build renditions from the original, not the compressed copy.
  const buffer = await getObject(image.originalFilename || image.filename);
  const renditions = await generateRenditions(buffer);

  if (renditions.length === 0) {
    // generateRenditions swallows its own errors and returns [] — treat that as
    // a real failure rather than silently marking the image "completed" with no
    // ladder, which would look identical to a legacy image forever.
    throw new Error('no renditions produced');
  }

  const records = await Promise.all(
    renditions.map(async (r) => ({
      url: await putObject(r.buffer, generateFilename(r.ext), r.contentType, {
        cacheControl: 'max-age=2592000, immutable' // 30 days; filenames are unique
      }),
      format: r.format,
      width: r.width,
      height: r.height,
      size: r.size
    }))
  );

  await Image.updateOne(
    { _id: image._id },
    { renditions: records, processingStatus: 'completed' }
  );

  return records.length;
}

async function loop() {
  console.log(
    `[RenditionWorker] started (renditions ${GENERATE_RENDITIONS ? 'on' : 'off'})`
  );

  let sinceCount = 0;

  for (;;) {
    // Oldest pending first, so a batch completes in the order it was uploaded.
    const image = await Image.findOne({ processingStatus: 'pending' })
      .sort({ uploadDate: 1 })
      .select('_id filename originalFilename originalName')
      .lean();

    if (!image) {
      sinceCount = 0;
      await sleep(IDLE_MS);
      continue;
    }

    // Log the remaining backlog occasionally — at 500-1000 images per batch this
    // is the only way to tell progress from a stall. Not every image: the count
    // is a full index scan.
    if (sinceCount % 25 === 0) {
      const pending = await Image.countDocuments({ processingStatus: 'pending' });
      console.log(`[RenditionWorker] ${pending} image(s) pending`);
    }
    sinceCount += 1;

    try {
      const n = await processOne(image);
      console.log(`[RenditionWorker] done ${image.originalName} (${n} renditions)`);
    } catch (err) {
      // One retry covers a transient storage blip. A second failure marks the
      // row failed so it leaves the queue — otherwise one unreadable image sits
      // at the head of the backlog and nothing behind it is ever processed.
      console.error(`[RenditionWorker] ${image.originalName} failed, retrying once:`, err.message);
      await sleep(ERROR_MS);
      try {
        const n = await processOne(image);
        console.log(`[RenditionWorker] done on retry ${image.originalName} (${n} renditions)`);
      } catch (retryErr) {
        console.error(`[RenditionWorker] giving up on ${image.originalName}:`, retryErr.message);
        await Image.updateOne({ _id: image._id }, { processingStatus: 'failed' });
      }
    }

    await sleep(PAUSE_MS);
  }
}

function startRenditionWorker() {
  loop().catch((err) => {
    // The loop should never exit; if it does (e.g. Mongo dropped), restart it
    // rather than leaving every later upload stuck as pending.
    console.error('[RenditionWorker] loop exited, restarting in 30s:', err.message);
    setTimeout(startRenditionWorker, 30000);
  });
}

module.exports = { startRenditionWorker, processOne };
