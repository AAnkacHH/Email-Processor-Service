export interface ClientConfig {
  service: 'resend' | 'sendgrid';
  apiKey: string;
  from: string;
}

export interface Attachment {
  filename: string;
  content: string; // base64-encoded file content
  type?: string; // MIME type, e.g. 'application/pdf'
}

export interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  attachments?: Attachment[];
}

export interface SendResult {
  success: boolean;
  data?: unknown;
  error?: string;
}
