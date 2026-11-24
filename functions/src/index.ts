import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import * as nodemailer from 'nodemailer';

const DATABASE_ID = 'ai-studio-66c029ca-9bd7-4fb1-8571-9606c861238f';
const BOOTSTRAP_ADMIN_EMAIL = 'delfikarnain@gmail.com';

const app = initializeApp();
const db = getFirestore(app, DATABASE_ID);

// Runtime configuration & Firebase Secrets (set via: firebase functions:secrets:set SMTP_PASS)
const smtpHost = defineString('SMTP_HOST', { default: 'smtp.gmail.com' });
const smtpPort = defineString('SMTP_PORT', { default: '587' });
const smtpUser = defineString('SMTP_USER');
const smtpFrom = defineString('SMTP_FROM', { default: 'CertFlow Official <noreply@uinjakarta.id>' });
const portalBaseUrl = defineString('PORTAL_BASE_URL', {
  default: 'https://ais-pre-4nt2qbdfzcnlcm7owjl7m5-1065828704075.asia-southeast1.run.app',
});
const smtpPass = defineSecret('SMTP_PASS');

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function createTransporter() {
  return nodemailer.createTransport({
    host: smtpHost.value(),
    port: Number(smtpPort.value()) || 587,
    secure: Number(smtpPort.value()) === 465,
    auth: {
      user: smtpUser.value(),
      pass: smtpPass.value(),
    },
  });
}

function buildCheckInConfirmationHtml(params: {
  fullName: string;
  eventName: string;
  eventDate: string;
  location: string;
  role: string;
  claimCode: string;
  checkInRef: string;
  verifyUrl: string;
}): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #0f172a; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #064e3b; color: #ffffff; padding: 24px 28px;">
        <p style="margin: 0; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85;">Official Attendance Confirmation</p>
        <h1 style="margin: 8px 0 0; font-size: 20px; font-weight: 700;">${escapeHtml(params.eventName)}</h1>
      </div>
      <div style="padding: 28px;">
        <p style="margin-top: 0;">Dear <strong>${escapeHtml(params.fullName)}</strong>,</p>
        <p style="line-height: 1.6; color: #334155;">Your attendance check-in has been verified and recorded as <strong>${escapeHtml(params.role)}</strong> for ${escapeHtml(params.eventName)} (${escapeHtml(params.eventDate)} · ${escapeHtml(params.location)}).</p>
        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 18px; margin: 20px 0; text-align: center;">
          <p style="margin: 0 0 6px; font-size: 12px; color: #64748b;">Certificate Claim Code</p>
          <p style="margin: 0; font-family: monospace; font-size: 22px; font-weight: 700; color: #047857; letter-spacing: 0.08em;">${escapeHtml(params.claimCode)}</p>
          <p style="margin: 8px 0 0; font-size: 12px; color: #64748b;">Reference: ${escapeHtml(params.checkInRef)}</p>
        </div>
        <p style="line-height: 1.6; color: #334155;">Once the event concludes, your official signed digital certificate will be delivered automatically. You may also verify or download your certificate anytime using the link below:</p>
        <p style="margin: 24px 0;">
          <a href="${escapeHtml(params.verifyUrl)}" style="display: inline-block; background-color: #047857; color: #ffffff; text-decoration: none; font-weight: 600; padding: 12px 22px; border-radius: 6px;">View &amp; Verify Certificate</a>
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #64748b; margin: 0;">Automated notification dispatched by CertFlow Firebase Cloud Functions.</p>
      </div>
    </div>
  `;
}

function buildCertificateDeliveryHtml(params: {
  fullName: string;
  eventName: string;
  eventDate: string;
  organizer: string;
  role: string;
  claimCode: string;
  verifyUrl: string;
}): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #0f172a; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #064e3b; color: #ffffff; padding: 24px 28px;">
        <p style="margin: 0; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85;">Official E-Certificate Ready</p>
        <h1 style="margin: 8px 0 0; font-size: 20px; font-weight: 700;">${escapeHtml(params.eventName)}</h1>
      </div>
      <div style="padding: 28px;">
        <p style="margin-top: 0;">Congratulations <strong>${escapeHtml(params.fullName)}</strong>,</p>
        <p style="line-height: 1.6; color: #334155;">Thank you for participating as <strong>${escapeHtml(params.role)}</strong> in <strong>${escapeHtml(params.eventName)}</strong> organized by ${escapeHtml(params.organizer)} on ${escapeHtml(params.eventDate)}. The event is now officially completed and your cryptographically verified certificate is ready for download.</p>
        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 18px; margin: 20px 0; text-align: center;">
          <p style="margin: 0 0 6px; font-size: 12px; color: #64748b;">Official Claim Code</p>
          <p style="margin: 0; font-family: monospace; font-size: 22px; font-weight: 700; color: #047857; letter-spacing: 0.08em;">${escapeHtml(params.claimCode)}</p>
        </div>
        <p style="margin: 24px 0;">
          <a href="${escapeHtml(params.verifyUrl)}" style="display: inline-block; background-color: #047857; color: #ffffff; text-decoration: none; font-weight: 600; padding: 12px 22px; border-radius: 6px;">Download Official Certificate (PDF / PNG)</a>
        </p>
        <p style="font-size: 13px; color: #475569;">Verification URL: <a href="${escapeHtml(params.verifyUrl)}" style="color: #047857;">${escapeHtml(params.verifyUrl)}</a></p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #64748b; margin: 0;">Dispatched automatically upon event completion via Firebase Cloud Functions.</p>
      </div>
    </div>
  `;
}

