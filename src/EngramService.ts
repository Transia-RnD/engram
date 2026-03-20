import { MemoryRecord } from './types/core'
import { RememberOptions, RecallOptions, ConsolidationOptions, EngramConfig, DEFAULT_CONFIG } from './types/options'
import { IMemoryStore, IEdgeStore } from './types/storage'
import { TemporalContextModel } from './engine/TemporalContextModel'
import { TimeCellNetwork } from './engine/TimeCellNetwork'
import { HippocampalIndex } from './engine/HippocampalIndex'
import { MiddleOutRetrieval, RetrievalResult } from './engine/MiddleOutRetrieval'
import { EncodingPipeline } from './pipeline/EncodingPipeline'
import { ConsolidationPipeline, ConsolidationResult } from './pipeline/ConsolidationPipeline'
import { InMemoryMemoryStore, InMemoryEdgeStore } from './storage/InMemoryStores'

/**
 * EngramService: the public facade for the engram temporal memory system.
 *
 * Provides: remember(), recall(), forget(), consolidate()
 */
export class EngramService {
  private readonly tcm: TemporalContextModel
  private readonly tcn: TimeCellNetwork
  private readonly index: HippocampalIndex
  private readonly memoryStore: IMemoryStore
  private readonly edgeStore: IEdgeStore
  private readonly encoding: EncodingPipeline
  private readonly consolidation: ConsolidationPipeline
  private readonly retrieval: MiddleOutRetrieval
  private readonly config: EngramConfig

  constructor(
    memoryStore: IMemoryStore,
    edgeStore: IEdgeStore,
    config: Partial<EngramConfig> = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.memoryStore = memoryStore
    this.edgeStore = edgeStore

    this.tcm = new TemporalContextModel({
      contextDimension: this.config.contextDimension,
      betaEncoding: this.config.betaEncoding,
      betaRetrieval: this.config.betaRetrieval,
      signatureDimension: this.config.signatureDimension,
    })

    this.tcn = new TimeCellNetwork({
      timeScaleMs: this.config.timeScaleMs,
    })

    this.index = new HippocampalIndex()

    this.encoding = new EncodingPipeline(
      this.tcm,
      this.tcn,
      this.index,
      this.memoryStore,
      this.edgeStore,
      { neighborK: this.config.neighborK, forwardBias: this.config.defaultForwardBias },
    )

    this.consolidation = new ConsolidationPipeline(this.edgeStore, this.memoryStore)

    this.retrieval = new MiddleOutRetrieval(
      (id) => this.memoryStore.get(id),
      (userId, memoryId, direction) => this.edgeStore.getEdges(userId, memoryId, direction),
    )
  }

  /**
   * Create an in-memory EngramService for testing or CLI usage.
   */
  static createInMemory(config: Partial<EngramConfig> = {}): EngramService {
    return new EngramService(
      new InMemoryMemoryStore(),
      new InMemoryEdgeStore(),
      config,
    )
  }

  /**
   * Store a new memory with temporal context encoding.
   */
  async remember(
    userId: string,
    content: string,
    options: RememberOptions = {},
  ): Promise<MemoryRecord> {
    return this.encoding.encode(userId, content, options)
  }

  /**
   * Recall memories using middle-out retrieval from temporal context.
   */
  async recall(
    userId: string,
    query: string,
    options: RecallOptions = {},
  ): Promise<RetrievalResult> {
    // Generate query context by encoding the query (without storing)
    const queryInput = this.tcm.contentToInput(query)
    const querySignature = this.tcm.compressToSignature(queryInput)

    // Find nearest index entry (hippocampal lookup)
    const indexHits = this.index.findNearest(userId, querySignature, 1)

    if (indexHits.length === 0) {
      return { memories: [], chain: [], totalHops: 0 }
    }

    // Pattern completion: retrieve full memory at best match
    const origin = await this.memoryStore.get(indexHits[0].memoryId)
    if (!origin || origin.softDeleted) {
      return { memories: [], chain: [], totalHops: 0 }
    }

    // Update context via TCM recall (creates forward bias)
    this.tcm.recall(userId, origin.temporalContext.values)

    // Middle-out expansion
    const result = await this.retrieval.retrieve(userId, origin, {
      maxHops: options.maxHops ?? 5,
      relevanceThreshold: options.relevanceThreshold ?? 0,
      maxResults: options.maxResults ?? 10,
      forwardBias: options.forwardBias ?? this.config.defaultForwardBias,
      backwardBias: options.backwardBias ?? 1.0,
    })

    // Filter out soft-deleted memories
    result.memories = result.memories.filter((m) => !m.softDeleted)
    result.chain = result.chain.filter((c) =>
      result.memories.some((m) => m.id === c.memoryId),
    )

    // Update access counts
    for (const memory of result.memories) {
      await this.memoryStore.update(memory.id, {
        accessCount: memory.accessCount + 1,
        lastAccessedAt: new Date(),
      })
    }

    return result
  }

  /**
   * Soft-delete a memory and remove its index entry.
   */
  async forget(userId: string, memoryId: string): Promise<void> {
    await this.memoryStore.softDelete(memoryId)
    this.index.removeByMemoryId(memoryId)
  }

  /**
   * Run consolidation (decay edges, prune weak ones, boost traversed).
   */
  async consolidate(
    userId: string,
    options: ConsolidationOptions = {},
  ): Promise<ConsolidationResult> {
    return this.consolidation.consolidate(userId, options)
  }

  /**
   * Reset a user's temporal context state.
   */
  resetContext(userId: string): void {
    this.tcm.resetContext(userId)
  }
}
