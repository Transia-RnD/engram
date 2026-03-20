import { MemoryRecord } from './types/core'
import {
  RememberOptions,
  RecallOptions,
  ConsolidationOptions,
  EngramConfig,
  DEFAULT_CONFIG,
} from './types/options'
import { IMemoryStore, IEdgeStore, ISemanticStore } from './types/storage'
import { TemporalContextModel } from './engine/TemporalContextModel'
import { TimeCellNetwork } from './engine/TimeCellNetwork'
import { HippocampalIndex } from './engine/HippocampalIndex'
import { MiddleOutRetrieval, RetrievalResult } from './engine/MiddleOutRetrieval'
import { EncodingPipeline } from './pipeline/EncodingPipeline'
import { ConsolidationPipeline, ConsolidationResult } from './pipeline/ConsolidationPipeline'
import { InMemoryMemoryStore, InMemoryEdgeStore } from './storage/InMemoryStores'
import { InMemorySemanticStore } from './storage/InMemorySemanticStore'
import { EngramLogger } from './logger'

/**
 * EngramService: the public facade for the engram temporal memory system.
 *
 * Provides: remember(), recall(), forget(), consolidate()
 *
 * With semantic store: recall also returns semantic nodes (context-free knowledge
 * extracted from repeated episodic patterns during consolidation).
 */
export class EngramService {
  private readonly tcm: TemporalContextModel
  private readonly tcn: TimeCellNetwork
  private readonly index: HippocampalIndex
  private readonly memoryStore: IMemoryStore
  private readonly edgeStore: IEdgeStore
  private readonly semanticStore?: ISemanticStore
  private readonly encoding: EncodingPipeline
  private readonly consolidation: ConsolidationPipeline
  private readonly retrieval: MiddleOutRetrieval
  private readonly config: EngramConfig
  private readonly log: EngramLogger

  constructor(
    memoryStore: IMemoryStore,
    edgeStore: IEdgeStore,
    config: Partial<EngramConfig> = {},
    semanticStore?: ISemanticStore,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    EngramService.validateConfig(this.config)
    this.log = this.config.logger

    this.memoryStore = memoryStore
    this.edgeStore = edgeStore
    this.semanticStore = semanticStore

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
      this.log,
    )

    // Wire semantic store into encoding for schema-gating
    if (semanticStore) {
      this.encoding.setSemanticStore(semanticStore)
    }

    this.consolidation = new ConsolidationPipeline(
      this.edgeStore,
      this.memoryStore,
      this.log,
      semanticStore,
      this.index,
    )

