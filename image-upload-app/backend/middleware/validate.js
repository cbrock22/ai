const { ZodError } = require('zod');

// Request-validation middleware factory.
//
// Why this exists: several endpoints previously passed `req.body` fields
// straight into Mongoose queries / documents. Because Express + body-parser
// will happily parse a JSON object like `{ "email": { "$gt": "" } }`, an
// attacker can smuggle a Mongo query operator into a field that is later used
// in `User.findOne({ email })` and bypass authentication (NoSQL injection).
//
// `validate()` runs the incoming `req.body` / `req.params` / `req.query`
// through strict Zod schemas. Zod enforces that each field is the EXPECTED
// primitive type (a string is a string, not an object), so operator-injection
// payloads are rejected with a 400 before they ever reach the database. On
// success the PARSED, type-safe, key-stripped values replace the originals so
// downstream handlers never see raw attacker-controlled shapes.
//
// Usage:
//   router.post('/login', validate({ body: loginBody }), handler)
//   router.put('/:folderId', validate({ params: folderIdParams, body: updateFolderBody }), handler)
function validate(schemas = {}) {
  return (req, res, next) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body ?? {});
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params ?? {});
      }
      if (schemas.query) {
        const parsedQuery = schemas.query.parse(req.query ?? {});
        // Depending on the Express version `req.query` may be a getter-only
        // property; assign defensively so we never throw on a valid request.
        try {
          req.query = parsedQuery;
        } catch (_) {
          Object.keys(req.query).forEach((k) => delete req.query[k]);
          Object.assign(req.query, parsedQuery);
        }
      }
      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: err.issues.map((issue) => ({
            field: issue.path.join('.') || '(root)',
            message: issue.message,
          })),
        });
      }
      return next(err);
    }
  };
}

module.exports = { validate };
