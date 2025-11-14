# Image Upload Optimization Plan

**Goal:** Reduce upload time from 30+ minutes to ~8-12 minutes for 1000 images while maintaining site responsiveness

**Date:** 2025-11-03

**Server Constraints:**
- 2 vCPUs (shared between nginx, mongodb, backend, certbot)
- 2GB RAM (~1.5GB available after containers)
- 60GB SSD Storage
- 3TB Transfer

---

## Current State Analysis

### Performance Metrics
- **Current:** 1000 images in 30+ minutes = ~0.55 images/second
- **Target:** 1000 images in 8-12 minutes = ~1.4-2 images/second

### Current Implementation
- **Frontend:** Upload.js with batch upload (5 files per batch, sequential batches)
- **Backend:** Single file endpoint with Sharp compression (2400x2400 JPEG @ 85% quality)
- **Storage:** AWS S3 (configurable, can use local)
- **Gallery:** Loads all full compressed images, no lazy loading
- **Versions Stored:** Compressed (display) + Original (download)

### Identified Bottlenecks
1. **Network Round Trips:** 200 HTTP requests for 1000 images (5 per request)
2. **Sequential Processing:** Only 5 files uploading at once
3. **Server-Side Compression:** Sharp processing blocks response, single-threaded
4. **No Thumbnails:** Gallery loads 2400x2400 images for grid view
5. **No Lazy Loading:** All images load on page render

---

## Optimization Strategy

### Core Principle
**Shift work from server to client** - The user's device is much more powerful than the 2 vCPU server.

### Key Changes
1. **Client-side image compression** before upload (10MB → 1MB)
2. **Bulk upload endpoint** (20 files per request vs 1)
3. **Parallel chunked uploads** (60 files uploading simultaneously)
4. **Deferred thumbnail generation** (background worker, low priority)
5. **Lazy loading gallery** with Intersection Observer

---

## Implementation Phases

### Sprint 1: Client-Side Compression & Parallel Uploads
**Duration:** 2-3 hours | **Impact:** Immediate 3x speed improvement

#### Changes:
1. Add `browser-image-compression` library to frontend
2. Compress images on client before upload:
   - Max 1MB per image
   - Max dimension: 1920x1920
   - Output: JPEG
   - Use browser Web Workers (non-blocking)
3. Update upload logic:
   - Chunk size: 20 files per request
   - Parallel chunks: 3 concurrent requests
   - Total: 60 files uploading simultaneously
4. Update nginx configuration:
   - `client_max_body_size`: 200M
   - `client_body_timeout`: 300s

#### Files Modified:
- `frontend/package.json` - Add dependency
- `frontend/src/components/Upload.js` - Client compression + parallel uploads
- `nginx/conf.d/app.conf` - Increase upload limits

#### Expected Results:
- Upload time: **10-12 minutes** for 1000 images
- Server CPU: Minimal (no compression)
- Server RAM: ~550MB (safe)
- Site: Fully responsive during uploads

---

### Sprint 2: Backend Bulk Upload Optimization
**Duration:** 4-6 hours | **Impact:** 8-10 minute upload time

#### Changes:
1. Create new bulk upload endpoint: `POST /api/images/bulk`
   - Accept up to 20 files per request
   - Return 202 Accepted immediately
   - Process files asynchronously
   - Stream directly to S3 (no memory buffering)
2. Update database schema:
   - Add `thumbnailUrl`, `thumbnailSize`, `thumbnailGeneratedAt`
   - Add `processingStatus` enum: pending/completed/failed
3. Create job status endpoint: `GET /api/images/bulk/:jobId/status`
   - Return: total files, processed, failed
   - Poll interval: 2 seconds

#### Files Modified:
- `backend/routes/images.js` - Add bulk endpoint
- `backend/models/Image.js` - Update schema
- `backend/package.json` - Dependencies (if needed)

#### Expected Results:
- Upload time: **8-10 minutes** for 1000 images
- Fewer HTTP requests: 50 vs 200
- Lower memory footprint
- Better error handling

---

### Sprint 3: Background Thumbnail Generation
**Duration:** 4-6 hours | **Impact:** Gallery performance

#### Changes:
1. Create thumbnail worker service:
   - Runs continuously in background
   - CPU usage monitoring (max 50% utilization)
   - Rate limiting during high load
   - Processes 1 image at a time
2. Thumbnail generation:
   - Size: 300x300 WebP @ 70% quality
   - Upload to S3 with `-thumb` suffix
   - Update database record
