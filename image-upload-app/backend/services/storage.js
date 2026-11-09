// Single place that knows how bytes get stored and read back.
//
// Both the upload request (routes/images.js) and the background rendition
// worker (services/renditionWorker.js) need to put an object and build its URL,
// and the worker also needs to read the original back. Before this module the
// S3-vs-local branch was written out four times, which meant four places to fix
// whenever the bucket or the dev URL changed.

const { join } = require('path');
const fs = require('fs').promises;
const { S3Client, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');

const USE_S3 = process.env.USE_S3 === 'true';
const S3_BUCKET = process.env.S3_BUCKET_NAME;
const REGION = process.env.AWS_REGION || 'us-east-1';
const uploadsDir = join(__dirname, '..', 'uploads');

const s3Client = USE_S3
  ? new S3Client({
      region: REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    })
  : null;

// Collision-resistant without the cost of a UUID dependency: millisecond clock
// plus 9 random digits. `filename` is uniquely indexed, so a collision would
// surface as a write error rather than silent overwrite.
const generateFilename = (ext = 'jpg') => `${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;

// Local-storage fallback base URL. The upload request passes its own
// req-derived base (so a phone on the LAN gets a reachable host in dev); the
// worker has no request, so it falls back to BACKEND_URL like the read path in
// routes/images.js already does.
const defaultBaseUrl = () => process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;

/**
 * Store a buffer and return its public URL.
 * @param {Buffer} buffer
 * @param {string} filename Key (S3) or basename (local).
 * @param {string} contentType
 * @param {{cacheControl?: string, baseUrl?: string}} [opts]
 */
async function putObject(buffer, filename, contentType, opts = {}) {
  if (USE_S3) {
    await new Upload({
      client: s3Client,
      params: {
        Bucket: S3_BUCKET,
        Key: filename,
        Body: buffer,
        ContentType: contentType,
        CacheControl: opts.cacheControl || 'max-age=604800'
      }
    }).done();
    return `https://${S3_BUCKET}.s3.${REGION}.amazonaws.com/${filename}`;
  }

  await fs.writeFile(join(uploadsDir, filename), buffer);
  return `${opts.baseUrl || defaultBaseUrl()}/uploads/${filename}`;
}

/** Read a stored object back into a buffer, by the same key putObject was given. */
async function getObject(filename) {
  if (!USE_S3) {
    return fs.readFile(join(uploadsDir, filename));
  }

  const res = await s3Client.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: filename }));
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/**
 * Best-effort delete of keys written during a request that then failed, so a
 * half-finished upload doesn't leave objects nobody can reach (and we keep
 * paying for). Never throws: the caller is already on an error path.
 */
async function deleteObjects(filenames) {
  await Promise.all(
    filenames.filter(Boolean).map(async (filename) => {
      try {
        if (USE_S3) {
          await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: filename }));
        } else {
          await fs.unlink(join(uploadsDir, filename));
        }
      } catch (err) {
        console.error(`[storage] orphan cleanup failed for ${filename}:`, err.message);
      }
    })
  );
}

module.exports = { USE_S3, generateFilename, putObject, getObject, deleteObjects, uploadsDir };
