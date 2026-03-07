import type { ClientConfig, EmailPayload, SendResult } from '../types.js';

export async function sendViaSendgrid(
  config: ClientConfig,
  payload: EmailPayload,
): Promise<SendResult> {
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: Array.isArray(payload.to)
            ? payload.to.map((email) => ({ email }))
            : [{ email: payload.to }],
          subject: payload.subject,
        },
      ],
      from: { email: payload.from ?? config.from },
      content: [{ type: 'text/html', value: payload.html }],
      ...(payload.attachments?.length
        ? {
            attachments: payload.attachments.map((a) => ({
              content: a.content,
              filename: a.filename,
              type: a.type ?? 'application/octet-stream',
              disposition: 'attachment',
            })),
          }
        : {}),
    }),
  });

  // SendGrid returns 202 with no body on success
  if (response.status === 202) {
    return { success: true, data: { message: 'Email queued' } };
  }

  const data = await response.json().catch(() => ({ message: 'Unknown error' }));
  return { success: false, error: JSON.stringify(data) };
}
