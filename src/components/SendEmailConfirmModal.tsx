import { useState } from 'react';
import { AlertCircle, CheckCircle2, Mail, Paperclip, Send, X } from 'lucide-react';
import type { RegistrationRecord } from '../types';
import { GoogleSignInButton } from './GoogleSignInButton';

export interface SendEmailConfirmRequest {
  title: string;
  description: string;
  recipients: RegistrationRecord[];
  emailType: 'checkin_confirmation' | 'certificate_delivery';
  markEventCompleted?: boolean;
}

interface SendEmailConfirmModalProps {
  request: SendEmailConfirmRequest | null;
  senderEmail: string;
  hasGmailToken: boolean;
  onRefreshGmailAuth: () => Promise<string | null>;
  onConfirm: (params: {
    recipients: RegistrationRecord[];
    emailType: 'checkin_confirmation' | 'certificate_delivery';
    attachPdf: boolean;
    markEventCompleted: boolean;
    onProgress: (index: number, total: number, currentName: string) => void;
  }) => Promise<{ sentCount: number; failedCount: number; errors: string[] }>;
  onClose: () => void;
}

export function SendEmailConfirmModal({
  request,
  senderEmail,
  hasGmailToken,
  onRefreshGmailAuth,
  onConfirm,
  onClose,
}: SendEmailConfirmModalProps) {
  const [attachPdf, setAttachPdf] = useState(true);
  const [sending, setSending] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [result, setResult] = useState<{
    sentCount: number;
    failedCount: number;
    errors: string[];
  } | null>(null);

  if (!request) return null;

  const handleReconnect = async () => {
    setReconnecting(true);
    try {
      await onRefreshGmailAuth();
    } finally {
      setReconnecting(false);
    }
  };

  const handleConfirmSend = async () => {
    setSending(true);
    setResult(null);
    setProgressText(`Preparing ${request.recipients.length} email(s)...`);
    try {
      const outcome = await onConfirm({
        recipients: request.recipients,
        emailType: request.emailType,
        attachPdf,
        markEventCompleted: Boolean(request.markEventCompleted),
        onProgress: (index, total, currentName) => {
          setProgressText(`Sending ${index} of ${total}: ${currentName}...`);
        },
      });
      setResult(outcome);
    } catch (err) {
      setResult({
        sentCount: 0,
        failedCount: request.recipients.length,
        errors: [err instanceof Error ? err.message : 'Unable to send via Gmail.'],
      });
    } finally {
      setSending(false);
      setProgressText('');
    }
  };

  const handleClose = () => {
    if (sending) return;
    setResult(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gmail-confirm-title"
        className="bg-white border border-slate-200 rounded-xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Mail className="w-5 h-5 text-emerald-700" />
            <h3 id="gmail-confirm-title" className="text-base font-bold text-slate-900">
              {request.title}
            </h3>
          </div>
          <button
            type="button"
            disabled={sending}
            onClick={handleClose}
            className="p-1 text-slate-500 hover:text-slate-900 disabled:opacity-40"
            aria-label="Close confirmation dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          <p className="text-sm text-slate-600 leading-relaxed">{request.description}</p>

          {/* Sender summary */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-500">Sender (Gmail)</span>
              <span className="font-mono font-semibold text-slate-900">{senderEmail}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-500">Recipients</span>
              <span className="font-mono font-semibold text-emerald-800 tabular-nums">
                {request.recipients.length} verified attendee(s)
              </span>
            </div>
            {request.markEventCompleted && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500">Event Status Update</span>
                <span className="font-semibold text-slate-900">Will be marked Completed</span>
              </div>
            )}
          </div>

          {/* Recipient list */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700">Affected Recipients</p>
            <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-200">
              {request.recipients.map((rec) => (
                <div
                  key={rec.id}
                  className="px-3.5 py-2.5 bg-white flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{rec.fullName}</p>
                    <p className="font-mono text-slate-500 truncate">{rec.email}</p>
                  </div>
                  <span className="font-mono text-[11px] text-emerald-800 shrink-0 tabular-nums">
                    {rec.claimCode}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* PDF Attachment option */}
          {request.emailType === 'certificate_delivery' && !result && (
            <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={attachPdf}
                disabled={sending}
                onChange={(e) => setAttachPdf(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
              />
              <span>
                <span className="font-semibold text-slate-900 inline-flex items-center gap-1">
                  <Paperclip className="w-3.5 h-3.5 text-emerald-700" />
                  Attach personalized PDF certificate to each email
                </span>
                <span className="block text-slate-500 mt-0.5">
                  Renders each attendee&apos;s official certificate using your event template and
                  attaches it directly to the Gmail message alongside the QR verification link.
                </span>
              </span>
            </label>
          )}

          {/* Re-auth prompt if Gmail in-memory token was cleared on page refresh */}
          {!hasGmailToken && !result && (
            <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 space-y-3">
              <p className="text-xs font-medium text-amber-900 leading-relaxed">
                Your Gmail sending session needs to be refreshed before sending emails from{' '}
                <span className="font-mono font-semibold">{senderEmail}</span>.
              </p>
              <GoogleSignInButton
                compact
                disabled={reconnecting}
                onClick={() => void handleReconnect()}
                label={reconnecting ? 'Connecting Gmail...' : 'Connect Gmail with Google'}
              />
            </div>
          )}

          {/* Progress */}
          {sending && (
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700">
              {progressText}
            </div>
          )}

          {/* Outcome summary */}
          {result && (
            <div
              className={`p-4 rounded-lg border text-xs space-y-2 ${
                result.failedCount === 0
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold">
                {result.failedCount === 0 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                )}
                <span>
                  Sent {result.sentCount} email(s) from {senderEmail}
                  {result.failedCount > 0 ? ` · ${result.failedCount} failed` : ''}
                </span>
              </div>
              {result.errors.length > 0 && (
                <ul className="list-disc pl-5 space-y-1 text-[11px]">
                  {result.errors.slice(0, 4).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          {result ? (
            <button
              type="button"
              onClick={handleClose}
              className="px-5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
            >
              Done
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={sending}
                onClick={handleClose}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={sending || !hasGmailToken || request.recipients.length === 0}
                onClick={() => void handleConfirmSend()}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 rounded-lg transition-colors whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                {sending
                  ? 'Sending via Gmail...'
                  : `Confirm & Send ${request.recipients.length} Email(s)`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
