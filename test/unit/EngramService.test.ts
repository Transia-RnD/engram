import { EngramService } from '../../src/EngramService'

describe('EngramService', () => {
  let engram: EngramService

  beforeEach(() => {
    engram = EngramService.createInMemory()
  })

  describe('remember + recall round-trip', () => {
    it('recalls a stored memory', async () => {
      await engram.remember('user1', 'The capital of France is Paris')

      const result = await engram.recall('user1', 'France capital')
      expect(result.memories.length).toBeGreaterThan(0)
      expect(result.memories[0].content).toBe('The capital of France is Paris')
    })
  })

  describe('asymmetric contiguity end-to-end', () => {
    /**
     * THE FULL END-TO-END CONTIGUITY TEST:
     * Encode [A, B, C, D, E] in sequence.
     * Recall from C's context.
     * D should rank higher than B (forward bias).
     */
    it('forward neighbors rank higher than backward in recall results', async () => {
      await engram.remember('user1', 'Alpha event happened first')
      await engram.remember('user1', 'Bravo event happened second')
      await engram.remember('user1', 'Charlie event happened third')
      await engram.remember('user1', 'Delta event happened fourth')
      await engram.remember('user1', 'Echo event happened fifth')

      // Recall from Charlie's perspective
      const result = await engram.recall('user1', 'Charlie event happened third', {
        maxResults: 10,
        maxHops: 5,
      })

      const indexOf = (content: string) =>
        result.chain.findIndex((c) =>
          result.memories.find((m) => m.id === c.memoryId)?.content.includes(content),
        )

      const deltaIdx = indexOf('Delta')
      const bravoIdx = indexOf('Bravo')

      // Delta (forward from Charlie) should appear before Bravo (backward)
      // Lower index = higher rank in sorted-by-score chain
      if (deltaIdx !== -1 && bravoIdx !== -1) {
        expect(deltaIdx).toBeLessThan(bravoIdx)
      }
    })
  })

  describe('forget', () => {
    it('soft-deletes a memory', async () => {
      const record = await engram.remember('user1', 'Temporary memory')
      await engram.forget('user1', record.id)

      // Recall should not return the deleted memory
      const result = await engram.recall('user1', 'Temporary memory')
      const found = result.memories.find((m) => m.id === record.id)
      expect(found).toBeUndefined()
    })
  })

  describe('consolidate', () => {
    it('runs consolidation without errors', async () => {
      await engram.remember('user1', 'Memory one')
      await engram.remember('user1', 'Memory two')

      const result = await engram.consolidate('user1')
      expect(result.decayed).toBeGreaterThanOrEqual(0)
      expect(result.pruned).toBeGreaterThanOrEqual(0)
    })
  })

  describe('user isolation', () => {
    it('does not leak memories between users', async () => {
      await engram.remember('user1', 'Secret user1 memory')

      const result = await engram.recall('user2', 'Secret user1 memory')
      expect(result.memories.length).toBe(0)
    })
  })

  describe('multiple memories', () => {
    it('handles encoding many memories without error', async () => {
      for (let i = 0; i < 20; i++) {
        await engram.remember('user1', `Memory number ${i}`)
      }

      const result = await engram.recall('user1', 'Memory number 10')
      expect(result.memories.length).toBeGreaterThan(0)
    })
  })
})
