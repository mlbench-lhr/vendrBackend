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

function maskToken(token) {
  const s = String(token || "");
  if (!s) return "";
  if (s.length <= 10) return `${s.slice(0, 3)}...${s.slice(-2)}`;
  return `${s.slice(0, 6)}...${s.slice(-4)}`;
}

async function sendAlert(deviceToken, title, body, data) {
  if (!PROJECT_ID) {
    logger.error("FCM PROJECT_ID missing");
    return null;
  }

  const tokenLabel = maskToken(deviceToken);
  logger.info("FCM sendAlert:request", {
    projectId: PROJECT_ID,
    token: tokenLabel,
    title,
    bodyLength: String(body || "").length,
  });

  const payload = {
    message: {
      token: deviceToken,
      notification: { title, body },
      data: toStringData(data),
    },
  };

  let token;
  try {
    token = await getAccessToken();
  } catch (err) {
    logger.error("FCM getAccessToken failed", err);
    return null;
  }

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
      let responseBody = "";

      res.on("data", (chunk) => (responseBody += chunk));
      res.on("end", () => {
        const statusCode = res.statusCode;
        let json = {};
        try {
          json = responseBody ? JSON.parse(responseBody) : {};
        } catch (err) {
          logger.error("FCM response JSON parse failed", err);
        }

        if (statusCode >= 400) {
          logger.error("FCM sendAlert:response_error", { statusCode, token: tokenLabel, responseBody });
        } else {
          logger.info("FCM sendAlert:response_ok", { statusCode, token: tokenLabel });
        }

        resolve(json);
      });
    });

    req.on("error", (err) => {
      logger.error("FCM sendAlert:request_error", err);
      reject(err);
    });

    req.write(JSON.stringify(payload));
    req.end();
  });
}

module.exports = { sendAlert };
