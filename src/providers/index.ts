import type { ClientConfig, EmailPayload, SendResult } from '../types.js';
import { sendViaResend } from './resend.js';
import { sendViaSendgrid } from './sendgrid.js';

export async function sendEmail(
  config: ClientConfig,
  payload: EmailPayload,
): Promise<SendResult> {
  switch (config.service) {
    case 'resend':
      return sendViaResend(config, payload);
    case 'sendgrid':
      return sendViaSendgrid(config, payload);
    default: {
      const exhaustive: never = config.service;
      return { success: false, error: `Unknown provider: ${exhaustive}` };
    }
  }
}
