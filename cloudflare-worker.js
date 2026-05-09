// Cloudflare Worker — visitor country tracker
// Setup:
//   1. Paste this into a new Cloudflare Worker
//   2. Create a KV namespace named "VISITS"
//   3. Bind it to this worker with variable name "VISITS"
//   4. Deploy → copy the worker URL into hugo.toml as visitorWorkerURL

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    // Record a visit — Cloudflare injects CF-IPCountry automatically, no client JS needed
    if (pathname === '/visit') {
      const cc = request.headers.get('CF-IPCountry');
      if (cc && cc.length === 2 && cc !== 'XX' && cc !== 'T1') {
        ctx.waitUntil(
          env.VISITS.get('c').then(function (raw) {
            var counts = raw ? JSON.parse(raw) : {};
            counts[cc] = (counts[cc] || 0) + 1;
            return env.VISITS.put('c', JSON.stringify(counts));
          })
        );
      }
      return new Response(null, { status: 204, headers: CORS });
    }

    // Return all country counts as JSON
    if (pathname === '/stats') {
      var raw = await env.VISITS.get('c');
      return new Response(raw || '{}', {
        headers: {
          ...CORS,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300',
        },
      });
    }

    return new Response('not found', { status: 404, headers: CORS });
  },
};
