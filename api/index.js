export const config = { runtime: "edge" };

// Base URL of the upstream server, without trailing slash.
const UPSTREAM_BASE_URL = (process.env.TARGET_DOMAIN || "").replace(//$/, "");

// Headers that should not be forwarded as-is.
const HOP_BY_HOP_HEADERS = new Set([
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

export default async function edgeRelay(request) {
  if (!UPSTREAM_BASE_URL) {
    return new Response("Misconfigured: TARGET_DOMAIN is not set", { status: 500 });
  }

  try {
    const pathStartIndex = request.url.indexOf("/", 8);
    const upstreamUrl =
      pathStartIndex === -1
        ? UPSTREAM_BASE_URL + "/"
        : UPSTREAM_BASE_URL + request.url.slice(pathStartIndex);

    const forwardHeaders = new Headers();
    let originIp = null;

    for (const [headerName, headerValue] of request.headers) {
      if (HOP_BY_HOP_HEADERS.has(headerName)) continue;
      if (headerName.startsWith("x-vercel-")) continue;

      if (headerName === "x-real-ip") {
        originIp = headerValue;
        continue;
      }

      if (headerName === "x-forwarded-for") {
        if (!originIp) originIp = headerValue;
        continue;
      }

      forwardHeaders.set(headerName, headerValue);
    }

    // Preserve a single client IP hint for the upstream.
    if (originIp) forwardHeaders.set("x-forwarded-for", originIp);

    const requestMethod = request.method;
    const shouldSendBody = requestMethod !== "GET" && requestMethod !== "HEAD";

    return await fetch(upstreamUrl, {
      method: requestMethod,
      headers: forwardHeaders,
      body: shouldSendBody ? request.body : undefined,
      duplex: "half",
      redirect: "manual",
    });
  } catch (error) {
    console.error("relay error:", error);
    return new Response("Bad Gateway: Tunnel Failed", { status: 502 });
  }
}
