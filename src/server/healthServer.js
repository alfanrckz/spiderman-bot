import http from 'node:http';

// Render Web Service (free tier) mensyaratkan proses membuka port HTTP.
// Endpoint ini juga dipakai sebagai target ping oleh UptimeRobot agar service tidak sleep.
export function startHealthServer() {
  const port = process.env.PORT || 3000;

  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK - Bot Swing Trading BEI aktif.');
  });

  server.listen(port, () => {
    console.log(`[server] Health check server listening on port ${port}`);
  });

  return server;
}
