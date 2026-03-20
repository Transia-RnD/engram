import { InMemoryMemoryStore, InMemoryEdgeStore } from '../../../src/storage/InMemoryStores'
import { InMemorySemanticStore } from '../../../src/storage/InMemorySemanticStore'

describe('InMemoryMemoryStore — error handling', () => {
  let store: InMemoryMemoryStore

  beforeEach(() => {
    store = new InMemoryMemoryStore()
  })

  it('update throws for non-existent record', async () => {
    await expect(store.update('nonexistent', { content: 'x' })).rejects.toThrow('not found')
  })

  it('softDelete throws for non-existent record', async () => {
    await expect(store.softDelete('nonexistent')).rejects.toThrow('not found')
  })

  it('get returns null for non-existent record', async () => {
    expect(await store.get('nonexistent')).toBeNull()
  })

  it('getMany returns only existing records', async () => {
    expect(await store.getMany(['a', 'b', 'c'])).toEqual([])
  })
})

describe('InMemoryEdgeStore — error handling', () => {
  let store: InMemoryEdgeStore

  beforeEach(() => {
    store = new InMemoryEdgeStore()
  })

  it('updateWeight throws for non-existent edge', async () => {
    await expect(store.updateWeight('nonexistent', 0.5)).rejects.toThrow('not found')
  })

  it('incrementTraversal throws for non-existent edge', async () => {
    await expect(store.incrementTraversal('nonexistent')).rejects.toThrow('not found')
  })

  it('delete succeeds silently for non-existent edge', async () => {
    // delete is idempotent — Map.delete on missing key is a no-op
    await expect(store.delete('nonexistent')).resolves.toBeUndefined()
  })
})

describe('InMemorySemanticStore — error handling', () => {
  let store: InMemorySemanticStore

  beforeEach(() => {
    store = new InMemorySemanticStore()
  })

  it('update throws for non-existent node', async () => {
    await expect(store.update('nonexistent', { content: 'x' })).rejects.toThrow('not found')
  })

  it('softDelete throws for non-existent node', async () => {
    await expect(store.softDelete('nonexistent')).rejects.toThrow('not found')
  })

  it('updateEdge throws for non-existent edge', async () => {
    await expect(store.updateEdge('nonexistent', { weight: 0.5 })).rejects.toThrow('not found')
  })

  it('get returns null for non-existent node', async () => {
    expect(await store.get('nonexistent')).toBeNull()
  })

  it('findByContentHash returns null when no match', async () => {
    expect(await store.findByContentHash('user1', 'nohash')).toBeNull()
  })

  it('findNearestByCentroid returns empty for unknown user', async () => {
    expect(await store.findNearestByCentroid('unknown', [1, 0], 5)).toEqual([])
  })
})
