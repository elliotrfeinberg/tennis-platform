// NTRP calibration.
//
// USTA publishes year-end NTRP levels (3.0, 3.5, 4.0, 4.5, 5.0) for every
// player who completed enough matches. We treat those as labels and fit a
// linear map from Glicko rating to NTRP scale. With a few thousand labels
// per year, ordinary least squares is sufficient; we can swap to isotonic
// regression later if the relationship turns out to be non-linear at the
// extremes (it does at the tails — 2.5 and 5.5+).
//
// In production this is fit once nightly from the most recent year-end data
// snapshot. Stored as just (slope, intercept) in the db.

export interface NtrpCalibration {
  slope: number;
  intercept: number;
  fittedAt: string; // ISO timestamp
  sampleSize: number;
  rmse: number;
}

export interface NtrpLabel {
  glickoRating: number;
  ntrpLevel: number; // 3.0, 3.5, ...
}

export function fitCalibration(labels: readonly NtrpLabel[]): NtrpCalibration {
  if (labels.length < 10) {
    throw new Error(
      `Need at least 10 labeled players to fit calibration, got ${labels.length}`
    );
  }
  const n = labels.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const { glickoRating, ntrpLevel } of labels) {
    sumX += glickoRating;
    sumY += ntrpLevel;
    sumXY += glickoRating * ntrpLevel;
    sumXX += glickoRating * glickoRating;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) throw new Error("Degenerate calibration input");
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  let sse = 0;
  for (const { glickoRating, ntrpLevel } of labels) {
    const pred = slope * glickoRating + intercept;
    sse += (pred - ntrpLevel) ** 2;
  }
  return {
    slope,
    intercept,
    fittedAt: new Date().toISOString(),
    sampleSize: n,
    rmse: Math.sqrt(sse / n),
  };
}

export function glickoToNtrp(
  glicko: number,
  calibration: NtrpCalibration
): number {
  return calibration.slope * glicko + calibration.intercept;
}

// Round to the nearest published NTRP level (half-point increments). Used
// for "would this player get bumped" predictions; the bump threshold is
// asymmetric — USTA doesn't bump up exactly at .25, there's a buffer — so
// `bumpHysteresis` reflects that.
export function predictLevel(
  ntrp: number,
  currentLevel: number,
  bumpHysteresis = 0.1
): number {
  const up = currentLevel + 0.5;
  const down = currentLevel - 0.5;
  if (ntrp >= up - bumpHysteresis) return up;
  if (ntrp <= down + bumpHysteresis) return down;
  return currentLevel;
}
