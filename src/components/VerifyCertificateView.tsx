import React, { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { Award, CheckCircle2, Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { CertificateRecord, CertificateTemplateRecord } from '../types';
import { fetchCertificateByClaimCode, fetchUserCertificates } from '../lib/firestoreService';
import { CertificatePreview } from './CertificatePreview';

interface VerifyCertificateViewProps {
  user: User | null;
  initialClaimCode: string;
  onClaimCodeChange: (code: string) => void;
}

export function VerifyCertificateView({
  user,
  initialClaimCode,
  onClaimCodeChange,
}: VerifyCertificateViewProps) {
  const [queryCode, setQueryCode] = useState(initialClaimCode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [certificate, setCertificate] = useState<CertificateRecord | null>(null);
  const [template, setTemplate] = useState<CertificateTemplateRecord | null>(null);
  const [myCertificates, setMyCertificates] = useState<CertificateRecord[]>([]);

  const runLookup = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setLoading(true);
    setError('');
    setSearched(true);
    onClaimCodeChange(trimmed);
    try {
      const result = await fetchCertificateByClaimCode(trimmed);
      setCertificate(result.certificate);
      setTemplate(result.template);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to verify certificate code.');
      setCertificate(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialClaimCode) {
      setQueryCode(initialClaimCode);
      void runLookup(initialClaimCode);
    }
  }, [initialClaimCode]);

  useEffect(() => {
    if (!user) {
      setMyCertificates([]);
      return;
    }
    fetchUserCertificates(user.uid)
      .then(setMyCertificates)
      .catch(() => setMyCertificates([]));
  }, [user]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runLookup(queryCode);
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      {/* Lookup Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-5">
        <div className="max-w-2xl space-y-1.5">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Official Certificate Verification &amp; Download
          </h1>
          <p className="text-sm text-slate-600">
            Enter a certificate claim code or scan the embedded QR code to validate cryptographic
            authenticity and download the print-ready PDF or PNG certificate.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-2xl">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={queryCode}
              onChange={(e) => setQueryCode(e.target.value)}
              placeholder="Enter Claim Code (e.g. UIN26-7K4M-9P2Q)"
              className="w-full pl-10 pr-4 py-2.5 text-sm font-mono bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !queryCode.trim()}
            className="px-6 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {loading ? 'Verifying...' : 'Verify Certificate'}
          </button>
        </form>

        {myCertificates.length > 0 && (
          <div className="pt-4 border-t border-slate-200 space-y-2.5">
            <p className="text-xs font-semibold text-slate-500">Your Issued Certificates</p>
            <div className="flex flex-wrap gap-2">
              {myCertificates.map((c) => (
                <button
                  key={c.claimCode}
                  type="button"
                  onClick={() => {
                    setQueryCode(c.claimCode);
                    void runLookup(c.claimCode);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                    certificate?.claimCode === c.claimCode
                      ? 'bg-emerald-50 border-emerald-600 text-emerald-900'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="font-mono font-semibold">{c.claimCode}</span>
                  <span className="mx-1.5 text-slate-400">·</span>
                  <span>{c.fullName}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      {searched && !loading && !certificate && !error && (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <ShieldAlert className="w-10 h-10 text-amber-600 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900">No Certificate Record Found</h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Claim code <span className="font-mono font-semibold text-slate-900">{queryCode}</span>{' '}
            does not match an issued certificate in the verification registry.
          </p>
        </div>
      )}

      {certificate && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Certificate Preview Canvas */}
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-4 pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                {certificate.status === 'issued' ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                    <span>Authentic Issued Certificate</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-4 h-4 text-red-600" />
                    <span className="text-red-700">Revoked Certificate</span>
                  </>
                )}
              </div>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                {certificate.claimCode}
              </span>
            </div>

            <CertificatePreview certificate={certificate} template={template} showDownloads />
          </div>

          {/* Cryptographic Verification Ledger */}
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex items-center gap-2.5 pb-4 border-b border-slate-200">
              <ShieldCheck className="w-5 h-5 text-emerald-700" />
              <h2 className="text-base font-bold text-slate-900">Verification Dossier</h2>
            </div>

            <dl className="space-y-3.5 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Recipient</dt>
                <dd className="font-semibold text-slate-900 mt-0.5">{certificate.fullName}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Institution</dt>
                <dd className="text-slate-800 mt-0.5">{certificate.institution}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Role</dt>
                <dd className="font-medium text-emerald-800 mt-0.5">{certificate.role}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Event</dt>
                <dd className="text-slate-800 mt-0.5">{certificate.eventName}</dd>
              </div>
              {certificate.paperTitle && (
                <div>
                  <dt className="text-xs text-slate-500">Presented Paper</dt>
                  <dd className="text-slate-800 mt-0.5 italic">
                    {certificate.paperCode ? `[${certificate.paperCode}] ` : ''}
                    {certificate.paperTitle}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-slate-500">Organizer &amp; Date</dt>
                <dd className="text-slate-700 mt-0.5">
                  {certificate.organizer} · {certificate.eventDate}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Official Signatory</dt>
                <dd className="text-slate-800 mt-0.5">
                  {certificate.signatoryName}
                  <span className="block text-xs text-slate-500">{certificate.signatoryTitle}</span>
                </dd>
              </div>
              <div className="pt-3 border-t border-slate-200">
                <dt className="text-xs text-slate-500">SHA-256 Digest</dt>
                <dd className="font-mono text-[11px] text-slate-700 break-all mt-1 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  {certificate.verificationHash}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Privacy Isolation</dt>
                <dd className="text-xs text-slate-600 mt-0.5">
                  Public verification records exclude email addresses, phone numbers, and GPS
                  check-in metadata.
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      {!searched && !certificate && (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <Award className="w-10 h-10 text-emerald-700 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900">Ready to Verify Any Certificate</h2>
          <p className="text-sm text-slate-600 max-w-lg mx-auto">
            Try entering a claim code from an attendee receipt (such as{' '}
            <button
              type="button"
              onClick={() => {
                setQueryCode('UIN26-7K4M-9P2Q');
                void runLookup('UIN26-7K4M-9P2Q');
              }}
              className="font-mono font-semibold text-emerald-700 underline hover:text-emerald-800"
            >
              UIN26-7K4M-9P2Q
            </button>{' '}
            after initializing the sample conference) to preview and download the PDF certificate.
          </p>
        </div>
      )}
    </div>
  );
}
