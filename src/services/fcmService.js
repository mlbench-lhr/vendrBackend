const { GoogleAuth } = require("google-auth-library");
const https = require("https");
const logger = require("../utils/logger");

const PROJECT_ID = process.env.PROJECT_ID || process.env.FIREBASE_PROJECT_ID;

function buildAuth() {
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
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
  });
}

async function getAccessToken() {
  const auth = buildAuth();
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();
  return accessToken.token;
}

function toStringData(data) {
  if (!data) return undefined;
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = v == null ? "" : String(v);
  }
  return out;
}

async function sendAlert(deviceToken, title, body, data) {
  if (!PROJECT_ID) {
    logger.error("FCM PROJECT_ID missing");
    return null;
  }
  console.log("deviceToken----", deviceToken);

  const payload = {
    message: {
      token: deviceToken,
      notification: { title, body },
      data: toStringData(data),
    },
  };

  const token = await getAccessToken();

  const options = {
    method: "POST",
    hostname: "fcm.googleapis.com",
    path: `/v1/projects/${PROJECT_ID}/messages:send`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  };

  return await new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = "";
      console.log("FCM status:", res.statusCode);

      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        console.log("FCM response:", body);
        try {
          const json = body ? JSON.parse(body) : {};
          resolve(json);
        } catch (e) {
          console.error("FCM parse error:", e);
          resolve({});
        }
      });
    });
    req.on("error", reject);
    req.write(JSON.stringify(payload));
    req.end();
  });
}

module.exports = { sendAlert };
