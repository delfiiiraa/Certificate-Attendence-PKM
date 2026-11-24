import type { Timestamp } from 'firebase/firestore';

export type EventStatus = 'draft' | 'active' | 'completed';
export type ParticipationRole =
  | 'Participant'
  | 'Presenter'
  | 'Keynote Speaker'
  | 'Moderator'
  | 'Committee';
export type RegistrationStatus = 'registered' | 'checked_in' | 'cancelled';
export type EmailDeliveryStatus = 'pending' | 'queued' | 'sent' | 'failed';
export type CertificateAspectRatio = '4:3' | '16:9' | 'A4';
export type EmailType = 'checkin_confirmation' | 'certificate_delivery';
export type TriggerFunctionName =
  | 'onAttendanceCreated'
  | 'onEventCompleted'
  | 'triggerCertificateDispatch';

export const PARTICIPATION_ROLES: ParticipationRole[] = [
  'Participant',
  'Presenter',
  'Keynote Speaker',
  'Moderator',
  'Committee',
];

export const BOOTSTRAP_ADMIN_EMAIL = 'delfikarnain@gmail.com';
export const DEFAULT_FLAGSHIP_EVENT_ID = '0f3c5a9d-d122-451a-af7b-580919be7c19';

/**
 * Validation constants synchronized verbatim with firebase-blueprint.json & firestore.rules
 */
export const SCHEMA_LIMITS = {
  ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
  ID_MAX: 128,
  PREFIX_PATTERN: /^[A-Z0-9-]+$/,
  PREFIX_MIN: 2,
  PREFIX_MAX: 20,
  EMAIL_PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  TITLE_MIN: 3,
  TITLE_MAX: 160,
  SUBTITLE_MAX: 240,
  ORGANIZER_MIN: 2,
  ORGANIZER_MAX: 140,
  EVENT_DATE_MIN: 4,
  EVENT_DATE_MAX: 80,
  LOCATION_MIN: 2,
  LOCATION_MAX: 160,
  NAME_MIN: 2,
  NAME_MAX: 120,
  SIGNATORY_TITLE_MAX: 140,
  EMAIL_MAX: 160,
  PHONE_MAX: 32,
  INSTITUTION_MAX: 160,
  PAPER_CODE_MAX: 40,
  PAPER_TITLE_MAX: 240,
  CLAIM_CODE_MAX: 64,
  TEMPLATE_IMAGE_MAX: 700000,
  THUMBNAIL_MAX: 120000,
  SUBJECT_MAX: 200,
  CERT_URL_MAX: 400,
} as const;

export interface FieldLayoutConfig {
  enabled: boolean;
  x: number; // percentage 0..100
  y: number; // percentage 0..100
  fontSize: number; // px at 1600px canvas width
  color: string;
  fontFamily: 'serif' | 'sans' | 'mono';
  fontWeight: '400' | '600' | '700';
}

export interface CertificateTemplateFields {
  organizer: FieldLayoutConfig;
  heading: FieldLayoutConfig;
  fullName: FieldLayoutConfig;
  roleLine: FieldLayoutConfig;
  institution: FieldLayoutConfig;
  eventName: FieldLayoutConfig;
  paperTitle: FieldLayoutConfig;
  eventDate: FieldLayoutConfig;
  signatory: FieldLayoutConfig;
  claimCode: FieldLayoutConfig;
  qrCode: {
    enabled: boolean;
    x: number;
    y: number;
    size: number; // px at 1600px canvas width
  };
}

export const DEFAULT_TEMPLATE_FIELDS: CertificateTemplateFields = {
  organizer: {
    enabled: true,
    x: 50,
    y: 16,
    fontSize: 24,
    color: '#065f46',
    fontFamily: 'sans',
    fontWeight: '700',
  },
  heading: {
    enabled: true,
    x: 50,
    y: 24,
    fontSize: 54,
    color: '#0f172a',
    fontFamily: 'serif',
    fontWeight: '700',
  },
  fullName: {
    enabled: true,
    x: 50,
    y: 43,
    fontSize: 64,
    color: '#064e3b',
    fontFamily: 'serif',
    fontWeight: '700',
  },
  institution: {
    enabled: true,
    x: 50,
    y: 50,
    fontSize: 24,
    color: '#334155',
    fontFamily: 'sans',
    fontWeight: '400',
  },
  roleLine: {
    enabled: true,
    x: 50,
    y: 58,
    fontSize: 28,
    color: '#b45309',
    fontFamily: 'sans',
    fontWeight: '700',
  },
  eventName: {
    enabled: true,
    x: 50,
    y: 65,
    fontSize: 30,
    color: '#0f172a',
    fontFamily: 'sans',
    fontWeight: '600',
  },
  paperTitle: {
    enabled: true,
    x: 50,
    y: 71,
    fontSize: 20,
    color: '#475569',
    fontFamily: 'serif',
    fontWeight: '600',
  },
  eventDate: {
    enabled: true,
    x: 50,
    y: 77,
    fontSize: 20,
    color: '#475569',
    fontFamily: 'sans',
    fontWeight: '400',
  },
  signatory: {
    enabled: true,
    x: 34,
    y: 86,
    fontSize: 22,
    color: '#0f172a',
    fontFamily: 'sans',
    fontWeight: '700',
  },
  claimCode: {
    enabled: true,
    x: 72,
    y: 91,
    fontSize: 16,
    color: '#475569',
    fontFamily: 'mono',
    fontWeight: '600',
  },
  qrCode: {
    enabled: true,
    x: 72,
    y: 81,
    size: 132,
  },
};

export interface EventRecord {
  id: string;
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
  ownerId: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  completedAt?: Timestamp;
}

export interface CertificateTemplateRecord {
  id: string;
  name: string;
  description: string;
  imageDataUrl: string;
  aspectRatio: CertificateAspectRatio;
  fields: CertificateTemplateFields;
  isDefault: boolean;
  ownerId: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface RegistrationRecord {
  id: string;
  eventId: string;
  userId: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  institution: string;
  role: ParticipationRole;
  paperCode: string;
  paperTitle: string;
  registrationStatus: RegistrationStatus;
  claimCode: string;
  checkInRef: string;
  photoCaptured: boolean;
  photoThumbnail: string;
  gpsLat: number;
  gpsLng: number;
  gpsVerified: boolean;
  confirmationEmailStatus: EmailDeliveryStatus;
  certificateEmailStatus: EmailDeliveryStatus;
  checkedInAt?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface CertificateRecord {
  claimCode: string;
  eventId: string;
  registrationId: string;
  eventName: string;
  eventDate: string;
  organizer: string;
  fullName: string;
  institution: string;
  role: ParticipationRole;
  paperCode: string;
  paperTitle: string;
  signatoryName: string;
  signatoryTitle: string;
  templateId: string;
  verificationHash: string;
  status: 'issued' | 'revoked';
  ownerId: string;
  issuedAt?: Timestamp;
}

export interface EmailLogRecord {
  id: string;
  eventId: string;
  registrationId: string;
  userId: string;
  recipientName: string;
  recipientEmail: string;
  claimCode: string;
  emailType: EmailType;
  triggerFunction: TriggerFunctionName;
  subject: string;
  certificateUrl: string;
  status: 'queued' | 'sent' | 'failed';
  errorMessage: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
