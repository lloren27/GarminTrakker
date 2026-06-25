import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
const mailFrom = process.env.MAIL_FROM;

if (!resendApiKey) {
  throw new Error("RESEND_API_KEY no está definida");
}

if (!mailFrom) {
  throw new Error("MAIL_FROM no está definida");
}

const resend = new Resend(resendApiKey);

export const sendPasswordResetEmail = async (
  to: string,
  resetToken: string,
) => {
  const resetBaseUrl = process.env.APP_RESET_PASSWORD_URL;

  if (!resetBaseUrl) {
    throw new Error("APP_RESET_PASSWORD_URL no está definida");
  }

  const separator = resetBaseUrl.includes("?") ? "&" : "?";
  const resetUrl = `${resetBaseUrl}${separator}token=${encodeURIComponent(resetToken)}`;

  const subject = "Restablece tu contraseña de GarminTrakker";

  const html = `
    <div style="font-family: Arial, sans-serif; background:#F9FAFB; padding:24px;">
      <div style="max-width:600px; margin:auto; background:#ffffff; border-radius:12px; padding:24px;">
        
        <h2 style="color:#111827;">Restablecer contraseña</h2>

        <p>Hemos recibido una solicitud para restablecer tu contraseña.</p>

        <p>Pulsa en el siguiente botón:</p>

        <div style="text-align:center; margin:24px 0;">
          <a
            href="${resetUrl}"
            style="
              background:#2563EB;
              color:#ffffff;
              padding:14px 24px;
              border-radius:8px;
              text-decoration:none;
              font-weight:600;
              display:inline-block;
            "
          >
            Restablecer contraseña
          </a>
        </div>

        <p>Si no has solicitado este cambio, puedes ignorar este correo.</p>

        <p style="color:#6B7280; font-size:14px;">
          Este enlace expirará en 30 minutos.
        </p>

        <hr style="margin:24px 0;border:none;border-top:1px solid #E5E7EB;" />

        <p style="font-size:14px; color:#6B7280;">
          Si el botón no funciona, copia este enlace:
        </p>

        <p style="font-size:14px; color:#2563EB; word-break: break-all;">
          ${resetUrl}
        </p>

      </div>
    </div>
  `;

  const text = `
Restablecer contraseña de GarminTrakker

Abre este enlace:
${resetUrl}

Este enlace expirará en 30 minutos.
`;

  const { data, error } = await resend.emails.send({
    from: mailFrom,
    to,
    subject,
    html,
    text,
  });

  if (error) {
    console.error("❌ Error Resend:", error);
    throw new Error(
      `Error enviando email con Resend: ${error.message || "desconocido"}`
    );
  }

  return data;
};
