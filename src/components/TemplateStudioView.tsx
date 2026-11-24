import React, { useState } from 'react';
import { Check, ImagePlus, RotateCcw, Save, SlidersHorizontal, Trash2 } from 'lucide-react';
import {
  DEFAULT_TEMPLATE_FIELDS,
  SCHEMA_LIMITS,
  type CertificateAspectRatio,
  type CertificateTemplateFields,
  type CertificateTemplateRecord,
  type FieldLayoutConfig,
} from '../types';
import { compressTemplateImage } from '../lib/certificateRenderer';
import { saveCertificateTemplate } from '../lib/firestoreService';
import { CertificatePreview } from './CertificatePreview';

interface TemplateStudioViewProps {
  adminUid: string;
  templates: CertificateTemplateRecord[];
  onTemplateSaved?: (templateId: string) => void;
}

type EditableTextFieldKey = Exclude<keyof CertificateTemplateFields, 'qrCode'>;

const TEXT_FIELD_LABELS: Record<EditableTextFieldKey, string> = {
  organizer: 'Organizer Header',
  heading: 'Certificate Title',
  fullName: 'Participant Full Name',
  institution: 'Institution / Affiliation',
  roleLine: 'Participation Role',
  eventName: 'Event Title',
  paperTitle: 'Paper Title (Presenters)',
  eventDate: 'Event Date',
  signatory: 'Official Signatory',
  claimCode: 'Claim Code Label',
};

const SAMPLE_PREVIEW_CERT = {
  claimCode: 'UIN26-7K4M-9P2Q',
  eventName: 'International Conference on Islamic Studies & Digital Innovation 2026',
  eventDate: 'November 24–25, 2026',
  organizer: 'UIN Syarif Hidayatullah Jakarta',
  fullName: 'Dr. Siti Rahmawati, M.Ag.',
  institution: 'Faculty of Ushuluddin, UIN Syarif Hidayatullah Jakarta',
  role: 'Presenter' as const,
  paperCode: 'ICIS-104',
  paperTitle: 'Digital Manuscript Preservation and Cryptographic Provenance in Southeast Asia',
  signatoryName: 'Prof. Asep Saepudin Jahar, M.A., Ph.D.',
  signatoryTitle: 'Rector, UIN Syarif Hidayatullah Jakarta',
  verificationHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
};

