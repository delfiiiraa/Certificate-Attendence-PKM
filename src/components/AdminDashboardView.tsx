import React, { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import QRCode from 'qrcode';
import {
  Award,
  CalendarDays,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Mail,
  Palette,
  Plus,
  QrCode,
  Search,
  Send,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  PARTICIPATION_ROLES,
  SCHEMA_LIMITS,
  type CertificateTemplateRecord,
  type EmailLogRecord,
  type EventRecord,
  type EventStatus,
  type ParticipationRole,
  type RegistrationRecord,
} from '../types';
import { buildAttendanceUrl } from '../lib/crypto';
import {
  addPreRegisteredParticipant,
  adminCheckInExistingParticipant,
  completeEventAndTriggerCertificateDelivery,
  createOrUpdateEvent,
  seedFlagshipSampleEvent,
} from '../lib/firestoreService';
import { TemplateStudioView } from './TemplateStudioView';
import { CloudFunctionsView } from './CloudFunctionsView';

interface AdminDashboardViewProps {
  user: User | null;
  isAdmin: boolean;
  events: EventRecord[];
  selectedEventId: string;
  onSelectEvent: (eventId: string) => void;
  registrations: RegistrationRecord[];
  templates: CertificateTemplateRecord[];
  emailLogs: EmailLogRecord[];
  onSignIn: () => Promise<void>;
  onOpenCertificate: (claimCode: string) => void;
  onOpenCheckInPortal: (eventId: string) => void;
  initialSubTab?: AdminSubTab;
}

export type AdminSubTab = 'events' | 'roster' | 'templates' | 'functions';

export function AdminDashboardView({
  user,
  isAdmin,
  events,
  selectedEventId,
  onSelectEvent,
  registrations,
  templates,
  emailLogs,
  onSignIn,
  onOpenCertificate,
  onOpenCheckInPortal,
  initialSubTab = 'events',
}: AdminDashboardViewProps) {
  const [subTab, setSubTab] = useState<AdminSubTab>(initialSubTab);
  const [seeding, setSeeding] = useState(false);
  const [actionBanner, setActionBanner] = useState('');
  const [actionError, setActionError] = useState('');

  // QR poster state for selected event
  const [eventQrUrl, setEventQrUrl] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Roster filters
  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterFilter, setRosterFilter] = useState<'all' | 'checked_in' | 'registered'>('all');

  // Modals
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventRecord | null>(null);
  const [showAddParticipant, setShowAddParticipant] = useState(false);

  // Event form state
  const [evSlug, setEvSlug] = useState('');
  const [evTitle, setEvTitle] = useState('');
  const [evSubtitle, setEvSubtitle] = useState('');
  const [evOrganizer, setEvOrganizer] = useState('UIN Syarif Hidayatullah Jakarta');
  const [evDate, setEvDate] = useState('');
  const [evLocation, setEvLocation] = useState('');
  const [evStatus, setEvStatus] = useState<EventStatus>('active');
  const [evPrefix, setEvPrefix] = useState('UIN26');
  const [evSignatoryName, setEvSignatoryName] = useState('');
  const [evSignatoryTitle, setEvSignatoryTitle] = useState('');
  const [evTemplateId, setEvTemplateId] = useState('');
  const [evRequirePhoto, setEvRequirePhoto] = useState(false);
  const [evRequireGps, setEvRequireGps] = useState(true);
  const [evAutoEmail, setEvAutoEmail] = useState(true);
  const [evAutoComplete, setEvAutoComplete] = useState(true);
  const [savingEvent, setSavingEvent] = useState(false);

  // Add Participant form state
  const [pName, setPName] = useState('');
  const [pEmail, setPEmail] = useState('');
  const [pPhone, setPPhone] = useState('');
  const [pInst, setPInst] = useState('');
  const [pRole, setPRole] = useState<ParticipationRole>('Participant');
  const [pPaperCode, setPPaperCode] = useState('');
  const [pPaperTitle, setPPaperTitle] = useState('');
  const [pCheckInNow, setPCheckInNow] = useState(false);
  const [savingParticipant, setSavingParticipant] = useState(false);

  const [checkingInId, setCheckingInId] = useState('');
  const [completingEvent, setCompletingEvent] = useState(false);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  const selectedEvent = events.find((e) => e.id === selectedEventId) || events[0] || null;

  useEffect(() => {
    if (!selectedEvent) {
      setEventQrUrl('');
      return;
    }
    const url = buildAttendanceUrl(selectedEvent.id);
    QRCode.toDataURL(url, { width: 220, margin: 1 })
      .then(setEventQrUrl)
      .catch(() => setEventQrUrl(''));
  }, [selectedEvent]);

  if (!user) {
    return (
      <div className="max-w-xl mx-auto px-6 py-16">
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-5">
          <Users className="w-10 h-10 text-emerald-700 mx-auto" />
          <div className="space-y-1.5">
            <h1 className="text-xl font-bold text-slate-900">Organizer Admin Console</h1>
            <p className="text-sm text-slate-600">
              Sign in with your authorized organizer Google account to manage events, participant
              rosters, custom certificate templates, and automated email triggers.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onSignIn()}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors"
          >
            Sign In with Google
          </button>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-xl mx-auto px-6 py-16">
        <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-4">
          <h1 className="text-xl font-bold text-slate-900">Administrator Access Required</h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Signed in as <span className="font-mono text-slate-900">{user.email}</span>. This
            account has participant access only. You can submit event attendance check-ins and
            verify/download your own certificates from the Check-In and Verify tabs.
          </p>
        </div>
      </div>
    );
  }

  const openCreateEventModal = () => {
    setEditingEvent(null);
    setEvSlug(`evt-${Date.now().toString(36)}`);
    setEvTitle('');
    setEvSubtitle('');
    setEvOrganizer('UIN Syarif Hidayatullah Jakarta');
    setEvDate('December 12, 2026');
    setEvLocation('Auditorium Harun Nasution, Ciputat');
    setEvStatus('active');
    setEvPrefix('UIN26');
    setEvSignatoryName('Prof. Asep Saepudin Jahar, M.A., Ph.D.');
    setEvSignatoryTitle('Rector, UIN Syarif Hidayatullah Jakarta');
    setEvTemplateId(templates.find((t) => t.isDefault)?.id || templates[0]?.id || '');
    setEvRequirePhoto(false);
    setEvRequireGps(true);
    setEvAutoEmail(true);
    setEvAutoComplete(true);
    setShowEventModal(true);
  };

  const openEditEventModal = (ev: EventRecord) => {
    setEditingEvent(ev);
    setEvSlug(ev.id);
    setEvTitle(ev.title);
    setEvSubtitle(ev.subtitle);
    setEvOrganizer(ev.organizer);
    setEvDate(ev.eventDate);
    setEvLocation(ev.location);
    setEvStatus(ev.status);
    setEvPrefix(ev.certificatePrefix);
    setEvSignatoryName(ev.signatoryName);
    setEvSignatoryTitle(ev.signatoryTitle);
    setEvTemplateId(ev.templateId);
    setEvRequirePhoto(ev.requirePhoto);
    setEvRequireGps(ev.requireGps);
    setEvAutoEmail(ev.autoEmailOnCheckIn);
    setEvAutoComplete(ev.autoDeliverOnComplete);
    setShowEventModal(true);
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError('');
    setSavingEvent(true);
    try {
      const savedId = await createOrUpdateEvent(
        editingEvent ? editingEvent.id : evSlug,
        user.uid,
        {
          title: evTitle,
          subtitle: evSubtitle,
          organizer: evOrganizer,
          eventDate: evDate,
          location: evLocation,
          status: evStatus,
          requirePhoto: evRequirePhoto,
          requireGps: evRequireGps,
          certificatePrefix: evPrefix,
          signatoryName: evSignatoryName,
          signatoryTitle: evSignatoryTitle,
          templateId: evTemplateId,
          autoEmailOnCheckIn: evAutoEmail,
          autoDeliverOnComplete: evAutoComplete,
        },
        !editingEvent
      );
      onSelectEvent(savedId);
      setShowEventModal(false);
      setActionBanner(editingEvent ? 'Event configuration updated.' : 'New event created and live.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to save event.');
    } finally {
      setSavingEvent(false);
    }
  };

  const handleAddParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent) return;
    setActionError('');
    setSavingParticipant(true);
    try {
      await addPreRegisteredParticipant({
        event: selectedEvent,
        adminUid: user.uid,
        fullName: pName,
        email: pEmail,
        phoneNumber: pPhone,
        institution: pInst,
        role: pRole,
        paperCode: pRole === 'Presenter' ? pPaperCode : '',
        paperTitle: pRole === 'Presenter' ? pPaperTitle : '',
        markCheckedInNow: pCheckInNow,
      });
      setPName('');
      setPEmail('');
      setPPhone('');
      setPInst('');
      setPPaperCode('');
      setPPaperTitle('');
      setPCheckInNow(false);
      setShowAddParticipant(false);
      setActionBanner('Participant added to event database.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to add participant.');
    } finally {
      setSavingParticipant(false);
    }
  };

  const handleSeedSample = async () => {
    setSeeding(true);
    setActionError('');
    try {
      const id = await seedFlagshipSampleEvent(user.uid);
      onSelectEvent(id);
      setActionBanner(
        'Initialized flagship UIN Jakarta Conference (ID 0f3c5a9d-d122-451a-af7b-580919be7c19) with sample attendees and certificates.'
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to seed sample event.');
    } finally {
      setSeeding(false);
    }
  };

  const handleCompleteEvent = async () => {
    if (!selectedEvent) return;
    setCompletingEvent(true);
    setActionError('');
    try {
      const { queuedCount } = await completeEventAndTriggerCertificateDelivery(
        selectedEvent,
        registrations
      );
      setActionBanner(
        `Event marked Completed. Triggered onEventCompleted workflow and queued ${queuedCount} automated certificate delivery email(s).`
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to complete event.');
    } finally {
      setCompletingEvent(false);
    }
  };

  const handleExportCsv = () => {
    if (!selectedEvent || registrations.length === 0) return;
    const headers = [
      'Full Name',
      'Email',
      'Phone',
      'Institution',
      'Role',
      'Paper Code',
      'Paper Title',
      'Status',
      'Claim Code',
      'GPS Verified',
      'Confirmation Email',
      'Certificate Email',
    ];
    const rows = registrations.map((r) =>
      [
        r.fullName,
        r.email,
        r.phoneNumber,
        r.institution,
        r.role,
        r.paperCode,
        r.paperTitle,
        r.registrationStatus,
        r.claimCode,
        r.gpsVerified ? `${r.gpsLat},${r.gpsLng}` : 'No',
        r.confirmationEmailStatus,
        r.certificateEmailStatus,
      ]
        .map((cell) => `"${String(cell || '').replace(/"/g, '""')}"`)
        .join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-${selectedEvent.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const checkedInCount = registrations.filter((r) => r.registrationStatus === 'checked_in').length;
  const deliveredCount = registrations.filter((r) => r.certificateEmailStatus === 'sent').length;
  const queuedCertCount = registrations.filter((r) => r.certificateEmailStatus === 'queued').length;

  const filteredRoster = registrations.filter((r) => {
    const matchesStatus = rosterFilter === 'all' ? true : r.registrationStatus === rosterFilter;
    const q = rosterSearch.trim().toLowerCase();
    const matchesQuery =
      !q ||
      r.fullName.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.institution.toLowerCase().includes(q) ||
      r.claimCode.toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });

  const navItems: Array<{ id: AdminSubTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'events', label: 'Events & Check-In QR', icon: CalendarDays },
    { id: 'roster', label: 'Participants & Attendance', icon: Users },
    { id: 'templates', label: 'Template Studio', icon: Palette },
    { id: 'functions', label: 'Cloud Functions & Email', icon: Mail },
  ];

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Workspace Sidebar (240px–280px equivalent on desktop) */}
        <aside className="lg:col-span-3 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
            <div className="space-y-1.5 px-1">
              <label
                htmlFor="admin-event-select"
                className="block text-xs font-semibold text-slate-500"
              >
                Active Event Workspace
              </label>
              {events.length > 0 ? (
                <select
                  id="admin-event-select"
                  value={selectedEvent?.id || ''}
                  onChange={(e) => onSelectEvent(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-slate-500 py-1">No events created yet.</p>
              )}
            </div>

            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = subTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSubTab(item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-emerald-50 text-emerald-900 font-semibold'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-emerald-700' : 'text-slate-400'}`} />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={openCreateEventModal}
                className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Create New Event
              </button>
            </div>
          </div>

          {selectedEvent && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
              <div className="flex items-center justify-between text-slate-500">
                <span>Total Registered</span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {registrations.length}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-500">
                <span>Verified Attendance</span>
                <span className="font-mono font-semibold text-emerald-800 tabular-nums">
                  {checkedInCount}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-500">
                <span>Cert Emails Queued / Sent</span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {queuedCertCount} / {deliveredCount}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-500 pt-2 border-t border-slate-200">
                <span>Event Lifecycle</span>
                <span className="font-semibold capitalize text-slate-900">
                  {selectedEvent.status}
                </span>
              </div>
            </div>
          )}
        </aside>

        {/* Main Workspace Panel */}
        <section className="lg:col-span-9 space-y-6">
          {actionBanner && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-4 text-xs font-medium text-emerald-900">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700" />
                <span>{actionBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setActionBanner('')}
                className="text-emerald-700 hover:text-emerald-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {actionError && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-800">
              {actionError}
            </div>
          )}

          {/* Empty State if no events exist yet */}
          {events.length === 0 && subTab !== 'templates' && (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-5">
              <CalendarDays className="w-10 h-10 text-emerald-700 mx-auto" />
              <div className="space-y-1.5 max-w-lg mx-auto">
                <h2 className="text-xl font-bold text-slate-900">
                  Initialize Your Event &amp; Certificate Database
                </h2>
                <p className="text-sm text-slate-600">
                  Your Firestore database is connected and secured. Load the sample UIN Jakarta
                  conference (matching event ID{' '}
                  <code className="font-mono text-xs text-slate-800">
                    0f3c5a9d-d122-451a-af7b-580919be7c19
                  </code>
                  ) or create your own event from scratch.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  disabled={seeding}
                  onClick={() => void handleSeedSample()}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 rounded-lg transition-colors"
                >
                  {seeding ? 'Initializing Database...' : 'Load Sample UIN Jakarta Conference'}
                </button>
                <button
                  type="button"
                  onClick={openCreateEventModal}
                  className="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  Create Custom Event
                </button>
              </div>
            </div>
          )}

          {/* SUB-TAB 1: EVENTS & CHECK-IN QR */}
          {subTab === 'events' && selectedEvent && (
            <div className="space-y-6">
              {/* Overview Strip */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-5 border-b border-slate-200">
                  <div className="space-y-1.5">
                    <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-emerald-800 capitalize">
                        {selectedEvent.status}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{selectedEvent.eventDate}</span>
                      <span aria-hidden="true">·</span>
                      <span>{selectedEvent.location}</span>
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                      {selectedEvent.title}
                    </h2>
                    <p className="text-sm text-slate-600">{selectedEvent.organizer}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditEventModal(selectedEvent)}
                      className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
                    >
                      Edit Settings
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenCheckInPortal(selectedEvent.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open Check-In Portal
                    </button>
                    {selectedEvent.status !== 'completed' && (
                      <button
                        type="button"
                        disabled={completingEvent}
                        onClick={() => void handleCompleteEvent()}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 rounded-lg transition-colors whitespace-nowrap"
                      >
                        <Send className="w-3.5 h-3.5" />
                        {completingEvent
                          ? 'Completing...'
                          : 'Complete Event & Send Certificates'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Attendance Desk Link + QR Code + Automation Summary */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                  <div className="md:col-span-8 space-y-4">
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-slate-700">
                        Shareable Participant Check-In URL
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-700 truncate">
                          {buildAttendanceUrl(selectedEvent.id)}
                        </code>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(
                                buildAttendanceUrl(selectedEvent.id)
                              );
                              setCopiedLink(true);
                              setTimeout(() => setCopiedLink(false), 2000);
                            } catch {
                              // Ignore
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg whitespace-nowrap shrink-0"
                        >
                          {copiedLink ? (
                            <Check className="w-3.5 h-3.5 text-emerald-700" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          {copiedLink ? 'Copied' : 'Copy Link'}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
                      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                        <p className="text-[11px] text-slate-500">Registered</p>
                        <p className="text-xl font-bold text-slate-900 font-mono tabular-nums mt-0.5">
                          {registrations.length}
                        </p>
                      </div>
                      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                        <p className="text-[11px] text-slate-500">Checked In</p>
                        <p className="text-xl font-bold text-emerald-800 font-mono tabular-nums mt-0.5">
                          {checkedInCount}
                        </p>
                      </div>
                      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                        <p className="text-[11px] text-slate-500">Cert Prefix</p>
                        <p className="text-base font-bold text-slate-900 font-mono mt-1">
                          {selectedEvent.certificatePrefix}
                        </p>
                      </div>
                      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                        <p className="text-[11px] text-slate-500">Auto-Deliver</p>
                        <p className="text-base font-bold text-slate-900 mt-1">
                          {selectedEvent.autoDeliverOnComplete ? 'Enabled' : 'Manual'}
                        </p>
                      </div>
                    </div>

                    <div className="text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1 pt-1">
                      <span>
                        Certificate Template:{' '}
                        <strong className="text-slate-900">
                          {templates.find((t) => t.id === selectedEvent.templateId)?.name ||
                            'Built-In UIN Ceremonial Frame'}
                        </strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => setSubTab('templates')}
                        className="text-emerald-700 font-semibold hover:underline"
                      >
                        Upload / Change Template →
                      </button>
                    </div>
                  </div>

                  {/* Check-in Desk QR */}
                  <div className="md:col-span-4 flex flex-col items-center justify-center p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                    {eventQrUrl ? (
                      <img
                        src={eventQrUrl}
                        alt="Event attendance check-in QR code"
                        referrerPolicy="no-referrer"
                        className="w-36 h-36 rounded-lg border border-slate-200 bg-white p-1.5"
                      />
                    ) : (
                      <div className="w-36 h-36 flex items-center justify-center bg-white border border-slate-200 rounded-lg">
                        <QrCode className="w-10 h-10 text-slate-300" />
                      </div>
                    )}
                    <p className="text-[11px] font-medium text-slate-600 text-center">
                      Venue Check-In Desk QR Code
                    </p>
                    {eventQrUrl && (
                      <a
                        href={eventQrUrl}
                        download={`checkin-qr-${selectedEvent.id}.png`}
                        className="text-xs font-semibold text-emerald-700 hover:underline"
                      >
                        Download QR PNG
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SUB-TAB 2: PARTICIPANT ROSTER & ATTENDANCE */}
          {subTab === 'roster' && selectedEvent && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Participant Registrations &amp; Attendance Roster
                  </h2>
                  <p className="text-xs text-slate-500 tabular-nums">
                    {selectedEvent.title} · {checkedInCount} of {registrations.length} checked in
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    disabled={registrations.length === 0}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 rounded-lg whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddParticipant(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg whitespace-nowrap"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Add Participant
                  </button>
                </div>
              </div>

              {/* Search & Segmented Status Filter */}
              <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={rosterSearch}
                    onChange={(e) => setRosterSearch(e.target.value)}
                    placeholder="Search name, email, institution, claim code..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start">
                  {(
                    [
                      ['all', 'All'],
                      ['checked_in', 'Checked In'],
                      ['registered', 'Registered'],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setRosterFilter(key)}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                        rosterFilter === key
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredRoster.length === 0 ? (
                <div className="p-10 text-center space-y-2">
                  <Users className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-sm font-semibold text-slate-900">No Participants Found</p>
                  <p className="text-xs text-slate-500">
                    Add pre-registered participants above or share the live check-in link.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                        <th className="py-3 px-4">Participant</th>
                        <th className="py-3 px-4">Role &amp; Institution</th>
                        <th className="py-3 px-4">Attendance</th>
                        <th className="py-3 px-4">Claim Code &amp; Email</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredRoster.map((reg) => (
                        <tr key={reg.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">{reg.fullName}</div>
                            <div className="text-xs font-mono text-slate-500">{reg.email}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-xs font-semibold text-emerald-800">{reg.role}</div>
                            <div className="text-xs text-slate-600 truncate max-w-[220px]">
                              {reg.institution}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div
                              className={`text-xs font-semibold ${
                                reg.registrationStatus === 'checked_in'
                                  ? 'text-emerald-700'
                                  : 'text-slate-600'
                              }`}
                            >
                              {reg.registrationStatus === 'checked_in'
                                ? 'Verified Present'
                                : 'Pre-Registered'}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                              {reg.gpsVerified
                                ? `GPS ${reg.gpsLat.toFixed(3)}, ${reg.gpsLng.toFixed(3)}`
                                : 'No GPS'}
                              {reg.photoCaptured ? ' · Photo OK' : ''}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-mono text-xs text-slate-800 tabular-nums">
                              {reg.claimCode || 'Not issued yet'}
                            </div>
                            <div className="text-[11px] text-slate-500 capitalize">
                              Cert email: {reg.certificateEmailStatus}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            {reg.registrationStatus === 'checked_in' && reg.claimCode ? (
                              <button
                                type="button"
                                onClick={() => onOpenCertificate(reg.claimCode)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-md whitespace-nowrap"
                              >
                                <Award className="w-3.5 h-3.5" />
                                Certificate
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={checkingInId === reg.id}
                                onClick={async () => {
                                  setCheckingInId(reg.id);
                                  try {
                                    await adminCheckInExistingParticipant(selectedEvent, reg);
                                    setActionBanner(
                                      `Marked ${reg.fullName} checked in and generated official certificate.`
                                    );
                                  } finally {
                                    setCheckingInId('');
                                  }
                                }}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 rounded-md whitespace-nowrap"
                              >
                                <UserCheck className="w-3.5 h-3.5" />
                                {checkingInId === reg.id ? 'Checking In...' : 'Check In'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* SUB-TAB 3: TEMPLATE STUDIO */}
          {subTab === 'templates' && (
            <TemplateStudioView
              adminUid={user.uid}
              templates={templates}
              onTemplateSaved={() => setActionBanner('Certificate template saved.')}
            />
          )}

          {/* SUB-TAB 4: CLOUD FUNCTIONS & EMAIL AUTOMATION */}
          {subTab === 'functions' && (
            <CloudFunctionsView
              selectedEvent={selectedEvent}
              emailLogs={emailLogs}
              isAdmin={isAdmin}
              onCompleteEvent={handleCompleteEvent}
            />
          )}
        </section>
      </div>

      {/* Create / Edit Event Modal */}
      {showEventModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {editingEvent ? 'Edit Event Configuration' : 'Create New Event'}
              </h3>
              <button
                type="button"
                onClick={() => setShowEventModal(false)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveEvent} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Event Title
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={SCHEMA_LIMITS.TITLE_MAX}
                    value={evTitle}
                    onChange={(e) => setEvTitle(e.target.value)}
                    placeholder="e.g., National Seminar on Digital Transformation 2026"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Subtitle / Theme (Optional)
                  </label>
                  <input
                    type="text"
                    maxLength={SCHEMA_LIMITS.SUBTITLE_MAX}
                    value={evSubtitle}
                    onChange={(e) => setEvSubtitle(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Organizer / Institution
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={SCHEMA_LIMITS.ORGANIZER_MAX}
                    value={evOrganizer}
                    onChange={(e) => setEvOrganizer(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Event Date
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={SCHEMA_LIMITS.EVENT_DATE_MAX}
                    value={evDate}
                    onChange={(e) => setEvDate(e.target.value)}
                    placeholder="November 24–25, 2026"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Venue / Location
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={SCHEMA_LIMITS.LOCATION_MAX}
                    value={evLocation}
                    onChange={(e) => setEvLocation(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Certificate Code Prefix
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={SCHEMA_LIMITS.PREFIX_MAX}
                    value={evPrefix}
                    onChange={(e) => setEvPrefix(e.target.value.toUpperCase())}
                    placeholder="UIN26"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Signatory Name
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={SCHEMA_LIMITS.NAME_MAX}
                    value={evSignatoryName}
                    onChange={(e) => setEvSignatoryName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Signatory Title
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={SCHEMA_LIMITS.SIGNATORY_TITLE_MAX}
                    value={evSignatoryTitle}
                    onChange={(e) => setEvSignatoryTitle(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Event Status
                  </label>
                  <select
                    value={evStatus}
                    onChange={(e) => setEvStatus(e.target.value as EventStatus)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="draft">Draft (Hidden)</option>
                    <option value="active">Active (Accepting Check-Ins)</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Certificate Template
                  </label>
                  <select
                    value={evTemplateId}
                    onChange={(e) => setEvTemplateId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">Built-In Archival Frame</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-200 text-xs text-slate-700">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={evRequirePhoto}
                    onChange={(e) => setEvRequirePhoto(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-700"
                  />
                  Require live camera photo on check-in
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={evRequireGps}
                    onChange={(e) => setEvRequireGps(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-700"
                  />
                  Enable GPS location stamp
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={evAutoEmail}
                    onChange={(e) => setEvAutoEmail(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-700"
                  />
                  Trigger confirmation email on check-in
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={evAutoComplete}
                    onChange={(e) => setEvAutoComplete(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-700"
                  />
                  Auto-deliver certificates on event completion
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowEventModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEvent}
                  className="px-5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 rounded-lg"
                >
                  {savingEvent ? 'Saving...' : editingEvent ? 'Save Changes' : 'Create Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Participant Modal */}
      {showAddParticipant && selectedEvent && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Register Participant</h3>
              <button
                type="button"
                onClick={() => setShowAddParticipant(false)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddParticipant} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={pName}
                  onChange={(e) => setPName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={pEmail}
                    onChange={(e) => setPEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    WhatsApp / Phone
                  </label>
                  <input
                    type="tel"
                    value={pPhone}
                    onChange={(e) => setPPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Institution / Affiliation
                </label>
                <input
                  type="text"
                  required
                  value={pInst}
                  onChange={(e) => setPInst(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Participation Role
                </label>
                <select
                  value={pRole}
                  onChange={(e) => setPRole(e.target.value as ParticipationRole)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {PARTICIPATION_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              {pRole === 'Presenter' && (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Paper Code
                    </label>
                    <input
                      type="text"
                      value={pPaperCode}
                      onChange={(e) => setPPaperCode(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Paper Title
                    </label>
                    <input
                      type="text"
                      value={pPaperTitle}
                      onChange={(e) => setPPaperTitle(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              )}

              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={pCheckInNow}
                  onChange={(e) => setPCheckInNow(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-700"
                />
                Mark as Checked-In immediately &amp; generate official certificate
              </label>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddParticipant(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingParticipant}
                  className="px-5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 rounded-lg"
                >
                  {savingParticipant ? 'Saving...' : 'Save Participant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
