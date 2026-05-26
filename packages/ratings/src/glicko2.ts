// Glicko-2 implementation following Glickman (2012).
// http://www.glicko.net/glicko/glicko2.pdf
//
// We use the standard Glicko-2 internals (μ, φ, σ in Glicko-2 scale) but
// expose the more familiar (rating, RD, vol) on the public API. Conversion
// is rating = 173.7178 * μ + 1500; same for φ -> RD.

export interface Rating {
  rating: number; // Glicko-1 scale, e.g. ~1500 for a new player
  rd: number; // rating deviation
  vol: number; // volatility
}

export interface Glicko2Config {
  tau: number; // system constant; reasonable values 0.3 - 1.2
  ratingScale: number; // 173.7178 per Glickman
  defaultRating: number;
  defaultRd: number;
  defaultVol: number;
  convergenceTolerance: number;
}

export const DEFAULT_CONFIG: Glicko2Config = {
  tau: 0.5,
  ratingScale: 173.7178,
  defaultRating: 1500,
  defaultRd: 350,
  defaultVol: 0.06,
  convergenceTolerance: 1e-6,
};

export function newRating(cfg: Partial<Glicko2Config> = {}): Rating {
  const c = { ...DEFAULT_CONFIG, ...cfg };
  return { rating: c.defaultRating, rd: c.defaultRd, vol: c.defaultVol };
}

// One "outcome" against a single opponent. score is in [0, 1] (1 = win,
// 0 = loss, 0.5 = tie). weight lets us up- or down-weight an outcome (e.g.,
// for a single set vs. a full match) without changing Glicko's internal math.
export interface Outcome {
  opponent: Rating;
  score: number;
  weight?: number;
}

function toGlicko2(r: Rating, scale: number): { mu: number; phi: number } {
  return { mu: (r.rating - 1500) / scale, phi: r.rd / scale };
}

function fromGlicko2(
  mu: number,
  phi: number,
  vol: number,
  scale: number
): Rating {
  return { rating: mu * scale + 1500, rd: phi * scale, vol };
}

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function E(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

// Illinois method for finding the volatility root. Per Glickman section 5.4.
function newVolatility(
  sigma: number,
  phi: number,
  v: number,
  delta: number,
  tau: number,
  tol: number
): number {
  const a = Math.log(sigma * sigma);
  const f = (x: number) => {
    const ex = Math.exp(x);
    const num = ex * (delta * delta - phi * phi - v - ex);
    const den = 2 * Math.pow(phi * phi + v + ex, 2);
    return num / den - (x - a) / (tau * tau);
  };

  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) k += 1;
    B = a - k * tau;
  }

  let fA = f(A);
  let fB = f(B);
  let iterations = 0;
  while (Math.abs(B - A) > tol && iterations < 100) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
    iterations += 1;
  }
  return Math.exp(A / 2);
}

export function updateRating(
  player: Rating,
  outcomes: readonly Outcome[],
  config: Partial<Glicko2Config> = {}
): Rating {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Inactive period: RD increases, rating unchanged.
  if (outcomes.length === 0) {
    const { mu, phi } = toGlicko2(player, cfg.ratingScale);
    const phiPrime = Math.sqrt(phi * phi + player.vol * player.vol);
    return fromGlicko2(mu, phiPrime, player.vol, cfg.ratingScale);
  }

  const { mu, phi } = toGlicko2(player, cfg.ratingScale);

  // Step 3: variance v
  let vInv = 0;
  for (const o of outcomes) {
    const w = o.weight ?? 1;
    const { mu: muJ, phi: phiJ } = toGlicko2(o.opponent, cfg.ratingScale);
    const gJ = g(phiJ);
    const eJ = E(mu, muJ, phiJ);
    vInv += w * gJ * gJ * eJ * (1 - eJ);
  }
  const v = 1 / vInv;

  // Step 4: improvement delta
  let deltaSum = 0;
  for (const o of outcomes) {
    const w = o.weight ?? 1;
    const { mu: muJ, phi: phiJ } = toGlicko2(o.opponent, cfg.ratingScale);
    deltaSum += w * g(phiJ) * (o.score - E(mu, muJ, phiJ));
  }
  const delta = v * deltaSum;

  // Step 5: new volatility
  const newVol = newVolatility(
    player.vol,
    phi,
    v,
    delta,
    cfg.tau,
    cfg.convergenceTolerance
  );

  // Step 6: update phi-star (prior period drift)
  const phiStar = Math.sqrt(phi * phi + newVol * newVol);

  // Step 7: new rating and RD
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muPrime = mu + phiPrime * phiPrime * deltaSum;

  return fromGlicko2(muPrime, phiPrime, newVol, cfg.ratingScale);
}

// Win probability that `a` beats `b`. Uses Glicko's logistic; same math the
// rating update uses internally, so prediction and rating are consistent.
export function winProbability(a: Rating, b: Rating, scale = 173.7178): number {
  const muA = (a.rating - 1500) / scale;
  const muB = (b.rating - 1500) / scale;
  const phiB = b.rd / scale;
  return E(muA, muB, phiB);
}
