import { InMemorySemanticStore } from '../../../src/storage/InMemorySemanticStore'
import { SemanticNode } from '../../../src/types/semantic'

describe('InMemorySemanticStore', () => {
  let store: InMemorySemanticStore

  beforeEach(() => {
    store = new InMemorySemanticStore()
  })

  function makeNode(
    overrides: Partial<
      Omit<SemanticNode, 'id' | 'createdAt' | 'accessCount' | 'consolidationCount'>
    > = {},
  ): Omit<SemanticNode, 'id' | 'createdAt' | 'accessCount' | 'consolidationCount'> {
    return {
      userId: 'user1',
      content: 'user prefers dark mode',
      category: 'preference',
      centroidVector: [1, 0, 0],
      contentHash: 'abc123',
      tier: 'corroborated',
      confidence: { probability: 0.8, confidence: 0.7 },
      sourceMemoryIds: ['mem1', 'mem2'],
      sourceCount: 2,
      contextVariability: 0.6,
      dissents: [],
      lastReinforcedAt: new Date(),
      lastAccessedAt: undefined,
      updatedAt: undefined,
      softDeleted: false,
      ...overrides,
    }
  }

  describe('CRUD', () => {
    it('creates a semantic node and retrieves it by id', async () => {
      const node = await store.create(makeNode())
      expect(node.id).toBeDefined()
      expect(node.createdAt).toBeInstanceOf(Date)
      expect(node.accessCount).toBe(0)
      expect(node.consolidationCount).toBe(0)

      const retrieved = await store.get(node.id)
      expect(retrieved).not.toBeNull()
      expect(retrieved!.content).toBe('user prefers dark mode')
    })

    it('returns null for non-existent id', async () => {
      expect(await store.get('nonexistent')).toBeNull()
    })

    it('getMany returns matching nodes', async () => {
      const n1 = await store.create(makeNode({ content: 'first' }))
      const n2 = await store.create(makeNode({ content: 'second' }))
      await store.create(makeNode({ content: 'third' }))

      const results = await store.getMany([n1.id, n2.id, 'fake'])
      expect(results).toHaveLength(2)
      expect(results.map((r) => r.content)).toEqual(['first', 'second'])
    })

    it('update patches fields and sets updatedAt', async () => {
      const node = await store.create(makeNode())
      await store.update(node.id, { content: 'updated content', sourceCount: 5 })

      const updated = await store.get(node.id)
      expect(updated!.content).toBe('updated content')
      expect(updated!.sourceCount).toBe(5)
      expect(updated!.updatedAt).toBeInstanceOf(Date)
    })

    it('softDelete marks node as deleted', async () => {
      const node = await store.create(makeNode())
      await store.softDelete(node.id)

      const deleted = await store.get(node.id)
      expect(deleted!.softDeleted).toBe(true)
    })
  })

  describe('findByUser', () => {
    it('returns only nodes for the given user', async () => {
      await store.create(makeNode({ userId: 'user1', content: 'a' }))
      await store.create(makeNode({ userId: 'user2', content: 'b' }))
      await store.create(makeNode({ userId: 'user1', content: 'c' }))

      const results = await store.findByUser('user1')
      expect(results).toHaveLength(2)
    })

    it('excludes soft-deleted nodes', async () => {
      const node = await store.create(makeNode())
      await store.softDelete(node.id)

      const results = await store.findByUser('user1')
      expect(results).toHaveLength(0)
    })

    it('filters by category', async () => {
      await store.create(makeNode({ category: 'preference' }))
      await store.create(makeNode({ category: 'skill' }))

      const results = await store.findByUser('user1', { category: 'preference' })
      expect(results).toHaveLength(1)
      expect(results[0].category).toBe('preference')
    })

    it('filters by tier', async () => {
      await store.create(makeNode({ tier: 'raw' }))
      await store.create(makeNode({ tier: 'baseline' }))

      const results = await store.findByUser('user1', { tier: 'baseline' })
      expect(results).toHaveLength(1)
      expect(results[0].tier).toBe('baseline')
    })

    it('respects limit', async () => {
      await store.create(makeNode({ content: 'a' }))
      await store.create(makeNode({ content: 'b' }))
      await store.create(makeNode({ content: 'c' }))

      const results = await store.findByUser('user1', { limit: 2 })
      expect(results).toHaveLength(2)
    })
  })

  describe('findByContentHash', () => {
    it('finds exact match by hash', async () => {
      await store.create(makeNode({ contentHash: 'hash1', content: 'first' }))
      await store.create(makeNode({ contentHash: 'hash2', content: 'second' }))

      const result = await store.findByContentHash('user1', 'hash1')
      expect(result).not.toBeNull()
      expect(result!.content).toBe('first')
    })

    it('returns null when no match', async () => {
      expect(await store.findByContentHash('user1', 'nope')).toBeNull()
    })

    it('scoped to user', async () => {
      await store.create(makeNode({ userId: 'user1', contentHash: 'hash1' }))
      expect(await store.findByContentHash('user2', 'hash1')).toBeNull()
    })
  })

  describe('findNearestByCentroid', () => {
    it('returns k nearest by cosine similarity', async () => {
      await store.create(makeNode({ centroidVector: [1, 0, 0], content: 'aligned' }))
      await store.create(makeNode({ centroidVector: [0, 1, 0], content: 'orthogonal' }))
      await store.create(makeNode({ centroidVector: [0.9, 0.1, 0], content: 'close' }))

      const results = await store.findNearestByCentroid('user1', [1, 0, 0], 2)
      expect(results).toHaveLength(2)
      expect(results[0].content).toBe('aligned')
      expect(results[1].content).toBe('close')
    })

    it('excludes soft-deleted nodes', async () => {
      const node = await store.create(makeNode({ centroidVector: [1, 0, 0] }))
      await store.softDelete(node.id)

      const results = await store.findNearestByCentroid('user1', [1, 0, 0], 5)
      expect(results).toHaveLength(0)
    })

    it('scoped to user', async () => {
      await store.create(makeNode({ userId: 'user1', centroidVector: [1, 0, 0] }))
      await store.create(makeNode({ userId: 'user2', centroidVector: [1, 0, 0] }))

      const results = await store.findNearestByCentroid('user1', [1, 0, 0], 10)
      expect(results).toHaveLength(1)
    })
  })

  describe('findBySourceMemory', () => {
    it('returns nodes that reference the given memory id', async () => {
      await store.create(makeNode({ sourceMemoryIds: ['mem1', 'mem2'], content: 'has mem1' }))
      await store.create(makeNode({ sourceMemoryIds: ['mem3'], content: 'no mem1' }))

      const results = await store.findBySourceMemory('mem1')
      expect(results).toHaveLength(1)
      expect(results[0].content).toBe('has mem1')
    })
  })

  describe('edges', () => {
    it('creates and retrieves semantic edges', async () => {
      const edge = await store.createEdge({
        userId: 'user1',
        sourceNodeId: 'node1',
        targetNodeId: 'node2',
        relationship: 'prefers',
        weight: 0.8,
      })
      expect(edge.id).toBeDefined()
      expect(edge.createdAt).toBeInstanceOf(Date)

      const edges = await store.getEdges('node1')
      expect(edges).toHaveLength(1)
      expect(edges[0].relationship).toBe('prefers')
    })

    it('filters edges by relationship', async () => {
      await store.createEdge({
        userId: 'user1',
        sourceNodeId: 'node1',
        targetNodeId: 'node2',
        relationship: 'prefers',
        weight: 0.8,
      })
      await store.createEdge({
        userId: 'user1',
        sourceNodeId: 'node1',
        targetNodeId: 'node3',
        relationship: 'contradicts',
        weight: 0.5,
      })

      const filtered = await store.getEdges('node1', 'prefers')
      expect(filtered).toHaveLength(1)
      expect(filtered[0].targetNodeId).toBe('node2')
    })

    it('updates edge fields', async () => {
      const edge = await store.createEdge({
        userId: 'user1',
        sourceNodeId: 'node1',
        targetNodeId: 'node2',
        relationship: 'prefers',
        weight: 0.5,
      })
      await store.updateEdge(edge.id, { weight: 0.9 })

      const edges = await store.getEdges('node1')
      expect(edges[0].weight).toBe(0.9)
    })

    it('deletes an edge', async () => {
      const edge = await store.createEdge({
        userId: 'user1',
        sourceNodeId: 'node1',
        targetNodeId: 'node2',
        relationship: 'prefers',
        weight: 0.5,
      })
      await store.deleteEdge(edge.id)

      const edges = await store.getEdges('node1')
      expect(edges).toHaveLength(0)
    })
  })
})
