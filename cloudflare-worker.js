// Cloudflare Worker — visitor country tracker
// Each country stored as its own KV key — no race conditions, no caching.

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

    // Record a visit — Cloudflare injects CF-IPCountry, no cookies needed
    if (pathname === '/visit') {
      const cc = request.headers.get('CF-IPCountry');
      if (cc && cc.length === 2 && cc !== 'XX' && cc !== 'T1') {
        ctx.waitUntil(
          env.VISITS.get(cc).then(function (val) {
            return env.VISITS.put(cc, String((parseInt(val) || 0) + 1));
          })
        );
      }
      return new Response(null, { status: 204, headers: CORS });
    }

    // Return all country counts — always fresh, no cache
    if (pathname === '/stats') {
      const { keys } = await env.VISITS.list();
      const counts = {};
      await Promise.all(
        keys.map(async function (k) {
          counts[k.name] = parseInt(await env.VISITS.get(k.name)) || 0;
        })
      );
      return new Response(JSON.stringify(counts), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return new Response('not found', { status: 404, headers: CORS });
  },
};
