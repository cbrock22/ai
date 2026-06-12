/**
 * NoSQL-injection / request-validation smoke test.
 *
 * Proves that the Zod validation layer rejects operator-injection payloads
 * (e.g. { "email": { "$gt": "" } }) BEFORE they reach Mongoose, while letting
 * well-formed requests through. Mongoose models and auth/rate-limit middleware
 * are mocked so the test needs no database.
 *
 * Run from the backend directory:
 *   node test/validation.test.js
 *
 * Requires `zod` to be installed (npm install).
 */
const Module = require('module');
const express = require('express');
const http = require('http');

// ---- Mock model + middleware modules so the routers load without a DB ------
let findOneCalledWith = null;
function makeUserMock() {
  function User(doc) { Object.assign(this, doc); }
  User.findOne = async (q) => { findOneCalledWith = q; return null; }; // no match -> 401
  User.find = async () => [];
  User.findByIdAndUpdate = () => ({ select: async () => null });
  User.findByIdAndDelete = async () => null;
  User.prototype.save = async function () { return this; };
  User.prototype.comparePassword = async () => false;
  return User;
}

const origLoad = Module._load;
Module._load = function (request) {
  if (request.endsWith('/models/User')) return makeUserMock();
  if (request.endsWith('/models/Folder')) {
    function Folder() {}
    Folder.findOne = async () => null;
    Folder.findById = () => ({ select: async () => null, populate: async () => null });
    Folder.find = async () => [];
    return Folder;
  }
  if (request.endsWith('/models/Image')) {
    function Image() {}
    Image.find = async () => [];
    Image.countDocuments = async () => 0;
    return Image;
  }
  if (request.endsWith('/middleware/auth')) {
    return {
      generateToken: () => 'tok',
      authenticateToken: (req, res, next) => { req.user = { _id: 'x', role: 'user' }; next(); },
      requireAdmin: (req, res, next) => next(),
      optionalAuthentication: (req, res, next) => next(),
    };
  }
  if (request.endsWith('/middleware/rateLimit')) {
    return { authLimiter: (req, res, next) => next(), apiLimiter: (req, res, next) => next() };
  }
  return origLoad.apply(this, arguments);
};

const authRouter = require('../routes/auth');
const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
const server = http.createServer(app);

function post(path, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const r = http.request(
      { method: 'POST', path, port: server.address().port,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode, body: b })); }
    );
    r.write(data); r.end();
  });
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  let pass = 0, fail = 0;
  const check = (name, cond) => { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } };

  findOneCalledWith = null;
  let r = await post('/api/auth/login', { email: { $gt: '' }, password: { $gt: '' } });
  check('injection login rejected with 400', r.status === 400);
  check('injection never reached User.findOne', findOneCalledWith === null);

  r = await post('/api/auth/signup', { username: { $gt: '' }, email: { $gt: '' }, password: { $gt: '' } });
  check('injection signup rejected 400', r.status === 400);

  findOneCalledWith = null;
  r = await post('/api/auth/login', { email: 'cole@example.com', password: 'secret123' });
  check('valid login passes validation (401, not 400)', r.status === 401);
  check('valid login reached findOne with string email', findOneCalledWith && findOneCalledWith.email === 'cole@example.com');

  r = await post('/api/auth/signup', { username: 'coletest', email: 'New@Example.com', password: 'secret123' });
  check('valid signup passes validation (201)', r.status === 201);

  r = await post('/api/auth/signup', { username: 'abc', email: 'a@b.com', password: '123' });
  check('short password rejected 400', r.status === 400);

  r = await post('/api/auth/login', { email: 'a@b.com', password: 'secret123', role: 'admin' });
  check('strict() rejects unexpected field (privilege smuggling) 400', r.status === 400);

  server.close();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
