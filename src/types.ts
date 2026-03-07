export interface ClientConfig {
  service: 'resend' | 'sendgrid';
  apiKey: string;
  from: string;
}

export interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}

export interface SendResult {
  success: boolean;
  data?: unknown;
  error?: string;
}
