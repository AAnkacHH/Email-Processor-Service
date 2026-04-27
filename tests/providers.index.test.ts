import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ClientConfig, EmailPayload } from '../src/types.js';

// Mock all provider modules
vi.mock('../src/providers/resend.js', () => ({
  sendViaResend: vi.fn(),
}));
vi.mock('../src/providers/sendgrid.js', () => ({
  sendViaSendgrid: vi.fn(),
}));
vi.mock('../src/providers/brevo.js', () => ({
  sendViaBrevo: vi.fn(),
}));

import { sendViaResend } from '../src/providers/resend.js';
import { sendViaSendgrid } from '../src/providers/sendgrid.js';
import { sendViaBrevo } from '../src/providers/brevo.js';
import { sendEmail } from '../src/providers/index.js';

const payload: EmailPayload = {
  to: 'user@example.com',
  subject: 'Test',
  html: '<b>hi</b>',
};

describe('Provider Dispatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches to Resend when service=resend', async () => {
    const config: ClientConfig = { service: 'resend', apiKey: 're_key', from: 'a@b.com' };
    (sendViaResend as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

    const result = await sendEmail(config, payload);

    expect(sendViaResend).toHaveBeenCalledWith(config, payload);
    expect(sendViaSendgrid).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('dispatches to SendGrid when service=sendgrid', async () => {
    const config: ClientConfig = { service: 'sendgrid', apiKey: 'sg_key', from: 'a@b.com' };
    (sendViaSendgrid as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

    const result = await sendEmail(config, payload);

    expect(sendViaSendgrid).toHaveBeenCalledWith(config, payload);
    expect(sendViaResend).not.toHaveBeenCalled();
    expect(sendViaBrevo).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('dispatches to Brevo when service=brevo', async () => {
    const config: ClientConfig = { service: 'brevo', apiKey: 'xkeysib-key', from: 'a@b.com' };
    (sendViaBrevo as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

    const result = await sendEmail(config, payload);

    expect(sendViaBrevo).toHaveBeenCalledWith(config, payload);
    expect(sendViaResend).not.toHaveBeenCalled();
    expect(sendViaSendgrid).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });
});
