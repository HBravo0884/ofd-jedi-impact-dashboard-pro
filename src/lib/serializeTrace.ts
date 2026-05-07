// Safely serialize a signature_pad trace to a JSON string that fits under a
// size budget AND remains valid JSON.
//
// The previous approach was JSON.stringify(trace).slice(0, 5000) which is
// the SOURCE of the 'No baseline samples on file' bug — slicing in the
// middle of a JSON string corrupts every trace > 5KB and JSON.parse fails
// silently, leaving the appearance of an empty baseline.
//
// New approach: if the JSON exceeds the byte budget, we DOWN-SAMPLE the
// points within each stroke (drop every other point, recursively until it
// fits) and re-serialize. This produces valid, slightly-coarser JSON that
// still parses correctly and renders fine.

const DEFAULT_MAX_BYTES = 12000; // generous; Postgres TEXT/array entries handle this trivially

function downsampleStroke(stroke: any): any {
  if (!stroke || !Array.isArray(stroke.points) || stroke.points.length <= 4) {
    return stroke;
  }
  const kept: any[] = [];
  for (let i = 0; i < stroke.points.length; i++) {
    // Always keep first and last; drop every other middle point.
    if (i === 0 || i === stroke.points.length - 1 || i % 2 === 1) {
      kept.push(stroke.points[i]);
    }
  }
  return { ...stroke, points: kept };
}

function downsampleTrace(trace: any[]): any[] {
  return Array.isArray(trace) ? trace.map(downsampleStroke) : trace;
}

export function serializeTrace(
  trace: any,
  maxBytes: number = DEFAULT_MAX_BYTES
): string {
  let current = trace;
  for (let pass = 0; pass < 6; pass++) {
    const json = JSON.stringify(current);
    // Byte length, not char length, since signature_pad output is ASCII-ish
    // but we want to be safe.
    if (Buffer.byteLength(json, 'utf8') <= maxBytes) return json;
    current = downsampleTrace(current);
  }
  // After 6 down-sampling passes the trace should be tiny; if not, accept
  // whatever we have. ALWAYS return valid JSON.
  return JSON.stringify(current);
}
