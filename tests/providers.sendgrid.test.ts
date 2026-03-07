import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ClientConfig, EmailPayload } from '../src/types.js';
import { sendViaSendgrid } from '../src/providers/sendgrid.js';

const mockConfig: ClientConfig = {
  service: 'sendgrid',
  apiKey: 'sg_test_key',
  from: 'info@lugixbox.cz',
};

const mockPayload: EmailPayload = {
  to: 'user@example.com',
  subject: 'Hello from Sendgrid',
  html: '<p>Test</p>',
};

describe('SendGrid Provider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends an email successfully (202 no body)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 202,
        json: async () => ({}),
      }),
    );

    const result = await sendViaSendgrid(mockConfig, mockPayload);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ message: 'Email queued' });

    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('https://api.sendgrid.com/v3/mail/send');
    expect(call[1].headers['Authorization']).toBe('Bearer sg_test_key');
  });

  it('builds correct personalizations for single recipient', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 202, json: async () => ({}) }));

    await sendViaSendgrid(mockConfig, mockPayload);

    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.personalizations[0].to).toEqual([{ email: 'user@example.com' }]);
  });

  it('builds correct personalizations for multiple recipients', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 202, json: async () => ({}) }));

    await sendViaSendgrid(mockConfig, { ...mockPayload, to: ['a@a.com', 'b@b.com'] });

    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.personalizations[0].to).toEqual([{ email: 'a@a.com' }, { email: 'b@b.com' }]);
  });

  it('returns failure on non-202 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 401,
        json: async () => ({ errors: [{ message: 'Unauthorized' }] }),
      }),
    );

    const result = await sendViaSendgrid(mockConfig, mockPayload);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unauthorized');
  });

  it('sends attachments in SendGrid format', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 202, json: async () => ({}) }));

    await sendViaSendgrid(mockConfig, {
      ...mockPayload,
      attachments: [{ filename: 'report.pdf', content: 'base64abc==', type: 'application/pdf' }],
    });

    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.attachments).toHaveLength(1);
    expect(body.attachments[0]).toEqual({
      content: 'base64abc==',
      filename: 'report.pdf',
      type: 'application/pdf',
      disposition: 'attachment',
    });
  });

  it('uses octet-stream as default MIME type for attachments', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 202, json: async () => ({}) }));

    await sendViaSendgrid(mockConfig, {
      ...mockPayload,
      attachments: [{ filename: 'file.bin', content: 'base64==' }], // no type provided
    });

    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.attachments[0].type).toBe('application/octet-stream');
  });

  it('omits attachments field when none provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 202, json: async () => ({}) }));

    await sendViaSendgrid(mockConfig, mockPayload);

    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.attachments).toBeUndefined();
  });
});
