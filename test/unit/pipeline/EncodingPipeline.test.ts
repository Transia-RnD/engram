import { EncodingPipeline } from '../../../src/pipeline/EncodingPipeline'
import { TemporalContextModel } from '../../../src/engine/TemporalContextModel'
import { TimeCellNetwork } from '../../../src/engine/TimeCellNetwork'
import { HippocampalIndex } from '../../../src/engine/HippocampalIndex'
import { InMemoryMemoryStore, InMemoryEdgeStore } from '../../../src/storage/InMemoryStores'

describe('EncodingPipeline', () => {
  let pipeline: EncodingPipeline
  let memoryStore: InMemoryMemoryStore
  let edgeStore: InMemoryEdgeStore
  let tcm: TemporalContextModel
  let tcn: TimeCellNetwork
  let index: HippocampalIndex

  beforeEach(() => {
    tcm = new TemporalContextModel({ contextDimension: 64, betaEncoding: 0.6, betaRetrieval: 0.4 })
    tcn = new TimeCellNetwork({ timeScaleMs: 86400000 })
    index = new HippocampalIndex()
    memoryStore = new InMemoryMemoryStore()
    edgeStore = new InMemoryEdgeStore()
    pipeline = new EncodingPipeline(tcm, tcn, index, memoryStore, edgeStore, { neighborK: 3 })
  })

  describe('encode', () => {
    it('creates a memory record with temporal context', async () => {
      const record = await pipeline.encode('user1', 'The sky is blue')

      expect(record.id).toBeDefined()
      expect(record.userId).toBe('user1')
      expect(record.content).toBe('The sky is blue')
      expect(record.temporalContext.values.length).toBe(64)
      expect(record.temporalCoordinate).toBeGreaterThan(0)
    })

    it('creates an index entry for the memory', async () => {
      const record = await pipeline.encode('user1', 'The sky is blue')

      const indexEntry = index.getByMemoryId(record.id)
      expect(indexEntry).not.toBeNull()
      expect(indexEntry!.contextSignature.length).toBe(32)
      expect(indexEntry!.memoryId).toBe(record.id)
    })

    it('creates temporal edges to previous memories', async () => {
      const r1 = await pipeline.encode('user1', 'First memory')
      const r2 = await pipeline.encode('user1', 'Second memory')

      // Should have edges: r1→r2 (forward) and r2→r1 (backward)
      const forwardEdges = await edgeStore.getEdges('user1', r1.id, 'forward')
      const backwardEdges = await edgeStore.getEdges('user1', r2.id, 'backward')

      expect(forwardEdges.length).toBe(1)
      expect(forwardEdges[0].targetMemoryId).toBe(r2.id)
      expect(forwardEdges[0].direction).toBe('forward')

      expect(backwardEdges.length).toBe(1)
      expect(backwardEdges[0].targetMemoryId).toBe(r1.id)
      expect(backwardEdges[0].direction).toBe('backward')
    })

    it('forward edges have 2x the weight of backward edges at equal distance', async () => {
      await pipeline.encode('user1', 'First memory')
      const r2 = await pipeline.encode('user1', 'Second memory')

      const forwardEdges = await edgeStore.getEdges('user1', (await memoryStore.findByUser('user1'))[0].id, 'forward')
      const backwardEdges = await edgeStore.getEdges('user1', r2.id, 'backward')

      expect(forwardEdges[0].weight).toBeCloseTo(backwardEdges[0].weight * 2, 5)
    })

    it('assigns monotonically increasing temporal coordinates', async () => {
      const r1 = await pipeline.encode('user1', 'First')
      const r2 = await pipeline.encode('user1', 'Second')
      const r3 = await pipeline.encode('user1', 'Third')

      expect(r2.temporalCoordinate).toBeGreaterThanOrEqual(r1.temporalCoordinate)
      expect(r3.temporalCoordinate).toBeGreaterThanOrEqual(r2.temporalCoordinate)
    })

    it('stores the memory in the memory store', async () => {
      const record = await pipeline.encode('user1', 'Test memory')
      const stored = await memoryStore.get(record.id)
      expect(stored).not.toBeNull()
      expect(stored!.content).toBe('Test memory')
    })
  })
})
