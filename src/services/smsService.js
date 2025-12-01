module.exports.sendSms = async function (phone, message) {
  console.log("SMS SENT TO:", phone, "MESSAGE:", message);

  // TODO: Replace this with Twilio / Firebase SMS / Your provider
  // Example Twilio:
  //
  // await client.messages.create({
  //     body: message,
  //     from: process.env.TWILIO_FROM,
  //     to: phone
  // });
};
