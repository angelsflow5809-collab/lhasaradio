// GET /api/stream -> 302 to the live Radio Lhasa stream on caster.fm.
//
// caster.fm only plays the stream with a token that its player page hands out, and the
// token changes whenever the caster.fm server restarts. Browsers can't read that page
// (no CORS), so this reads it on Vercel and redirects. The audio itself goes straight
// from caster.fm to the listener: none of it passes through Vercel.

const PLAYER_PAGE =
  "https://widgets.cloud.caster.fm/player/?token=559cee41-6071-4a67-bfca-e69331aba8f8";
const FALLBACK = { domain: "morcast.caster.fm", port: "14433", mount: "EJU95" };
const CACHE_MS = 60 * 1000;

let cached = null; // { url, at }

// The page's JSON has used both "key":"value" and "key":"value".
function field(page, key, numeric) {
  const q = '(?:"|\\\\u0022)';
  const value = numeric ? "(\\d+)" : `${q}([^"\\\\]+)${q}`;
  const m = page.match(new RegExp(`${q}${key}${q}\\s*:\\s*${value}`));
  return m ? m[1] : null;
}

async function streamUrl() {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.url;
  const res = await fetch(PLAYER_PAGE, { headers: { "User-Agent": "RadioLhasaSite/1.0" } });
  if (!res.ok) throw new Error(`caster.fm page answered ${res.status}`);
  const page = await res.text();
  const token = (page.match(/streamToken\s*=\s*'([0-9a-f]+)'/) || [])[1];
  if (!token) throw new Error("no stream token on the caster.fm page");
  const domain = field(page, "domain") || FALLBACK.domain;
  const port = field(page, "streaming_server_port", true) || FALLBACK.port;
  const mount = (field(page, "streaming_server_mountpoint") || FALLBACK.mount).replace(/^\//, "");
  const url = `https://${domain}:${port}/${mount}?token=${token}`;
  cached = { url, at: Date.now() };
  return url;
}

module.exports = async function handler(req, res) {
  try {
    const url = await streamUrl();
    res.statusCode = 302;
    res.setHeader("Location", url);
    res.setHeader("Cache-Control", "no-store");
    res.end();
  } catch (err) {
    cached = null;
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ error: "The stream address isn't available right now", detail: String(err.message || err) }));
  }
};

module.exports.streamUrl = streamUrl;
module.exports.field = field;
