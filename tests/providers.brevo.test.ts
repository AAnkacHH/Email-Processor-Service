import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ClientConfig, EmailPayload } from '../src/types.js';
import { sendViaBrevo } from '../src/providers/brevo.js';

const mockConfig: ClientConfig = {
  service: 'brevo',
  apiKey: 'xkeysib-test-key',
  from: 'noreply@elenamuratovateta.com',
};

const mockPayload: EmailPayload = {
  to: 'user@example.com',
  subject: 'Test Subject',
  html: '<b>Hello</b>',
};

describe('Brevo Provider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends an email successfully', async () => {
    const mockResponse = { messageId: 'brevo-id-123' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      }),
    );

    const result = await sendViaBrevo(mockConfig, mockPayload);

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockResponse);

    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('https://api.brevo.com/v3/smtp/email');
    expect(call[1].headers['api-key']).toBe('xkeysib-test-key');

    const body = JSON.parse(call[1].body);
    expect(body.sender).toEqual({ email: 'noreply@elenamuratovateta.com' });
    expect(body.to).toEqual([{ email: 'user@example.com' }]);
    expect(body.subject).toBe('Test Subject');
    expect(body.htmlContent).toBe('<b>Hello</b>');
  });

  it('wraps array recipients into Brevo object format', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    await sendViaBrevo(mockConfig, {
      ...mockPayload,
      to: ['a@example.com', 'b@example.com'],
    });

    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.to).toEqual([{ email: 'a@example.com' }, { email: 'b@example.com' }]);
  });

  it('ignores payload.from when provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    await sendViaBrevo(mockConfig, { ...mockPayload, from: 'custom@example.com' });

    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.sender).toEqual({ email: 'noreply@elenamuratovateta.com' });
  });

  it('returns failure on non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ code: 'unauthorized', message: 'Invalid API key' }),
      }),
    );

    const result = await sendViaBrevo(mockConfig, mockPayload);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid API key');
  });

  it('sends attachments mapped to Brevo schema (name + content)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    await sendViaBrevo(mockConfig, {
      ...mockPayload,
      attachments: [{ filename: 'invoice.pdf', content: 'base64string==' }],
    });

    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.attachment).toHaveLength(1);
    expect(body.attachment[0]).toEqual({ name: 'invoice.pdf', content: 'base64string==' });
  });

  it('omits attachment field when none provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    await sendViaBrevo(mockConfig, mockPayload);

    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.attachment).toBeUndefined();
  });

  it('handles network errors gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const result = await sendViaBrevo(mockConfig, mockPayload);

    expect(result.success).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });
});