3. Supervisor pattern:
   - Auto-restart on crash
   - Resume from last processed image
   - Error logging and retry logic

#### Files Created:
- `backend/services/thumbnailWorker.js` - Worker service
- `backend/utils/cpuMonitor.js` - CPU usage tracking

#### Files Modified:
- `backend/server.js` - Start worker on boot

#### Expected Results:
- Thumbnails generated within hours after upload
- Zero impact on upload speed
- Zero impact on site responsiveness
- Gallery performance improves as thumbnails appear

---

### Sprint 4: Gallery Lazy Loading Enhancement
**Duration:** 3-4 hours | **Impact:** <1s gallery load

#### Changes:
1. Implement Intersection Observer:
   - Load images when scrolling into view
   - Configurable threshold and root margin
2. Three-tier loading strategy:
   - Tier 1: Blur placeholder (instant)
   - Tier 2: Thumbnail (lazy, if available)
   - Tier 3: Full image on click (lightbox)
3. Fallback handling:
   - Use full image if thumbnail not yet generated
   - Progressive enhancement as thumbnails appear
4. Virtual scrolling (optional):
   - For 1000+ images
   - Only render visible items

#### Files Modified:
- `frontend/package.json` - Add `react-intersection-observer`
- `frontend/src/components/Gallery.js` - Lazy loading logic

#### Expected Results:
- Initial gallery load: **<1s** (with thumbnails)
- Bandwidth: 100x reduction (300x300 vs 2400x2400)
- Smooth scrolling with 1000+ images
- Graceful degradation without thumbnails

---

## Technical Implementation Details

### Client-Side Compression (Sprint 1)

```javascript
import imageCompression from 'browser-image-compression';

async function compressImageOnClient(file) {
  const options = {
    maxSizeMB: 1,              // Max 1MB per image
    maxWidthOrHeight: 1920,    // Max dimension
    useWebWorker: true,        // Use browser worker threads
    fileType: 'image/jpeg'     // Output JPEG
  };

  const compressedFile = await imageCompression(file, options);
  return compressedFile;
}
```

### Parallel Chunked Upload (Sprint 1)

```javascript
const chunkSize = 20;
const parallelChunks = 3;

for (let i = 0; i < files.length; i += chunkSize * parallelChunks) {
  const chunks = [];

  for (let j = 0; j < parallelChunks; j++) {
    const start = i + (j * chunkSize);
    const chunk = files.slice(start, start + chunkSize);

    if (chunk.length > 0) {
      // Compress images on client first
      const compressed = await Promise.all(
        chunk.map(f => compressImageOnClient(f))
      );
      chunks.push(uploadChunk(compressed));
    }
  }

  await Promise.all(chunks);
}
```

### Bulk Upload Endpoint (Sprint 2)

```javascript
router.post('/bulk',
  upload.array('images', 20),
  checkFolderAccess('write'),
  async (req, res) => {
    const uploadId = generateUUID();

    // Return immediately
    res.status(202).json({
      uploadId,
      message: 'Upload accepted, processing in background',
      totalFiles: req.files.length
    });

    // Process async without blocking
    setImmediate(() => processUploadsAsync(uploadId, req.files, req.body.folderId, req.user._id));
  }
);
```

### Background Thumbnail Worker (Sprint 3)

```javascript
async function thumbnailWorker() {
  console.log('[ThumbnailWorker] Started');

  while (true) {
    try {
      // Check CPU usage
      const cpuUsage = await getCPUUsage();
      if (cpuUsage > 50) {
        await sleep(60000); // Wait 1 min if server busy
        continue;
      }

      // Find one image needing thumbnail
      const image = await Image.findOne({
        thumbnailUrl: null,
        processingStatus: { $ne: 'failed' }
      }).sort({ uploadDate: 1 }); // FIFO

      if (!image) {
        await sleep(30000); // No work, wait 30s
        continue;
      }

      console.log(`[ThumbnailWorker] Processing ${image.filename}`);

      // Download from S3, generate thumbnail, upload
      const buffer = await downloadFromS3(image.url);
      const thumbnail = await sharp(buffer)
        .resize(300, 300, { fit: 'cover' })
        .webp({ quality: 70 })
        .toBuffer();

      const thumbnailUrl = await uploadToS3(thumbnail, `${image.filename}-thumb.webp`);

      // Update database
      image.thumbnailUrl = thumbnailUrl;
      image.thumbnailSize = thumbnail.length;
      image.thumbnailGeneratedAt = new Date();
      image.processingStatus = 'completed';
      await image.save();

      console.log(`[ThumbnailWorker] Completed ${image.filename}`);

    } catch (err) {
      console.error('[ThumbnailWorker] Error:', err);
      await sleep(10000); // Error cooldown
    }
  }
}
```

