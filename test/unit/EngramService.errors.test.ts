import { EngramService } from '../../src/EngramService'

describe('EngramService — input validation', () => {
  let engram: EngramService

  beforeEach(() => {
    engram = EngramService.createInMemory()
  })

  describe('constructor config validation', () => {
    it('rejects negative contextDimension', () => {
      expect(() => EngramService.createInMemory({ contextDimension: -1 })).toThrow(
        'contextDimension',
      )
    })

    it('rejects zero signatureDimension', () => {
      expect(() => EngramService.createInMemory({ signatureDimension: 0 })).toThrow(
        'signatureDimension',
      )
    })

    it('rejects signatureDimension > contextDimension', () => {
      expect(() =>
        EngramService.createInMemory({ contextDimension: 16, signatureDimension: 32 }),
      ).toThrow('signatureDimension')
    })

    it('rejects betaEncoding out of range', () => {
      expect(() => EngramService.createInMemory({ betaEncoding: 1.5 })).toThrow('betaEncoding')
    })

    it('rejects negative betaRetrieval', () => {
      expect(() => EngramService.createInMemory({ betaRetrieval: -0.1 })).toThrow('betaRetrieval')
    })

    it('rejects zero defaultForwardBias', () => {
      expect(() => EngramService.createInMemory({ defaultForwardBias: 0 })).toThrow(
        'defaultForwardBias',
      )
    })

    it('rejects zero timeScaleMs', () => {
      expect(() => EngramService.createInMemory({ timeScaleMs: 0 })).toThrow('timeScaleMs')
    })

    it('rejects non-integer neighborK', () => {
      expect(() => EngramService.createInMemory({ neighborK: 2.5 })).toThrow('neighborK')
    })
  })

  describe('remember validation', () => {
    it('rejects empty userId', async () => {
      await expect(engram.remember('', 'content')).rejects.toThrow('userId')
    })

    it('rejects empty content', async () => {
      await expect(engram.remember('user1', '')).rejects.toThrow('content')
    })

    it('rejects importance out of range', async () => {
      await expect(engram.remember('user1', 'test', { importance: 11 })).rejects.toThrow(
        'importance',
      )
    })

    it('rejects emotionalValence out of range', async () => {
      await expect(engram.remember('user1', 'test', { emotionalValence: 2 })).rejects.toThrow(
        'emotionalValence',
      )
    })
  })

  describe('recall validation', () => {
    it('rejects empty userId', async () => {
      await expect(engram.recall('', 'query')).rejects.toThrow('userId')
    })

    it('rejects empty query', async () => {
      await expect(engram.recall('user1', '')).rejects.toThrow('query')
    })

    it('rejects non-positive maxResults', async () => {
      await expect(engram.recall('user1', 'query', { maxResults: 0 })).rejects.toThrow('maxResults')
    })

    it('rejects negative maxHops', async () => {
      await expect(engram.recall('user1', 'query', { maxHops: -1 })).rejects.toThrow('maxHops')
    })
  })

  describe('forget validation', () => {
    it('rejects empty userId', async () => {
      await expect(engram.forget('', 'mem-id')).rejects.toThrow('userId')
    })

    it('rejects empty memoryId', async () => {
      await expect(engram.forget('user1', '')).rejects.toThrow('memoryId')
    })
  })

  describe('consolidate validation', () => {
    it('rejects empty userId', async () => {
      await expect(engram.consolidate('')).rejects.toThrow('userId')
    })
  })

  describe('resetContext validation', () => {
    it('rejects empty userId', () => {
      expect(() => engram.resetContext('')).toThrow('userId')
    })
  })

  describe('recall with no memories', () => {
    it('returns empty results for unknown user', async () => {
      const result = await engram.recall('unknown-user', 'anything')
      expect(result.memories).toEqual([])
      expect(result.chain).toEqual([])
      expect(result.totalHops).toBe(0)
    })
  })
})
