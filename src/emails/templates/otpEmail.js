module.exports = function otpEmailTemplate({ otp, subject }) {

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      
      <div style="text-align: center; padding-top: 10px;">
        <h2>Vendr</h2>
      </div>

      <h2 style="text-align:center; color:#266CA8; margin-top: 20px;">
        ${subject}
      </h2>

      <p style="font-size: 16px; color:#444;">
        You requested a OTP for your Vender mobile application account.
      </p>

      <p style="font-size: 16px;">Your OTP code is:</p>

      <div style="background:#f3f6f9; padding:20px; text-align:center; border-radius:8px;">
        <h1 style="letter-spacing:6px; font-size:36px; margin:0; color:#266CA8;">
          ${otp}
        </h1>
      </div>

      <p style="margin-top:20px;">
        <strong>This OTP expires in 10 minutes.</strong>
      </p>

      <p>If you did not request this, simply ignore this email.</p>

      <hr style="margin:30px 0; border:none; border-top:1px solid #ddd;" />

      <p style="font-size:12px; color:#666; text-align:center;">
        This is an automated email from Vender App. Please do not reply.
      </p>
    </div>
  `;
};
