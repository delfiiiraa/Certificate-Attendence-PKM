import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  DEFAULT_FLAGSHIP_EVENT_ID,
  DEFAULT_TEMPLATE_FIELDS,
  SCHEMA_LIMITS,
  type CertificateAspectRatio,
  type CertificateRecord,
  type CertificateTemplateFields,
  type CertificateTemplateRecord,
  type EmailLogRecord,
  type EventRecord,
  type EventStatus,
  type ParticipationRole,
  type RegistrationRecord,
} from '../types';
import {
  buildVerifyUrl,
  computeVerificationHash,
  generateCheckInRef,
  generateClaimCode,
  generateRegistrationId,
  sanitizeId,
  sanitizePrefix,
  sanitizeString,
} from './crypto';

export async function createOrUpdateEvent(
  eventId: string,
  ownerId: string,
  input: {
    title: string;
    subtitle: string;
    organizer: string;
    eventDate: string;
    location: string;
    status: EventStatus;
    requirePhoto: boolean;
    requireGps: boolean;
    certificatePrefix: string;
    signatoryName: string;
    signatoryTitle: string;
    templateId: string;
    autoEmailOnCheckIn: boolean;
    autoDeliverOnComplete: boolean;
  },
  isNew: boolean
): Promise<string> {
  const safeId = sanitizeId(eventId);
  const path = `events/${safeId}`;
  const ref = doc(db, 'events', safeId);

  const sanitized = {
    title: sanitizeString(input.title, SCHEMA_LIMITS.TITLE_MAX),
    subtitle: sanitizeString(input.subtitle, SCHEMA_LIMITS.SUBTITLE_MAX),
    organizer: sanitizeString(input.organizer, SCHEMA_LIMITS.ORGANIZER_MAX),
    eventDate: sanitizeString(input.eventDate, SCHEMA_LIMITS.EVENT_DATE_MAX),
    location: sanitizeString(input.location, SCHEMA_LIMITS.LOCATION_MAX),
    status: input.status,
    requirePhoto: Boolean(input.requirePhoto),
    requireGps: Boolean(input.requireGps),
    certificatePrefix: sanitizePrefix(input.certificatePrefix),
    signatoryName: sanitizeString(input.signatoryName, SCHEMA_LIMITS.NAME_MAX),
    signatoryTitle: sanitizeString(input.signatoryTitle, SCHEMA_LIMITS.SIGNATORY_TITLE_MAX),
    templateId: input.templateId ? sanitizeId(input.templateId) : '',
    autoEmailOnCheckIn: Boolean(input.autoEmailOnCheckIn),
    autoDeliverOnComplete: Boolean(input.autoDeliverOnComplete),
  };

  try {
    if (isNew) {
      await setDoc(ref, {
        ...sanitized,
        ownerId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        ...sanitized,
        updatedAt: serverTimestamp(),
      });
    }
    return safeId;
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function deleteEventRecord(eventId: string): Promise<void> {
  const safeId = sanitizeId(eventId);
  const path = `events/${safeId}`;
  try {
    await deleteDoc(doc(db, 'events', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function submitLiveAttendanceCheckIn(params: {
  event: EventRecord;
  userId: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  institution: string;
  role: ParticipationRole;
  paperCode: string;
  paperTitle: string;
  photoCaptured: boolean;
  photoThumbnail: string;
  gpsLat: number;
  gpsLng: number;
  gpsVerified: boolean;
}): Promise<{
  registrationId: string;
  claimCode: string;
  checkInRef: string;
  verificationHash: string;
}> {
  const { event, userId } = params;
  const registrationId = generateRegistrationId();
  const claimCode = generateClaimCode(event.certificatePrefix);
  const checkInRef = generateCheckInRef();

  const fullName = sanitizeString(params.fullName, SCHEMA_LIMITS.NAME_MAX);
  const email = sanitizeString(params.email, SCHEMA_LIMITS.EMAIL_MAX).toLowerCase();
  const phoneNumber = sanitizeString(params.phoneNumber, SCHEMA_LIMITS.PHONE_MAX);
  const institution = sanitizeString(params.institution, SCHEMA_LIMITS.INSTITUTION_MAX);
  const paperCode = sanitizeString(params.paperCode, SCHEMA_LIMITS.PAPER_CODE_MAX);
  const paperTitle = sanitizeString(params.paperTitle, SCHEMA_LIMITS.PAPER_TITLE_MAX);
  const photoThumbnail =
    params.photoThumbnail.length <= SCHEMA_LIMITS.THUMBNAIL_MAX ? params.photoThumbnail : '';

  const verificationHash = await computeVerificationHash({
    claimCode,
    eventId: event.id,
    fullName,
    role: params.role,
  });

  const regRef = doc(db, 'events', event.id, 'registrations', registrationId);
  const certRef = doc(db, 'certificates', claimCode);
  const verifyUrl = buildVerifyUrl(claimCode);

  const batch = writeBatch(db);

  batch.set(regRef, {
    eventId: event.id,
    userId,
    fullName,
    email,
    phoneNumber,
    institution,
    role: params.role,
    paperCode,
    paperTitle,
    registrationStatus: 'checked_in',
    claimCode,
    checkInRef,
    photoCaptured: Boolean(params.photoCaptured),
    photoThumbnail,
    gpsLat: Number.isFinite(params.gpsLat) ? params.gpsLat : 0,
    gpsLng: Number.isFinite(params.gpsLng) ? params.gpsLng : 0,
    gpsVerified: Boolean(params.gpsVerified),
    confirmationEmailStatus: event.autoEmailOnCheckIn ? 'queued' : 'pending',
    certificateEmailStatus: 'pending',
    checkedInAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(certRef, {
    claimCode,
    eventId: event.id,
    registrationId,
    eventName: event.title,
    eventDate: event.eventDate,
    organizer: event.organizer,
    fullName,
    institution,
    role: params.role,
    paperCode,
    paperTitle,
    signatoryName: event.signatoryName,
    signatoryTitle: event.signatoryTitle,
    templateId: event.templateId || '',
    verificationHash,
    status: 'issued',
    ownerId: userId,
    issuedAt: serverTimestamp(),
  });

  if (event.autoEmailOnCheckIn) {
    const logRef = doc(db, 'events', event.id, 'emailLogs', `confirm_${registrationId}`);
    batch.set(logRef, {
      eventId: event.id,
      registrationId,
      userId,
      recipientName: fullName,
      recipientEmail: email,
      claimCode,
      emailType: 'checkin_confirmation',
      triggerFunction: 'onAttendanceCreated',
      subject: sanitizeString(
        `[Attendance Confirmed] ${event.title} — Claim Code ${claimCode}`,
        SCHEMA_LIMITS.SUBJECT_MAX
      ),
      certificateUrl: verifyUrl,
      status: 'queued',
      errorMessage: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
    return { registrationId, claimCode, checkInRef, verificationHash };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `events/${event.id}/registrations/${registrationId}`);
  }
}

export async function addPreRegisteredParticipant(params: {
  event: EventRecord;
  adminUid: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  institution: string;
  role: ParticipationRole;
  paperCode: string;
  paperTitle: string;
  markCheckedInNow?: boolean;
}): Promise<string> {
  const { event, adminUid, markCheckedInNow } = params;
  const registrationId = generateRegistrationId();
  const fullName = sanitizeString(params.fullName, SCHEMA_LIMITS.NAME_MAX);
  const email = sanitizeString(params.email, SCHEMA_LIMITS.EMAIL_MAX).toLowerCase();
  const phoneNumber = sanitizeString(params.phoneNumber, SCHEMA_LIMITS.PHONE_MAX);
  const institution = sanitizeString(params.institution, SCHEMA_LIMITS.INSTITUTION_MAX);
  const paperCode = sanitizeString(params.paperCode, SCHEMA_LIMITS.PAPER_CODE_MAX);
  const paperTitle = sanitizeString(params.paperTitle, SCHEMA_LIMITS.PAPER_TITLE_MAX);

  const claimCode = markCheckedInNow ? generateClaimCode(event.certificatePrefix) : '';
  const checkInRef = markCheckedInNow ? generateCheckInRef() : '';

  const batch = writeBatch(db);
  const regRef = doc(db, 'events', event.id, 'registrations', registrationId);

  batch.set(regRef, {
    eventId: event.id,
    userId: adminUid,
    fullName,
    email,
    phoneNumber,
    institution,
    role: params.role,
    paperCode,
    paperTitle,
    registrationStatus: markCheckedInNow ? 'checked_in' : 'registered',
    claimCode,
    checkInRef,
    photoCaptured: false,
    photoThumbnail: '',
    gpsLat: 0,
    gpsLng: 0,
    gpsVerified: false,
    confirmationEmailStatus: markCheckedInNow && event.autoEmailOnCheckIn ? 'queued' : 'pending',
    certificateEmailStatus: 'pending',
    ...(markCheckedInNow ? { checkedInAt: serverTimestamp() } : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (markCheckedInNow && claimCode) {
    const verificationHash = await computeVerificationHash({
      claimCode,
      eventId: event.id,
      fullName,
      role: params.role,
    });
    const certRef = doc(db, 'certificates', claimCode);
    batch.set(certRef, {
      claimCode,
      eventId: event.id,
      registrationId,
      eventName: event.title,
      eventDate: event.eventDate,
      organizer: event.organizer,
      fullName,
      institution,
      role: params.role,
      paperCode,
      paperTitle,
      signatoryName: event.signatoryName,
      signatoryTitle: event.signatoryTitle,
      templateId: event.templateId || '',
      verificationHash,
      status: 'issued',
      ownerId: adminUid,
      issuedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
    return registrationId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `events/${event.id}/registrations/${registrationId}`);
  }
}

export async function adminCheckInExistingParticipant(
  event: EventRecord,
  reg: RegistrationRecord
): Promise<string> {
  const claimCode = reg.claimCode || generateClaimCode(event.certificatePrefix);
  const checkInRef = reg.checkInRef || generateCheckInRef();
  const verificationHash = await computeVerificationHash({
    claimCode,
    eventId: event.id,
    fullName: reg.fullName,
    role: reg.role,
  });

  const batch = writeBatch(db);
  const regRef = doc(db, 'events', event.id, 'registrations', reg.id);
  const certRef = doc(db, 'certificates', claimCode);

  batch.update(regRef, {
    registrationStatus: 'checked_in',
    claimCode,
    checkInRef,
    confirmationEmailStatus: event.autoEmailOnCheckIn ? 'queued' : reg.confirmationEmailStatus,
    checkedInAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(certRef, {
    claimCode,
    eventId: event.id,
    registrationId: reg.id,
    eventName: event.title,
    eventDate: event.eventDate,
    organizer: event.organizer,
    fullName: reg.fullName,
    institution: reg.institution,
    role: reg.role,
    paperCode: reg.paperCode,
    paperTitle: reg.paperTitle,
    signatoryName: event.signatoryName,
    signatoryTitle: event.signatoryTitle,
    templateId: event.templateId || '',
    verificationHash,
    status: 'issued',
    ownerId: reg.userId,
    issuedAt: serverTimestamp(),
  });

  if (event.autoEmailOnCheckIn) {
    const logRef = doc(db, 'events', event.id, 'emailLogs', `confirm_${reg.id}`);
    batch.set(logRef, {
      eventId: event.id,
      registrationId: reg.id,
      userId: reg.userId,
      recipientName: reg.fullName,
      recipientEmail: reg.email,
      claimCode,
      emailType: 'checkin_confirmation',
      triggerFunction: 'onAttendanceCreated',
      subject: sanitizeString(
        `[Attendance Confirmed] ${event.title} — Claim Code ${claimCode}`,
        SCHEMA_LIMITS.SUBJECT_MAX
      ),
      certificateUrl: buildVerifyUrl(claimCode),
      status: 'queued',
      errorMessage: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
    return claimCode;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `events/${event.id}/registrations/${reg.id}`);
  }
}

/**
 * Transitions an event to "completed" (which triggers the `onEventCompleted` Firebase Cloud Function)
 * and atomically queues certificate delivery logs for all checked-in attendees so the organizer
 * has immediate visibility and auditability.
 */
export async function completeEventAndTriggerCertificateDelivery(
  event: EventRecord,
  registrations: RegistrationRecord[]
): Promise<{ queuedCount: number }> {
  const checkedIn = registrations.filter(
    (r) => r.registrationStatus === 'checked_in' && Boolean(r.claimCode)
  );

  const batch = writeBatch(db);
  const eventRef = doc(db, 'events', event.id);

  batch.update(eventRef, {
    status: 'completed',
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  let queuedCount = 0;
  if (event.autoDeliverOnComplete) {
    for (const reg of checkedIn) {
      if (reg.certificateEmailStatus === 'sent') continue;
      const regRef = doc(db, 'events', event.id, 'registrations', reg.id);
      const logRef = doc(db, 'events', event.id, 'emailLogs', `cert_${reg.id}`);
      const verifyUrl = buildVerifyUrl(reg.claimCode);

      batch.update(regRef, {
        certificateEmailStatus: 'queued',
        updatedAt: serverTimestamp(),
      });

      batch.set(logRef, {
        eventId: event.id,
        registrationId: reg.id,
        userId: reg.userId,
        recipientName: reg.fullName,
        recipientEmail: reg.email,
        claimCode: reg.claimCode,
        emailType: 'certificate_delivery',
        triggerFunction: 'onEventCompleted',
        subject: sanitizeString(
          `[Official E-Certificate] ${event.title} — ${reg.fullName}`,
          SCHEMA_LIMITS.SUBJECT_MAX
        ),
        certificateUrl: verifyUrl,
        status: 'queued',
        errorMessage: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      queuedCount++;
    }
  }

  try {
    await batch.commit();
    return { queuedCount };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `events/${event.id}`);
  }
}

export async function updateEmailLogDeliveryStatus(
  eventId: string,
  log: EmailLogRecord,
  status: 'queued' | 'sent' | 'failed',
  errorMessage = ''
): Promise<void> {
  const batch = writeBatch(db);
  const logRef = doc(db, 'events', eventId, 'emailLogs', log.id);
  const regRef = doc(db, 'events', eventId, 'registrations', log.registrationId);

  batch.update(logRef, {
    status,
    errorMessage: sanitizeString(errorMessage, 300),
    updatedAt: serverTimestamp(),
  });

  if (log.emailType === 'certificate_delivery') {
    batch.update(regRef, {
      certificateEmailStatus: status,
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.update(regRef, {
      confirmationEmailStatus: status,
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `events/${eventId}/emailLogs/${log.id}`);
  }
}

export async function saveCertificateTemplate(params: {
  templateId?: string;
  ownerId: string;
  name: string;
  description: string;
  imageDataUrl: string;
  aspectRatio: CertificateAspectRatio;
  fields: CertificateTemplateFields;
  isDefault: boolean;
}): Promise<string> {
  const isNew = !params.templateId;
  const safeId = params.templateId ? sanitizeId(params.templateId) : `tpl-${Date.now().toString(36)}`;
  const path = `templates/${safeId}`;
  const ref = doc(db, 'templates', safeId);

  const payload = {
    name: sanitizeString(params.name, SCHEMA_LIMITS.NAME_MAX),
    description: sanitizeString(params.description, SCHEMA_LIMITS.SUBTITLE_MAX),
    imageDataUrl: params.imageDataUrl,
    aspectRatio: params.aspectRatio,
    fields: params.fields,
    isDefault: Boolean(params.isDefault),
  };

  try {
    if (isNew) {
      await setDoc(ref, {
        ...payload,
        ownerId: params.ownerId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    }
    return safeId;
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function fetchCertificateByClaimCode(
  claimCode: string
): Promise<{
  certificate: CertificateRecord | null;
  template: CertificateTemplateRecord | null;
}> {
  const safeCode = sanitizeId(claimCode);
  const certPath = `certificates/${safeCode}`;
  try {
    const certSnap = await getDoc(doc(db, 'certificates', safeCode));
    if (!certSnap.exists()) {
      return { certificate: null, template: null };
    }
    const certificate = certSnap.data() as CertificateRecord;
    let template: CertificateTemplateRecord | null = null;
    if (certificate.templateId) {
      const tplSnap = await getDoc(doc(db, 'templates', certificate.templateId));
      if (tplSnap.exists()) {
        template = { id: tplSnap.id, ...(tplSnap.data() as Omit<CertificateTemplateRecord, 'id'>) };
      }
    }
    return { certificate, template };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, certPath);
  }
}

export async function fetchPublicEventById(eventId: string): Promise<EventRecord | null> {
  const safeId = sanitizeId(eventId);
  const path = `events/${safeId}`;
  try {
    const snap = await getDoc(doc(db, 'events', safeId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<EventRecord, 'id'>) };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function seedFlagshipSampleEvent(adminUid: string): Promise<string> {
  const eventId = DEFAULT_FLAGSHIP_EVENT_ID;
  const templateId = 'tpl-uin-default-archival';

  const existingEvent = await getDoc(doc(db, 'events', eventId));
  if (existingEvent.exists()) {
    return eventId;
  }

  const batch = writeBatch(db);

  batch.set(doc(db, 'templates', templateId), {
    name: 'UIN Jakarta Ceremonial Ivory (Default)',
    description:
      'Built-in archival emerald and antique gold guilloché frame. Replace or upload your own institutional template anytime in Template Studio.',
    imageDataUrl: '',
    aspectRatio: '4:3',
    fields: DEFAULT_TEMPLATE_FIELDS,
    isDefault: true,
    ownerId: adminUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'events', eventId), {
    title: 'International Conference on Islamic Studies & Digital Innovation 2026',
    subtitle: 'Official Academic Attendance & E-Certificate Portal — Syarif Hidayatullah Jakarta',
    organizer: 'UIN Syarif Hidayatullah Jakarta',
    eventDate: 'November 24–25, 2026',
    location: 'Auditorium Prof. Dr. Harun Nasution, Ciputat, Jakarta',
    status: 'active',
    requirePhoto: false,
    requireGps: true,
    certificatePrefix: 'UIN26',
    signatoryName: 'Prof. Asep Saepudin Jahar, M.A., Ph.D.',
    signatoryTitle: 'Rector, UIN Syarif Hidayatullah Jakarta',
    templateId,
    autoEmailOnCheckIn: true,
    autoDeliverOnComplete: true,
    ownerId: adminUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const sampleParticipants: Array<{
    id: string;
    fullName: string;
    email: string;
    phoneNumber: string;
    institution: string;
    role: ParticipationRole;
    paperCode: string;
    paperTitle: string;
    checkedIn: boolean;
    claimCode: string;
  }> = [
    {
      id: 'reg-sample-001',
      fullName: 'Dr. Siti Rahmawati, M.Ag.',
      email: 'siti.rahmawati@uinjkt.ac.id',
      phoneNumber: '+62 812-8890-1120',
      institution: 'Faculty of Ushuluddin, UIN Syarif Hidayatullah Jakarta',
      role: 'Presenter',
      paperCode: 'ICIS-104',
      paperTitle: 'Digital Manuscript Preservation and Cryptographic Provenance in Southeast Asia',
      checkedIn: true,
      claimCode: 'UIN26-7K4M-9P2Q',
    },
    {
      id: 'reg-sample-002',
      fullName: 'Ahmad Fauzan Hidayat, M.Kom.',
      email: 'ahmad.fauzan@uinjkt.ac.id',
      phoneNumber: '+62 813-4421-9087',
      institution: 'Faculty of Science and Technology, UIN Jakarta',
      role: 'Participant',
      paperCode: '',
      paperTitle: '',
      checkedIn: true,
      claimCode: 'UIN26-3R8N-5V6W',
    },
    {
      id: 'reg-sample-003',
      fullName: 'Nadia Kusuma Putri',
      email: 'nadia.kusuma@mahasiswa.uinjkt.ac.id',
      phoneNumber: '+62 857-1029-4412',
      institution: 'Graduate School (SPs), UIN Syarif Hidayatullah Jakarta',
      role: 'Committee',
      paperCode: '',
      paperTitle: '',
      checkedIn: false,
      claimCode: '',
    },
  ];

  for (const p of sampleParticipants) {
    const regRef = doc(db, 'events', eventId, 'registrations', p.id);
    batch.set(regRef, {
      eventId,
      userId: adminUid,
      fullName: p.fullName,
      email: p.email,
      phoneNumber: p.phoneNumber,
      institution: p.institution,
      role: p.role,
      paperCode: p.paperCode,
      paperTitle: p.paperTitle,
      registrationStatus: p.checkedIn ? 'checked_in' : 'registered',
      claimCode: p.claimCode,
      checkInRef: p.checkedIn ? `CHK-20261124-${p.id.slice(-3).toUpperCase()}` : '',
      photoCaptured: p.checkedIn,
      photoThumbnail: '',
      gpsLat: p.checkedIn ? -6.3063 : 0,
      gpsLng: p.checkedIn ? 106.7562 : 0,
      gpsVerified: p.checkedIn,
      confirmationEmailStatus: p.checkedIn ? 'sent' : 'pending',
      certificateEmailStatus: 'pending',
      ...(p.checkedIn ? { checkedInAt: serverTimestamp() } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (p.checkedIn && p.claimCode) {
      const hash = await computeVerificationHash({
        claimCode: p.claimCode,
        eventId,
        fullName: p.fullName,
        role: p.role,
      });
      batch.set(doc(db, 'certificates', p.claimCode), {
        claimCode: p.claimCode,
        eventId,
        registrationId: p.id,
        eventName: 'International Conference on Islamic Studies & Digital Innovation 2026',
        eventDate: 'November 24–25, 2026',
        organizer: 'UIN Syarif Hidayatullah Jakarta',
        fullName: p.fullName,
        institution: p.institution,
        role: p.role,
        paperCode: p.paperCode,
        paperTitle: p.paperTitle,
        signatoryName: 'Prof. Asep Saepudin Jahar, M.A., Ph.D.',
        signatoryTitle: 'Rector, UIN Syarif Hidayatullah Jakarta',
        templateId,
        verificationHash: hash,
        status: 'issued',
        ownerId: adminUid,
        issuedAt: serverTimestamp(),
      });

      batch.set(doc(db, 'events', eventId, 'emailLogs', `confirm_${p.id}`), {
        eventId,
        registrationId: p.id,
        userId: adminUid,
        recipientName: p.fullName,
        recipientEmail: p.email,
        claimCode: p.claimCode,
        emailType: 'checkin_confirmation',
        triggerFunction: 'onAttendanceCreated',
        subject: `[Attendance Confirmed] International Conference on Islamic Studies & Digital Innovation 2026 — Claim Code ${p.claimCode}`,
        certificateUrl: buildVerifyUrl(p.claimCode),
        status: 'sent',
        errorMessage: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }

  try {
    await batch.commit();
    return eventId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `events/${eventId}`);
  }
}

export async function fetchUserCertificates(userId: string): Promise<CertificateRecord[]> {
  const path = 'certificates';
  try {
    const q = query(collection(db, path), where('ownerId', '==', userId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as CertificateRecord);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}
