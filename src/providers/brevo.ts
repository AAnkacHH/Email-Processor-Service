import type { ClientConfig, EmailPayload, SendResult } from '../types.js';

export async function sendViaBrevo(
  config: ClientConfig,
  payload: EmailPayload,
): Promise<SendResult> {
  try {
    const recipients = Array.isArray(payload.to)
      ? payload.to.map((email) => ({ email }))
      : payload.to
        ? [{ email: payload.to }]
        : [];

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { email: config.from },
        to: recipients,
        subject: payload.subject,
        htmlContent: payload.html,
        ...(payload.attachments?.length
          ? {
              attachment: payload.attachments.map((a) => ({
                name: a.filename,
                content: a.content,
              })),
            }
          : {}),
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { success: false, error: JSON.stringify(data) };
    }

    return { success: true, data };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
