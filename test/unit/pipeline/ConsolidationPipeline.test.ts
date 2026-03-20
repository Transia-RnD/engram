import { ConsolidationPipeline } from '../../../src/pipeline/ConsolidationPipeline'
import { InMemoryEdgeStore, InMemoryMemoryStore } from '../../../src/storage/InMemoryStores'
import { TemporalEdge } from '../../../src/types/core'

describe('ConsolidationPipeline', () => {
  let edgeStore: InMemoryEdgeStore
  let memoryStore: InMemoryMemoryStore
  let pipeline: ConsolidationPipeline

  beforeEach(() => {
    edgeStore = new InMemoryEdgeStore()
    memoryStore = new InMemoryMemoryStore()
    pipeline = new ConsolidationPipeline(edgeStore, memoryStore)
  })

  async function createEdge(weight: number, lastTraversed?: Date): Promise<TemporalEdge> {
    return edgeStore.create({
      userId: 'user1',
      sourceMemoryId: 'src',
      targetMemoryId: 'tgt',
      direction: 'forward',
      weight,
      temporalDistance: 1,
      lastTraversed,
    })
  }

  describe('decay', () => {
    it('decays all edge weights by decayRate', async () => {
      await createEdge(1.0)
      await pipeline.consolidate('user1', { decayRate: 0.9, pruneThreshold: 0, replayBoost: 1.0 })

      const edges = await edgeStore.getAllEdges('user1')
      expect(edges[0].weight).toBeCloseTo(0.9, 5)
    })

    it('applies multiple decay cycles cumulatively', async () => {
      await createEdge(1.0)
      await pipeline.consolidate('user1', { decayRate: 0.9, pruneThreshold: 0, replayBoost: 1.0 })
      await pipeline.consolidate('user1', { decayRate: 0.9, pruneThreshold: 0, replayBoost: 1.0 })

      const edges = await edgeStore.getAllEdges('user1')
      expect(edges[0].weight).toBeCloseTo(0.81, 5) // 0.9 * 0.9
    })
  })

  describe('pruning', () => {
    it('removes edges below pruneThreshold', async () => {
      await createEdge(0.01) // Below threshold
      await createEdge(1.0) // Above threshold

      const result = await pipeline.consolidate('user1', {
        decayRate: 1.0, // No decay
        pruneThreshold: 0.05,
        replayBoost: 1.0,
      })

      const edges = await edgeStore.getAllEdges('user1')
      expect(edges.length).toBe(1)
      expect(result.pruned).toBe(1)
    })
  })

  describe('replay boost', () => {
    it('boosts edges that were recently traversed', async () => {
      const recentlyTraversed = await createEdge(1.0, new Date())
      const notTraversed = await createEdge(1.0)

      await pipeline.consolidate('user1', {
        decayRate: 0.9,
        pruneThreshold: 0,
        replayBoost: 1.5,
      })

      const edges = await edgeStore.getAllEdges('user1')
      const traversedEdge = edges.find((e) => e.id === recentlyTraversed.id)!
      const otherEdge = edges.find((e) => e.id === notTraversed.id)!

      // Traversed: 1.0 * 0.9 * 1.5 = 1.35
      // Not traversed: 1.0 * 0.9 = 0.9
      expect(traversedEdge.weight).toBeGreaterThan(otherEdge.weight)
    })
  })

  describe('result', () => {
    it('returns counts of decayed, pruned, and boosted', async () => {
      await createEdge(1.0, new Date()) // traversed
      await createEdge(0.01) // will be pruned
      await createEdge(0.5) // normal

      const result = await pipeline.consolidate('user1', {
        decayRate: 0.9,
        pruneThreshold: 0.05,
        replayBoost: 1.2,
      })

      expect(result.decayed).toBeGreaterThan(0)
      expect(result.pruned).toBe(1) // The 0.01 edge
    })
  })
})
