import http from 'node:http';
import { handleRequest } from './router.js';

const PORT = Number(process.env.PORT ?? 3000);

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((err: unknown) => {
    console.error('Unhandled error:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  });
});

server.listen(PORT, () => {
  console.log(`✉️  Email Processor running on http://localhost:${PORT}`);
  console.log(`   POST /send          — send email (origin-gated)`);
  console.log(`   GET  /config        — list client configs (admin)`);
  console.log(`   POST /config        — add/update client config (admin)`);
  console.log(`   DEL  /config/:key   — remove client config (admin)`);
});
