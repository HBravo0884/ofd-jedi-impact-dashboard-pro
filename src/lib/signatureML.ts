export interface Point {
  x: number;
  y: number;
}

// 1. Extract and flatten proprietary SignaturePad format
export function extractPath(trace: any[]): Point[] {
  if (!trace || trace.length === 0) return [];
  const points: Point[] = [];
  for (const stroke of trace) {
    if (stroke.points && Array.isArray(stroke.points)) {
      for (const pt of stroke.points) {
        points.push({ x: Number(pt.x), y: Number(pt.y) });
      }
    }
  }
  return points;
}

// 2. Normalize to 1x1 standard space
export function normalizePoints(points: Point[]): Point[] {
  if (!points || points.length === 0) return [];
  
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  
  let width = maxX - minX;
  let height = maxY - minY;
  
  if (width === 0) width = 1;
  if (height === 0) height = 1;
  
  return points.map(p => ({
    x: (p.x - minX) / width,
    y: (p.y - minY) / height
  }));
}

// 3. Resample curve to exact nodes (O(N) normalization)
export function resamplePoints(points: Point[], targetNodes: number = 50): Point[] {
  if (!points || points.length === 0) return [];
  
  const lengths: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    lengths.push(lengths[lengths.length - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  
  const totalLen = lengths[lengths.length - 1];
  if (totalLen === 0) {
    return Array(targetNodes).fill(points[0]);
  }
  
  const resampled: Point[] = [points[0]];
  const interval = totalLen / (targetNodes - 1);
  let targetDist = interval;
  
  for (let i = 1; i < points.length; i++) {
    while (lengths[i] >= targetDist) {
      const segmentLen = lengths[i] - lengths[i - 1];
      const ratio = segmentLen === 0 ? 0 : (targetDist - lengths[i - 1]) / segmentLen;
      
      const nx = points[i - 1].x + ratio * (points[i].x - points[i - 1].x);
      const ny = points[i - 1].y + ratio * (points[i].y - points[i - 1].y);
      resampled.push({ x: nx, y: ny });
      targetDist += interval;
      
      if (resampled.length === targetNodes) break;
    }
  }
  
  while (resampled.length < targetNodes) {
    resampled.push(points[points.length - 1]);
  }
  return resampled;
}

// 4. Dynamic Time Warping (Euclidean Mapping)
export function dynamicTimeWarping(seq1: Point[], seq2: Point[]): number {
  const n = seq1.length, m = seq2.length;
  if (n === 0 || m === 0) return Infinity;
  
  const dtwMatrix: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(Infinity));
  dtwMatrix[0][0] = 0;
  
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const dx = seq1[i - 1].x - seq2[j - 1].x;
      const dy = seq1[i - 1].y - seq2[j - 1].y;
      const cost = Math.sqrt(dx * dx + dy * dy);
      
      dtwMatrix[i][j] = cost + Math.min(
        dtwMatrix[i - 1][j],     // insertion
        dtwMatrix[i][j - 1],     // deletion
        dtwMatrix[i - 1][j - 1]  // match
      );
    }
  }
  return dtwMatrix[n][m];
}

// 5. Calculate final confidence
export function calculateConfidence(dtwCost: number, numNodes: number = 50): number {
  const maxAcceptableDistortion = numNodes * 0.4;
  if (dtwCost >= maxAcceptableDistortion) return 0.0;
  
  const matchPercentage = 100 * (1 - (dtwCost / maxAcceptableDistortion));
  return Math.max(0.0, Number(matchPercentage.toFixed(1)));
}
