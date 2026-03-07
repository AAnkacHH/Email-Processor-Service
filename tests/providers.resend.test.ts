import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ClientConfig, EmailPayload } from '../src/types.js';
import { sendViaResend } from '../src/providers/resend.js';

const mockConfig: ClientConfig = {
  service: 'resend',
  apiKey: 're_test_key',
  from: 'noreply@ankach.com',
};

const mockPayload: EmailPayload = {
  to: 'user@example.com',
  subject: 'Test Subject',
  html: '<b>Hello</b>',
};

describe('Resend Provider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends an email successfully', async () => {
    const mockResponse = { id: 'resend-id-123' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      }),
    );

    const result = await sendViaResend(mockConfig, mockPayload);

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockResponse);

    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('https://api.resend.com/emails');
    expect(call[1].headers['Authorization']).toBe('Bearer re_test_key');

    const body = JSON.parse(call[1].body);
    expect(body.from).toBe('noreply@ankach.com');
    expect(body.to).toBe('user@example.com');
    expect(body.subject).toBe('Test Subject');
  });

  it('uses payload.from when provided', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      }),
    );

    await sendViaResend(mockConfig, { ...mockPayload, from: 'custom@ankach.com' });

    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.from).toBe('custom@ankach.com');
  });

  it('returns failure on non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ message: 'Invalid API key' }),
      }),
    );

    const result = await sendViaResend(mockConfig, mockPayload);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid API key');
  });

  it('sends attachments when provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    await sendViaResend(mockConfig, {
      ...mockPayload,
      attachments: [{ filename: 'invoice.pdf', content: 'base64string==' }],
    });

    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.attachments).toHaveLength(1);
    expect(body.attachments[0]).toEqual({ filename: 'invoice.pdf', content: 'base64string==' });
  });

  it('omits attachments field when none provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    await sendViaResend(mockConfig, mockPayload);

    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.attachments).toBeUndefined();
  });

  it('handles network errors gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const result = await sendViaResend(mockConfig, mockPayload);

    expect(result.success).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });
});
