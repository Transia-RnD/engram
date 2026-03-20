/**
 * Exponential decay: score = e^(-lambda * t)
 * @param t - time elapsed (days, or any unit)
 * @param lambda - decay rate (higher = faster decay). For 30-day half-life: lambda = ln(2)/30
 */
export function exponentialDecay(t: number, lambda: number): number {
  return Math.exp(-lambda * t)
}

/**
 * Power law decay: score = 1 / (1 + t)^exponent
 * Decays slower than exponential for large t (long tail).
 */
export function powerLawDecay(t: number, exponent: number): number {
  return 1 / Math.pow(1 + t, exponent)
}

/**
 * Temporal distance weight: 1 / (1 + distance)
 * Closer memories get higher weight.
 */
export function temporalWeight(distance: number): number {
  return 1 / (1 + distance)
}

/**
 * Contiguity weight with asymmetric forward bias (TCM).
 * Forward edges (item came AFTER source) get forwardBias multiplier.
 * Backward edges get 1x.
 *
 * @param distance - temporal distance between memories
 * @param direction - 'forward' or 'backward'
 * @param forwardBias - multiplier for forward edges (default 2.0, from TCM research)
 */
export function contiguityWeight(
  distance: number,
  direction: 'forward' | 'backward',
  forwardBias: number = 2.0,
): number {
  const base = temporalWeight(distance)
  return direction === 'forward' ? base * forwardBias : base
}
