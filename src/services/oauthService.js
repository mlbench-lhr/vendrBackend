const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client();

async function verifyGoogleToken(idToken, platform) {
  const ANDROID_ID =
    process.env.GOOGLE_CLIENT_ID_ANDROID || process.env.GOOGLE_CLIENT_ID;
  const IOS_ID =
    process.env.GOOGLE_CLIENT_ID_IOS || process.env.GOOGLE_CLIENT_ID;
  const audience =
    String(platform || "").toLowerCase() === "android"
      ? ANDROID_ID
      : String(platform || "").toLowerCase() === "ios"
      ? IOS_ID
      : [ANDROID_ID, IOS_ID];
  const ticket = await client.verifyIdToken({
    idToken,
    audience
  });
  return ticket.getPayload();
}

module.exports = {
  verifyGoogleToken
};
