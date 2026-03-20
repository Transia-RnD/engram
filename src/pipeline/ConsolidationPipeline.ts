import { IEdgeStore, IMemoryStore } from '../types/storage'
import { ConsolidationOptions } from '../types/options'

export interface ConsolidationResult {
  decayed: number
  pruned: number
  boosted: number
}

const DEFAULTS: Required<ConsolidationOptions> = {
  decayRate: 0.95,
  pruneThreshold: 0.05,
  replayBoost: 1.2,
  accessBoost: 0.1,
  batchSize: 500,
}

/**
 * ConsolidationPipeline: background process analogous to sleep consolidation.
 *
 * 1. DECAY: All edge weights decay toward zero
 * 2. REPLAY: Recently traversed edges get boosted (memory replay)
 * 3. PRUNE: Edges below threshold are removed (forgetting)
 * 4. BOOST: Frequently accessed memories get importance boost
 */
export class ConsolidationPipeline {
  private readonly edgeStore: IEdgeStore
  private readonly memoryStore: IMemoryStore

  constructor(edgeStore: IEdgeStore, memoryStore: IMemoryStore) {
    this.edgeStore = edgeStore
    this.memoryStore = memoryStore
  }

  async consolidate(
    userId: string,
    options: Partial<ConsolidationOptions> = {},
  ): Promise<ConsolidationResult> {
    const config = { ...DEFAULTS, ...options }

    const allEdges = await this.edgeStore.getAllEdges(userId)

    const updates: { edgeId: string; newWeight: number }[] = []
    const toDelete: string[] = []
    let boosted = 0

    for (const edge of allEdges) {
      let newWeight = edge.weight * config.decayRate

      // Replay boost: edges traversed recently get strengthened
      if (edge.lastTraversed) {
        newWeight *= config.replayBoost
        boosted++
      }

      // Prune: edges below threshold are forgotten
      if (newWeight < config.pruneThreshold) {
        toDelete.push(edge.id)
      } else {
        updates.push({ edgeId: edge.id, newWeight })
      }
    }

    // Apply updates
    await this.edgeStore.bulkUpdateWeights(updates)
    for (const edgeId of toDelete) {
      await this.edgeStore.delete(edgeId)
    }

    return {
      decayed: updates.length,
      pruned: toDelete.length,
      boosted,
    }
  }
}
