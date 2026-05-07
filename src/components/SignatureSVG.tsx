import React from 'react';

// Shared signature renderer — used by the printable sign-in sheet and the
// verification audit report. Takes a raw signature_pad trace (the JSON
// shape stored in Faculty.signatureUrls / AuditAttempt.perSample.trace),
// renders it as an inline SVG with quadratic-bezier midpoint smoothing
// for ink-like quality. Server-renderable (no useEffect, no refs).

export function pickLatestTrace(urls: string[] | null | undefined): any[] | null {
  if (!Array.isArray(urls) || urls.length === 0) return null;
  for (let i = urls.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(urls[i]);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {}
  }
  return null;
}

export interface SignatureSVGProps {
  trace: any[] | null;
  width?: number;
  height?: number;
  /** Stroke width in viewBox units. 2.4 looks like real ink at 180×48. */
  strokeWidth?: number;
  /** Fallback when no trace — render a blank signature line. */
  showLine?: boolean;
  /** Inline style for outer SVG. */
  style?: React.CSSProperties;
  ariaLabel?: string;
}

export function SignatureSVG({
  trace,
  width = 180,
  height = 48,
  strokeWidth = 2.4,
  showLine = true,
  style,
  ariaLabel = 'Signature',
}: SignatureSVGProps) {
  if (!trace || trace.length === 0) {
    return showLine ? (
      <span style={{ display: 'inline-block', width, height, borderBottom: '1px solid #cbd5e1' }} />
    ) : null;
  }

  // Flatten all stroke points
  const allPoints: Array<{ x: number; y: number; stroke: number }> = [];
  trace.forEach((stroke: any, sIdx: number) => {
    const pts = Array.isArray(stroke?.points) ? stroke.points : [];
    for (const pt of pts) {
      const x = Number(pt?.x);
      const y = Number(pt?.y);
      if (Number.isFinite(x) && Number.isFinite(y)) allPoints.push({ x, y, stroke: sIdx });
    }
  });
  if (allPoints.length < 2) {
    return showLine ? (
      <span style={{ display: 'inline-block', width, height, borderBottom: '1px solid #cbd5e1' }} />
    ) : null;
  }

  // Bounding-box normalize → preserve aspect ratio inside viewBox.
  const xs = allPoints.map((p) => p.x);
  const ys = allPoints.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = Math.max(maxX - minX, 1);
  const h = Math.max(maxY - minY, 1);
  const pad = 2;
  const sx = (width - 2 * pad) / w;
  const sy = (height - 2 * pad) / h;
  const scale = Math.min(sx, sy);
  const offsetX = pad + (width - 2 * pad - w * scale) / 2;
  const offsetY = pad + (height - 2 * pad - h * scale) / 2;
  const nx = (x: number) => offsetX + (x - minX) * scale;
  const ny = (y: number) => offsetY + (y - minY) * scale;

  // Group by stroke
  const strokes: Array<Array<{ x: number; y: number }>> = [];
  let lastStroke = -1;
  for (const p of allPoints) {
    if (p.stroke !== lastStroke) {
      strokes.push([]);
      lastStroke = p.stroke;
    }
    strokes[strokes.length - 1].push({ x: nx(p.x), y: ny(p.y) });
  }

  // Build smoothed path strings (quadratic-bezier midpoint, like signature_pad)
  const paths: string[] = [];
  for (const stroke of strokes) {
    if (stroke.length < 2) {
      if (stroke.length === 1) {
        paths.push(`M ${stroke[0].x.toFixed(2)} ${stroke[0].y.toFixed(2)} L ${(stroke[0].x + 0.5).toFixed(2)} ${(stroke[0].y + 0.5).toFixed(2)}`);
      }
      continue;
    }
    if (stroke.length === 2) {
      paths.push(`M ${stroke[0].x.toFixed(2)} ${stroke[0].y.toFixed(2)} L ${stroke[1].x.toFixed(2)} ${stroke[1].y.toFixed(2)}`);
      continue;
    }
    const seg: string[] = [`M ${stroke[0].x.toFixed(2)} ${stroke[0].y.toFixed(2)}`];
    for (let i = 1; i < stroke.length - 1; i++) {
      const a = stroke[i];
      const b = stroke[i + 1];
      const mx = ((a.x + b.x) / 2).toFixed(2);
      const my = ((a.y + b.y) / 2).toFixed(2);
      seg.push(`Q ${a.x.toFixed(2)} ${a.y.toFixed(2)} ${mx} ${my}`);
    }
    const last = stroke[stroke.length - 1];
    seg.push(`L ${last.x.toFixed(2)} ${last.y.toFixed(2)}`);
    paths.push(seg.join(' '));
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={ariaLabel}
      style={{ display: 'block', color: '#0a1f22', ...(style || {}) }}
    >
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="#0a1f22"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
