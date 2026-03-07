import type { ClientConfig, EmailPayload, SendResult } from '../types.js';

export async function sendViaResend(
  config: ClientConfig,
  payload: EmailPayload,
): Promise<SendResult> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: payload.from ?? config.from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      ...(payload.attachments?.length
        ? {
            attachments: payload.attachments.map((a) => ({
              filename: a.filename,
              content: a.content,
            })),
          }
        : {}),
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    return { success: false, error: JSON.stringify(data) };
  }

  return { success: true, data };
}
