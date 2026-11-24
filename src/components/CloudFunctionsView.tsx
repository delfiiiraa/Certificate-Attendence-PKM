import { useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  Mail,
  Send,
  Terminal,
  X,
} from 'lucide-react';
import { FIREBASE_PROJECT_ID, FIRESTORE_DATABASE_ID } from '../firebase';
import type { EmailLogRecord, EventRecord, RegistrationRecord } from '../types';
import type { SendEmailConfirmRequest } from './SendEmailConfirmModal';

interface CloudFunctionsViewProps {
  selectedEvent: EventRecord | null;
  registrations: RegistrationRecord[];
  emailLogs: EmailLogRecord[];
  isAdmin: boolean;
  senderEmail: string;
  hasGmailToken: boolean;
  onRequestSendEmails: (req: SendEmailConfirmRequest) => void;
}

export function CloudFunctionsView({
  selectedEvent,
  registrations,
  emailLogs,
  isAdmin,
  senderEmail,
  hasGmailToken,
  onRequestSendEmails,
}: CloudFunctionsViewProps) {
  const [filterType, setFilterType] = useState<'all' | 'checkin_confirmation' | 'certificate_delivery'>('all');
  const [previewLog, setPreviewLog] = useState<EmailLogRecord | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);

  const filteredLogs = emailLogs.filter((log) =>
    filterType === 'all' ? true : log.emailType === filterType
  );

  const queuedCount = emailLogs.filter((l) => l.status === 'queued').length;
  const sentCount = emailLogs.filter((l) => l.status === 'sent').length;
  const failedCount = emailLogs.filter((l) => l.status === 'failed').length;

  const checkedInAttendees = registrations.filter(
    (r) => r.registrationStatus === 'checked_in' && Boolean(r.claimCode) && Boolean(r.email)
  );
  const pendingCertAttendees = checkedInAttendees.filter(
    (r) => r.certificateEmailStatus !== 'sent'
  );

  const deployCommands = `cd functions && npm install && npm run build
firebase use ${FIREBASE_PROJECT_ID}
firebase functions:secrets:set SMTP_PASS
firebase deploy --only functions`;

  const handleCopyDeploy = async () => {
    try {
      await navigator.clipboard.writeText(deployCommands);
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleTriggerSendAll = (markCompleted: boolean) => {
    if (!selectedEvent) return;
    const targets = pendingCertAttendees.length > 0 ? pendingCertAttendees : checkedInAttendees;
    if (targets.length === 0) return;

    onRequestSendEmails({
      title: markCompleted
        ? 'Complete Event & Send Certificates via Gmail'
        : 'Send Official Certificates via Gmail',
      description: markCompleted
        ? `This will mark "${selectedEvent.title}" as Completed and send personalized official certificate emails directly from ${senderEmail} to all ${targets.length} verified attendee(s).`
        : `Send personalized official certificate emails directly from ${senderEmail} to ${targets.length} verified attendee(s) of "${selectedEvent.title}".`,
      recipients: targets,
      emailType: 'certificate_delivery',
      markEventCompleted: markCompleted,
    });
  };

  const handleSendSingleLog = (log: EmailLogRecord) => {
    const matchedReg = registrations.find((r) => r.id === log.registrationId);
    if (!matchedReg || !selectedEvent) return;
    onRequestSendEmails({
      title: `Send ${log.emailType === 'certificate_delivery' ? 'Certificate' : 'Confirmation'} via Gmail`,
      description: `Send this ${
        log.emailType === 'certificate_delivery' ? 'official certificate' : 'attendance confirmation'
      } email directly from ${senderEmail} to ${matchedReg.fullName} (${matchedReg.email}).`,
      recipients: [matchedReg],
      emailType: log.emailType,
      markEventCompleted: false,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header & Direct Gmail Trigger Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Gmail Delivery Triggers &amp; Firebase Cloud Functions
          </h2>
          <p className="text-sm text-slate-600">
            Send official PDF certificates directly from{' '}
            <span className="font-mono text-slate-900">{senderEmail}</span> to attendee emails, or
            deploy automated Firestore background triggers.
          </p>
        </div>

        {isAdmin && selectedEvent && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={checkedInAttendees.length === 0}
              onClick={() => handleTriggerSendAll(false)}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap"
            >
              <Mail className="w-3.5 h-3.5" />
              Send Pending ({pendingCertAttendees.length || checkedInAttendees.length}) via Gmail
            </button>
            {selectedEvent.status !== 'completed' && (
              <button
                type="button"
                disabled={checkedInAttendees.length === 0}
                onClick={() => handleTriggerSendAll(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 rounded-lg transition-colors whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                Complete Event &amp; Send via Gmail
              </button>
            )}
          </div>
        )}
      </div>

      {/* Gmail Sender Status Row */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-slate-500">Direct Gmail Sender Account</p>
          <p className="text-sm font-mono font-semibold text-slate-900">{senderEmail}</p>
        </div>
        <div className="text-xs text-slate-600">
          {hasGmailToken ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
              Gmail sending session active — ready to deliver with PDF attachment
            </span>
          ) : (
            <span>
              Click any Send via Gmail button to confirm and connect your Google sending session.
            </span>
          )}
        </div>
      </div>

      {/* Trigger Architecture Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5">
          <p className="text-xs font-mono font-semibold text-emerald-800">Gmail API Dispatch</p>
          <h3 className="text-sm font-bold text-slate-900">Instant Sender From Your Gmail</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Sends official HTML emails with the personalized PDF certificate attached straight from{' '}
            <span className="font-mono text-[11px]">{senderEmail}</span> after explicit organizer
            confirmation.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5">
          <p className="text-xs font-mono font-semibold text-emerald-800">onAttendanceCreated</p>
          <h3 className="text-sm font-bold text-slate-900">Check-In Confirmation Trigger</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Cloud Function trigger on{' '}
            <code className="font-mono text-[11px]">events/&#123;eventId&#125;/registrations/&#123;id&#125;</code>{' '}
            creation to confirm verified attendance and deliver Claim Codes.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5">
          <p className="text-xs font-mono font-semibold text-emerald-800">onEventCompleted</p>
          <h3 className="text-sm font-bold text-slate-900">Post-Event Batch Delivery</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Cloud Function trigger on{' '}
            <code className="font-mono text-[11px]">events/&#123;eventId&#125;</code> when status
            transitions to <strong className="text-slate-900">completed</strong> for unattended
            server-side batch sending.
          </p>
        </div>
      </div>

      {/* Delivery Pipeline Metrics & Filterable Audit Log */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900">
              Email Delivery Queue &amp; Audit Log
            </h3>
            <p className="text-xs text-slate-500 tabular-nums">
              {selectedEvent ? selectedEvent.title : 'No event selected'} · Total:{' '}
              {emailLogs.length} · Sent: {sentCount} · Queued: {queuedCount} · Failed: {failedCount}
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
            {(
              [
                ['all', 'All'],
                ['checkin_confirmation', 'Check-In'],
                ['certificate_delivery', 'Certificates'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilterType(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  filterType === key
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Mail className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-sm font-semibold text-slate-900">No Email Deliveries Logged Yet</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Use &ldquo;Send Pending via Gmail&rdquo; above or check in attendees to trigger
              certificate emails from {senderEmail}.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                  <th className="py-3 px-4">Recipient</th>
                  <th className="py-3 px-4">Trigger &amp; Type</th>
                  <th className="py-3 px-4">Claim Code</th>
                  <th className="py-3 px-4">Delivery State</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{log.recipientName}</div>
                      <div className="text-xs font-mono text-slate-500">{log.recipientEmail}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-mono text-xs text-slate-800">{log.triggerFunction}</div>
                      <div className="text-xs text-slate-500">
                        {log.emailType === 'certificate_delivery'
                          ? 'Official Certificate (PDF)'
                          : 'Check-In Confirmation'}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-700 tabular-nums">
                      {log.claimCode || '—'}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                          log.status === 'sent'
                            ? 'text-emerald-700'
                            : log.status === 'failed'
                              ? 'text-red-700'
                              : 'text-amber-700'
                        }`}
                      >
                        {log.status === 'sent' ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : log.status === 'failed' ? (
                          <AlertCircle className="w-3.5 h-3.5" />
                        ) : (
                          <Clock className="w-3.5 h-3.5" />
                        )}
                        <span className="capitalize">{log.status}</span>
                      </span>
                      {log.errorMessage && (
                        <p className="text-[11px] text-red-600 mt-0.5 max-w-[200px] truncate">
                          {log.errorMessage}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPreviewLog(log)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-md whitespace-nowrap"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Preview
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleSendSingleLog(log)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-md whitespace-nowrap"
                          >
                            <Send className="w-3 h-3" />
                            {log.status === 'sent' ? 'Resend' : 'Send via Gmail'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cloud Functions Deployment Configuration */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Terminal className="w-4 h-4 text-emerald-700" />
            <h3 className="text-sm font-bold text-slate-900">
              Optional: Deploy Background Cloud Functions ({FIREBASE_PROJECT_ID})
            </h3>
          </div>
          <button
            type="button"
            onClick={handleCopyDeploy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap self-start"
          >
            {copiedCmd ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedCmd ? 'Copied Commands' : 'Copy CLI Commands'}
          </button>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          Direct Gmail delivery works immediately from this portal using your signed-in Gmail
          account. For unattended server-side background triggers, deploy{' '}
          <code className="font-mono text-slate-800">functions/src/index.ts</code> (configured for
          database <code className="font-mono text-slate-800">{FIRESTORE_DATABASE_ID}</code> and
          default sender <code className="font-mono text-slate-800">{senderEmail}</code>):
        </p>

        <pre className="p-4 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto leading-relaxed">
          {deployCommands}
        </pre>
      </div>

      {/* Email HTML Preview Modal */}
      {previewLog && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Automated Email Preview</h3>
                <p className="text-xs text-slate-500">
                  From <span className="font-mono">{senderEmail}</span> · Trigger:{' '}
                  <span className="font-mono">{previewLog.triggerFunction}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewLog(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
                aria-label="Close email preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="text-xs space-y-1.5 pb-4 border-b border-slate-200">
                <div className="flex gap-3">
                  <span className="text-slate-500 w-16">From:</span>
                  <span className="font-mono text-slate-900">CertFlow Official &lt;{senderEmail}&gt;</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-slate-500 w-16">To:</span>
                  <span className="font-mono text-slate-900">
                    {previewLog.recipientName} &lt;{previewLog.recipientEmail}&gt;
                  </span>
                </div>
                <div className="flex gap-3">
                  <span className="text-slate-500 w-16">Subject:</span>
                  <span className="font-semibold text-slate-900">{previewLog.subject}</span>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-emerald-900 text-white px-6 py-5">
                  <p className="text-[11px] uppercase tracking-widest text-emerald-200">
                    {previewLog.emailType === 'certificate_delivery'
                      ? 'Official E-Certificate Ready'
                      : 'Official Attendance Confirmation'}
                  </p>
                  <h4 className="text-lg font-bold mt-1">
                    {selectedEvent?.title || 'Official Institutional Event'}
                  </h4>
                </div>
                <div className="p-6 space-y-4 text-sm text-slate-700 leading-relaxed">
                  <p>
                    Dear <strong className="text-slate-900">{previewLog.recipientName}</strong>,
                  </p>
                  <p>
                    {previewLog.emailType === 'certificate_delivery'
                      ? 'The event has officially concluded and your cryptographically verified digital certificate is attached as a PDF and ready for online verification.'
                      : 'Your event attendance check-in has been recorded and verified. Retain your certificate claim code below for verification and post-event certificate download.'}
                  </p>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center space-y-1">
                    <p className="text-xs text-slate-500">Certificate Claim Code</p>
                    <p className="text-xl font-mono font-bold text-emerald-800 tracking-wider">
                      {previewLog.claimCode}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500 break-all">
                    Verification Link:{' '}
                    <a
                      href={previewLog.certificateUrl}
                      className="text-emerald-700 underline font-mono"
                    >
                      {previewLog.certificateUrl}
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
