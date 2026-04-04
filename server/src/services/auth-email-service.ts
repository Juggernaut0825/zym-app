import { AuthService } from './auth-service.js';
import { emailService } from './email-service.js';

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function resolveWebBaseUrl(): string {
  const explicit = String(
    process.env.APP_WEB_BASE_URL
    || process.env.WEB_APP_BASE_URL
    || '',
  ).trim();
  if (explicit) {
    return normalizeBaseUrl(explicit);
  }

  const firstAllowedOrigin = String(process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .find(Boolean);
  if (firstAllowedOrigin) {
    return normalizeBaseUrl(firstAllowedOrigin);
  }

  return process.env.NODE_ENV === 'production'
    ? 'https://app.zym8.com'
    : 'http://localhost:3000';
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildLink(pathname: string, params: Record<string, string>): string {
  const search = new URLSearchParams(params);
  return `${resolveWebBaseUrl()}${pathname}?${search.toString()}`;
}

export class AuthEmailService {
  async sendVerificationEmail(user: { id: number; username: string; email: string }): Promise<void> {
    const token = AuthService.createEmailActionToken(user.id, user.email, 'verify_email');
    const verifyUrl = buildLink('/verify-email', {
      token,
      email: user.email,
      redirect: 'app',
    });
    const safeName = escapeHtml(user.username || 'there');

    await emailService.send({
      to: user.email,
      subject: 'Verify your ZYM account',
      text: [
        `Hi ${user.username || 'there'},`,
        '',
        'Welcome to ZYM. Verify your email by opening this link:',
        verifyUrl,
        '',
        'This link expires in 24 hours.',
      ].join('\n'),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f1f1f">
          <p>Hi ${safeName},</p>
          <p>Welcome to ZYM. Please verify your email to activate your account.</p>
          <p><a href="${escapeHtml(verifyUrl)}">Verify your email</a></p>
          <p>This link expires in 24 hours.</p>
        </div>
      `,
    });
  }

  async sendPasswordResetEmail(user: { id: number; username: string; email: string }): Promise<void> {
    const token = AuthService.createEmailActionToken(user.id, user.email, 'reset_password');
    const resetUrl = buildLink('/reset-password', {
      token,
    });
    const safeName = escapeHtml(user.username || 'there');

    await emailService.send({
      to: user.email,
      subject: 'Reset your ZYM password',
      text: [
        `Hi ${user.username || 'there'},`,
        '',
        'We received a request to reset your password.',
        'Open this link to choose a new password:',
        resetUrl,
        '',
        'This link expires in 1 hour. If you did not request this, you can ignore this email.',
      ].join('\n'),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f1f1f">
          <p>Hi ${safeName},</p>
          <p>We received a request to reset your password.</p>
          <p><a href="${escapeHtml(resetUrl)}">Choose a new password</a></p>
          <p>This link expires in 1 hour. If you did not request this, you can ignore this email.</p>
        </div>
      `,
    });
  }
}

export const authEmailService = new AuthEmailService();
