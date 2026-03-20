import {
  exponentialDecay,
  powerLawDecay,
  temporalWeight,
  contiguityWeight,
} from '../../../src/math/decay'

describe('decay', () => {
  describe('exponentialDecay', () => {
    it('returns 1 at time 0', () => {
      expect(exponentialDecay(0, 0.5)).toBe(1)
    })

    it('returns ~0.5 at the half-life', () => {
      const halfLife = 30
      const lambda = Math.LN2 / halfLife
      expect(exponentialDecay(30, lambda)).toBeCloseTo(0.5, 5)
    })

    it('approaches 0 as time increases', () => {
      expect(exponentialDecay(1000, 0.1)).toBeLessThan(0.001)
    })

    it('never goes negative', () => {
      expect(exponentialDecay(999999, 0.5)).toBeGreaterThanOrEqual(0)
    })
  })

  describe('powerLawDecay', () => {
    it('returns 1 at time 0', () => {
      expect(powerLawDecay(0, 1)).toBe(1)
    })

    it('decays slower than exponential for large t', () => {
      const t = 100
      const exp = exponentialDecay(t, 0.05)
      const pow = powerLawDecay(t, 1)
      expect(pow).toBeGreaterThan(exp)
    })

    it('never goes negative', () => {
      expect(powerLawDecay(999999, 2)).toBeGreaterThan(0)
    })
  })

  describe('temporalWeight', () => {
    it('gives higher weight to smaller distances', () => {
      const close = temporalWeight(1)
      const far = temporalWeight(10)
      expect(close).toBeGreaterThan(far)
    })

    it('returns 0.5 at distance 1', () => {
      // 1 / (1 + 1) = 0.5
      expect(temporalWeight(1)).toBeCloseTo(0.5, 10)
    })

    it('returns 1 at distance 0', () => {
      expect(temporalWeight(0)).toBe(1)
    })
  })

  describe('contiguityWeight', () => {
    it('gives forward edges 2x the weight of backward edges', () => {
      const distance = 1
      const forward = contiguityWeight(distance, 'forward')
      const backward = contiguityWeight(distance, 'backward')
      expect(forward).toBeCloseTo(backward * 2, 10)
    })

    it('applies custom forward bias', () => {
      const distance = 1
      const forward = contiguityWeight(distance, 'forward', 3.0)
      const backward = contiguityWeight(distance, 'backward', 3.0)
      expect(forward).toBeCloseTo(backward * 3, 10)
    })

    it('gives higher weight to closer memories', () => {
      const close = contiguityWeight(1, 'forward')
      const far = contiguityWeight(10, 'forward')
      expect(close).toBeGreaterThan(far)
    })
  })
})
