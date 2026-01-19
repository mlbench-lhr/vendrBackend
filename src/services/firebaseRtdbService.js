const { GoogleAuth } = require("google-auth-library");
const https = require("https");
const logger = require("../utils/logger");

function buildAuth(scopes) {
  return new GoogleAuth({
    credentials: {
      type: process.env.FIREBASE_TYPE,
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: process.env.FIREBASE_AUTH_URI,
      token_uri: process.env.FIREBASE_TOKEN_URI,
      auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
      client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
      universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN,
    },
    scopes,
  });
}

async function getAccessToken(scopes) {
  const auth = buildAuth(scopes);
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();
  return accessToken.token;
}

function normalizeNumber(v) {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeUserLocation(value) {
  if (!value || typeof value !== "object") return null;

  const directLat = normalizeNumber(value.lat ?? value.latitude);
  const directLng = normalizeNumber(value.lng ?? value.lon ?? value.longitude);
  if (directLat != null && directLng != null) return { lat: directLat, lng: directLng };

  if (value.location && typeof value.location === "object") {
    const lat = normalizeNumber(value.location.lat ?? value.location.latitude);
    const lng = normalizeNumber(value.location.lng ?? value.location.lon ?? value.location.longitude);
    if (lat != null && lng != null) return { lat, lng };
  }

  if (Array.isArray(value.l) && value.l.length >= 2) {
    const lat = normalizeNumber(value.l[0]);
    const lng = normalizeNumber(value.l[1]);
    if (lat != null && lng != null) return { lat, lng };
  }

  if (value.coords && typeof value.coords === "object") {
    const lat = normalizeNumber(value.coords.lat ?? value.coords.latitude);
    const lng = normalizeNumber(value.coords.lng ?? value.coords.lon ?? value.coords.longitude);
    if (lat != null && lng != null) return { lat, lng };
  }

  return null;
}

function normalizeVendorLocation(value) {
  if (!value || typeof value !== "object") return null;
  const lat = normalizeNumber(value.lat ?? value.latitude);
  const lng = normalizeNumber(value.lng ?? value.lon ?? value.longitude);
  if (lat != null && lng != null) return { lat, lng };
  return null;
}

function joinUrl(base, path) {
  const trimmedBase = String(base || "").replace(/\/+$/, "");
  const trimmedPath = String(path || "").replace(/^\/+/, "");
  return `${trimmedBase}/${trimmedPath}`;
}

async function getJsonFromRtdb(path) {
  const databaseUrl = process.env.FIREBASE_DATABASE_URL || process.env.FIREBASE_RTDB_URL;
  if (!databaseUrl) return null;

  const fullUrl = joinUrl(databaseUrl, `${String(path || "").replace(/^\/+/, "")}.json`);

  let token;
  try {
    token = await getAccessToken([
      "https://www.googleapis.com/auth/firebase.database",
      "https://www.googleapis.com/auth/userinfo.email",
    ]);
  } catch (err) {
    logger.error("Failed to get Firebase RTDB access token", err);
    return null;
  }

  return await new Promise((resolve) => {
    try {
      const u = new URL(fullUrl);
      const req = https.request(
        {
          method: "GET",
          hostname: u.hostname,
          path: `${u.pathname}${u.search}`,
          headers: { Authorization: `Bearer ${token}` },
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            try {
              resolve(body ? JSON.parse(body) : null);
            } catch (e) {
              resolve(null);
            }
          });
        }
      );
      req.on("error", () => resolve(null));
      req.end();
    } catch (err) {
      resolve(null);
    }
  });
}

async function getUserLocationFromRtdb(userId) {
  const databaseUrl = process.env.FIREBASE_DATABASE_URL || process.env.FIREBASE_RTDB_URL;
  if (!databaseUrl) return null;

  const locationRoot = process.env.FIREBASE_USER_LOCATION_PATH || "locations/users";

  const raw = await getJsonFromRtdb(`${locationRoot}/${encodeURIComponent(String(userId))}`);
  return normalizeUserLocation(raw);
}

async function getVendorLocationsFromRtdb() {
  const vendorRoot = process.env.FIREBASE_VENDOR_LOCATION_PATH || "live_vendor_locations";
  const raw = await getJsonFromRtdb(vendorRoot);
  if (!raw || typeof raw !== "object") return [];

  const out = [];
  for (const [vendorId, value] of Object.entries(raw)) {
    const loc = normalizeVendorLocation(value);

    if (loc) out.push({ vendorId: String(vendorId), lat: loc.lat, lng: loc.lng });
  }
  return out;
}

module.exports = { getUserLocationFromRtdb, getVendorLocationsFromRtdb };
