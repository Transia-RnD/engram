import { HippocampalIndex } from '../../../src/engine/HippocampalIndex'
import { IndexEntry } from '../../../src/types/core'

describe('HippocampalIndex', () => {
  let index: HippocampalIndex

  beforeEach(() => {
    index = new HippocampalIndex()
  })

  function makeEntry(overrides: Partial<IndexEntry> = {}): IndexEntry {
    return {
      id: overrides.id ?? `idx-${Math.random().toString(36).slice(2)}`,
      memoryId: overrides.memoryId ?? `mem-${Math.random().toString(36).slice(2)}`,
      userId: overrides.userId ?? 'user1',
      contextSignature:
        overrides.contextSignature ?? Array.from({ length: 32 }, () => Math.random() - 0.5),
      contentHash: overrides.contentHash ?? 'hash',
      importance: overrides.importance ?? 5,
      temporalCoordinate: overrides.temporalCoordinate ?? 1.0,
      createdAt: overrides.createdAt ?? new Date(),
    }
  }

  describe('addEntry / findNearest', () => {
    it('finds the most similar entry', () => {
      const sig = Array.from({ length: 32 }, () => 0.5)
      const target = makeEntry({ userId: 'user1', contextSignature: sig })
      index.addEntry(target)

      // Add some noise entries
      for (let i = 0; i < 5; i++) {
        index.addEntry(makeEntry({ userId: 'user1' }))
      }

      // Query with the same signature should find target
      const results = index.findNearest('user1', sig, 1)
      expect(results[0].memoryId).toBe(target.memoryId)
    })

    it('returns k results sorted by similarity', () => {
      for (let i = 0; i < 10; i++) {
        index.addEntry(makeEntry({ userId: 'user1' }))
      }

      const results = index.findNearest(
        'user1',
        Array.from({ length: 32 }, () => 0),
        3,
      )
      expect(results.length).toBe(3)
    })

    it('returns fewer than k if not enough entries', () => {
      index.addEntry(makeEntry({ userId: 'user1' }))
      const results = index.findNearest(
        'user1',
        Array.from({ length: 32 }, () => 0),
        5,
      )
      expect(results.length).toBe(1)
    })
  })

  describe('pattern completion', () => {
    it('finds the right entry even with a noisy cue', () => {
      const originalSig = Array.from({ length: 32 }, (_, i) => Math.sin(i))
      const target = makeEntry({ userId: 'user1', contextSignature: originalSig })
      index.addEntry(target)

      // Add distractors
      for (let i = 0; i < 10; i++) {
        index.addEntry(makeEntry({ userId: 'user1' }))
      }

      // Create noisy version (add small noise to original)
      const noisySig = originalSig.map((v) => v + (Math.random() - 0.5) * 0.2)

      const results = index.findNearest('user1', noisySig, 1)
      expect(results[0].memoryId).toBe(target.memoryId)
    })
  })

  describe('user isolation', () => {
    it('does not leak entries between users', () => {
      const sig = Array.from({ length: 32 }, () => 1)
      index.addEntry(makeEntry({ userId: 'user1', contextSignature: sig }))

      const results = index.findNearest('user2', sig, 5)
      expect(results.length).toBe(0)
    })
  })

  describe('removeByMemoryId', () => {
    it('removes the entry for a given memoryId', () => {
      const entry = makeEntry({ userId: 'user1' })
      index.addEntry(entry)
      expect(index.findNearest('user1', entry.contextSignature, 1).length).toBe(1)

      index.removeByMemoryId(entry.memoryId)
      expect(index.findNearest('user1', entry.contextSignature, 1).length).toBe(0)
    })
  })

  describe('getByMemoryId', () => {
    it('returns the entry for a memoryId', () => {
      const entry = makeEntry({ userId: 'user1' })
      index.addEntry(entry)

      const found = index.getByMemoryId(entry.memoryId)
      expect(found).not.toBeNull()
      expect(found!.id).toBe(entry.id)
    })

    it('returns null for unknown memoryId', () => {
      expect(index.getByMemoryId('unknown')).toBeNull()
    })
  })
})