### Lazy Loading Gallery (Sprint 4)

```javascript
import { useInView } from 'react-intersection-observer';

function ImageCard({ image }) {
  const { ref, inView } = useInView({
    triggerOnce: true,
    threshold: 0.1,
    rootMargin: '200px' // Load 200px before visible
  });

  const imageSrc = image.thumbnailUrl || image.url; // Fallback to full

  return (
    <div ref={ref} className="image-card">
      {inView ? (
        <img src={imageSrc} alt={image.originalName} />
      ) : (
        <div className="placeholder blur-placeholder" />
      )}
    </div>
  );
}
```

---

## Database Schema Updates

### Image Model (After Sprint 2)

```javascript
const imageSchema = new mongoose.Schema({
  // Existing fields
  filename: { type: String, required: true, unique: true },
  originalName: { type: String, required: true },
  url: { type: String, required: true },
  originalFilename: String,
  originalUrl: String,
  originalSize: Number,
  size: Number,
  folder: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', required: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  uploadDate: { type: Date, default: Date.now },
  favoritedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // New fields for thumbnails
  thumbnailUrl: { type: String },
  thumbnailSize: { type: Number },
  thumbnailGeneratedAt: { type: Date },
  processingStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending'
  }
});
```

---

## Nginx Configuration Updates

### app.conf (Sprint 1)

```nginx
# Increase buffer sizes for large uploads
client_max_body_size 200M;      # 20 images × 10MB worst case
client_body_buffer_size 10M;
client_body_timeout 300s;        # 5 min timeout for slow uploads
proxy_read_timeout 300s;
proxy_connect_timeout 75s;
```

---

## Performance Projections

| Metric | Current | After Sprint 1 | After Sprint 2 | After Sprint 4 |
|--------|---------|----------------|----------------|----------------|
| **Upload Time (1000 images)** | 30+ min | 10-12 min | 8-10 min | 8-10 min |
| **HTTP Requests** | 200 | 200 | 50 | 50 |
| **Files per Request** | 5 | 5 | 20 | 20 |
| **Parallel Uploads** | 5 | 60 | 60 | 60 |
| **Upload Size per Image** | 5-10MB | 0.5-1MB | 0.5-1MB | 0.5-1MB |
| **Server CPU During Upload** | High | Low | Low | Low |
| **Server RAM Usage** | ~600MB | ~550MB | ~550MB | ~550MB |
| **Gallery Initial Load** | ~10s | ~10s | ~10s | <1s |
| **Gallery Data Transfer** | ~30MB | ~30MB | ~30MB | ~300KB |

---

## Memory Budget Analysis

### Current State (Baseline)
- nginx: ~50MB
- mongodb: ~200MB
- backend: ~200MB
- certbot: ~20MB
- **Total: ~470MB (23.5% of 2GB)**

### After All Optimizations
- nginx: ~50MB
- mongodb: ~200MB
- backend: ~200MB
- certbot: ~20MB
- Upload buffer (temporary): ~20MB (20 files × 1MB)
- Thumbnail worker: ~50MB (when active)
- **Peak Total: ~540MB (27% of 2GB)** ✅ Safe

---

## Risk Mitigation

### What if upload fails mid-batch?
- **Solution:** Client-side retry logic with exponential backoff
- **Implementation:** Track successful uploads, resume from failure point

### What if thumbnail worker crashes?
- **Solution:** Supervisor process restarts worker
- **Implementation:** PM2 or systemd service with auto-restart

### What if server runs out of memory?
- **Solution:** Limit concurrent uploads, monitor memory usage
- **Implementation:** Reject requests if memory >80%, return 503

### What if S3 upload is slow?
- **Solution:** Client shows per-file progress, can pause/resume
- **Implementation:** Upload progress events, cancellation tokens

### What if user uploads duplicate images?
- **Future Enhancement:** Hash-based deduplication
- **Not in current scope**

---

## Testing Plan

### Unit Tests
- Client-side compression function
- Bulk upload endpoint validation
- Thumbnail generation logic
- Lazy loading Intersection Observer

### Integration Tests
- End-to-end upload of 100 images
- Verify all files stored in S3
- Verify database records created
- Verify thumbnails generated

### Performance Tests
- Upload 1000 images, measure time
- Monitor server CPU/RAM during upload
- Verify site responsiveness (load homepage during upload)
- Gallery load time with/without thumbnails

