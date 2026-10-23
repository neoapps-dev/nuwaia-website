const USERNAME = "nawaia2025";
const APP_ID = "936619743392459";
const FRESH_SECONDS = 3600;
const FAIL_COOLDOWN = 300;
let lastFail = 0;
const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
};

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, OPTIONS",
        },
      });
    }
    if (request.method !== "GET" || url.pathname !== "/reels") {
      return jsonResponse({ error: "not_found" }, 404);
    }

    const cache = caches.default;
    const cacheKey = new Request(url.origin + "/cache/" + USERNAME);
    let cachedData = null;
    let cachedAt = 0;
    try {
      const cached = await cache.match(cacheKey);
      if (cached) {
        cachedAt = Number(cached.headers.get("x-cached-at") || 0);
        cachedData = await cached.json();
      }
    } catch (e) {
      cachedData = null;
    }

    const now = Date.now() / 1000;
    const isFresh = cachedData && now - cachedAt < FRESH_SECONDS;
    const coolingDown = lastFail > 0 && now - lastFail < FAIL_COOLDOWN;
    if (isFresh || (coolingDown && cachedData)) {
      return jsonResponse({ ...cachedData, cached: true });
    }

    try {
      const upstream = await fetch(
        "https://www.instagram.com/api/v1/users/web_profile_info/?username=" +
          USERNAME,
        {
          headers: {
            "x-ig-app-id": APP_ID,
            "user-agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          },
        },
      );
      const data = await upstream.json();
      const user =
        data && data.data && data.data.user && data.status === "ok"
          ? data.data.user
          : null;
      if (!upstream.ok || !user) throw new Error("upstream_error");
      lastFail = 0;
      const payload = { user, fetchedAt: now };
      const store = new Response(JSON.stringify(payload), {
        headers: {
          ...jsonHeaders,
          "x-cached-at": String(now),
          "cache-control": "public, max-age=31536000",
        },
      });
      await cache.put(cacheKey, store.clone());
      return jsonResponse(payload);
    } catch (e) {
      lastFail = now;
      if (cachedData) {
        return jsonResponse({ ...cachedData, cached: true, stale: true });
      }
      return jsonResponse({ error: e }, 502);
    }
  },
};
