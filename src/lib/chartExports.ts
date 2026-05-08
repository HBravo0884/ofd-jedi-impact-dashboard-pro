/**
 * Browser-side helpers to download a Chart.js chart as a PNG image
 * or its underlying data as CSV. Used by ChartCard.
 *
 * Both helpers are safe no-ops when called server-side.
 */

/** Trigger a PNG download from a chart canvas. */
export function downloadChartPNG(
  canvas: HTMLCanvasElement | null,
  filename: string,
): void {
  if (typeof window === 'undefined' || !canvas) return;
  const safeName = sanitizeFilename(filename) || 'chart';
  // Composite onto a white background so the PNG isn't transparent on dark
  // screens / print previews.
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
  const url = out.toDataURL('image/png');
  triggerDownload(url, `${safeName}.png`);
}

/** Trigger a CSV download from an array of plain row objects. */
export function downloadCSV(
  rows: Array<Record<string, string | number | null | undefined>>,
  filename: string,
): void {
  if (typeof window === 'undefined') return;
  if (!rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: string | number | null | undefined): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(',')),
  ];
  const blob = new Blob([lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const safeName = sanitizeFilename(filename) || 'chart';
  triggerDownload(url, `${safeName}.csv`);
  // Defer revoke to the next tick so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function triggerDownload(href: string, filename: string): void {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
