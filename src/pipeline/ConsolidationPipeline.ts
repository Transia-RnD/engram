import { IEdgeStore, IMemoryStore, ISemanticStore } from '../types/storage'
import { ConsolidationOptions } from '../types/options'
import { SemanticConsolidationResult, DEFAULT_SEMANTIC_CONFIG } from '../types/semantic'
import { SemanticConsolidation } from '../engine/SemanticConsolidation'
import { HippocampalIndex } from '../engine/HippocampalIndex'
import { EngramLogger, NOOP_LOGGER } from '../logger'

export interface ConsolidationResult {
  decayed: number
  pruned: number
  boosted: number
  semantic?: SemanticConsolidationResult
}

const DEFAULTS = {
  decayRate: 0.95,
  pruneThreshold: 0.05,
  replayBoost: 1.2,
  accessBoost: 0.1,
  batchSize: 500,
}

/**
 * ConsolidationPipeline: background process analogous to sleep consolidation.
 *
 * Phase 1: Temporal edge maintenance (existing)
 *   1. DECAY: All edge weights decay toward zero
 *   2. REPLAY: Recently traversed edges get boosted
 *   3. PRUNE: Edges below threshold are removed
 *
 * Phase 2: Semantic extraction (new, optional)
 *   4. CLUSTER: Group episodic memories by context similarity
 *   5. PROMOTE/REINFORCE: Create or update semantic nodes
 *   6. ANTI-ANCHORING: Decay stale semantic nodes
 *   7. COMPRESS: Mark well-predicted episodes as compressible
 */
export class ConsolidationPipeline {
  private readonly edgeStore: IEdgeStore
  private readonly memoryStore: IMemoryStore
  private readonly log: EngramLogger
  private readonly semanticEngine?: SemanticConsolidation

  constructor(
    edgeStore: IEdgeStore,
    memoryStore: IMemoryStore,
    logger: EngramLogger = NOOP_LOGGER,
    semanticStore?: ISemanticStore,
    index?: HippocampalIndex,
  ) {
    this.edgeStore = edgeStore
    this.memoryStore = memoryStore
    this.log = logger
    if (semanticStore && index) {
      this.semanticEngine = new SemanticConsolidation(memoryStore, semanticStore, index, logger)
    }
  }

  async consolidate(
    userId: string,
    options: Partial<ConsolidationOptions> = {},
  ): Promise<ConsolidationResult> {
    const config = { ...DEFAULTS, ...options }

    this.log.debug('CONSOLIDATION', `→ ENTER userId=${userId} edges phase starting`)

    // Phase 1: Temporal edge maintenance
    const allEdges = await this.edgeStore.getAllEdges(userId)

    const updates: { edgeId: string; newWeight: number }[] = []
    const toDelete: string[] = []
    let boosted = 0

    for (const edge of allEdges) {
      let newWeight = edge.weight * config.decayRate

      if (edge.lastTraversed) {
        newWeight *= config.replayBoost
        boosted++
      }

      if (newWeight < config.pruneThreshold) {
        toDelete.push(edge.id)
      } else {
        updates.push({ edgeId: edge.id, newWeight })
      }
    }

    await this.edgeStore.bulkUpdateWeights(updates)
    for (const edgeId of toDelete) {
      await this.edgeStore.delete(edgeId)
    }

    this.log.debug(
      'CONSOLIDATION',
      `phase1 complete: decayed=${updates.length} pruned=${toDelete.length} boosted=${boosted} totalEdges=${allEdges.length}`,
    )

    const result: ConsolidationResult = {
      decayed: updates.length,
      pruned: toDelete.length,
      boosted,
    }

    // Phase 2: Semantic consolidation (if enabled)
    if (this.semanticEngine) {
      const semanticConfig = {
        ...DEFAULT_SEMANTIC_CONFIG,
        ...(options.semantic ?? {}),
      }
      result.semantic = await this.semanticEngine.consolidate(userId, semanticConfig)
    }

    this.log.debug(
      'CONSOLIDATION',
      `→ EXIT userId=${userId} decayed=${result.decayed} pruned=${result.pruned} boosted=${result.boosted} semantic=${result.semantic ? 'yes' : 'skipped'}`,
    )

    return result
  }
}
