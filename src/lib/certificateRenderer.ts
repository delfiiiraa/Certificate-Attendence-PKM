import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import {
  DEFAULT_TEMPLATE_FIELDS,
  SCHEMA_LIMITS,
  type CertificateAspectRatio,
  type CertificateRecord,
  type CertificateTemplateFields,
  type CertificateTemplateRecord,
} from '../types';
import { buildVerifyUrl } from './crypto';

export const DEFAULT_TEMPLATE_IMAGE_URL =
  '/src/assets/images/default_certificate_frame_1795513727548.jpg';

export function getCanvasDimensions(aspectRatio: CertificateAspectRatio): {
  width: number;
  height: number;
} {
  switch (aspectRatio) {
    case '16:9':
      return { width: 1600, height: 900 };
    case 'A4':
      return { width: 1600, height: 1131 };
    case '4:3':
    default:
      return { width: 1600, height: 1200 };
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

function resolveFontFamily(family: 'serif' | 'sans' | 'mono'): string {
  switch (family) {
    case 'serif':
      return '"Cormorant Garamond", Georgia, serif';
    case 'mono':
      return '"JetBrains Mono", ui-monospace, monospace';
    case 'sans':
    default:
      return '"Plus Jakarta Sans", "Public Sans", system-ui, sans-serif';
  }
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 2
): number {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length >= maxLines - 1) break;
    }
  }
  if (current) lines.push(current);

  const clampedLines = lines.slice(0, maxLines);
  const startY = y - ((clampedLines.length - 1) * lineHeight) / 2;
  clampedLines.forEach((line, idx) => {
    ctx.fillText(line, x, startY + idx * lineHeight);
  });
  return clampedLines.length;
}

