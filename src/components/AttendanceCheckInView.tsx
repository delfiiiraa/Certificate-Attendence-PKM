import React, { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Camera,
  CheckCircle2,
  ExternalLink,
  MapPin,
  RefreshCw,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import {
  PARTICIPATION_ROLES,
  SCHEMA_LIMITS,
  type EventRecord,
  type ParticipationRole,
} from '../types';
import { compressWebcamSnapshot } from '../lib/certificateRenderer';
import { submitLiveAttendanceCheckIn } from '../lib/firestoreService';

interface AttendanceCheckInViewProps {
  user: User | null;
  events: EventRecord[];
  selectedEventId: string;
  onSelectEvent: (eventId: string) => void;
  onSignIn: () => Promise<void>;
  onOpenCertificate: (claimCode: string) => void;
}

interface SubmissionReceipt {
  registrationId: string;
  claimCode: string;
  checkInRef: string;
  verificationHash: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  institution: string;
  role: ParticipationRole;
  paperCode: string;
  paperTitle: string;
  eventName: string;
  submittedAt: string;
  autoEmailQueued: boolean;
}

export function AttendanceCheckInView({
  user,
  events,
  selectedEventId,
  onSelectEvent,
  onSignIn,
  onOpenCertificate,
}: AttendanceCheckInViewProps) {
  const activeEvents = events.filter((e) => e.status === 'active' || e.status === 'completed');
  const currentEvent =
    events.find((e) => e.id === selectedEventId) ||
    events.find((e) => e.status === 'active') ||
    events[0] ||
    null;

  // Form fields
  const [fullName, setFullName] = useState(user?.displayName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [institution, setInstitution] = useState('');
  const [role, setRole] = useState<ParticipationRole>('Participant');
  const [paperCode, setPaperCode] = useState('');
  const [paperTitle, setPaperTitle] = useState('');

  // Camera state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [photoThumbnail, setPhotoThumbnail] = useState('');

  // GPS state
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'locating' | 'captured' | 'error'>('idle');
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState('');

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [receipt, setReceipt] = useState<SubmissionReceipt | null>(null);

  useEffect(() => {
    if (user) {
      setFullName((prev) => prev || user.displayName || '');
      setEmail((prev) => prev || user.email || '');
    }
  }, [user]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    setCameraError('');
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Camera API is unavailable in this browser context.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setCameraError(
        'Camera permission was denied or no camera was detected. You may still proceed if photo capture is optional.'
      );
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const dataUrl = compressWebcamSnapshot(videoRef.current);
    if (dataUrl) {
      setPhotoThumbnail(dataUrl);
      stopCamera();
    }
  };

  const captureGps = () => {
    setGpsError('');
    if (!navigator.geolocation) {
      setGpsStatus('error');
      setGpsError('Geolocation is not supported by this browser.');
      return;
    }
    setGpsStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        });
        setGpsStatus('captured');
      },
      (err) => {
        setGpsStatus('error');
        setGpsError(err.message || 'Unable to retrieve GPS coordinates.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!currentEvent) {
      setFormError('No active event is currently selected.');
      return;
    }
    if (currentEvent.status !== 'active') {
      setFormError('This event is not currently accepting live attendance check-ins.');
      return;
    }
    if (!user) {
      setFormError('Please sign in with Google first to record verified attendance.');
      return;
    }
    if (fullName.trim().length < SCHEMA_LIMITS.NAME_MIN) {
      setFormError('Please enter your full name as it should appear on the official certificate.');
      return;
    }
    if (!SCHEMA_LIMITS.EMAIL_PATTERN.test(email.trim())) {
      setFormError('Please provide a valid email address for automated certificate delivery.');
      return;
    }
    if (institution.trim().length < 2) {
      setFormError('Please provide your university, faculty, or institution.');
      return;
    }
    if (currentEvent.requirePhoto && !photoThumbnail) {
      setFormError('This event requires a live verification photo before submitting check-in.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitLiveAttendanceCheckIn({
        event: currentEvent,
        userId: user.uid,
        fullName,
        email,
        phoneNumber,
        institution,
        role,
        paperCode: role === 'Presenter' ? paperCode : '',
        paperTitle: role === 'Presenter' ? paperTitle : '',
        photoCaptured: Boolean(photoThumbnail),
        photoThumbnail,
        gpsLat: gpsCoords?.lat ?? 0,
        gpsLng: gpsCoords?.lng ?? 0,
        gpsVerified: Boolean(gpsCoords),
      });

      setReceipt({
        registrationId: res.registrationId,
        claimCode: res.claimCode,
        checkInRef: res.checkInRef,
        verificationHash: res.verificationHash,
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        phoneNumber: phoneNumber.trim(),
        institution: institution.trim(),
        role,
        paperCode: role === 'Presenter' ? paperCode.trim() : '',
        paperTitle: role === 'Presenter' ? paperTitle.trim() : '',
        eventName: currentEvent.title,
        submittedAt: new Date().toUTCString(),
        autoEmailQueued: currentEvent.autoEmailOnCheckIn,
      });
      stopCamera();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to submit attendance check-in.');
    } finally {
      setSubmitting(false);
    }
  };

  if (receipt) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-emerald-700 text-sm font-semibold">
                <CheckCircle2 className="w-5 h-5" />
                <span>Attendance Verified &amp; Recorded</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                {receipt.eventName}
              </h1>
              <p className="text-sm text-slate-600">
                Your attendance record and cryptographic certificate have been stored in Firestore.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReceipt(null)}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start"
            >
              Submit Another Check-In
            </button>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-500">Official Certificate Claim Code</p>
              <p className="text-2xl font-mono font-bold text-emerald-800 tracking-wider tabular-nums">
                {receipt.claimCode}
              </p>
              {receipt.autoEmailQueued && (
                <p className="text-xs text-slate-600 pt-1">
                  Confirmation &amp; claim code queued for automated email delivery to{' '}
                  <span className="font-mono font-medium text-slate-900">{receipt.email}</span>.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onOpenCertificate(receipt.claimCode)}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <ExternalLink className="w-4 h-4" />
              View &amp; Download Certificate
            </button>
          </div>

          <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden text-sm">
            <div className="grid grid-cols-3 gap-4 px-5 py-3.5 bg-white">
              <span className="text-slate-500">Attendee Name</span>
              <span className="col-span-2 font-semibold text-slate-900">{receipt.fullName}</span>
            </div>
            <div className="grid grid-cols-3 gap-4 px-5 py-3.5 bg-white">
              <span className="text-slate-500">Email</span>
              <span className="col-span-2 font-mono text-xs text-slate-800 self-center">
                {receipt.email}
              </span>
            </div>
            {receipt.phoneNumber && (
              <div className="grid grid-cols-3 gap-4 px-5 py-3.5 bg-white">
                <span className="text-slate-500">WhatsApp / Phone</span>
                <span className="col-span-2 font-mono text-xs text-slate-800 self-center tabular-nums">
                  {receipt.phoneNumber}
                </span>
              </div>
            )}
            <div className="grid grid-cols-3 gap-4 px-5 py-3.5 bg-white">
              <span className="text-slate-500">Institution</span>
              <span className="col-span-2 text-slate-800">{receipt.institution}</span>
            </div>
            <div className="grid grid-cols-3 gap-4 px-5 py-3.5 bg-white">
              <span className="text-slate-500">Participation Role</span>
              <span className="col-span-2 font-medium text-emerald-800">{receipt.role}</span>
            </div>
            {receipt.paperTitle && (
              <div className="grid grid-cols-3 gap-4 px-5 py-3.5 bg-white">
                <span className="text-slate-500">Assigned Paper</span>
                <span className="col-span-2 text-slate-800">
                  {receipt.paperCode ? `[${receipt.paperCode}] ` : ''}
                  {receipt.paperTitle}
                </span>
              </div>
            )}
            <div className="grid grid-cols-3 gap-4 px-5 py-3.5 bg-white">
              <span className="text-slate-500">Check-In Reference</span>
              <span className="col-span-2 font-mono text-xs text-slate-700 self-center tabular-nums">
                {receipt.checkInRef}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4 px-5 py-3.5 bg-white">
              <span className="text-slate-500">Timestamp</span>
              <span className="col-span-2 font-mono text-xs text-slate-600 self-center tabular-nums">
                {receipt.submittedAt}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left column: Event details + Live camera/GPS verification */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-emerald-800">
                  Official Event Attendance Portal
                </span>
                {currentEvent && (
                  <span className="text-xs font-medium text-slate-500 capitalize">
                    Status: {currentEvent.status}
                  </span>
                )}
              </div>

              {activeEvents.length > 1 && (
                <div className="pt-1">
                  <label
                    htmlFor="event-selector"
                    className="block text-xs font-medium text-slate-600 mb-1.5"
                  >
                    Select Event Session
                  </label>
                  <select
                    id="event-selector"
                    value={currentEvent?.id || ''}
                    onChange={(e) => onSelectEvent(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  >
                    {activeEvents.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.title} ({ev.status})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {currentEvent ? (
                <>
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight pt-1">
                    {currentEvent.title}
                  </h1>
                  {currentEvent.subtitle && (
                    <p className="text-sm text-slate-600 leading-relaxed">{currentEvent.subtitle}</p>
                  )}
                </>
              ) : (
                <div className="py-4 space-y-2">
                  <h1 className="text-xl font-bold text-slate-900">No Active Events Yet</h1>
                  <p className="text-sm text-slate-600">
                    Sign in to the Admin Console to create an event or initialize the sample UIN
                    Jakarta conference portal.
                  </p>
                </div>
              )}
            </div>

            {currentEvent && (
              <div className="pt-4 border-t border-slate-200 space-y-2.5 text-sm text-slate-600">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">Organizer</span>
                  <span className="font-medium text-slate-900 text-right">
                    {currentEvent.organizer}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">Date</span>
                  <span className="font-medium text-slate-900 text-right tabular-nums">
                    {currentEvent.eventDate}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">Venue</span>
                  <span className="font-medium text-slate-900 text-right">
                    {currentEvent.location}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">Event ID</span>
                  <span className="font-mono text-xs text-slate-600 truncate max-w-[200px]">
                    {currentEvent.id}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Live Camera & GPS Verification Module */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-slate-900">Presence Verification</h2>
              <p className="text-xs text-slate-500">
                Capture live camera presence and GPS coordinates to strengthen attendance auditability.
              </p>
            </div>

            {/* Camera Capture */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">
                  Live Photo {currentEvent?.requirePhoto ? '(Required)' : '(Optional)'}
                </span>
                {photoThumbnail && (
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoThumbnail('');
                      void startCamera();
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Retake
                  </button>
                )}
              </div>

              {photoThumbnail ? (
                <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                  <img
                    src={photoThumbnail}
                    alt="Captured attendance verification portrait"
                    referrerPolicy="no-referrer"
                    className="w-full h-48 object-cover"
                  />
                  <div className="px-3 py-2 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-emerald-800 font-medium">
                    <span>Verification photo captured</span>
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                </div>
              ) : cameraActive ? (
                <div className="space-y-2.5">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-48 object-cover rounded-lg bg-slate-900 border border-slate-200"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={capturePhoto}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors"
                    >
                      <Camera className="w-4 h-4" />
                      Capture Photo
                    </button>
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={startCamera}
                  className="w-full py-3.5 px-4 border border-dashed border-slate-300 hover:border-emerald-600 rounded-lg text-xs font-semibold text-slate-700 hover:text-emerald-800 bg-slate-50 transition-colors flex items-center justify-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  Enable Camera for Attendance Photo
                </button>
              )}

              {cameraError && <p className="text-xs text-amber-700">{cameraError}</p>}
            </div>

            {/* GPS Verification */}
            <div className="pt-4 border-t border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">GPS Location Check</span>
                <button
                  type="button"
                  onClick={captureGps}
                  disabled={gpsStatus === 'locating'}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  {gpsStatus === 'locating'
                    ? 'Locating...'
                    : gpsCoords
                      ? 'Refresh GPS'
                      : 'Capture Coordinates'}
                </button>
              </div>
              {gpsCoords ? (
                <div className="px-3.5 py-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs font-mono tabular-nums text-slate-700">
                  <span>
                    {gpsCoords.lat}, {gpsCoords.lng}
                  </span>
                  <span className="font-sans font-semibold text-emerald-700">Verified</span>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  {gpsError || 'Optional geolocation stamp attached to your attendance receipt.'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right column: Attendee Registration & Check-In Form */}
        <div className="lg:col-span-7">
          <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
            <div className="space-y-1.5 pb-4 border-b border-slate-200">
              <h2 className="text-xl font-bold text-slate-900">Participant Check-In Form</h2>
              <p className="text-sm text-slate-600">
                Complete your identity details accurately. Your name, institution, and role will be
                imprinted directly onto your official digital certificate.
              </p>
            </div>

            {!user && (
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-slate-900">
                    Google Sign-In Required for Verified Attendance
                  </p>
                  <p className="text-xs text-slate-600">
                    Authenticating prevents duplicate spoofing and binds your certificate to your
                    verified account.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void onSignIn()}
                  className="px-4 py-2.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  Sign In with Google
                </button>
              </div>
            )}

            {currentEvent?.status === 'completed' && (
              <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
                This event has been marked <strong>Completed</strong>. Live check-in is closed and
                certificates have been dispatched to verified attendees.
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="checkin-fullname"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Full Name (with Academic Title if applicable)
                  </label>
                  <input
                    id="checkin-fullname"
                    type="text"
                    required
                    maxLength={SCHEMA_LIMITS.NAME_MAX}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g., Dr. Siti Rahmawati, M.Ag."
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="checkin-email"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Email Address (for Certificate Delivery)
                  </label>
                  <input
                    id="checkin-email"
                    type="email"
                    required
                    maxLength={SCHEMA_LIMITS.EMAIL_MAX}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@uinjkt.ac.id"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="checkin-phone"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    WhatsApp / Mobile Number
                  </label>
                  <input
                    id="checkin-phone"
                    type="tel"
                    maxLength={SCHEMA_LIMITS.PHONE_MAX}
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+62 812-0000-0000"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="checkin-institution"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Institution / Faculty / Affiliation
                  </label>
                  <input
                    id="checkin-institution"
                    type="text"
                    required
                    maxLength={SCHEMA_LIMITS.INSTITUTION_MAX}
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    placeholder="e.g., Faculty of Science and Technology, UIN Syarif Hidayatullah Jakarta"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="checkin-role"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Participation Role
                  </label>
                  <select
                    id="checkin-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value as ParticipationRole)}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                  >
                    {PARTICIPATION_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                {role === 'Presenter' && (
                  <>
                    <div>
                      <label
                        htmlFor="checkin-papercode"
                        className="block text-xs font-semibold text-slate-700 mb-1.5"
                      >
                        Paper Code (Optional)
                      </label>
                      <input
                        id="checkin-papercode"
                        type="text"
                        maxLength={SCHEMA_LIMITS.PAPER_CODE_MAX}
                        value={paperCode}
                        onChange={(e) => setPaperCode(e.target.value)}
                        placeholder="e.g., ICIS-204"
                        className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label
                        htmlFor="checkin-papertitle"
                        className="block text-xs font-semibold text-slate-700 mb-1.5"
                      >
                        Presented Paper Title
                      </label>
                      <input
                        id="checkin-papertitle"
                        type="text"
                        maxLength={SCHEMA_LIMITS.PAPER_TITLE_MAX}
                        value={paperTitle}
                        onChange={(e) => setPaperTitle(e.target.value)}
                        placeholder="Enter full title of presented manuscript"
                        className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                      />
                    </div>
                  </>
                )}
              </div>

              {formError && (
                <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-800">
                  {formError}
                </div>
              )}

              <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>Generates SHA-256 verified claim code &amp; queues email receipt</span>
                </div>
                <button
                  type="submit"
                  disabled={submitting || !currentEvent || currentEvent.status !== 'active' || !user}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <UserCheck className="w-4 h-4" />
                  {submitting ? 'Verifying Attendance...' : 'Verify & Submit Check-In'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
