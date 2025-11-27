const nodemailer = require("nodemailer");

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendEmail(to, subject, html, text) {
  const transporter = createTransporter();

  await transporter.sendMail({
    from: `"Vender App" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
    text,
  });
}

module.exports = { sendEmail };