export async function renderCertificateToCanvas(
  canvas: HTMLCanvasElement,
  cert: Pick<
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
  >,
  template?: Pick<CertificateTemplateRecord, 'imageDataUrl' | 'aspectRatio' | 'fields'> | null
): Promise<void> {
  const aspectRatio = template?.aspectRatio ?? '4:3';
  const fields: CertificateTemplateFields = template?.fields
    ? { ...DEFAULT_TEMPLATE_FIELDS, ...template.fields }
    : DEFAULT_TEMPLATE_FIELDS;

  const { width, height } = getCanvasDimensions(aspectRatio);
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Base archival parchment fallback
  ctx.fillStyle = '#faf8f3';
  ctx.fillRect(0, 0, width, height);

  const usingCustom = Boolean(template?.imageDataUrl && template.imageDataUrl.length > 20);
  const bgSrc = usingCustom ? template!.imageDataUrl : DEFAULT_TEMPLATE_IMAGE_URL;

  try {
    const bgImg = await loadImage(bgSrc);
    if (usingCustom) {
      ctx.drawImage(bgImg, 0, 0, width, height);
    } else {
      // Crop outer 4.5% of generated frame artwork so only the ivory paper + guilloche frame fills the canvas
      const cropX = bgImg.width * 0.045;
      const cropY = bgImg.height * 0.04;
      const cropW = bgImg.width * 0.91;
      const cropH = bgImg.height * 0.92;
      ctx.drawImage(bgImg, cropX, cropY, cropW, cropH, 0, 0, width, height);
    }
  } catch {
    // Crisp vector fallback frame if image cannot load
    ctx.strokeStyle = '#065f46';
    ctx.lineWidth = 8;
    ctx.strokeRect(42, 42, width - 84, height - 84);
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 2;
    ctx.strokeRect(58, 58, width - 116, height - 116);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 1. Organizer line
  if (fields.organizer.enabled && cert.organizer) {
    ctx.fillStyle = fields.organizer.color;
    ctx.font = `${fields.organizer.fontWeight} ${fields.organizer.fontSize}px ${resolveFontFamily(
      fields.organizer.fontFamily
    )}`;
    ctx.fillText(
      cert.organizer.toUpperCase(),
      (fields.organizer.x / 100) * width,
      (fields.organizer.y / 100) * height
    );
  }

  // 2. Main Heading
  if (fields.heading.enabled) {
    ctx.fillStyle = fields.heading.color;
    ctx.font = `${fields.heading.fontWeight} ${fields.heading.fontSize}px ${resolveFontFamily(
      fields.heading.fontFamily
    )}`;
    ctx.fillText(
      'CERTIFICATE OF APPRECIATION',
      (fields.heading.x / 100) * width,
      (fields.heading.y / 100) * height
    );

    // Subtle ceremonial rule + presentation cue
    const ruleY = (fields.heading.y / 100) * height + fields.heading.fontSize * 0.85;
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(width * 0.38, ruleY);
    ctx.lineTo(width * 0.62, ruleY);
    ctx.stroke();

    ctx.fillStyle = '#475569';
    ctx.font = `500 20px ${resolveFontFamily('sans')}`;
    ctx.fillText('THIS CERTIFICATE IS PROUDLY PRESENTED TO', width / 2, ruleY + 42);
  }

  // 3. Recipient Full Name
  if (fields.fullName.enabled && cert.fullName) {
    ctx.fillStyle = fields.fullName.color;
    ctx.font = `${fields.fullName.fontWeight} ${fields.fullName.fontSize}px ${resolveFontFamily(
      fields.fullName.fontFamily
    )}`;
    drawWrappedText(
      ctx,
      cert.fullName,
      (fields.fullName.x / 100) * width,
      (fields.fullName.y / 100) * height,
      width * 0.72,
      fields.fullName.fontSize * 1.15,
      2
    );
  }

  // 4. Institution
  if (fields.institution.enabled && cert.institution) {
    ctx.fillStyle = fields.institution.color;
    ctx.font = `${fields.institution.fontWeight} ${fields.institution.fontSize}px ${resolveFontFamily(
      fields.institution.fontFamily
    )}`;
    ctx.fillText(
      cert.institution,
      (fields.institution.x / 100) * width,
      (fields.institution.y / 100) * height
    );
  }

  // 5. Role line
  if (fields.roleLine.enabled && cert.role) {
    ctx.fillStyle = fields.roleLine.color;
    ctx.font = `${fields.roleLine.fontWeight} ${fields.roleLine.fontSize}px ${resolveFontFamily(
      fields.roleLine.fontFamily
    )}`;
    ctx.fillText(
      `In recognition of active contribution as ${cert.role.toUpperCase()}`,
      (fields.roleLine.x / 100) * width,
      (fields.roleLine.y / 100) * height
    );
  }

  // 6. Event Name
  if (fields.eventName.enabled && cert.eventName) {
    ctx.fillStyle = fields.eventName.color;
    ctx.font = `${fields.eventName.fontWeight} ${fields.eventName.fontSize}px ${resolveFontFamily(
      fields.eventName.fontFamily
    )}`;
    drawWrappedText(
      ctx,
      cert.eventName,
      (fields.eventName.x / 100) * width,
      (fields.eventName.y / 100) * height,
      width * 0.74,
      fields.eventName.fontSize * 1.25,
      2
    );
  }

  // 7. Presenter Paper Title (optional)
  if (fields.paperTitle.enabled && cert.paperTitle) {
    const label = cert.paperCode
      ? `Paper [${cert.paperCode}]: “${cert.paperTitle}”`
      : `Paper: “${cert.paperTitle}”`;
    ctx.fillStyle = fields.paperTitle.color;
    ctx.font = `italic ${fields.paperTitle.fontWeight} ${fields.paperTitle.fontSize}px ${resolveFontFamily(
      fields.paperTitle.fontFamily
    )}`;
    drawWrappedText(
      ctx,
      label,
      (fields.paperTitle.x / 100) * width,
      (fields.paperTitle.y / 100) * height,
      width * 0.72,
      fields.paperTitle.fontSize * 1.3,
      2
    );
  }

  // 8. Event Date
  if (fields.eventDate.enabled && cert.eventDate) {
    ctx.fillStyle = fields.eventDate.color;
    ctx.font = `${fields.eventDate.fontWeight} ${fields.eventDate.fontSize}px ${resolveFontFamily(
      fields.eventDate.fontFamily
    )}`;
    ctx.fillText(
      cert.eventDate,
      (fields.eventDate.x / 100) * width,
      (fields.eventDate.y / 100) * height
    );
  }

  // 9. Official Signatory Block
  if (fields.signatory.enabled && cert.signatoryName) {
    const sx = (fields.signatory.x / 100) * width;
    const sy = (fields.signatory.y / 100) * height;
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx - 150, sy - 22);
    ctx.lineTo(sx + 150, sy - 22);
    ctx.stroke();

    ctx.fillStyle = fields.signatory.color;
    ctx.font = `${fields.signatory.fontWeight} ${fields.signatory.fontSize}px ${resolveFontFamily(
      fields.signatory.fontFamily
    )}`;
    ctx.fillText(cert.signatoryName, sx, sy);

    if (cert.signatoryTitle) {
      ctx.fillStyle = '#475569';
      ctx.font = `400 ${Math.max(14, fields.signatory.fontSize - 5)}px ${resolveFontFamily('sans')}`;
      ctx.fillText(cert.signatoryTitle, sx, sy + 28);
    }
  }

  // 10. Cryptographic QR Verification Code
  if (fields.qrCode.enabled && cert.claimCode) {
    try {
      const verifyUrl = buildVerifyUrl(cert.claimCode);
      const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
        width: fields.qrCode.size,
        margin: 1,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      });
      const qrImg = await loadImage(qrDataUrl);
      const qx = (fields.qrCode.x / 100) * width - fields.qrCode.size / 2;
      const qy = (fields.qrCode.y / 100) * height - fields.qrCode.size / 2;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(qx - 6, qy - 6, fields.qrCode.size + 12, fields.qrCode.size + 12);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(qx - 6, qy - 6, fields.qrCode.size + 12, fields.qrCode.size + 12);
      ctx.drawImage(qrImg, qx, qy, fields.qrCode.size, fields.qrCode.size);
    } catch {
      // Skip QR if generation fails
    }
  }

  // 11. Claim Code & Hash Footer
  if (fields.claimCode.enabled && cert.claimCode) {
    ctx.fillStyle = fields.claimCode.color;
    ctx.font = `${fields.claimCode.fontWeight} ${fields.claimCode.fontSize}px ${resolveFontFamily(
      fields.claimCode.fontFamily
    )}`;
    ctx.fillText(
      `ID: ${cert.claimCode}`,
      (fields.claimCode.x / 100) * width,
      (fields.claimCode.y / 100) * height
    );
  }
}