### Load Tests
- Multiple users uploading simultaneously
- Server stability under sustained load

---

## Rollback Plan

### If Sprint 1 Fails
- Remove `browser-image-compression` dependency
- Revert Upload.js changes
- Revert nginx config

### If Sprint 2 Fails
- Keep Sprint 1 optimizations (still 3x faster)
- Remove bulk endpoint
- Revert to single-file uploads

### If Sprint 3 Fails
- Thumbnail worker optional - can run manually
- System works without thumbnails

### If Sprint 4 Fails
- Gallery works without lazy loading
- Just slower initial load

---

## Monitoring & Observability

### Metrics to Track
- Upload success rate
- Average upload time per batch
- Server CPU/RAM usage
- Thumbnail generation backlog
- S3 upload failures
- Client-side compression failures

### Logging
- `[Upload]` Client-side compression results
- `[BulkUpload]` Batch processing status
- `[ThumbnailWorker]` Processing progress
- `[S3]` Upload success/failure

### Alerts
- Server RAM >80%
- Upload failure rate >5%
- Thumbnail backlog >1000 images
- S3 upload errors

---

## Future Enhancements (Not in Scope)

### Phase 5+
1. **WebP with JPEG Fallback**
   - Serve WebP to modern browsers, JPEG to older
   - ~25% better compression than JPEG

2. **CDN Integration**
   - CloudFront in front of S3
   - Global edge caching
   - Faster downloads worldwide

3. **Progressive Image Loading**
   - Low-quality placeholder (LQIP)
   - Progressive enhancement to high quality

4. **Image Deduplication**
   - Hash-based duplicate detection
   - Save storage costs

5. **Multi-region S3**
   - Replicate to multiple regions
   - Disaster recovery

6. **Video Support**
   - Extend to video uploads
   - Thumbnail extraction from video

---

## Dependencies

### New Frontend Dependencies
```json
{
  "browser-image-compression": "^2.0.2",
  "react-intersection-observer": "^9.5.3"
}
```

### New Backend Dependencies
None - uses existing Sharp, AWS SDK, etc.

---

## Configuration Changes

### Environment Variables (No changes needed)
Existing S3 configuration works as-is:
- `USE_S3=true`
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `S3_BUCKET_NAME`

### Docker Compose (No changes needed)
No changes to `docker-compose.prod.yml` required.

---

## Success Criteria

### Sprint 1 Success
- ✅ 1000 images upload in 10-12 minutes
- ✅ Server RAM stays <600MB
- ✅ Site responsive during upload
- ✅ No upload errors

### Sprint 2 Success
- ✅ 1000 images upload in 8-10 minutes
- ✅ Bulk endpoint returns 202 immediately
- ✅ All files stored in S3
- ✅ Database records created

### Sprint 3 Success
- ✅ Thumbnail worker runs continuously
- ✅ CPU usage stays <50% during thumbnail generation
- ✅ Thumbnails generated within 24 hours
- ✅ No server crashes

### Sprint 4 Success
- ✅ Gallery loads <1s with thumbnails
- ✅ Lazy loading works smoothly
- ✅ Fallback to full images works
- ✅ No layout shift during loading

---

## Timeline Estimate

| Sprint | Duration | Cumulative |
|--------|----------|------------|
| Sprint 1 | 2-3 hours | 2-3 hours |
| Sprint 2 | 4-6 hours | 6-9 hours |
| Sprint 3 | 4-6 hours | 10-15 hours |
| Sprint 4 | 3-4 hours | 13-19 hours |
| **Testing** | 2-3 hours | **15-22 hours** |

**Total:** ~2-3 working days for full implementation and testing

---

## Contact & Support

**Issues:** Create GitHub issue with `[optimization]` tag
**Questions:** Document assumptions in code comments
**Rollback:** See "Rollback Plan" section above

---

## Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2025-11-03 | Claude | Initial plan created |

---

## Appendix: Alternative Approaches Considered

### ❌ Server-Side Worker Threads
**Why rejected:** 2 vCPUs not enough for 4-8 worker threads

### ❌ In-Memory Upload Queue
**Why rejected:** Would use 5GB+ RAM for 1000 images

### ❌ Redis for Job Queue
**Why rejected:** Adds complexity and memory overhead

### ❌ Server-Side Image Compression
**Why rejected:** CPU-intensive, blocks site responsiveness

### ✅ Client-Side Compression (Chosen)
**Why chosen:** Offloads work to powerful client device, fast network upload

---

**End of Document**
