import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, FileText } from 'lucide-react';
import type { CertificateRecord, CertificateTemplateRecord } from '../types';
import {
  downloadCanvasAsPdf,
  downloadCanvasAsPng,
  renderCertificateToCanvas,
} from '../lib/certificateRenderer';
import { buildVerifyUrl } from '../lib/crypto';

interface CertificatePreviewProps {
  certificate: Pick<
    CertificateRecord,
    | 'claimCode'
    | 'eventName'
    | 'eventDate'
    | 'organizer'
    | 'fullName'
    | 'institution'
    | 'role'
    | 'paperCode'
    | 'paperTitle'
    | 'signatoryName'
    | 'signatoryTitle'
    | 'verificationHash'
  >;
  template?: Pick<CertificateTemplateRecord, 'imageDataUrl' | 'aspectRatio' | 'fields'> | null;
  showDownloads?: boolean;
}

export function CertificatePreview({
  certificate,
  template,
  showDownloads = true,
}: CertificatePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rendering, setRendering] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    setRendering(true);
    const canvas = canvasRef.current;
    if (!canvas) return;

    renderCertificateToCanvas(canvas, certificate, template)
      .catch((err) => console.error('Certificate render failed:', err))
      .finally(() => {
        if (active) setRendering(false);
      });

    return () => {
      active = false;
    };
  }, [certificate, template]);

  const safeFilename = `Certificate-${certificate.claimCode || 'Preview'}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(buildVerifyUrl(certificate.claimCode));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative bg-slate-100 border border-slate-200 rounded-xl overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full h-auto block"
          aria-label={`Official certificate preview for ${certificate.fullName}`}
        />
        {rendering && (
          <div className="absolute inset-0 bg-white/75 flex items-center justify-center text-sm font-medium text-slate-600">
            Rendering high-resolution certificate...
          </div>
        )}
      </div>

      {showDownloads && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500 font-mono tabular-nums truncate max-w-md">
            SHA-256: {certificate.verificationHash.slice(0, 24)}…
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Link Copied' : 'Copy Verify Link'}
            </button>
            <button
              type="button"
              onClick={() => canvasRef.current && downloadCanvasAsPng(canvasRef.current, safeFilename)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Download PNG
            </button>
            <button
              type="button"
              onClick={() => canvasRef.current && downloadCanvasAsPdf(canvasRef.current, safeFilename)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <FileText className="w-3.5 h-3.5" />
              Download PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
