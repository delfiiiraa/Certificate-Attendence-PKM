import { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  Mail,
  Send,
  Terminal,
  X,
  AlertCircle,
} from 'lucide-react';
import { FIREBASE_PROJECT_ID, FIRESTORE_DATABASE_ID } from '../firebase';
import type { EmailLogRecord, EventRecord } from '../types';
import { updateEmailLogDeliveryStatus } from '../lib/firestoreService';

interface CloudFunctionsViewProps {
  selectedEvent: EventRecord | null;
  emailLogs: EmailLogRecord[];
  isAdmin: boolean;
  onCompleteEvent?: () => Promise<void>;
}

export function CloudFunctionsView({
  selectedEvent,
  emailLogs,
  isAdmin,
  onCompleteEvent,
}: CloudFunctionsViewProps) {
  const [filterType, setFilterType] = useState<'all' | 'checkin_confirmation' | 'certificate_delivery'>('all');
  const [previewLog, setPreviewLog] = useState<EmailLogRecord | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [updatingId, setUpdatingId] = useState('');
  const [completing, setCompleting] = useState(false);

  const filteredLogs = emailLogs.filter((log) =>
    filterType === 'all' ? true : log.emailType === filterType
  );

  const queuedCount = emailLogs.filter((l) => l.status === 'queued').length;
  const sentCount = emailLogs.filter((l) => l.status === 'sent').length;
  const failedCount = emailLogs.filter((l) => l.status === 'failed').length;

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

  const handleMarkStatus = async (log: EmailLogRecord, status: 'sent' | 'queued') => {
    if (!selectedEvent) return;
    setUpdatingId(log.id);
    try {
      await updateEmailLogDeliveryStatus(selectedEvent.id, log, status, '');
    } finally {
      setUpdatingId('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Firebase Cloud Functions &amp; Email Automation
          </h2>
          <p className="text-sm text-slate-600">
            Event-driven Firestore triggers automatically dispatch attendance confirmations and
            post-event certificate delivery emails.
          </p>
        </div>
        {isAdmin && selectedEvent && selectedEvent.status !== 'completed' && onCompleteEvent && (
          <button
            type="button"
            disabled={completing}
            onClick={async () => {
              setCompleting(true);
              try {
                await onCompleteEvent();
              } finally {
                setCompleting(false);
              }
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            {completing ? 'Completing Event...' : 'Complete Event & Dispatch Certificates'}
          </button>
        )}
      </div>

      {/* Trigger Architecture Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5">
          <p className="text-xs font-mono font-semibold text-emerald-800">onAttendanceCreated</p>
          <h3 className="text-sm font-bold text-slate-900">Check-In Confirmation Trigger</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Fires on <code className="font-mono text-[11px]">events/&#123;eventId&#125;/registrations/&#123;id&#125;</code>{' '}
            creation when status is checked in. Emails claim code &amp; check-in receipt immediately.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5">
          <p className="text-xs font-mono font-semibold text-emerald-800">onEventCompleted</p>
          <h3 className="text-sm font-bold text-slate-900">Post-Event Certificate Delivery</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Fires on <code className="font-mono text-[11px]">events/&#123;eventId&#125;</code> update
            when status transitions to <strong className="text-slate-900">completed</strong>.
            Dispatches official certificate links to all verified attendees.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5">
          <p className="text-xs font-mono font-semibold text-emerald-800">
            triggerCertificateDispatch
          </p>
          <h3 className="text-sm font-bold text-slate-900">Admin Retry Callable Function</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Authenticated HTTPS <code className="font-mono text-[11px]">onCall</code> function
            allowing verified organizers to retry failed deliveries or send selective batches.
          </p>
        </div>
      </div>

      {/* Delivery Pipeline Metrics & Filterable Audit Log */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900">
              Automated Email Delivery Queue &amp; Audit Log
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
            <p className="text-sm font-semibold text-slate-900">No Email Triggers Logged Yet</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Check-in confirmation emails appear automatically when participants verify attendance,
              and certificate delivery emails queue when you mark the event Completed.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                  <th className="py-3 px-4">Recipient</th>
                  <th className="py-3 px-4">Trigger Function</th>
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
                          ? 'Post-Event Certificate'
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
                        {isAdmin && log.status !== 'sent' && (
                          <button
                            type="button"
                            disabled={updatingId === log.id}
                            onClick={() => void handleMarkStatus(log, 'sent')}
                            className="px-2.5 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-md whitespace-nowrap disabled:opacity-50"
                          >
                            {updatingId === log.id ? 'Updating...' : 'Mark Sent'}
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
              Deploy Cloud Functions to Firebase Project ({FIREBASE_PROJECT_ID})
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
          The complete Cloud Functions v2 backend is pre-configured in{' '}
          <code className="font-mono text-slate-800">functions/src/index.ts</code> targeting named
          Firestore database <code className="font-mono text-slate-800">{FIRESTORE_DATABASE_ID}</code>.
          Provide your SMTP secret (<code className="font-mono text-slate-800">SMTP_PASS</code>) and
          deploy via Firebase CLI to activate live outbound email delivery:
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
                  Triggered by <span className="font-mono">{previewLog.triggerFunction}</span>
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

              {/* Rendered Email Card */}
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
                      ? 'The event has officially concluded and your cryptographically verified digital certificate is now ready for immediate download.'
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
