import nodemailer, { type Transporter } from 'nodemailer';
import type { EnterpriseInquiryRecord } from '../../domain/schemas/enterprise-inquiry.schema.js';

export interface EnterpriseMailConfig {
  host: string;
  port: number;
  serverName: string;
  user: string;
  pass: string;
  to: string;
}

export interface EnterpriseNotifier {
  notify(record: EnterpriseInquiryRecord): Promise<void>;
}

/** Reads SMTP settings from env; returns null when mail is not configured. */
export function loadEnterpriseMailConfig(env: NodeJS.ProcessEnv): EnterpriseMailConfig | null {
  const user = env.ENTERPRISE_MAIL_USER?.trim();
  const pass = env.ENTERPRISE_MAIL_PASS?.trim();
  const to = env.ENTERPRISE_MAIL_TO?.trim();
  if (!user || !pass || !to) return null;
  return {
    host: env.ENTERPRISE_SMTP_HOST?.trim() || '127.0.0.1',
    port: Number(env.ENTERPRISE_SMTP_PORT) || 465,
    serverName: env.ENTERPRISE_SMTP_SERVERNAME?.trim() || 'mail.aipp.dev',
    user,
    pass,
    to,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Strips CR/LF so user input can never inject extra mail headers. */
function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

export function renderInquiryText(r: EnterpriseInquiryRecord): string {
  return [
    `Inquiry ID: ${r.inquiryId}`,
    `Received: ${r.createdAt}`,
    '',
    `Name: ${r.fullName}`,
    `Email: ${r.workEmail}`,
    `Organization: ${r.organization}`,
    `Telegram/X/Discord: ${r.roleOrChannel || '-'}`,
    '',
    `Products: ${r.selectedProducts.join(', ')}`,
    `Settlement: ${r.preferredSettlement}`,
    `Volume / Tier: ${r.monthlyVolume}`,
    '',
    'Notes:',
    r.notes || '-',
  ].join('\n');
}

export function renderInquiryHtml(r: EnterpriseInquiryRecord): string {
  const row = (k: string, v: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#6b6a65">${escapeHtml(k)}</td><td style="padding:4px 0">${escapeHtml(v)}</td></tr>`;
  return `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#1b1a17">
<h2 style="margin:0 0 12px">New Enterprise / Partnership Inquiry</h2>
<table>${[
    row('Inquiry ID', r.inquiryId),
    row('Received', r.createdAt),
    row('Name', r.fullName),
    row('Email', r.workEmail),
    row('Organization', r.organization),
    row('Telegram/X/Discord', r.roleOrChannel || '-'),
    row('Products', r.selectedProducts.join(', ')),
    row('Settlement', r.preferredSettlement),
    row('Volume / Tier', r.monthlyVolume),
  ].join('')}</table>
<p style="margin:14px 0 4px;color:#6b6a65">Notes</p>
<pre style="white-space:pre-wrap;font-family:inherit;margin:0">${escapeHtml(r.notes || '-')}</pre>
</div>`;
}

export class SmtpEnterpriseNotifier implements EnterpriseNotifier {
  private readonly transporter: Transporter;

  constructor(private readonly config: EnterpriseMailConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass },
      tls: { servername: config.serverName },
      connectionTimeout: 8000,
      socketTimeout: 12000,
    });
  }

  async notify(record: EnterpriseInquiryRecord): Promise<void> {
    await this.transporter.sendMail({
      from: `SovRoute Enterprise Desk <${this.config.user}>`,
      to: this.config.to,
      replyTo: { name: singleLine(record.fullName), address: record.workEmail },
      subject: singleLine(
        `[SovRoute Inquiry] ${record.organization} — ${record.selectedProducts.length} module(s)`,
      ),
      text: renderInquiryText(record),
      html: renderInquiryHtml(record),
    });
  }
}
