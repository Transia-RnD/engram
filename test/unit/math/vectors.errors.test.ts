import {
  zeros,
  dot,
  cosineSimilarity,
  add,
  scale,
  normalize,
  randomUnitVector,
  randomProjectionMatrix,
  project,
} from '../../../src/math/vectors'

describe('vectors — error handling', () => {
  describe('zeros', () => {
    it('throws on zero dimension', () => {
      expect(() => zeros(0)).toThrow('positive integer')
    })

    it('throws on negative dimension', () => {
      expect(() => zeros(-5)).toThrow('positive integer')
    })

    it('throws on non-integer dimension', () => {
      expect(() => zeros(3.5)).toThrow('positive integer')
    })
  })

  describe('dot', () => {
    it('throws on dimension mismatch', () => {
      const a = new Float64Array([1, 2, 3])
      const b = new Float64Array([1, 2])
      expect(() => dot(a, b)).toThrow('dimension mismatch')
    })

    it('handles empty vectors', () => {
      expect(dot(new Float64Array(0), new Float64Array(0))).toBe(0)
    })
  })

  describe('cosineSimilarity', () => {
    it('throws on dimension mismatch', () => {
      const a = new Float64Array([1, 0])
      const b = new Float64Array([1, 0, 0])
      expect(() => cosineSimilarity(a, b)).toThrow('dimension mismatch')
    })

    it('returns 0 for zero-magnitude vectors', () => {
      const a = new Float64Array([0, 0, 0])
      const b = new Float64Array([1, 0, 0])
      expect(cosineSimilarity(a, b)).toBe(0)
    })

    it('returns 0 when both vectors are zero', () => {
      const z = new Float64Array([0, 0])
      expect(cosineSimilarity(z, z)).toBe(0)
    })
  })

  describe('add', () => {
    it('throws on dimension mismatch', () => {
      const a = new Float64Array([1])
      const b = new Float64Array([1, 2])
      expect(() => add(a, b)).toThrow('dimension mismatch')
    })
  })

  describe('scale', () => {
    it('throws on NaN scalar', () => {
      expect(() => scale(new Float64Array([1]), NaN)).toThrow('finite')
    })

    it('throws on Infinity scalar', () => {
      expect(() => scale(new Float64Array([1]), Infinity)).toThrow('finite')
    })
  })

  describe('normalize', () => {
    it('returns zero vector for zero input', () => {
      const v = normalize(new Float64Array([0, 0, 0]))
      expect(v.every((x) => x === 0)).toBe(true)
    })

    it('produces unit vector', () => {
      const v = normalize(new Float64Array([3, 4]))
      const mag = Math.sqrt(v[0] ** 2 + v[1] ** 2)
      expect(mag).toBeCloseTo(1.0)
    })
  })

  describe('randomUnitVector', () => {
    it('throws on zero dimension', () => {
      expect(() => randomUnitVector(0)).toThrow('positive integer')
    })
  })

  describe('randomProjectionMatrix', () => {
    it('throws on zero outputDim', () => {
      expect(() => randomProjectionMatrix(0, 10)).toThrow('positive integer')
    })

    it('throws on zero inputDim', () => {
      expect(() => randomProjectionMatrix(10, 0)).toThrow('positive integer')
    })
  })

  describe('project', () => {
    it('throws on dimension mismatch between matrix columns and vector', () => {
      const matrix = [new Float64Array([1, 0, 0])]
      const v = new Float64Array([1, 0]) // wrong dimension
      expect(() => project(matrix, v)).toThrow('dimension')
    })

    it('handles empty matrix', () => {
      const result = project([], new Float64Array([1, 2, 3]))
      expect(result.length).toBe(0)
    })
  })
})
