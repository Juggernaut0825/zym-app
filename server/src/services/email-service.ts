import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import nodemailer, { type Transporter } from 'nodemailer';
import { resolveAppDataRoot } from '../config/app-paths.js';
import { logger } from '../utils/logger.js';

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

type EmailDeliveryMode = 'log' | 'smtp';

function resolveDeliveryMode(): EmailDeliveryMode {
  const configured = String(process.env.EMAIL_DELIVERY_MODE || '').trim().toLowerCase();
  if (configured === 'smtp') return 'smtp';
  if (configured === 'log') return 'log';
  return process.env.NODE_ENV === 'production' ? 'smtp' : 'log';
}

function resolveFromAddress(): string {
  return String(process.env.EMAIL_FROM || 'ZYM <no-reply@localhost>').trim() || 'ZYM <no-reply@localhost>';
}

function resolveSmtpPort(): number {
  const parsed = Number(process.env.SMTP_PORT || 587);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 587;
}

function resolveSmtpSecure(port: number): boolean {
  const configured = String(process.env.SMTP_SECURE || '').trim().toLowerCase();
  if (configured === 'true') return true;
  if (configured === 'false') return false;
  return port === 465;
}

async function writeDevEmail(input: SendEmailInput): Promise<void> {
  const outDir = path.join(resolveAppDataRoot(), 'dev-emails');
  await fs.mkdir(outDir, { recursive: true });

  const filePath = path.join(
    outDir,
    `${new Date().toISOString().replace(/[:.]/g, '-')}_${crypto.randomUUID()}.json`,
  );

  await fs.writeFile(filePath, JSON.stringify({
    from: resolveFromAddress(),
    ...input,
    createdAt: new Date().toISOString(),
  }, null, 2), 'utf8');

  logger.info(`[email] wrote dev email to ${filePath}`);
}

class EmailService {
  private transporter: Transporter | null = null;

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;

    const host = String(process.env.SMTP_HOST || '').trim();
    const user = String(process.env.SMTP_USER || '').trim();
    const pass = String(process.env.SMTP_PASS || '').trim();
    const port = resolveSmtpPort();

    if (!host || !user || !pass) {
      throw new Error('SMTP_HOST, SMTP_USER, and SMTP_PASS are required when EMAIL_DELIVERY_MODE=smtp.');
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: resolveSmtpSecure(port),
      auth: {
        user,
        pass,
      },
    });

    return this.transporter;
  }

  async send(input: SendEmailInput): Promise<void> {
    const to = String(input.to || '').trim().toLowerCase();
    if (!to) {
      throw new Error('Recipient email is required.');
    }

    const payload = {
      from: resolveFromAddress(),
      to,
      subject: String(input.subject || '').trim(),
      text: String(input.text || '').trim(),
      html: input.html,
    };

    if (resolveDeliveryMode() === 'log') {
      await writeDevEmail({
        to: payload.to,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
      });
      return;
    }

    await this.getTransporter().sendMail(payload);
    logger.info(`[email] sent message to ${payload.to} subject="${payload.subject}"`);
  }
}

export const emailService = new EmailService();
