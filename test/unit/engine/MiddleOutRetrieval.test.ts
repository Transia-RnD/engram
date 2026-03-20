import { MiddleOutRetrieval, RetrievalResult } from '../../../src/engine/MiddleOutRetrieval'
import { MemoryRecord, TemporalEdge } from '../../../src/types/core'

/**
 * In-memory mock stores for testing the retrieval algorithm in isolation.
 */
class MockMemoryStore {
  private records: Map<string, MemoryRecord> = new Map()

  add(record: MemoryRecord): void {
    this.records.set(record.id, record)
  }

  async get(id: string): Promise<MemoryRecord | null> {
    return this.records.get(id) ?? null
  }
}

class MockEdgeStore {
  private edges: TemporalEdge[] = []

  add(edge: TemporalEdge): void {
    this.edges.push(edge)
  }

  async getEdges(
    _userId: string,
    memoryId: string,
    direction: 'forward' | 'backward',
  ): Promise<TemporalEdge[]> {
    return this.edges.filter(
      (e) => e.sourceMemoryId === memoryId && e.direction === direction,
    )
  }
}

function makeMemory(id: string, content: string, coordinate: number): MemoryRecord {
  return {
    id,
    userId: 'user1',
    content,
    temporalContext: { values: new Float64Array(64), capturedAt: new Date() },
    temporalCoordinate: coordinate,
    category: 'general',
    importance: 5,
    emotionalValence: 0,
    source: 'test',
    metadata: {},
    accessCount: 0,
    createdAt: new Date(),
    softDeleted: false,
  }
}

function makeEdge(
  source: string,
  target: string,
  direction: 'forward' | 'backward',
  weight: number,
): TemporalEdge {
  return {
    id: `edge-${source}-${target}-${direction}`,
    userId: 'user1',
    sourceMemoryId: source,
    targetMemoryId: target,
    direction,
    weight,
    temporalDistance: 1,
    traversalCount: 0,
    createdAt: new Date(),
  }
}

