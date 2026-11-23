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

function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

const SCENARIO_LABELS: Record<string, string> = {
  gateway_catalog: 'Gateway & Catalog Listing (TaskFuel / Facilitator Model)',
  agent_security: 'Agent & Wallet Security (Pre-Flight Guard & 10x SLA)',
  high_volume_fleet: 'High-Volume Fleet Access (Prepaid Key / Custom Quota)',
};

export function renderInquiryText(r: EnterpriseInquiryRecord): string {
  return [
    `Inquiry ID: ${r.inquiryId}`,
    `Received: ${r.createdAt}`,
    `Scenario: ${SCENARIO_LABELS[r.scenario] || r.scenario}`,
    '',
    `Name: ${r.fullName}`,
    `Email: ${r.workEmail}`,
    `Organization / Platform: ${r.organization}`,
    `Contact (Telegram/X): ${r.contactChannel || '-'}`,
    '',
    `Focus Areas / Interests: ${r.interests.length ? r.interests.join(', ') : '-'}`,
    `Volume / Fleet Size: ${r.expectedVolume || '-'}`,
    `Settlement Preference: ${r.settlementPreference || '-'}`,
    '',
    'Technical Notes:',
    r.notes || '-',
  ].join('\n');
}

export function renderInquiryHtml(r: EnterpriseInquiryRecord): string {
  const row = (k: string, v: string) =>
    `<tr><td style="padding:4px 14px 4px 0;color:#6b6a65;font-weight:500">${escapeHtml(k)}</td><td style="padding:4px 0;color:#1b1a17">${escapeHtml(v)}</td></tr>`;
  return `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#1b1a17;max-width:600px;line-height:1.5">
<div style="border-bottom:1px solid #e5e3dc;padding-bottom:10px;margin-bottom:14px">
  <span style="font-size:11px;font-family:monospace;color:#a93823;text-transform:uppercase;letter-spacing:0.08em">SovRoute Architecture & Partnerships</span>
  <h2 style="margin:4px 0 0;font-size:18px;color:#1b1a17">${escapeHtml(SCENARIO_LABELS[r.scenario] || r.scenario)}</h2>
</div>
<table style="width:100%;border-collapse:collapse">${[
    row('Inquiry ID', r.inquiryId),
    row('Received At', r.createdAt),
    row('Contact Name', r.fullName),
    row('Work Email', r.workEmail),
    row('Organization / URL', r.organization),
    row('Direct Channel', r.contactChannel || '-'),
    row('Focus / Subsystems', r.interests.length ? r.interests.join(', ') : '-'),
    row('Expected Volume', r.expectedVolume || '-'),
    row('Settlement', r.settlementPreference || '-'),
  ].join('')}</table>
<div style="margin-top:16px;padding-top:12px;border-top:1px solid #f0eee8">
  <p style="margin:0 0 6px;color:#6b6a65;font-size:12px;text-transform:uppercase;font-family:monospace">Integration Notes / Brief</p>
  <pre style="white-space:pre-wrap;font-family:inherit;margin:0;background:#faf9f6;padding:10px;border-radius:6px;border:1px solid #e5e3dc;font-size:13px">${escapeHtml(r.notes || '-')}</pre>
</div>
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
    const scenarioTag =
      record.scenario === 'gateway_catalog'
        ? 'GATEWAY/CATALOG'
        : record.scenario === 'agent_security'
        ? 'AGENT-SECURITY'
        : 'HIGH-VOLUME';
        
    await this.transporter.sendMail({
      from: `SovRoute Architecture Desk <${this.config.user}>`,
      to: this.config.to,
      replyTo: { name: singleLine(record.fullName), address: record.workEmail },
      subject: singleLine(
        `[${scenarioTag}] ${record.organization} — SovRoute Inquiry`,
      ),
      text: renderInquiryText(record),
      html: renderInquiryHtml(record),
    });
  }
}