export function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string): void {
  const link = document.createElement('a');
  link.download = `${filename}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

export function downloadCanvasAsPdf(canvas: HTMLCanvasElement, filename: string): void {
  const imgData = canvas.toDataURL('image/jpeg', 0.94);
  const orientation = canvas.width >= canvas.height ? 'landscape' : 'portrait';
  const pdf = new jsPDF({
    orientation,
    unit: 'px',
    format: [canvas.width, canvas.height],
  });
  pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
  pdf.save(`${filename}.pdf`);
}

/**
 * Compresses an uploaded certificate template image cleanly so it always stays safely
 * below Firestore's 1MB document limit (max 650KB encoded data URL).
 */
export async function compressTemplateImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read uploaded template file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Uploaded file is not a valid image (PNG, JPG, or WebP).'));
      img.onload = () => {
        const maxWidth = 1600;
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable.'));
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        let quality = 0.84;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > SCHEMA_LIMITS.TEMPLATE_IMAGE_MAX - 20000 && quality > 0.35) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        if (dataUrl.length > SCHEMA_LIMITS.TEMPLATE_IMAGE_MAX) {
          reject(new Error('Template image is too large even after compression. Please use a smaller image.'));
          return;
        }
        resolve(dataUrl);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function compressWebcamSnapshot(video: HTMLVideoElement): string {
  const canvas = document.createElement('canvas');
  const targetWidth = 320;
  const ratio = video.videoHeight ? video.videoHeight / video.videoWidth : 0.75;
  canvas.width = targetWidth;
  canvas.height = Math.round(targetWidth * ratio);
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
  return dataUrl.length <= SCHEMA_LIMITS.THUMBNAIL_MAX ? dataUrl : '';
}