    this.retrieval = new MiddleOutRetrieval(
      (id) => this.memoryStore.get(id),
      (userId, memoryId, direction) => this.edgeStore.getEdges(userId, memoryId, direction),
      this.log,
    )
  }

  private static validateConfig(config: EngramConfig): void {
    if (config.contextDimension <= 0 || !Number.isInteger(config.contextDimension)) {
      throw new Error(
        `EngramConfig: contextDimension must be a positive integer, got ${config.contextDimension}`,
      )
    }
    if (config.signatureDimension <= 0 || !Number.isInteger(config.signatureDimension)) {
      throw new Error(
        `EngramConfig: signatureDimension must be a positive integer, got ${config.signatureDimension}`,
      )
    }
    if (config.signatureDimension > config.contextDimension) {
      throw new Error(
        `EngramConfig: signatureDimension (${config.signatureDimension}) must be <= contextDimension (${config.contextDimension})`,
      )
    }
    if (config.betaEncoding < 0 || config.betaEncoding > 1) {
      throw new Error(`EngramConfig: betaEncoding must be in [0, 1], got ${config.betaEncoding}`)
    }
    if (config.betaRetrieval < 0 || config.betaRetrieval > 1) {
      throw new Error(`EngramConfig: betaRetrieval must be in [0, 1], got ${config.betaRetrieval}`)
    }
    if (config.defaultForwardBias <= 0) {
      throw new Error(
        `EngramConfig: defaultForwardBias must be positive, got ${config.defaultForwardBias}`,
      )
    }
    if (config.timeScaleMs <= 0) {
      throw new Error(`EngramConfig: timeScaleMs must be positive, got ${config.timeScaleMs}`)
    }
    if (config.neighborK <= 0 || !Number.isInteger(config.neighborK)) {
      throw new Error(`EngramConfig: neighborK must be a positive integer, got ${config.neighborK}`)
    }
  }

  /**
   * Create an in-memory EngramService for testing or CLI usage.
   * Includes semantic store by default.
   */
  static createInMemory(config: Partial<EngramConfig> = {}): EngramService {
    return new EngramService(
      new InMemoryMemoryStore(),
      new InMemoryEdgeStore(),
      config,
      new InMemorySemanticStore(),
    )
  }

  /**
   * Store a new memory with temporal context encoding.
   * If a semantic store is available, schema-gating runs automatically.
   */
  async remember(
    userId: string,
    content: string,
    options: RememberOptions = {},
  ): Promise<MemoryRecord> {
    if (!userId || typeof userId !== 'string') {
      throw new Error('remember: userId must be a non-empty string')
    }
    if (!content || typeof content !== 'string') {
      throw new Error('remember: content must be a non-empty string')
    }
    if (options.importance !== undefined && (options.importance < 0 || options.importance > 10)) {
      throw new Error(`remember: importance must be in [0, 10], got ${options.importance}`)
    }
    if (
      options.emotionalValence !== undefined &&
      (options.emotionalValence < -1 || options.emotionalValence > 1)
    ) {
      throw new Error(
        `remember: emotionalValence must be in [-1, 1], got ${options.emotionalValence}`,
      )
    }
    return this.encoding.encode(userId, content, options)
  }

  /**
   * Recall memories using middle-out retrieval from temporal context.
   * If a semantic store is available, also returns matching semantic nodes.
   */
  async recall(
    userId: string,
    query: string,
    options: RecallOptions = {},
  ): Promise<RetrievalResult> {
    if (!userId || typeof userId !== 'string') {
      throw new Error('recall: userId must be a non-empty string')
    }
    if (!query || typeof query !== 'string') {
      throw new Error('recall: query must be a non-empty string')
    }
    if (options.maxResults !== undefined && options.maxResults <= 0) {
      throw new Error(`recall: maxResults must be positive, got ${options.maxResults}`)
    }
    if (options.maxHops !== undefined && options.maxHops < 0) {
      throw new Error(`recall: maxHops must be non-negative, got ${options.maxHops}`)
    }

    // Generate query context by encoding the query (without storing)
    const queryInput = this.tcm.contentToInput(query)
    const querySignature = this.tcm.compressToSignature(queryInput)

    // Find nearest index entry (hippocampal lookup)
    const indexHits = this.index.findNearest(userId, querySignature, 1)

    let result: RetrievalResult

    if (indexHits.length === 0) {
      this.log.debug(
        'RECALL',
        `no index hits for userId=${userId} query="${query.slice(0, 60)}" — returning empty`,
      )
      result = { memories: [], chain: [], totalHops: 0 }
    } else {
      // Pattern completion: retrieve full memory at best match
      const origin = await this.memoryStore.get(indexHits[0].memoryId)
      if (!origin || origin.softDeleted) {
        this.log.warn(
          'RECALL',
          `index hit memoryId=${indexHits[0].memoryId} resolved to ${!origin ? 'null' : 'soft-deleted'} record — stale index entry`,
          { userId, memoryId: indexHits[0].memoryId },
        )
        result = { memories: [], chain: [], totalHops: 0 }
      } else {
        // Update context via TCM recall (creates forward bias)
        this.tcm.recall(userId, origin.temporalContext.values)

        // Middle-out expansion
        result = await this.retrieval.retrieve(userId, origin, {
          maxHops: options.maxHops ?? 5,
          relevanceThreshold: options.relevanceThreshold ?? 0,
          maxResults: options.maxResults ?? 10,
          forwardBias: options.forwardBias ?? this.config.defaultForwardBias,
          backwardBias: options.backwardBias ?? 1.0,
        })

        // Filter out soft-deleted memories
        result.memories = result.memories.filter((m) => !m.softDeleted)
        result.chain = result.chain.filter((c) => result.memories.some((m) => m.id === c.memoryId))

        // Update access counts
        for (const memory of result.memories) {
          await this.memoryStore.update(memory.id, {
            accessCount: memory.accessCount + 1,
            lastAccessedAt: new Date(),
          })
        }
      }
    }

    // Semantic overlay: also query semantic nodes
    if (this.semanticStore && options.includeSemanticNodes !== false) {
      const minConfidence = options.minSemanticConfidence ?? 0.1
      const semanticHits = await this.semanticStore.findNearestByCentroid(
        userId,
        Array.from(querySignature),
        options.maxResults ?? 5,
      )
      result.semanticNodes = semanticHits.filter(
        (n) => !n.softDeleted && n.confidence.confidence >= minConfidence,
      )
    }

    return result
  }

  /**
   * Soft-delete a memory and remove its index entry.
   */
  async forget(userId: string, memoryId: string): Promise<void> {
    if (!userId || typeof userId !== 'string') {
      throw new Error('forget: userId must be a non-empty string')
    }
    if (!memoryId || typeof memoryId !== 'string') {
      throw new Error('forget: memoryId must be a non-empty string')
    }
    await this.memoryStore.softDelete(memoryId)
    this.index.removeByMemoryId(memoryId)
  }

  /**
   * Run consolidation (Phase 1: edge maintenance, Phase 2: semantic extraction).
   */
  async consolidate(
    userId: string,
    options: ConsolidationOptions = {},
  ): Promise<ConsolidationResult> {
    if (!userId || typeof userId !== 'string') {
      throw new Error('consolidate: userId must be a non-empty string')
    }
    return this.consolidation.consolidate(userId, options)
  }

  /**
   * Reset a user's temporal context state.
   */
  resetContext(userId: string): void {
    if (!userId || typeof userId !== 'string') {
      throw new Error('resetContext: userId must be a non-empty string')
    }
    this.tcm.resetContext(userId)
  }
}
