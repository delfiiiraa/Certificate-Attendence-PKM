/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { LogOut } from 'lucide-react';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  signInWithGoogle,
  signOutUser,
} from './firebase';
import {
  BOOTSTRAP_ADMIN_EMAIL,
  DEFAULT_FLAGSHIP_EVENT_ID,
  type CertificateTemplateRecord,
  type EmailLogRecord,
  type EventRecord,
  type RegistrationRecord,
} from './types';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AttendanceCheckInView } from './components/AttendanceCheckInView';
import { VerifyCertificateView } from './components/VerifyCertificateView';
import { AdminDashboardView, type AdminSubTab } from './components/AdminDashboardView';
import { CloudFunctionsView } from './components/CloudFunctionsView';
import { completeEventAndTriggerCertificateDelivery } from './lib/firestoreService';

type TopView = 'checkin' | 'verify' | 'admin' | 'functions';

function getInitialRouteFromUrl(): {
  view: TopView;
  eventId: string;
  claimCode: string;
} {
  if (typeof window === 'undefined') {
    return { view: 'checkin', eventId: DEFAULT_FLAGSHIP_EVENT_ID, claimCode: '' };
  }
  const params = new URLSearchParams(window.location.search);
  const verify = params.get('verify')?.trim() || '';
  const attendance = params.get('attendance')?.trim() || '';
  if (verify) {
    return { view: 'verify', eventId: attendance || DEFAULT_FLAGSHIP_EVENT_ID, claimCode: verify };
  }
  if (attendance) {
    return { view: 'checkin', eventId: attendance, claimCode: '' };
  }
  return { view: 'checkin', eventId: DEFAULT_FLAGSHIP_EVENT_ID, claimCode: '' };
}

