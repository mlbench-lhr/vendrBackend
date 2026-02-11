const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client();

async function verifyGoogleToken(idToken, platform) {
  const ANDROID_ID =
    process.env.GOOGLE_CLIENT_ID_ANDROID || process.env.GOOGLE_CLIENT_ID;
  const IOS_ID =
    process.env.GOOGLE_CLIENT_ID_IOS || process.env.GOOGLE_CLIENT_ID;
  const WEB_ID =
    process.env.GOOGLE_CLIENT_ID_WEBCLIENT || process.env.GOOGLE_CLIENT_ID;
  const p = String(platform || "").toLowerCase();
  const audience =
    p === "android"
      ? ANDROID_ID
      : p === "ios"
      ? IOS_ID
      : p === "webclient"
      ? WEB_ID
      : [ANDROID_ID, IOS_ID, WEB_ID];
  const ticket = await client.verifyIdToken({
    idToken,
    audience
  });
  return ticket.getPayload();
}

module.exports = {
  verifyGoogleToken
};
