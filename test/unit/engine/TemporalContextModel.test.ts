import { TemporalContextModel } from '../../../src/engine/TemporalContextModel'
import { cosineSimilarity } from '../../../src/math/vectors'

describe('TemporalContextModel', () => {
  let tcm: TemporalContextModel

  beforeEach(() => {
    tcm = new TemporalContextModel({ contextDimension: 64, betaEncoding: 0.6, betaRetrieval: 0.4 })
  })

  describe('initialization', () => {
    it('creates a zero initial context', () => {
      const ctx = tcm.getContext('user1')
      expect(ctx.length).toBe(64)
      expect(ctx.every((x: number) => x === 0)).toBe(true)
    })
  })

  describe('context drift', () => {
    it('encoding an item changes the context', () => {
      const before = tcm.getContext('user1')
      const input = randomInput(64)
      tcm.encode('user1', input)
      const after = tcm.getContext('user1')

      // Context should have changed
      const sim = cosineSimilarity(before, after)
      expect(sim).not.toBeCloseTo(1.0, 5)
    })

    it('items encoded close together share similar contexts', () => {
      const inputA = randomInput(64)
      const inputB = randomInput(64)
      const inputC = randomInput(64)

      const ctxA = tcm.encode('user1', inputA)
      const ctxB = tcm.encode('user1', inputB)

      // Encode many items to drift context far
      for (let i = 0; i < 20; i++) {
        tcm.encode('user1', randomInput(64))
      }
      const ctxC = tcm.encode('user1', inputC)

      // A and B should be more similar than A and C
      const simAB = cosineSimilarity(ctxA, ctxB)
      const simAC = cosineSimilarity(ctxA, ctxC)
      expect(simAB).toBeGreaterThan(simAC)
    })

    it('higher beta means faster drift (less context sharing)', () => {
      const fastTCM = new TemporalContextModel({
        contextDimension: 64,
        betaEncoding: 0.9,
        betaRetrieval: 0.4,
      })
      const slowTCM = new TemporalContextModel({
        contextDimension: 64,
        betaEncoding: 0.2,
        betaRetrieval: 0.4,
      })

      const inputA = randomInput(64)
      const inputB = randomInput(64)

      const fastA = fastTCM.encode('user1', inputA)
      const fastB = fastTCM.encode('user1', inputB)

      const slowA = slowTCM.encode('user1', inputA)
      const slowB = slowTCM.encode('user1', inputB)

      const fastSim = cosineSimilarity(fastA, fastB)
      const slowSim = cosineSimilarity(slowA, slowB)

      // Slow drift = more context sharing = higher similarity
      expect(slowSim).toBeGreaterThan(fastSim)
    })
  })

  describe('asymmetric contiguity', () => {
    it('after recall at N, context is more similar to N+1 than N-1', () => {
      // Encode sequence: A, B, C, D, E
      const inputs = Array.from({ length: 5 }, () => randomInput(64))
      const contexts: Float64Array[] = []

      for (const input of inputs) {
        contexts.push(tcm.encode('user1', input))
      }

      // Now recall item at index 2 (C)
      const retrievedContext = tcm.recall('user1', contexts[2])

      // Retrieved context should be more similar to D's context than B's
      const simToD = cosineSimilarity(retrievedContext, contexts[3])
      const simToB = cosineSimilarity(retrievedContext, contexts[1])

      expect(simToD).toBeGreaterThan(simToB)
    })
  })

  describe('user isolation', () => {
    it('different users have independent contexts', () => {
      const input = randomInput(64)
      tcm.encode('user1', input)
      const ctx1 = tcm.getContext('user1')
      const ctx2 = tcm.getContext('user2')

      // user2 should still be at zero
      expect(ctx2.every((x: number) => x === 0)).toBe(true)
      // user1 should have drifted
      expect(ctx1.some((x: number) => x !== 0)).toBe(true)
    })
  })

  describe('context compression', () => {
    it('compresses a 64-dim context to a 32-dim signature', () => {
      const input = randomInput(64)
      tcm.encode('user1', input)
      const ctx = tcm.getContext('user1')
      const sig = tcm.compressToSignature(ctx)
      expect(sig.length).toBe(32)
    })

    it('similar contexts produce similar signatures', () => {
      const inputA = randomInput(64)
      const ctxA = tcm.encode('user1', inputA)
      const inputB = randomInput(64)
      const ctxB = tcm.encode('user1', inputB)

      // Drift far
      for (let i = 0; i < 30; i++) {
        tcm.encode('user1', randomInput(64))
      }
      const inputC = randomInput(64)
      const ctxC = tcm.encode('user1', inputC)

      const sigA = tcm.compressToSignature(ctxA)
      const sigB = tcm.compressToSignature(ctxB)
      const sigC = tcm.compressToSignature(ctxC)

      const sigSimAB = cosineSimilarity(Float64Array.from(sigA), Float64Array.from(sigB))
      const sigSimAC = cosineSimilarity(Float64Array.from(sigA), Float64Array.from(sigC))

      // A and B signatures should be more similar than A and C
      expect(sigSimAB).toBeGreaterThan(sigSimAC)
    })
  })

  describe('resetContext', () => {
    it('resets a user context to zero', () => {
      tcm.encode('user1', randomInput(64))
      tcm.resetContext('user1')
      const ctx = tcm.getContext('user1')
      expect(ctx.every((x: number) => x === 0)).toBe(true)
    })
  })
})

function randomInput(dim: number): Float64Array {
  const v = new Float64Array(dim)
  for (let i = 0; i < dim; i++) {
    v[i] = Math.random() - 0.5
  }
  return v
}
