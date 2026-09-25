// Dependency-free static server for e2e/update.spec.ts. Serves one of two production builds
// (dist-e2e/v1 or dist-e2e/v2, made by `npm run e2e:build-versions`) on port 4174 and records
// every path it was asked for, so a test can prove which files the browser downloaded.
//
//   GET /__switch?to=v1|v2  serve that build from now on (also clears the log)
//   GET /__log              JSON list of paths requested since the last switch; clears it
//   GET /__health           200 once the server is up
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

const PORT = 4174;
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

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  res.end(body);
}

/** Maps a URL path to a file inside the current build, or null if it would escape it. */
function fileFor(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const base = join(ROOT, current);
  const file = resolve(base, `.${decoded.endsWith('/') ? `${decoded}index.html` : decoded}`);
  return file.startsWith(base + sep) ? file : null;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  if (url.pathname === '/__health') return send(res, 200, 'ok');
  if (url.pathname === '/__switch') {
    const to = url.searchParams.get('to');
    if (!BUILDS.includes(to)) return send(res, 400, `unknown build: ${to}`);
    current = to;
    log = [];
    return send(res, 200, current);
  }
  if (url.pathname === '/__log') {
    const body = JSON.stringify(log);
    log = [];
    return send(res, 200, body, 'application/json; charset=utf-8');
  }

  log.push(url.pathname);
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
  const file = fileFor(url.pathname);
  if (!file) return send(res, 400, 'bad path');
  try {
    const body = await readFile(file);
    const type = TYPES[extname(file)] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length, 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    send(res, 404, 'not found');
  }
});

server.listen(PORT, 'localhost', () => {
  console.log(`two-build-server: http://localhost:${PORT}/ serving ${join(ROOT, current)}`);
});