/**
 * 1. Firestore Trigger: Automated Check-In Confirmation Email
 * Fires whenever a new participant attendance record is created with status "checked_in".
 */
export const onAttendanceCreated = onDocumentCreated(
  {
    document: 'events/{eventId}/registrations/{registrationId}',
    database: DATABASE_ID,
    secrets: [smtpPass],
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const reg = snapshot.data();
    const { eventId, registrationId } = event.params;

    if (reg.registrationStatus !== 'checked_in' || !reg.email || !reg.claimCode) {
      return;
    }

    const eventSnap = await db.doc(`events/${eventId}`).get();
    if (!eventSnap.exists) return;
    const eventData = eventSnap.data()!;

    if (!eventData.autoEmailOnCheckIn) {
      logger.info(`autoEmailOnCheckIn disabled for event ${eventId}`);
      return;
    }

    const verifyUrl = `${portalBaseUrl.value()}/?verify=${encodeURIComponent(reg.claimCode)}`;
    const subject = `[Attendance Confirmed] ${eventData.title} — Claim Code ${reg.claimCode}`;
    const logRef = db.collection(`events/${eventId}/emailLogs`).doc(`confirm_${registrationId}`);

    try {
      const transporter = createTransporter();
      await transporter.sendMail({
        from: smtpFrom.value(),
        to: reg.email,
        subject,
        html: buildCheckInConfirmationHtml({
          fullName: reg.fullName,
          eventName: eventData.title,
          eventDate: eventData.eventDate,
          location: eventData.location,
          role: reg.role,
          claimCode: reg.claimCode,
          checkInRef: reg.checkInRef || registrationId,
          verifyUrl,
        }),
      });

      const batch = db.batch();
      batch.update(snapshot.ref, {
        confirmationEmailStatus: 'sent',
        updatedAt: FieldValue.serverTimestamp(),
      });
      batch.set(logRef, {
        eventId,
        registrationId,
        userId: reg.userId,
        recipientName: reg.fullName,
        recipientEmail: reg.email,
        claimCode: reg.claimCode,
        emailType: 'checkin_confirmation',
        triggerFunction: 'onAttendanceCreated',
        subject,
        certificateUrl: verifyUrl,
        status: 'sent',
        errorMessage: '',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await batch.commit();
      logger.info(`Confirmation email sent to ${reg.email} for event ${eventId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message.slice(0, 280) : 'SMTP delivery failed';
      logger.error(`Failed sending check-in confirmation to ${reg.email}:`, err);
      await snapshot.ref.update({
        confirmationEmailStatus: 'failed',
        updatedAt: FieldValue.serverTimestamp(),
      });
      await logRef.set({
        eventId,
        registrationId,
        userId: reg.userId,
        recipientName: reg.fullName,
        recipientEmail: reg.email,
        claimCode: reg.claimCode,
        emailType: 'checkin_confirmation',
        triggerFunction: 'onAttendanceCreated',
        subject,
        certificateUrl: verifyUrl,
        status: 'failed',
        errorMessage: message,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }
);

/**
 * 2. Firestore Trigger: Automated Certificate Delivery on Event Completion
 * Fires when an event's status transitions to "completed", dispatching official certificates
 * to all verified attendees in batches.
 */
export const onEventCompleted = onDocumentUpdated(
  {
    document: 'events/{eventId}',
    database: DATABASE_ID,
    secrets: [smtpPass],
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    // Only fire on transition into "completed"
    if (before.status === 'completed' || after.status !== 'completed') {
      return;
    }
    if (!after.autoDeliverOnComplete) {
      logger.info(`autoDeliverOnComplete disabled for event ${event.params.eventId}`);
      return;
    }

    const { eventId } = event.params;
    const attendeesSnap = await db
      .collection(`events/${eventId}/registrations`)
      .where('registrationStatus', '==', 'checked_in')
      .get();

    if (attendeesSnap.empty) {
      logger.info(`No checked-in attendees to notify for completed event ${eventId}`);
      return;
    }

    const transporter = createTransporter();

    for (const regDoc of attendeesSnap.docs) {
      const reg = regDoc.data();
      if (!reg.email || !reg.claimCode || reg.certificateEmailStatus === 'sent') {
        continue;
      }

      const verifyUrl = `${portalBaseUrl.value()}/?verify=${encodeURIComponent(reg.claimCode)}`;
      const subject = `[Official E-Certificate] ${after.title} — ${reg.fullName}`;
      const logRef = db.collection(`events/${eventId}/emailLogs`).doc(`cert_${regDoc.id}`);

      try {
        await transporter.sendMail({
          from: smtpFrom.value(),
          to: reg.email,
          subject,
          html: buildCertificateDeliveryHtml({
            fullName: reg.fullName,
            eventName: after.title,
            eventDate: after.eventDate,
            organizer: after.organizer,
            role: reg.role,
            claimCode: reg.claimCode,
            verifyUrl,
          }),
        });

        const batch = db.batch();
        batch.update(regDoc.ref, {
          certificateEmailStatus: 'sent',
          updatedAt: FieldValue.serverTimestamp(),
        });
        batch.set(logRef, {
          eventId,
          registrationId: regDoc.id,
          userId: reg.userId,
          recipientName: reg.fullName,
          recipientEmail: reg.email,
          claimCode: reg.claimCode,
          emailType: 'certificate_delivery',
          triggerFunction: 'onEventCompleted',
          subject,
          certificateUrl: verifyUrl,
          status: 'sent',
          errorMessage: '',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        await batch.commit();
      } catch (err) {
        const message = err instanceof Error ? err.message.slice(0, 280) : 'SMTP delivery failed';
        logger.error(`Certificate delivery failed for ${reg.email}:`, err);
        await regDoc.ref.update({
          certificateEmailStatus: 'failed',
          updatedAt: FieldValue.serverTimestamp(),
        });
        await logRef.set({
          eventId,
          registrationId: regDoc.id,
          userId: reg.userId,
          recipientName: reg.fullName,
          recipientEmail: reg.email,
          claimCode: reg.claimCode,
          emailType: 'certificate_delivery',
          triggerFunction: 'onEventCompleted',
          subject,
          certificateUrl: verifyUrl,
          status: 'failed',
          errorMessage: message,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }
  }
);

/**
 * 3. Callable Cloud Function: Manual Retry / Batch Certificate Dispatch
 * Allows verified admins to retry failed deliveries or trigger immediate dispatch for an event.
 */
export const triggerCertificateDispatch = onCall(
  {
    secrets: [smtpPass],
  },
  async (request) => {
    if (!request.auth || !request.auth.token.email_verified) {
      throw new HttpsError('unauthenticated', 'Verified administrator authentication is required.');
    }

    const callerEmail = request.auth.token.email;
    const isBootstrap = callerEmail === BOOTSTRAP_ADMIN_EMAIL;
    const adminDoc = await db.doc(`admins/${request.auth.uid}`).get();
    if (!isBootstrap && !adminDoc.exists) {
      throw new HttpsError('permission-denied', 'Administrator privileges are required.');
    }

    const eventId = typeof request.data?.eventId === 'string' ? request.data.eventId.trim() : '';
    if (!eventId || !/^[a-zA-Z0-9_-]{1,128}$/.test(eventId)) {
      throw new HttpsError('invalid-argument', 'A valid eventId is required.');
    }

    const eventSnap = await db.doc(`events/${eventId}`).get();
    if (!eventSnap.exists) {
      throw new HttpsError('not-found', 'Event not found.');
    }
    const eventData = eventSnap.data()!;

    const attendeesSnap = await db
      .collection(`events/${eventId}/registrations`)
      .where('registrationStatus', '==', 'checked_in')
      .get();

    const transporter = createTransporter();
    let sentCount = 0;
    let failedCount = 0;

    for (const regDoc of attendeesSnap.docs) {
      const reg = regDoc.data();
      if (!reg.email || !reg.claimCode || reg.certificateEmailStatus === 'sent') {
        continue;
      }

      const verifyUrl = `${portalBaseUrl.value()}/?verify=${encodeURIComponent(reg.claimCode)}`;
      const subject = `[Official E-Certificate] ${eventData.title} — ${reg.fullName}`;
      const logRef = db.collection(`events/${eventId}/emailLogs`).doc(`dispatch_${regDoc.id}_${Date.now()}`);

      try {
        await transporter.sendMail({
          from: smtpFrom.value(),
          to: reg.email,
          subject,
          html: buildCertificateDeliveryHtml({
            fullName: reg.fullName,
            eventName: eventData.title,
            eventDate: eventData.eventDate,
            organizer: eventData.organizer,
            role: reg.role,
            claimCode: reg.claimCode,
            verifyUrl,
          }),
        });

        await regDoc.ref.update({
          certificateEmailStatus: 'sent',
          updatedAt: FieldValue.serverTimestamp(),
        });
        await logRef.set({
          eventId,
          registrationId: regDoc.id,
          userId: reg.userId,
          recipientName: reg.fullName,
          recipientEmail: reg.email,
          claimCode: reg.claimCode,
          emailType: 'certificate_delivery',
          triggerFunction: 'triggerCertificateDispatch',
          subject,
          certificateUrl: verifyUrl,
          status: 'sent',
          errorMessage: '',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        sentCount++;
      } catch (err) {
        const message = err instanceof Error ? err.message.slice(0, 280) : 'SMTP delivery failed';
        await regDoc.ref.update({
          certificateEmailStatus: 'failed',
          updatedAt: FieldValue.serverTimestamp(),
        });
        await logRef.set({
          eventId,
          registrationId: regDoc.id,
          userId: reg.userId,
          recipientName: reg.fullName,
          recipientEmail: reg.email,
          claimCode: reg.claimCode,
          emailType: 'certificate_delivery',
          triggerFunction: 'triggerCertificateDispatch',
          subject,
          certificateUrl: verifyUrl,
          status: 'failed',
          errorMessage: message,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        failedCount++;
      }
    }

    return { eventId, sentCount, failedCount };
  }
);
