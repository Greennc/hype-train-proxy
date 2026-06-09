'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const TARGET = process.env.TARGET_URL || 'https://example.com';

const target = new URL(TARGET);
const upstream = target.protocol === 'https:' ? https : http;

const server = http.createServer((req, res) => {
  // Health check endpoint handled locally, not proxied.
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', target: TARGET }));
    return;
  }

  const start = Date.now();
  const options = {
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || (target.protocol === 'https:' ? 443 : 80),
    method: req.method,
    path: req.url,
    headers: { ...req.headers, host: target.host },
  };

  const proxyReq = upstream.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
    proxyRes.on('end', () => {
      console.log(
        `${req.method} ${req.url} -> ${proxyRes.statusCode} (${Date.now() - start}ms)`
      );
    });
  });

  proxyReq.on('error', (err) => {
    console.error(`Proxy error for ${req.method} ${req.url}:`, err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
    }
    res.end(JSON.stringify({ error: 'Bad Gateway', detail: err.message }));
  });

  req.pipe(proxyReq);
});

server.listen(PORT, () => {
  console.log(`hype-train-proxy listening on port ${PORT}, forwarding to ${TARGET}`);
});