export function TemplateStudioView({
  adminUid,
  templates,
  onTemplateSaved,
}: TemplateStudioViewProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [name, setName] = useState('Custom Institutional Certificate Template');
  const [description, setDescription] = useState(
    'Upload your official blank certificate artwork (PNG/JPG) and align dynamic participant fields.'
  );
  const [aspectRatio, setAspectRatio] = useState<CertificateAspectRatio>('4:3');
  const [imageDataUrl, setImageDataUrl] = useState<string>('');
  const [fields, setFields] = useState<CertificateTemplateFields>(DEFAULT_TEMPLATE_FIELDS);
  const [isDefault, setIsDefault] = useState(false);

  const [activeField, setActiveField] = useState<EditableTextFieldKey | 'qrCode'>('fullName');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const loadTemplateIntoEditor = (tpl: CertificateTemplateRecord) => {
    setSelectedTemplateId(tpl.id);
    setName(tpl.name);
    setDescription(tpl.description);
    setAspectRatio(tpl.aspectRatio);
    setImageDataUrl(tpl.imageDataUrl);
    setFields({ ...DEFAULT_TEMPLATE_FIELDS, ...tpl.fields });
    setIsDefault(tpl.isDefault);
    setStatusMessage('');
    setErrorMessage('');
  };

  const resetToNewTemplate = () => {
    setSelectedTemplateId('');
    setName('New Uploaded Certificate Template');
    setDescription('Custom event certificate artwork with dynamic text overlay.');
    setAspectRatio('4:3');
    setImageDataUrl('');
    setFields(DEFAULT_TEMPLATE_FIELDS);
    setIsDefault(false);
    setStatusMessage('');
    setErrorMessage('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMessage('');
    setStatusMessage('');
    setUploading(true);
    try {
      const compressed = await compressTemplateImage(file);
      setImageDataUrl(compressed);
      setStatusMessage(
        `Loaded "${file.name}" (${Math.round(compressed.length / 1024)} KB optimized for Firestore).`
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to process template image.');
    } finally {
      setUploading(false);
    }
  };

  const updateTextField = (
    key: EditableTextFieldKey,
    patch: Partial<FieldLayoutConfig>
  ) => {
    setFields((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));
  };

  const handleSave = async () => {
    setErrorMessage('');
    setStatusMessage('');
    if (name.trim().length < 2) {
      setErrorMessage('Please enter a template name.');
      return;
    }
    setSaving(true);
    try {
      const savedId = await saveCertificateTemplate({
        templateId: selectedTemplateId || undefined,
        ownerId: adminUid,
        name,
        description,
        imageDataUrl,
        aspectRatio,
        fields,
        isDefault,
      });
      setSelectedTemplateId(savedId);
      setStatusMessage('Certificate template saved to Firestore. Assign it to any event under Events.');
      onTemplateSaved?.(savedId);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save certificate template.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Certificate Template Studio</h2>
          <p className="text-sm text-slate-600">
            Upload your custom blank certificate artwork anytime and position dynamic participant
            data and QR verification codes with live preview.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={resetToNewTemplate}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
          >
            New Template
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 rounded-lg transition-colors whitespace-nowrap"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : selectedTemplateId ? 'Update Template' : 'Save Template'}
          </button>
        </div>
      </div>

      {/* Existing Templates Strip */}
      {templates.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 mr-2">Saved Templates:</span>
          {templates.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => loadTemplateIntoEditor(tpl)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                selectedTemplateId === tpl.id
                  ? 'bg-emerald-50 border-emerald-600 text-emerald-900'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {tpl.name}
              {tpl.isDefault ? ' · Default' : ''}
            </button>
          ))}
        </div>
      )}

      {statusMessage && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-900 flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-800">
          {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Upload & Field Positioning Controls */}
        <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          {/* Template Metadata & Upload */}
          <div className="space-y-4 pb-5 border-b border-slate-200">
            <div>
              <label
                htmlFor="tpl-name"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Template Name
              </label>
              <input
                id="tpl-name"
                type="text"
                maxLength={SCHEMA_LIMITS.NAME_MAX}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="tpl-ratio"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Print Aspect Ratio
                </label>
                <select
                  id="tpl-ratio"
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value as CertificateAspectRatio)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  <option value="4:3">4:3 Standard</option>
                  <option value="A4">A4 Landscape</option>
                  <option value="16:9">16:9 Widescreen</option>
                </select>
              </div>
              <div className="flex items-end pb-1">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                  />
                  Set as Default Template
                </label>
              </div>
            </div>

            {/* File Uploader */}
            <div className="space-y-2">
              <span className="block text-xs font-semibold text-slate-700">
                Background Artwork (PNG / JPG / WebP)
              </span>
              <div className="flex items-center gap-2">
                <label className="flex-1 cursor-pointer inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors">
                  <ImagePlus className="w-4 h-4" />
                  <span>{uploading ? 'Optimizing Image...' : 'Upload Custom Certificate Background'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
                {imageDataUrl && (
                  <button
                    type="button"
                    onClick={() => setImageDataUrl('')}
                    title="Revert to built-in archival frame"
                    className="p-2.5 text-slate-600 hover:text-red-700 bg-slate-100 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                {imageDataUrl
                  ? 'Custom artwork active. Automatically compressed for reliable Firestore storage.'
                  : 'Currently using built-in UIN archival ivory frame. Upload your official graphic anytime.'}
              </p>
            </div>
          </div>

          {/* Visual Coordinate & Typography Inspector */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                <SlidersHorizontal className="w-4 h-4 text-emerald-700" />
                <span>Dynamic Placeholder Positioning</span>
              </div>
              <button
                type="button"
                onClick={() => setFields(DEFAULT_TEMPLATE_FIELDS)}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Layout
              </button>
            </div>

            <div>
              <label
                htmlFor="field-select"
                className="block text-xs font-medium text-slate-600 mb-1.5"
              >
                Select Field to Adjust
              </label>
              <select
                id="field-select"
                value={activeField}
                onChange={(e) =>
                  setActiveField(e.target.value as EditableTextFieldKey | 'qrCode')
                }
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
              >
                {(Object.keys(TEXT_FIELD_LABELS) as EditableTextFieldKey[]).map((key) => (
                  <option key={key} value={key}>
                    {TEXT_FIELD_LABELS[key]}
                  </option>
                ))}
                <option value="qrCode">Verification QR Code</option>
              </select>
            </div>

            {activeField === 'qrCode' ? (
              <div className="space-y-3 pt-1">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={fields.qrCode.enabled}
                    onChange={(e) =>
                      setFields((p) => ({
                        ...p,
                        qrCode: { ...p.qrCode, enabled: e.target.checked },
                      }))
                    }
                    className="rounded border-slate-300 text-emerald-700"
                  />
                  Show Verification QR Code
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      X Pos ({fields.qrCode.x}%)
                    </label>
                    <input
                      type="range"
                      min={10}
                      max={90}
                      value={fields.qrCode.x}
                      onChange={(e) =>
                        setFields((p) => ({
                          ...p,
                          qrCode: { ...p.qrCode, x: Number(e.target.value) },
                        }))
                      }
                      className="w-full accent-emerald-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Y Pos ({fields.qrCode.y}%)
                    </label>
                    <input
                      type="range"
                      min={10}
                      max={92}
                      value={fields.qrCode.y}
                      onChange={(e) =>
                        setFields((p) => ({
                          ...p,
                          qrCode: { ...p.qrCode, y: Number(e.target.value) },
                        }))
                      }
                      className="w-full accent-emerald-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Size ({fields.qrCode.size}px)
                    </label>
                    <input
                      type="range"
                      min={80}
                      max={220}
                      value={fields.qrCode.size}
                      onChange={(e) =>
                        setFields((p) => ({
                          ...p,
                          qrCode: { ...p.qrCode, size: Number(e.target.value) },
                        }))
                      }
                      className="w-full accent-emerald-700"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={fields[activeField].enabled}
                    onChange={(e) => updateTextField(activeField, { enabled: e.target.checked })}
                    className="rounded border-slate-300 text-emerald-700"
                  />
                  Render {TEXT_FIELD_LABELS[activeField]}
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Horizontal X ({fields[activeField].x}%)
                    </label>
                    <input
                      type="range"
                      min={10}
                      max={90}
                      value={fields[activeField].x}
                      onChange={(e) =>
                        updateTextField(activeField, { x: Number(e.target.value) })
                      }
                      className="w-full accent-emerald-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Vertical Y ({fields[activeField].y}%)
                    </label>
                    <input
                      type="range"
                      min={8}
                      max={94}
                      value={fields[activeField].y}
                      onChange={(e) =>
                        updateTextField(activeField, { y: Number(e.target.value) })
                      }
                      className="w-full accent-emerald-700"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Size ({fields[activeField].fontSize}px)
                    </label>
                    <input
                      type="range"
                      min={14}
                      max={84}
                      value={fields[activeField].fontSize}
                      onChange={(e) =>
                        updateTextField(activeField, { fontSize: Number(e.target.value) })
                      }
                      className="w-full accent-emerald-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Typeface
                    </label>
                    <select
                      value={fields[activeField].fontFamily}
                      onChange={(e) =>
                        updateTextField(activeField, {
                          fontFamily: e.target.value as 'serif' | 'sans' | 'mono',
                        })
                      }
                      className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                    >
                      <option value="serif">Ceremonial Serif</option>
                      <option value="sans">Modern Sans</option>
                      <option value="mono">Monospace</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Color
                    </label>
                    <input
                      type="color"
                      value={fields[activeField].color}
                      onChange={(e) => updateTextField(activeField, { color: e.target.value })}
                      className="w-full h-8 p-0.5 bg-white border border-slate-300 rounded-md cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Live High-Res Preview Canvas */}
        <div className="xl:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <span className="text-sm font-bold text-slate-900">Live Template Preview</span>
            <span className="text-xs text-slate-500 tabular-nums">
              {aspectRatio} · Sample Attendee Data
            </span>
          </div>
          <CertificatePreview
            certificate={SAMPLE_PREVIEW_CERT}
            template={{ imageDataUrl, aspectRatio, fields }}
            showDownloads
          />
        </div>
      </div>
    </div>
  );
}
