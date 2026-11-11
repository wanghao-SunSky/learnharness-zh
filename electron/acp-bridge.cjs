// Owner-local ACP gateway. No TCP listener or credential export; only learning routes.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

function allowed(method, url) {
  return (method === 'GET' && (/^\/api\/chats$/.test(url) || /^\/api\/chats\/[a-zA-Z0-9_-]+(?:\/stream)?$/.test(url))) ||
    (method === 'POST' && ['/api/chats', '/api/chat'].includes(url));
}
async function startACPBridge({ directory, origin, secret }) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid()) throw new Error('Unsafe ACP directory');
  fs.chmodSync(directory, 0o700);
  const socketPath = path.join(directory, 'bridge.sock');
  if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
  const target = new URL(origin);
  if (target.hostname !== '127.0.0.1') throw new Error('ACP target must be loopback');
  const server = http.createServer((req, res) => {
    if (!allowed(req.method, req.url)) { res.writeHead(403).end(); req.resume(); return; }
    const upstream = http.request({ hostname: '127.0.0.1', port: target.port, path: req.url, method: req.method,
      headers: { 'content-type': 'application/json', 'x-learnharness-desktop': secret } }, response => {
      res.writeHead(response.statusCode, { 'content-type': response.headers['content-type'] || 'application/json', 'cache-control': 'no-store' });
      response.pipe(res);
    });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(503); res.end('{"error":"LearnHarness is unavailable"}'); });
    let bytes = 0;
    req.on('data', chunk => { bytes += chunk.length; if (bytes > 1024 * 1024) { upstream.destroy(); req.destroy(); } });
    req.pipe(upstream);
    res.on('close', () => upstream.destroy());
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socketPath, resolve); });
  fs.chmodSync(socketPath, 0o600);
  return { close() { server.close(); try { fs.unlinkSync(socketPath); } catch {} } };
}
module.exports = { startACPBridge, allowed };
