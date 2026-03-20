import { IndexEntry } from '../types/core'
import { cosineSimilarity } from '../math/vectors'

/**
 * HippocampalIndex (inspired by Teyler & DiScenna, 1986)
 *
 * A sparse pointer network that stores compressed context signatures.
 * The index is what you SEARCH (small, fast).
 * It points to full memory records stored elsewhere (the "neocortex").
 *
 * Pattern completion: a partial/noisy cue activates the best-matching
 * index entry, which then dereferences to the full memory record.
 *
 * This is an in-memory implementation. The IIndexStore interface
 * provides the persistent version (MongoDB, etc.).
 */
export class HippocampalIndex {
  private entries: Map<string, IndexEntry[]> = new Map() // userId -> entries
  private memoryIdMap: Map<string, IndexEntry> = new Map() // memoryId -> entry

  addEntry(entry: IndexEntry): void {
    const userEntries = this.entries.get(entry.userId) ?? []
    userEntries.push(entry)
    this.entries.set(entry.userId, userEntries)
    this.memoryIdMap.set(entry.memoryId, entry)
  }

  /**
   * Find the k nearest index entries by cosine similarity of context signatures.
   * This is the "hippocampal lookup" — fast scan over compressed signatures.
   */
  findNearest(userId: string, signature: number[], k: number): IndexEntry[] {
    const userEntries = this.entries.get(userId) ?? []
    if (userEntries.length === 0) return []

    const querySig = Float64Array.from(signature)

    const scored = userEntries.map((entry) => ({
      entry,
      similarity: cosineSimilarity(querySig, Float64Array.from(entry.contextSignature)),
    }))

    scored.sort((a, b) => b.similarity - a.similarity)

    return scored.slice(0, k).map((s) => s.entry)
  }

  removeByMemoryId(memoryId: string): void {
    const entry = this.memoryIdMap.get(memoryId)
    if (!entry) return

    const userEntries = this.entries.get(entry.userId)
    if (userEntries) {
      const idx = userEntries.findIndex((e) => e.memoryId === memoryId)
      if (idx !== -1) userEntries.splice(idx, 1)
    }
    this.memoryIdMap.delete(memoryId)
  }

  getByMemoryId(memoryId: string): IndexEntry | null {
    return this.memoryIdMap.get(memoryId) ?? null
  }
}
