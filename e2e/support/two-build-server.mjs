// Dependency-free static server for the e2e tests.
//
// Port 4174 (e2e/update.spec.ts) serves one of two production builds, dist-e2e/v1 or dist-e2e/v2 (made by
// `npm run e2e:build-versions`), at "/", and records every path it was asked for, so a test can prove
// which files the browser downloaded:
//   GET /__switch?to=v1|v2  serve that build from now on (also clears the log)
//   GET /__log              JSON list of paths requested since the last switch; clears it
//   GET /__health           200 once both ports are listening
//
// Port 4175 (e2e/subpath.spec.ts) serves build v1 under /qundaq/, the way GitHub Pages serves the site,
// and answers 404 for anything else. It keeps its own log (GET /__log, cleared on read) so it never mixes
// with update.spec.ts, which runs in parallel.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

const PORT = 4174;
const SUBPATH_PORT = 4175;
const SUBPATH = '/qundaq/';
const ROOT = resolve('dist-e2e');
const BUILDS = ['v1', 'v2'];
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

for (const build of BUILDS) {
  const ok = await stat(join(ROOT, build, 'sw.js')).then(
    (s) => s.isFile(),
    () => false,
  );
  if (!ok) {
    console.error(`two-build-server: ${join(ROOT, build, 'sw.js')} is missing. Run "npm run e2e:build-versions" first.`);
    process.exit(1);
  }
}

let current = 'v1';
let log = [];
let subpathLog = [];
let listening = 0;

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  res.end(body);
}

function sendLog(res, paths) {
  send(res, 200, JSON.stringify(paths), 'application/json; charset=utf-8');
}

/** Maps a URL path to a file inside dist-e2e/<build>, or null if it would escape it. */
function fileFor(build, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const base = join(ROOT, build);
  const file = resolve(base, `.${decoded.endsWith('/') ? `${decoded}index.html` : decoded}`);
  return file.startsWith(base + sep) ? file : null;
}

async function serveFile(req, res, file) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
  if (!file) return send(res, 400, 'bad path');
  try {
    const body = await readFile(file);
    const type = TYPES[extname(file)] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length, 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    send(res, 404, 'not found');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  if (url.pathname === '/__health') return listening === 2 ? send(res, 200, 'ok') : send(res, 503, 'starting');
  if (url.pathname === '/__switch') {
    const to = url.searchParams.get('to');
    if (!BUILDS.includes(to)) return send(res, 400, `unknown build: ${to}`);
    current = to;
    log = [];
    return send(res, 200, current);
  }
  if (url.pathname === '/__log') {
    const paths = log;
    log = [];
    return sendLog(res, paths);
  }
  log.push(url.pathname);
  return serveFile(req, res, fileFor(current, url.pathname));
});

const subpathServer = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${SUBPATH_PORT}`);
  if (url.pathname === '/__log') {
    const paths = subpathLog;
    subpathLog = [];
    return sendLog(res, paths);
  }
  subpathLog.push(url.pathname);
  if (!url.pathname.startsWith(SUBPATH)) return send(res, 404, 'not found');
  return serveFile(req, res, fileFor('v1', `/${url.pathname.slice(SUBPATH.length)}`));
});

server.listen(PORT, 'localhost', () => {
  listening += 1;
  console.log(`two-build-server: http://localhost:${PORT}/ serving ${join(ROOT, current)}`);
});
subpathServer.listen(SUBPATH_PORT, 'localhost', () => {
  listening += 1;
  console.log(`two-build-server: http://localhost:${SUBPATH_PORT}${SUBPATH} serving ${join(ROOT, 'v1')}`);
});
