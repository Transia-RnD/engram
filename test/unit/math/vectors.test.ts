import {
  cosineSimilarity,
  normalize,
  add,
  scale,
  dot,
  randomUnitVector,
  randomProjectionMatrix,
  project,
  zeros,
} from '../../../src/math/vectors'

describe('vectors', () => {
  describe('zeros', () => {
    it('creates a zero vector of given dimension', () => {
      const v = zeros(64)
      expect(v).toBeInstanceOf(Float64Array)
      expect(v.length).toBe(64)
      expect(v.every((x) => x === 0)).toBe(true)
    })
  })

  describe('dot', () => {
    it('computes dot product of two vectors', () => {
      const a = Float64Array.from([1, 2, 3])
      const b = Float64Array.from([4, 5, 6])
      expect(dot(a, b)).toBe(32) // 1*4 + 2*5 + 3*6
    })

    it('returns 0 for orthogonal vectors', () => {
      const a = Float64Array.from([1, 0])
      const b = Float64Array.from([0, 1])
      expect(dot(a, b)).toBe(0)
    })
  })

  describe('normalize', () => {
    it('normalizes a vector to unit length', () => {
      const v = Float64Array.from([3, 4])
      const n = normalize(v)
      const magnitude = Math.sqrt(dot(n, n))
      expect(magnitude).toBeCloseTo(1.0, 10)
    })

    it('returns zero vector for zero input', () => {
      const v = Float64Array.from([0, 0, 0])
      const n = normalize(v)
      expect(n.every((x) => x === 0)).toBe(true)
    })

    it('does not mutate the input', () => {
      const v = Float64Array.from([3, 4])
      normalize(v)
      expect(v[0]).toBe(3)
      expect(v[1]).toBe(4)
    })
  })

  describe('cosineSimilarity', () => {
    it('returns 1 for identical vectors', () => {
      const v = Float64Array.from([1, 2, 3])
      expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 10)
    })

    it('returns -1 for opposite vectors', () => {
      const a = Float64Array.from([1, 0])
      const b = Float64Array.from([-1, 0])
      expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 10)
    })

    it('returns 0 for orthogonal vectors', () => {
      const a = Float64Array.from([1, 0])
      const b = Float64Array.from([0, 1])
      expect(cosineSimilarity(a, b)).toBeCloseTo(0, 10)
    })

    it('returns 0 when either vector is zero', () => {
      const a = Float64Array.from([1, 2])
      const b = Float64Array.from([0, 0])
      expect(cosineSimilarity(a, b)).toBe(0)
    })
  })

  describe('add', () => {
    it('adds two vectors element-wise', () => {
      const a = Float64Array.from([1, 2, 3])
      const b = Float64Array.from([4, 5, 6])
      const result = add(a, b)
      expect(Array.from(result)).toEqual([5, 7, 9])
    })

    it('does not mutate inputs', () => {
      const a = Float64Array.from([1, 2])
      const b = Float64Array.from([3, 4])
      add(a, b)
      expect(a[0]).toBe(1)
      expect(b[0]).toBe(3)
    })
  })

  describe('scale', () => {
    it('scales a vector by a scalar', () => {
      const v = Float64Array.from([2, 4, 6])
      const result = scale(v, 0.5)
      expect(Array.from(result)).toEqual([1, 2, 3])
    })

    it('does not mutate input', () => {
      const v = Float64Array.from([2, 4])
      scale(v, 0.5)
      expect(v[0]).toBe(2)
    })
  })

  describe('randomUnitVector', () => {
    it('creates a vector of the given dimension', () => {
      const v = randomUnitVector(64)
      expect(v.length).toBe(64)
    })

    it('creates a unit vector (magnitude ~1)', () => {
      const v = randomUnitVector(64)
      const mag = Math.sqrt(dot(v, v))
      expect(mag).toBeCloseTo(1.0, 5)
    })

    it('creates different vectors on successive calls', () => {
      const a = randomUnitVector(64)
      const b = randomUnitVector(64)
      // Extremely unlikely to be identical
      const sim = cosineSimilarity(a, b)
      expect(Math.abs(sim)).toBeLessThan(0.9)
    })
  })

  describe('randomProjectionMatrix', () => {
    it('creates a matrix of correct dimensions', () => {
      const matrix = randomProjectionMatrix(32, 64)
      expect(matrix.length).toBe(32)
      expect(matrix[0].length).toBe(64)
    })

    it('produces rows that are unit vectors', () => {
      const matrix = randomProjectionMatrix(32, 64)
      for (const row of matrix) {
        const mag = Math.sqrt(dot(row, row))
        expect(mag).toBeCloseTo(1.0, 5)
      }
    })
  })

  describe('project', () => {
    it('projects a 64-dim vector to 32-dim', () => {
      const matrix = randomProjectionMatrix(32, 64)
      const v = randomUnitVector(64)
      const projected = project(matrix, v)
      expect(projected.length).toBe(32)
    })

    it('preserves relative similarity (Johnson-Lindenstrauss)', () => {
      // Two similar vectors should remain relatively similar after projection
      const matrix = randomProjectionMatrix(32, 64)
      const a = randomUnitVector(64)
      // Create b as a slight perturbation of a
      const b = Float64Array.from(a.map((x, i) => (i < 5 ? x + 0.1 : x)))
      const bNorm = normalize(b)

      const simBefore = cosineSimilarity(a, bNorm)
      const simAfter = cosineSimilarity(
        normalize(project(matrix, a)),
        normalize(project(matrix, bNorm)),
      )
      // Similarity should be roughly preserved (within 0.3)
      expect(Math.abs(simBefore - simAfter)).toBeLessThan(0.3)
    })
  })
})