describe('MiddleOutRetrieval', () => {
  let memoryStore: MockMemoryStore
  let edgeStore: MockEdgeStore
  let retrieval: MiddleOutRetrieval

  beforeEach(() => {
    memoryStore = new MockMemoryStore()
    edgeStore = new MockEdgeStore()
    retrieval = new MiddleOutRetrieval(
      (id) => memoryStore.get(id),
      (userId, memoryId, direction) => edgeStore.getEdges(userId, memoryId, direction),
    )
  })

  describe('the signature test: asymmetric contiguity', () => {
    /**
     * THE TEST THAT PROVES THE NOVEL CONTRIBUTION:
     *
     * Encode sequence [A, B, C, D, E] as a linear chain.
     * Recall at C (the middle).
     * Results MUST show:
     *   - D ranked higher than B (forward bias 2x > backward 1x at equal distance)
     *   - E ranked higher than A (same logic, further out)
     *
     * This is the TCM contiguity prediction that distinguishes engram
     * from every other memory system.
     */
    it('ranks forward neighbors higher than backward neighbors at equal distance', async () => {
      // Setup: A(1) - B(2) - C(3) - D(4) - E(5)
      const A = makeMemory('A', 'memory A', 1)
      const B = makeMemory('B', 'memory B', 2)
      const C = makeMemory('C', 'memory C', 3)
      const D = makeMemory('D', 'memory D', 4)
      const E = makeMemory('E', 'memory E', 5)

      for (const m of [A, B, C, D, E]) memoryStore.add(m)

      // Forward edges from C: C→D (forward, 2x), C→E via D
      edgeStore.add(makeEdge('C', 'D', 'forward', 1.0)) // forward base weight
      edgeStore.add(makeEdge('D', 'E', 'forward', 0.8))

      // Backward edges from C: C→B (backward, 1x), C→A via B
      edgeStore.add(makeEdge('C', 'B', 'backward', 1.0)) // backward base weight
      edgeStore.add(makeEdge('B', 'A', 'backward', 0.8))

      const result = await retrieval.retrieve('user1', C, {
        maxHops: 3,
        relevanceThreshold: 0,
        maxResults: 10,
        forwardBias: 2.0,
        backwardBias: 1.0,
      })

      // Find scores for each memory
      const scoreOf = (id: string) => {
        const entry = result.chain.find((c) => c.memoryId === id)
        return entry?.score ?? -Infinity
      }

      // D should rank higher than B (forward 2x vs backward 1x at distance 1)
      expect(scoreOf('D')).toBeGreaterThan(scoreOf('B'))

      // E should rank higher than A (forward 2x vs backward 1x at distance 2)
      expect(scoreOf('E')).toBeGreaterThan(scoreOf('A'))
    })
  })

  describe('basic retrieval', () => {
    it('returns the origin memory in the chain', async () => {
      const C = makeMemory('C', 'memory C', 3)
      memoryStore.add(C)

      const result = await retrieval.retrieve('user1', C, {
        maxHops: 3,
        relevanceThreshold: 0,
        maxResults: 10,
        forwardBias: 2.0,
        backwardBias: 1.0,
      })

      expect(result.chain[0].memoryId).toBe('C')
      expect(result.chain[0].direction).toBe('origin')
    })

    it('stops expansion at maxHops', async () => {
      // Long chain: 0→1→2→3→4→5→6→7→8→9
      for (let i = 0; i < 10; i++) {
        memoryStore.add(makeMemory(`m${i}`, `memory ${i}`, i))
        if (i < 9) {
          edgeStore.add(makeEdge(`m${i}`, `m${i + 1}`, 'forward', 1.0))
        }
      }

      const origin = (await memoryStore.get('m0'))!
      const result = await retrieval.retrieve('user1', origin, {
        maxHops: 3,
        relevanceThreshold: 0,
        maxResults: 10,
        forwardBias: 2.0,
        backwardBias: 1.0,
      })

      // Origin + 3 hops max
      expect(result.chain.length).toBeLessThanOrEqual(4)
      expect(result.totalHops).toBeLessThanOrEqual(3)
    })

    it('respects maxResults', async () => {
      for (let i = 0; i < 10; i++) {
        memoryStore.add(makeMemory(`m${i}`, `memory ${i}`, i))
        if (i < 9) {
          edgeStore.add(makeEdge(`m${i}`, `m${i + 1}`, 'forward', 1.0))
        }
      }

      const origin = (await memoryStore.get('m0'))!
      const result = await retrieval.retrieve('user1', origin, {
        maxHops: 10,
        relevanceThreshold: 0,
        maxResults: 3,
        forwardBias: 2.0,
        backwardBias: 1.0,
      })

      expect(result.chain.length).toBeLessThanOrEqual(3)
    })

    it('does not revisit nodes', async () => {
      // Create a cycle: A→B→C→A
      memoryStore.add(makeMemory('A', 'mem A', 1))
      memoryStore.add(makeMemory('B', 'mem B', 2))
      memoryStore.add(makeMemory('C', 'mem C', 3))

      edgeStore.add(makeEdge('A', 'B', 'forward', 1.0))
      edgeStore.add(makeEdge('B', 'C', 'forward', 1.0))
      edgeStore.add(makeEdge('C', 'A', 'forward', 1.0))

      const origin = (await memoryStore.get('A'))!
      const result = await retrieval.retrieve('user1', origin, {
        maxHops: 10,
        relevanceThreshold: 0,
        maxResults: 10,
        forwardBias: 2.0,
        backwardBias: 1.0,
      })

      // Should visit each node exactly once
      const ids = result.chain.map((c) => c.memoryId)
      expect(new Set(ids).size).toBe(ids.length)
    })
  })

  describe('decay over hops', () => {
    it('further hops have lower scores', async () => {
      // Chain: A→B→C with equal edge weights
      memoryStore.add(makeMemory('A', 'mem A', 1))
      memoryStore.add(makeMemory('B', 'mem B', 2))
      memoryStore.add(makeMemory('C', 'mem C', 3))

      edgeStore.add(makeEdge('A', 'B', 'forward', 1.0))
      edgeStore.add(makeEdge('B', 'C', 'forward', 1.0))

      const origin = (await memoryStore.get('A'))!
      const result = await retrieval.retrieve('user1', origin, {
        maxHops: 5,
        relevanceThreshold: 0,
        maxResults: 10,
        forwardBias: 2.0,
        backwardBias: 1.0,
      })

      const scoreB = result.chain.find((c) => c.memoryId === 'B')?.score ?? 0
      const scoreC = result.chain.find((c) => c.memoryId === 'C')?.score ?? 0

      // B (1 hop) should score higher than C (2 hops)
      expect(scoreB).toBeGreaterThan(scoreC)
    })
  })
})
