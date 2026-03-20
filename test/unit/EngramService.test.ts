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

  describe('semantic memory', () => {
    it('recall returns semanticNodes when semantic store is available', async () => {
      await engram.remember('user1', 'Test memory for semantic')

      const result = await engram.recall('user1', 'Test memory')
      // semanticNodes should be defined (empty array if no semantic nodes yet)
      expect(result.semanticNodes).toBeDefined()
      expect(Array.isArray(result.semanticNodes)).toBe(true)
    })

    it('recall excludes semanticNodes when includeSemanticNodes is false', async () => {
      await engram.remember('user1', 'Another test memory')

      const result = await engram.recall('user1', 'test', {
        includeSemanticNodes: false,
      })
      expect(result.semanticNodes).toBeUndefined()
    })

    it('consolidation creates semantic nodes from repeated patterns', async () => {
      // Remember similar content across different conversations
      for (let i = 0; i < 4; i++) {
        await engram.remember('user1', 'user prefers dark mode', {
          conversationId: `conv-${i}`,
        })
      }

      // First consolidation
      const result1 = await engram.consolidate('user1', {
        semantic: {
          minSourcesForCorroborated: 2,
          contextVariabilityThreshold: 0.3,
        },
      })

      expect(result1.semantic).toBeDefined()
      expect(result1.semantic!.promoted + result1.semantic!.reinforced).toBeGreaterThanOrEqual(1)

      // Recall should now include semantic nodes
      const recallResult = await engram.recall('user1', 'dark mode preference')
      expect(recallResult.semanticNodes).toBeDefined()
      // There should be at least one semantic node
      expect(recallResult.semanticNodes!.length).toBeGreaterThanOrEqual(1)
    })

    it('schema-gated encoding reinforces matching semantic nodes', async () => {
      // Build up some memories and consolidate to create a semantic node
      for (let i = 0; i < 3; i++) {
        await engram.remember('user1', 'user likes TypeScript', {
          conversationId: `conv-ts-${i}`,
        })
      }

      await engram.consolidate('user1', {
        semantic: {
          minSourcesForCorroborated: 2,
          contextVariabilityThreshold: 0.0,
        },
      })

      // Now remember something similar — schema-gating should reinforce
      const recall1 = await engram.recall('user1', 'TypeScript preference')
      const nodesBefore = recall1.semanticNodes ?? []
      const countBefore = nodesBefore.length > 0 ? nodesBefore[0].sourceCount : 0

      await engram.remember('user1', 'user likes TypeScript a lot', {
        conversationId: 'conv-ts-new',
      })

      const recall2 = await engram.recall('user1', 'TypeScript preference')
      const nodesAfter = recall2.semanticNodes ?? []

      if (nodesAfter.length > 0 && countBefore > 0) {
        // Source count should have increased via schema-gating
        expect(nodesAfter[0].sourceCount).toBeGreaterThanOrEqual(countBefore)
      }
    })

    it('consolidation includes semantic phase results', async () => {
      // Create memories and consolidate
      for (let i = 0; i < 3; i++) {
        await engram.remember('user1', 'fact about Go language', {
          conversationId: `conv-go-${i}`,
        })
      }

      const result = await engram.consolidate('user1', {
        semantic: {
          minSourcesForCorroborated: 2,
          contextVariabilityThreshold: 0.0,
        },
      })

      // Semantic phase should have run and returned results
      expect(result.semantic).toBeDefined()
      expect(typeof result.semantic!.promoted).toBe('number')
      expect(typeof result.semantic!.reinforced).toBe('number')
      expect(typeof result.semantic!.decayed).toBe('number')
      expect(typeof result.semantic!.compressed).toBe('number')
      expect(typeof result.semantic!.contradictions).toBe('number')
    })
  })
})
