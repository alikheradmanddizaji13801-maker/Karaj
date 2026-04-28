// Edge runtime config for async request handling
export const config = { runtime: "edge" };

// Base URL of the internal service — read from environment variable
const _0x3f2a = (process.env.TARGET_DOMAIN || "").replace(//$/, "");

// List of headers to strip before forwarding (hop-by-hop and proxy headers)
const _filterMap = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

// Main function to process incoming requests
export default async function _handleRequest(req) {
  // Check if target address is configured
  if (!_0x3f2a) {
    return new Response("Misconfigured: TARGET_DOMAIN is not set", { status: 500 });
  }

  try {
    // Extract path from incoming URL and build final destination URL
    const _pathIdx = req.url.indexOf("/", 8);
    const _destUrl =
      _pathIdx === -1 ? _0x3f2a + "/" : _0x3f2a + req.url.slice(_pathIdx);

    // Build sanitized headers for outgoing request
    const _cleanHeaders = new Headers();
    let _clientAddr = null;

    for (const [_k, _v] of req.headers) {
      // Drop forbidden headers
      if (_filterMap.has(_k)) continue;
      // Drop platform-specific headers
      if (_k.startsWith("x-vercel-")) continue;
      // Extract real client IP
      if (_k === "x-real-ip") {
        _clientAddr = _v;
        continue;
      }
      // Handle forwarded-for header
      if (_k === "x-forwarded-for") {
        if (!_clientAddr) _clientAddr = _v;
        continue;
      }
      _cleanHeaders.set(_k, _v);
    }

    // Set final client IP in outgoing headers
    if (_clientAddr) _cleanHeaders.set("x-forwarded-for", _clientAddr);

    const _method = req.method;
    // Determine if request has a body (GET and HEAD don't)
    const _hasPayload = _method !== "GET" && _method !== "HEAD";

    // Forward request to destination and return response directly
    return await fetch(_destUrl, {
      method: _method,
      headers: _cleanHeaders,
      body: _hasPayload ? req.body : undefined,
      duplex: "half",
      redirect: "manual",
    });
  } catch (_err) {
    // Log error and return bad gateway response
    console.error("relay error:", _err);
    return new Response("Bad Gateway: Tunnel Failed", { status: 502 });
  }
}
