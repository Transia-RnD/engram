import { SemanticConsolidation } from '../../../src/engine/SemanticConsolidation'
import { InMemoryMemoryStore } from '../../../src/storage/InMemoryStores'
import { InMemorySemanticStore } from '../../../src/storage/InMemorySemanticStore'
import { HippocampalIndex } from '../../../src/engine/HippocampalIndex'
import { MemoryRecord, IndexEntry } from '../../../src/types/core'
import { SemanticConsolidationConfig, DEFAULT_SEMANTIC_CONFIG } from '../../../src/types/semantic'

describe('SemanticConsolidation', () => {
  let memoryStore: InMemoryMemoryStore
  let semanticStore: InMemorySemanticStore
  let index: HippocampalIndex
  let engine: SemanticConsolidation

  const userId = 'user1'

  function makeConfig(
    overrides: Partial<SemanticConsolidationConfig> = {},
  ): SemanticConsolidationConfig {
    return { ...DEFAULT_SEMANTIC_CONFIG, ...overrides }
  }

  beforeEach(() => {
    memoryStore = new InMemoryMemoryStore()
    semanticStore = new InMemorySemanticStore()
    index = new HippocampalIndex()
    engine = new SemanticConsolidation(memoryStore, semanticStore, index)
  })

  // Helper: create an episodic memory with an index entry (similar context signatures cluster)
  async function createMemory(
    content: string,
    signature: number[],
    conversationId?: string,
    projectId?: string,
  ): Promise<MemoryRecord> {
    const record = await memoryStore.create({
      userId,
      content,
      temporalContext: {
        values: Float64Array.from(signature),
        capturedAt: new Date(),
      },
      temporalCoordinate: Date.now(),
      category: 'general',
      importance: 5,
      emotionalValence: 0,
      source: 'agent',
      metadata: {},
      softDeleted: false,
      conversationId,
      projectId,
    })

    const indexEntry: IndexEntry = {
      id: `idx-${record.id}`,
      memoryId: record.id,
      userId,
      contextSignature: signature,
      contentHash: content,
      importance: 5,
      temporalCoordinate: record.temporalCoordinate,
      createdAt: new Date(),
    }
    index.addEntry(indexEntry)

    return record
  }

  describe('clustering and promotion', () => {
    it('does nothing when fewer than minSourcesForCorroborated memories exist', async () => {
      // Only 1 memory — not enough to form a cluster
      await createMemory('dark mode preferred', [1, 0, 0])

      const result = await engine.consolidate(userId, makeConfig())
      expect(result.promoted).toBe(0)
      expect(result.reinforced).toBe(0)
    })

    it('promotes a cluster of similar memories to a semantic node', async () => {
      // 3 similar memories (close signatures) from different conversations
      await createMemory('user prefers dark mode', [1, 0, 0], 'conv1')
      await createMemory('dark theme requested', [0.95, 0.05, 0], 'conv2')
      await createMemory('switch to dark mode', [0.9, 0.1, 0], 'conv3')

      const result = await engine.consolidate(
        userId,
        makeConfig({
          minSourcesForCorroborated: 2,
          contextVariabilityThreshold: 0.3,
        }),
      )

      expect(result.promoted).toBeGreaterThanOrEqual(1)

      const nodes = await semanticStore.findByUser(userId)
      expect(nodes.length).toBeGreaterThanOrEqual(1)
      expect(nodes[0].tier).toBe('corroborated')
      expect(nodes[0].sourceCount).toBeGreaterThanOrEqual(2)
    })

    it('does not promote when context variability is below threshold', async () => {
      // 3 memories from same conversation (low context variability)
      await createMemory('dark mode', [1, 0, 0], 'conv1')
      await createMemory('dark theme', [0.95, 0.05, 0], 'conv1')
      await createMemory('dark colors', [0.9, 0.1, 0], 'conv1')

      const result = await engine.consolidate(
        userId,
        makeConfig({
          contextVariabilityThreshold: 0.5,
        }),
      )

      expect(result.promoted).toBe(0)
    })

    it('reinforces existing semantic node when new cluster matches', async () => {
      // Create real original source memories
      const old1 = await createMemory('original dark mode', [1, 0, 0], 'conv1')
      const old2 = await createMemory('original theme', [0.98, 0.02, 0], 'conv2')

      await semanticStore.create({
        userId,
        content: 'user prefers dark mode',
        category: 'preference',
        centroidVector: [1, 0, 0],
        contentHash: 'dark-mode',
        tier: 'corroborated',
        confidence: { probability: 0.7, confidence: 0.5 },
        sourceMemoryIds: [old1.id, old2.id],
        sourceCount: 2,
        contextVariability: 0.6,
        dissents: [],
        lastReinforcedAt: new Date(Date.now() - 86400000), // yesterday
        softDeleted: false,
      })

      // New similar memories
      await createMemory('dark mode again', [0.95, 0.05, 0], 'conv4')
      await createMemory('still dark mode', [0.9, 0.1, 0], 'conv5')

      const result = await engine.consolidate(
        userId,
        makeConfig({
          minSourcesForCorroborated: 2,
          contextVariabilityThreshold: 0.0,
        }),
      )

      expect(result.reinforced).toBeGreaterThanOrEqual(1)

      const nodes = await semanticStore.findByUser(userId)
      expect(nodes[0].sourceCount).toBeGreaterThan(2)
    })
  })

  describe('confidence and tiers', () => {
    it('caps confidence at singleSourceCeiling when only 1 source', async () => {
      // Force promotion with 1 source by setting threshold to 1
      await createMemory('unique fact', [1, 0, 0], 'conv1')

      const result = await engine.consolidate(
        userId,
        makeConfig({
          minSourcesForCorroborated: 1,
          contextVariabilityThreshold: 0.0,
          singleSourceCeiling: 0.6,
        }),
      )

      if (result.promoted > 0) {
        const nodes = await semanticStore.findByUser(userId)
        expect(nodes[0].confidence.confidence).toBeLessThanOrEqual(0.6)
      }
    })

    it('promotes to assessed after enough sources and consolidation cycles', async () => {
      // Create 3 real source memories
      const s1 = await createMemory('source a', [1, 0, 0], 'convA')
      const s2 = await createMemory('source b', [0.98, 0.02, 0], 'convB')
      const s3 = await createMemory('source c', [0.96, 0.04, 0], 'convC')

      const node = await semanticStore.create({
        userId,
        content: 'well-established fact',
        category: 'general',
        centroidVector: [1, 0, 0],
        contentHash: 'established',
        tier: 'corroborated',
        confidence: { probability: 0.8, confidence: 0.7 },
        sourceMemoryIds: [s1.id, s2.id, s3.id],
        sourceCount: 3,
        contextVariability: 0.7,
        dissents: [],
        lastReinforcedAt: new Date(),
        softDeleted: false,
      })
      // Simulate 2 prior consolidation cycles
      await semanticStore.update(node.id, { consolidationCount: 2 })

      // Add a 4th source from a different conversation
      await createMemory('confirming fact', [0.95, 0.05, 0], 'conv6')

      await engine.consolidate(
        userId,
        makeConfig({
          minSourcesForCorroborated: 2,
          minSourcesForAssessed: 4,
          minCyclesForAssessed: 2,
          contextVariabilityThreshold: 0.0,
        }),
      )

      const updated = await semanticStore.get(node.id)
      expect(updated!.tier).toBe('assessed')
    })

    it('promotes to baseline at high sourceCount and confidence', async () => {
      // Create 7 real source memories
      const sourceIds: string[] = []
      for (let i = 0; i < 7; i++) {
        const m = await createMemory(`source ${i}`, [1, 0, 0], `conv-base-${i}`)
        sourceIds.push(m.id)
      }

      const node = await semanticStore.create({
        userId,
        content: 'rock-solid knowledge',
        category: 'general',
        centroidVector: [1, 0, 0],
        contentHash: 'solid',
        tier: 'assessed',
        confidence: { probability: 0.9, confidence: 0.85 },
        sourceMemoryIds: sourceIds,
        sourceCount: 7,
        contextVariability: 0.8,
        dissents: [],
        lastReinforcedAt: new Date(),
        softDeleted: false,
      })
      await semanticStore.update(node.id, { consolidationCount: 5 })

      // Add 8th source
      await createMemory('confirmed again', [0.95, 0.05, 0], 'conv7')

      await engine.consolidate(
        userId,
        makeConfig({
          minSourcesForBaseline: 8,
          minConfidenceForBaseline: 0.8,
          contextVariabilityThreshold: 0.0,
        }),
      )

      const updated = await semanticStore.get(node.id)
      expect(updated!.tier).toBe('baseline')
    })
  })

  describe('anti-anchoring', () => {
    it('decays stale nodes that have not been reinforced', async () => {
      const staleDate = new Date(Date.now() - 45 * 86400000) // 45 days ago
      const node = await semanticStore.create({
        userId,
        content: 'stale fact',
        category: 'general',
        centroidVector: [0, 1, 0],
        contentHash: 'stale',
        tier: 'corroborated',
        confidence: { probability: 0.8, confidence: 0.7 },
        sourceMemoryIds: ['m1', 'm2'],
        sourceCount: 2,
        contextVariability: 0.6,
        dissents: [],
        lastReinforcedAt: staleDate,
        softDeleted: false,
      })

      const result = await engine.consolidate(
        userId,
        makeConfig({
          staleThresholdDays: 30,
          staleDecayRate: 0.9,
        }),
      )

      expect(result.decayed).toBeGreaterThanOrEqual(1)
      const updated = await semanticStore.get(node.id)
      expect(updated!.confidence.confidence).toBeLessThan(0.7)
    })

    it('does not decay recently reinforced nodes', async () => {
      // Create real source memories with signatures DIFFERENT from the node's centroid
      // to avoid accidental reinforcement via clustering
      const m1 = await createMemory('source 1', [0, 0, 1], 'convA')
      const m2 = await createMemory('source 2', [0, 0, 0.95], 'convB')

      const node = await semanticStore.create({
        userId,
        content: 'fresh fact',
        category: 'general',
        centroidVector: [0, 1, 0], // orthogonal to source signatures
        contentHash: 'fresh',
        tier: 'corroborated',
        confidence: { probability: 0.8, confidence: 0.7 },
        sourceMemoryIds: [m1.id, m2.id],
        sourceCount: 2,
        contextVariability: 0.6,
        dissents: [],
        lastReinforcedAt: new Date(), // just now
        softDeleted: false,
      })

      await engine.consolidate(
        userId,
        makeConfig({
          staleThresholdDays: 30,
        }),
      )

      const updated = await semanticStore.get(node.id)
      expect(updated!.confidence.confidence).toBe(0.7)
    })
  })

  describe('progressive compression', () => {
    it('marks well-predicted episodic memories as compressed', async () => {
      // Create a strong semantic node
      await semanticStore.create({
        userId,
        content: 'user likes dark mode',
        category: 'preference',
        centroidVector: [1, 0, 0],
        contentHash: 'dark',
        tier: 'assessed',
        confidence: { probability: 0.9, confidence: 0.8 },
        sourceMemoryIds: ['m1', 'm2', 'm3', 'm4'],
        sourceCount: 4,
        contextVariability: 0.7,
        dissents: [],
        lastReinforcedAt: new Date(),
        softDeleted: false,
      })

      // Create episodic memory with very similar signature
      const mem = await createMemory('dark mode again', [0.99, 0.01, 0], 'conv8')

      const result = await engine.consolidate(
        userId,
        makeConfig({
          compressionThreshold: 0.85,
        }),
      )

      expect(result.compressed).toBeGreaterThanOrEqual(1)
      const updated = await memoryStore.get(mem.id)
      expect(updated!.metadata.semanticCompressed).toBe(true)
    })

    it('does not compress episodic memories matched to raw-tier nodes', async () => {
      await semanticStore.create({
        userId,
        content: 'weak assertion',
        category: 'general',
        centroidVector: [1, 0, 0],
        contentHash: 'weak',
        tier: 'raw',
        confidence: { probability: 0.5, confidence: 0.3 },
        sourceMemoryIds: ['m1'],
        sourceCount: 1,
        contextVariability: 0.2,
        dissents: [],
        lastReinforcedAt: new Date(),
        softDeleted: false,
      })

      const mem = await createMemory('similar to weak', [0.99, 0.01, 0], 'conv9')

      await engine.consolidate(
        userId,
        makeConfig({
          compressionThreshold: 0.85,
        }),
      )

      const updated = await memoryStore.get(mem.id)
      expect(updated!.metadata.semanticCompressed).toBeUndefined()
    })
  })

  describe('cascade invalidation', () => {
    it('reduces confidence when source memory is deleted', async () => {
      // Create memories then soft-delete one
      const m1 = await createMemory('fact source 1', [1, 0, 0], 'conv1')
      const m2 = await createMemory('fact source 2', [0.95, 0.05, 0], 'conv2')
      await memoryStore.softDelete(m1.id)

      const node = await semanticStore.create({
        userId,
        content: 'fact from deleted source',
        category: 'general',
        centroidVector: [0.975, 0.025, 0],
        contentHash: 'cascade-test',
        tier: 'corroborated',
        confidence: { probability: 0.8, confidence: 0.7 },
        sourceMemoryIds: [m1.id, m2.id],
        sourceCount: 2,
        contextVariability: 0.6,
        dissents: [],
        lastReinforcedAt: new Date(),
        softDeleted: false,
      })

      await engine.consolidate(userId, makeConfig())

      const updated = await semanticStore.get(node.id)
      expect(updated!.confidence.confidence).toBeLessThan(0.7)
    })
  })

  describe('dissent', () => {
    it('records dissent when new evidence contradicts existing node', async () => {
      // Create a semantic node about preferring dark mode
      const node = await semanticStore.create({
        userId,
        content: 'user prefers dark mode',
        category: 'preference',
        centroidVector: [1, 0, 0],
        contentHash: 'dark-mode',
        tier: 'assessed',
        confidence: { probability: 0.8, confidence: 0.7 },
        sourceMemoryIds: ['m1', 'm2', 'm3', 'm4'],
        sourceCount: 4,
        contextVariability: 0.7,
        dissents: [],
        lastReinforcedAt: new Date(),
        softDeleted: false,
      })

      // Create a contradicting memory (marked in metadata)
      await createMemory('user wants light mode', [0.95, 0.05, 0], 'conv10')
      // Mark it as contradicting via metadata
      const memories = await memoryStore.findByUser(userId)
      const lastMem = memories[memories.length - 1]
      await memoryStore.update(lastMem.id, {
        metadata: { ...lastMem.metadata, contradicts: node.id },
      })

      const result = await engine.consolidate(
        userId,
        makeConfig({
          contextVariabilityThreshold: 0.0,
        }),
      )

      expect(result.contradictions).toBeGreaterThanOrEqual(1)
      const updated = await semanticStore.get(node.id)
      expect(updated!.dissents.length).toBeGreaterThanOrEqual(1)
    })
  })
})
