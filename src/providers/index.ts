import type { ClientConfig, EmailPayload, SendResult } from '../types.js';
import { sendViaResend } from './resend.js';
import { sendViaSendgrid } from './sendgrid.js';
import { sendViaBrevo } from './brevo.js';

export async function sendEmail(config: ClientConfig, payload: EmailPayload): Promise<SendResult> {
  switch (config.service) {
    case 'resend':
      return sendViaResend(config, payload);
    case 'sendgrid':
      return sendViaSendgrid(config, payload);
    case 'brevo':
      return sendViaBrevo(config, payload);
    default: {
      const exhaustive: never = config.service;
      return { success: false, error: `Unknown provider: ${exhaustive}` };
    }
  }
}
