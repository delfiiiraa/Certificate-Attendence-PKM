/**
 * Firestore Security Rules Specification Test Suite (Dirty Dozen Verification)
 * Run with Firebase Emulator Suite when testing locally:
 *   firebase emulators:exec "npx tsx firestore.rules.test.ts"
 */

export interface AdversarialTestCase {
  id: number;
  name: string;
  pillar: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: {
    uid: string;
    email: string;
    email_verified: boolean;
  } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: AdversarialTestCase[] = [
  {
    id: 1,
    name: 'Self-Admin Privilege Escalation',
    pillar: 'Tiered Identity Logic',
    operation: 'create',
    path: 'admins/attacker-uid',
    auth: { uid: 'attacker-uid', email: 'attacker@example.com', email_verified: true },
    payload: {
      uid: 'attacker-uid',
      email: 'attacker@example.com',
      displayName: 'Attacker',
      createdAt: 'SERVER_TIMESTAMP',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Email Admin Spoof',
    pillar: 'Email Spoofing Guard',
    operation: 'create',
    path: 'events/spoof-event',
    auth: { uid: 'spoof-uid', email: 'delfikarnain@gmail.com', email_verified: false },
    payload: {
      title: 'Spoofed Event',
      status: 'active',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Shadow Field Injection on Registration',
    pillar: 'Validation Blueprints (hasOnly)',
    operation: 'create',
    path: 'events/0f3c5a9d-d122-451a-af7b-580919be7c19/registrations/reg-shadow',
    auth: { uid: 'user-a', email: 'usera@uinjkt.ac.id', email_verified: true },
    payload: {
      eventId: '0f3c5a9d-d122-451a-af7b-580919be7c19',
      userId: 'user-a',
      fullName: 'Shadow Tester',
      email: 'usera@uinjkt.ac.id',
      isAdmin: true,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'PII Blanket Read by Non-Owner',
    pillar: 'PII Isolation',
    operation: 'get',
    path: 'events/0f3c5a9d-d122-451a-af7b-580919be7c19/registrations/victim-reg',
    auth: { uid: 'user-b', email: 'userb@uinjkt.ac.id', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Unfiltered PII Collection List Scrape',
    pillar: 'Secure List Queries',
    operation: 'list',
    path: 'events/0f3c5a9d-d122-451a-af7b-580919be7c19/registrations',
    auth: { uid: 'user-b', email: 'userb@uinjkt.ac.id', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Identity Spoofing via Foreign userId',
    pillar: 'Identity Integrity',
    operation: 'create',
    path: 'events/0f3c5a9d-d122-451a-af7b-580919be7c19/registrations/reg-spoof',
    auth: { uid: 'user-a', email: 'usera@uinjkt.ac.id', email_verified: true },
    payload: {
      eventId: '0f3c5a9d-d122-451a-af7b-580919be7c19',
      userId: 'victim-uid',
      fullName: 'Spoofed User',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Orphaned Registration Against Missing Event',
    pillar: 'Master Gate (exists)',
    operation: 'create',
    path: 'events/nonexistent-event-999/registrations/reg-orphan',
    auth: { uid: 'user-a', email: 'usera@uinjkt.ac.id', email_verified: true },
    payload: {
      eventId: 'nonexistent-event-999',
      userId: 'user-a',
      fullName: 'Orphan Entry',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Check-In Attempt on Completed Event',
    pillar: 'Terminal State Locking',
    operation: 'create',
    path: 'events/completed-event-1/registrations/reg-late',
    auth: { uid: 'user-a', email: 'usera@uinjkt.ac.id', email_verified: true },
    payload: {
      eventId: 'completed-event-1',
      userId: 'user-a',
      registrationStatus: 'checked_in',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Path Variable ID Poisoning',
    pillar: 'Path Variable Hardening',
    operation: 'get',
    path: `certificates/${'A'.repeat(200)}`,
    auth: null,
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Client Backdated Timestamp Forgery',
    pillar: 'Temporal Integrity',
    operation: 'create',
    path: 'events/0f3c5a9d-d122-451a-af7b-580919be7c19/registrations/reg-time',
    auth: { uid: 'user-a', email: 'usera@uinjkt.ac.id', email_verified: true },
    payload: {
      eventId: '0f3c5a9d-d122-451a-af7b-580919be7c19',
      userId: 'user-a',
      createdAt: '2020-01-01T00:00:00Z',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Value Poisoning with Invalid Type on Update',
    pillar: 'Anti-Update-Gap Validation',
    operation: 'update',
    path: 'events/0f3c5a9d-d122-451a-af7b-580919be7c19/registrations/reg-1',
    auth: { uid: 'user-a', email: 'usera@uinjkt.ac.id', email_verified: true },
    payload: {
      fullName: 123456,
      registrationStatus: 'checked_in',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Unauthenticated Certificate Collection Enumeration',
    pillar: 'Secure List Queries',
    operation: 'list',
    path: 'certificates',
    auth: null,
    expected: 'PERMISSION_DENIED',
  },
];
