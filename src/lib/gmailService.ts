import { jsPDF } from 'jspdf';
import type {
  CertificateTemplateRecord,
  EventRecord,
  RegistrationRecord,
} from '../types';
import { buildVerifyUrl, computeVerificationHash } from './crypto';
import { renderCertificateToCanvas } from './certificateRenderer';

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function toBase64Url(str: string): string {
  return utf8ToBase64(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeMimeHeader(value: string): string {
  const safe = value.replace(/[\r\n]+/g, ' ').trim();
  return `=?UTF-8?B?${utf8ToBase64(safe)}?=`;
}

function sanitizeHeaderEmail(email: string): string {
  return email.replace(/[\r\n<>]/g, '').trim();
}

export function buildCertificateEmailHtml(params: {
  fullName: string;
  eventName: string;
  eventDate: string;
  organizer: string;
  role: string;
  claimCode: string;
  verifyUrl: string;
  senderEmail: string;
  emailType: 'checkin_confirmation' | 'certificate_delivery';
  hasPdfAttachment: boolean;
}): string {
  const isDelivery = params.emailType === 'certificate_delivery';
  const heading = isDelivery ? 'Official E-Certificate Ready' : 'Official Attendance Confirmed';
  const intro = isDelivery
    ? `Thank you for participating as <strong>${escapeHtml(params.role)}</strong> in <strong>${escapeHtml(
        params.eventName
      )}</strong> (${escapeHtml(params.eventDate)}). Your official cryptographically verified certificate is ${
        params.hasPdfAttachment ? 'attached as a PDF to this email and' : ''
      } ready for online verification.`
    : `Your attendance check-in as <strong>${escapeHtml(params.role)}</strong> for <strong>${escapeHtml(
        params.eventName
      )}</strong> (${escapeHtml(params.eventDate)}) has been verified and recorded.`;

  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
      <div style="background-color:#064e3b;color:#ffffff;padding:24px 28px;">
        <p style="margin:0;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#a7f3d0;">${heading}</p>
        <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;line-height:1.3;">${escapeHtml(params.eventName)}</h1>
        <p style="margin:6px 0 0;font-size:13px;color:#d1fae5;">${escapeHtml(params.organizer)}</p>
      </div>
      <div style="padding:28px;">
        <p style="margin-top:0;font-size:15px;">Dear <strong>${escapeHtml(params.fullName)}</strong>,</p>
        <p style="line-height:1.6;font-size:14px;color:#334155;">${intro}</p>
        <div style="background-color:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:18px;margin:22px 0;text-align:center;">
          <p style="margin:0 0 6px;font-size:12px;color:#64748b;">Official Certificate Claim Code</p>
          <p style="margin:0;font-family:monospace;font-size:22px;font-weight:700;color:#047857;letter-spacing:0.08em;">${escapeHtml(params.claimCode)}</p>
        </div>
        <p style="margin:24px 0;">
          <a href="${escapeHtml(params.verifyUrl)}" style="display:inline-block;background-color:#047857;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:6px;">View &amp; Verify Official Certificate</a>
        </p>
        <p style="font-size:12px;color:#475569;word-break:break-all;">
          Verification URL: <a href="${escapeHtml(params.verifyUrl)}" style="color:#047857;">${escapeHtml(params.verifyUrl)}</a>
        </p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p style="font-size:12px;color:#64748b;margin:0;">
          Sent directly from ${escapeHtml(params.senderEmail)} via CertFlow Digital Certificate Platform.
        </p>
      </div>
    </div>
  </body>
</html>`;
}

async function generateCertificatePdfBase64(
  event: EventRecord,
  registration: RegistrationRecord,
  template?: CertificateTemplateRecord | null
): Promise<string> {
  const canvas = document.createElement('canvas');
  const verificationHash = await computeVerificationHash({
    claimCode: registration.claimCode,
    eventId: event.id,
    fullName: registration.fullName,
    role: registration.role,
  });

  await renderCertificateToCanvas(
    canvas,
    {
      claimCode: registration.claimCode,
      eventName: event.title,
      eventDate: event.eventDate,
      organizer: event.organizer,
      fullName: registration.fullName,
      institution: registration.institution,
      role: registration.role,
      paperCode: registration.paperCode,
      paperTitle: registration.paperTitle,
      signatoryName: event.signatoryName,
      signatoryTitle: event.signatoryTitle,
      verificationHash,
    },
    template
  );

  const imgData = canvas.toDataURL('image/jpeg', 0.88);
  const orientation = canvas.width >= canvas.height ? 'landscape' : 'portrait';
  const pdf = new jsPDF({
    orientation,
    unit: 'px',
    format: [canvas.width, canvas.height],
  });
  pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
  const dataUri = pdf.output('datauristring');
  const base64Index = dataUri.indexOf('base64,');
  return base64Index >= 0 ? dataUri.slice(base64Index + 7) : '';
}

function wrapBase64Lines(base64: string): string {
  return base64.replace(/.{1,76}/g, '$&\r\n').trimEnd();
}

export async function sendCertificateEmailViaGmail(params: {
  accessToken: string;
  senderEmail: string;
  event: EventRecord;
  registration: RegistrationRecord;
  template?: CertificateTemplateRecord | null;
  emailType: 'checkin_confirmation' | 'certificate_delivery';
  attachPdf?: boolean;
}): Promise<{ gmailMessageId: string; subject: string; verifyUrl: string }> {
  const { accessToken, senderEmail, event, registration, template, emailType } = params;
  const attachPdf = params.attachPdf ?? emailType === 'certificate_delivery';
  const verifyUrl = buildVerifyUrl(registration.claimCode);

  const subject =
    emailType === 'certificate_delivery'
      ? `[Official E-Certificate] ${event.title} — ${registration.fullName}`
      : `[Attendance Confirmed] ${event.title} — Claim Code ${registration.claimCode}`;

  let pdfBase64 = '';
  if (attachPdf && registration.claimCode) {
    try {
      pdfBase64 = await generateCertificatePdfBase64(event, registration, template);
    } catch (err) {
      console.warn('PDF attachment generation fell back to HTML link:', err);
    }
  }

  const htmlBody = buildCertificateEmailHtml({
    fullName: registration.fullName,
    eventName: event.title,
    eventDate: event.eventDate,
    organizer: event.organizer,
    role: registration.role,
    claimCode: registration.claimCode,
    verifyUrl,
    senderEmail,
    emailType,
    hasPdfAttachment: Boolean(pdfBase64),
  });

  const cleanFrom = sanitizeHeaderEmail(senderEmail);
  const cleanTo = sanitizeHeaderEmail(registration.email);
  const boundary = `certflow_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  let mimeMessage = '';
  if (pdfBase64) {
    const filename = `Certificate-${registration.claimCode.replace(/[^a-zA-Z0-9_-]/g, '')}.pdf`;
    mimeMessage = [
      `From: CertFlow Official <${cleanFrom}>`,
      `To: ${cleanTo}`,
      `Subject: ${encodeMimeHeader(subject)}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      wrapBase64Lines(utf8ToBase64(htmlBody)),
      '',
      `--${boundary}`,
      `Content-Type: application/pdf; name="${filename}"`,
      `Content-Disposition: attachment; filename="${filename}"`,
      'Content-Transfer-Encoding: base64',
      '',
      wrapBase64Lines(pdfBase64),
      '',
      `--${boundary}--`,
    ].join('\r\n');
  } else {
    mimeMessage = [
      `From: CertFlow Official <${cleanFrom}>`,
      `To: ${cleanTo}`,
      `Subject: ${encodeMimeHeader(subject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      wrapBase64Lines(utf8ToBase64(htmlBody)),
    ].join('\r\n');
  }

  const raw = toBase64Url(mimeMessage);

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  if (!response.ok) {
    let errorDetail = `Gmail API error (${response.status})`;
    try {
      const errJson = await response.json();
      if (errJson?.error?.message) {
        errorDetail = errJson.error.message;
      }
    } catch {
      // Ignore JSON parse errors
    }
    throw new Error(errorDetail);
  }

  const data = (await response.json()) as { id?: string };
  return {
    gmailMessageId: data.id || 'sent',
    subject,
    verifyUrl,
  };
}