function CertFlowApp() {
  const initial = getInitialRouteFromUrl();
  const [activeView, setActiveView] = useState<TopView>(initial.view);
  const [adminSubTab, setAdminSubTab] = useState<AdminSubTab>('events');
  const [selectedEventId, setSelectedEventId] = useState<string>(initial.eventId);
  const [verifyClaimCode, setVerifyClaimCode] = useState<string>(initial.claimCode);

  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Live Firestore state
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [templates, setTemplates] = useState<CertificateTemplateRecord[]>([]);
  const [registrations, setRegistrations] = useState<RegistrationRecord[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLogRecord[]>([]);
  const [authError, setAuthError] = useState('');

  // Track Firebase auth & admin role
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        setIsAdmin(false);
        setAuthReady(true);
        return;
      }

      if (nextUser.emailVerified && nextUser.email === BOOTSTRAP_ADMIN_EMAIL) {
        setIsAdmin(true);
        setAuthReady(true);
        return;
      }

      try {
        const adminDoc = await getDoc(doc(db, 'admins', nextUser.uid));
        setIsAdmin(Boolean(nextUser.emailVerified && adminDoc.exists()));
      } catch {
        setIsAdmin(false);
      } finally {
        setAuthReady(true);
      }
    });
    return () => unsubscribe();
  }, []);

  // Live Events listener (publicly readable active/completed events; admin reads all)
  useEffect(() => {
    if (!authReady) return;
    const eventsRef = collection(db, 'events');
    const q = isAdmin
      ? eventsRef
      : query(eventsRef, where('status', 'in', ['active', 'completed']));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map(
          (d) => ({ id: d.id, ...(d.data() as Omit<EventRecord, 'id'>) })
        );
        setEvents(list);
        if (list.length > 0 && !list.some((e) => e.id === selectedEventId)) {
          const flagship = list.find((e) => e.id === DEFAULT_FLAGSHIP_EVENT_ID);
          setSelectedEventId(flagship ? flagship.id : list[0].id);
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'events');
      }
    );
    return () => unsub();
  }, [authReady, isAdmin]);

  // Live Certificate Templates listener (admin reads all, others read default)
  useEffect(() => {
    if (!authReady || !user) {
      setTemplates([]);
      return;
    }
    const templatesRef = collection(db, 'templates');
    const q = isAdmin ? templatesRef : query(templatesRef, where('isDefault', '==', true));

    const unsub = onSnapshot(
      q,
      (snap) => {
        setTemplates(
          snap.docs.map(
            (d) => ({ id: d.id, ...(d.data() as Omit<CertificateTemplateRecord, 'id'>) })
          )
        );
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'templates');
      }
    );
    return () => unsub();
  }, [authReady, user, isAdmin]);

  // Live Registrations & Email Logs for the currently selected event (strictly authenticated + PII scoped)
  const activeEvent = events.find((e) => e.id === selectedEventId) || events[0] || null;

  useEffect(() => {
    if (!authReady || !user || !activeEvent) {
      setRegistrations([]);
      setEmailLogs([]);
      return;
    }

    const regPath = `events/${activeEvent.id}/registrations`;
    const regRef = collection(db, 'events', activeEvent.id, 'registrations');
    const regQuery = isAdmin ? regRef : query(regRef, where('userId', '==', user.uid));

    const unsubRegs = onSnapshot(
      regQuery,
      (snap) => {
        setRegistrations(
          snap.docs.map(
            (d) => ({ id: d.id, ...(d.data() as Omit<RegistrationRecord, 'id'>) })
          )
        );
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, regPath);
      }
    );

    const logPath = `events/${activeEvent.id}/emailLogs`;
    const logRef = collection(db, 'events', activeEvent.id, 'emailLogs');
    const logQuery = isAdmin ? logRef : query(logRef, where('userId', '==', user.uid));

    const unsubLogs = onSnapshot(
      logQuery,
      (snap) => {
        setEmailLogs(
          snap.docs.map(
            (d) => ({ id: d.id, ...(d.data() as Omit<EmailLogRecord, 'id'>) })
          )
        );
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, logPath);
      }
    );

    return () => {
      unsubRegs();
      unsubLogs();
    };
  }, [authReady, user, isAdmin, activeEvent?.id]);

  const handleSignIn = async () => {
    setAuthError('');
    try {
      await signInWithGoogle();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google Sign-In could not be completed.');
    }
  };

  const handleOpenCertificate = (claimCode: string) => {
    setVerifyClaimCode(claimCode);
    setActiveView('verify');
    window.history.replaceState(null, '', `/?verify=${encodeURIComponent(claimCode)}`);
  };

  const handleOpenCheckInPortal = (eventId: string) => {
    setSelectedEventId(eventId);
    setActiveView('checkin');
    window.history.replaceState(null, '', `/?attendance=${encodeURIComponent(eventId)}`);
  };

  const handleCompleteFromFunctionsTab = async () => {
    if (!activeEvent) return;
    await completeEventAndTriggerCertificateDelivery(activeEvent, registrations);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-element brand wordmark */}
          <button
            type="button"
            onClick={() => setActiveView('checkin')}
            className="text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            CertFlow
          </button>

          {/* Zone 2: 4 concise single-line nav links */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium"
          >
            {(
              [
                ['checkin', 'Check-In'],
                ['verify', 'Verify Certificate'],
                ['admin', 'Admin Console'],
                ['functions', 'Cloud Functions'],
              ] as const
            ).map(([id, label]) => {
              const active = activeView === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setActiveView(id);
                    if (id === 'admin') setAdminSubTab('events');
                  }}
                  className={`py-5 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'border-emerald-700 text-slate-900 font-semibold'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center gap-3 shrink-0">
            {user ? (
              <button
                type="button"
                onClick={() => void signOutUser()}
                title={`Signed in as ${user.email || 'User'}`}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <span className="max-w-[140px] truncate">{user.displayName || user.email}</span>
                <LogOut className="w-3.5 h-3.5 text-slate-500" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleSignIn()}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                Sign In
              </button>
            )}
          </div>
        </div>

        {/* Mobile navigation row */}
        <div className="md:hidden border-t border-slate-200 px-4 py-2 flex items-center gap-4 overflow-x-auto text-xs font-medium">
          {(
            [
              ['checkin', 'Check-In'],
              ['verify', 'Verify'],
              ['admin', 'Admin'],
              ['functions', 'Cloud Functions'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveView(id)}
              className={`py-1 whitespace-nowrap shrink-0 ${
                activeView === id ? 'text-emerald-800 font-semibold' : 'text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {authError && (
        <div className="max-w-6xl w-full mx-auto px-6 pt-4">
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
            {authError}
          </div>
        </div>
      )}

      {/* Main Content Viewport */}
      <main className="flex-1">
        {activeView === 'checkin' && (
          <AttendanceCheckInView
            user={user}
            events={events}
            selectedEventId={selectedEventId}
            onSelectEvent={setSelectedEventId}
            onSignIn={handleSignIn}
            onOpenCertificate={handleOpenCertificate}
          />
        )}

        {activeView === 'verify' && (
          <VerifyCertificateView
            user={user}
            initialClaimCode={verifyClaimCode}
            onClaimCodeChange={setVerifyClaimCode}
          />
        )}

        {activeView === 'admin' && (
          <AdminDashboardView
            user={user}
            isAdmin={isAdmin}
            events={events}
            selectedEventId={selectedEventId}
            onSelectEvent={setSelectedEventId}
            registrations={registrations}
            templates={templates}
            emailLogs={emailLogs}
            onSignIn={handleSignIn}
            onOpenCertificate={handleOpenCertificate}
            onOpenCheckInPortal={handleOpenCheckInPortal}
            initialSubTab={adminSubTab}
          />
        )}

        {activeView === 'functions' && (
          <div className="max-w-6xl mx-auto px-6 py-10">
            <CloudFunctionsView
              selectedEvent={activeEvent}
              emailLogs={emailLogs}
              isAdmin={isAdmin}
              onCompleteEvent={handleCompleteFromFunctionsTab}
            />
          </div>
        )}
      </main>

      {/* Clean Editorial Footer */}
      <footer className="border-t border-slate-200 bg-white mt-auto">
        <div className="max-w-[1400px] mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <span>CertFlow · Event Attendance, Cryptographic Certificates &amp; Automated Delivery</span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setActiveView('checkin')}
              className="hover:text-slate-900"
            >
              Attendance Portal
            </button>
            <button
              type="button"
              onClick={() => setActiveView('verify')}
              className="hover:text-slate-900"
            >
              Certificate Registry
            </button>
            <button
              type="button"
              onClick={() => {
                setAdminSubTab('templates');
                setActiveView('admin');
              }}
              className="hover:text-slate-900"
            >
              Template Studio
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <CertFlowApp />
    </ErrorBoundary>
  );
}
