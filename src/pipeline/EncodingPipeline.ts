import { MemoryRecord } from '../types/core'
import { RememberOptions } from '../types/options'
import { IMemoryStore, IEdgeStore, ISemanticStore } from '../types/storage'
import { TemporalContextModel } from '../engine/TemporalContextModel'
import { TimeCellNetwork } from '../engine/TimeCellNetwork'
import { HippocampalIndex } from '../engine/HippocampalIndex'
import { contiguityWeight } from '../math/decay'
import { cosineSimilarity } from '../math/vectors'
import { DEFAULT_SEMANTIC_CONFIG } from '../types/semantic'
import { EngramLogger, NOOP_LOGGER } from '../logger'

export interface EncodingConfig {
  neighborK: number
  forwardBias?: number
  schemaCongruencyThreshold?: number
}

/**
 * EncodingPipeline: orchestrates what happens on remember().
 *
 * 1. Evolve context via TCM drift
 * 2. Assign temporal coordinate
 * 3. Store full memory record ("neocortex")
 * 4. Create compressed index entry ("hippocampus")
 * 5. Create asymmetric temporal edges to K nearest neighbors
 */
export class EncodingPipeline {
  private readonly tcm: TemporalContextModel
  private readonly tcn: TimeCellNetwork
  private readonly index: HippocampalIndex
  private readonly memoryStore: IMemoryStore
  private readonly edgeStore: IEdgeStore
  private readonly neighborK: number
  private readonly forwardBias: number
  private readonly schemaCongruencyThreshold: number
  private readonly log: EngramLogger
  private semanticStore?: ISemanticStore

  constructor(
    tcm: TemporalContextModel,
    tcn: TimeCellNetwork,
    index: HippocampalIndex,
    memoryStore: IMemoryStore,
    edgeStore: IEdgeStore,
    config: EncodingConfig,
    logger: EngramLogger = NOOP_LOGGER,
  ) {
    this.tcm = tcm
    this.tcn = tcn
    this.index = index
    this.memoryStore = memoryStore
    this.edgeStore = edgeStore
    this.neighborK = config.neighborK
    this.forwardBias = config.forwardBias ?? 2.0
    this.schemaCongruencyThreshold =
      config.schemaCongruencyThreshold ?? DEFAULT_SEMANTIC_CONFIG.schemaCongruencyThreshold
    this.log = logger
  }

  setSemanticStore(store: ISemanticStore): void {
    this.semanticStore = store
  }

  async encode(
    userId: string,
    content: string,
    options: RememberOptions = {},
  ): Promise<MemoryRecord> {
    // 1. Generate input representation and evolve context
    const inputRep = this.tcm.contentToInput(content)
    const encodingContext = this.tcm.encode(userId, inputRep)

    // 2. Assign temporal coordinate
    const temporalCoordinate = this.tcn.assignCoordinate(new Date())

    // 3. Store full memory record
    const record = await this.memoryStore.create({
      userId,
      content,
      contentEmbedding: options.embedding,
      temporalContext: { values: encodingContext, capturedAt: new Date() },
      temporalCoordinate,
      category: options.category ?? 'general',
      importance: options.importance ?? 5,
      emotionalValence: options.emotionalValence ?? 0,
      projectId: options.projectId,
      conversationId: options.conversationId,
      source: options.source ?? 'agent',
      metadata: options.metadata ?? {},
      softDeleted: false,
    })

    // 4. Create compressed index entry
    const signature = this.tcm.compressToSignature(encodingContext)
    this.index.addEntry({
      id: `idx-${record.id}`,
      memoryId: record.id,
      userId,
      contextSignature: signature,
      contentHash: simpleHash(content),
      importance: record.importance,
      temporalCoordinate,
      createdAt: new Date(),
    })

    // 5. Create temporal edges to K nearest previous memories
    const allUserMemories = await this.memoryStore.findByUser(userId)
    const items = allUserMemories
      .filter((m) => m.id !== record.id)
      .map((m) => ({ id: m.id, coordinate: m.temporalCoordinate }))

    const backwardNeighbors = this.tcn.backwardNeighbors(items, temporalCoordinate, this.neighborK)

    for (const neighbor of backwardNeighbors) {
      const distance = Math.abs(temporalCoordinate - neighbor.coordinate)

      // Forward edge: neighbor → this (neighbor came first)
      const fwdWeight = contiguityWeight(distance, 'forward', this.forwardBias)
      await this.edgeStore.create({
        userId,
        sourceMemoryId: neighbor.id,
        targetMemoryId: record.id,
        direction: 'forward',
        weight: fwdWeight,
        temporalDistance: distance,
      })

      // Backward edge: this → neighbor
      const bwdWeight = contiguityWeight(distance, 'backward', this.forwardBias)
      await this.edgeStore.create({
        userId,
        sourceMemoryId: record.id,
        targetMemoryId: neighbor.id,
        direction: 'backward',
        weight: bwdWeight,
        temporalDistance: distance,
      })
    }

    // 6. Schema-gating: check against existing semantic knowledge
    if (this.semanticStore) {
      const nearestSemantic = await this.semanticStore.findNearestByCentroid(userId, signature, 1)
      if (nearestSemantic.length > 0) {
        const sim = cosineSimilarity(
          Float64Array.from(signature),
          Float64Array.from(nearestSemantic[0].centroidVector),
        )
        if (sim >= this.schemaCongruencyThreshold) {
          // Schema-congruent: fast-path integration (CLS/SLIMM)
          this.log.debug(
            'ENCODING_SCHEMA_GATE',
            `schema-congruent: memory=${record.id} matched node=${nearestSemantic[0].id} sim=${sim.toFixed(3)} — fast-path reinforcement`,
          )
          await this.memoryStore.update(record.id, {
            metadata: {
              ...record.metadata,
              schemaCongruent: true,
              schemaNodeId: nearestSemantic[0].id,
            },
          })
          await this.semanticStore.update(nearestSemantic[0].id, {
            lastReinforcedAt: new Date(),
            sourceMemoryIds: [...nearestSemantic[0].sourceMemoryIds, record.id],
            sourceCount: nearestSemantic[0].sourceCount + 1,
          })
        } else {
          this.log.debug(
            'ENCODING_SCHEMA_GATE',
            `schema-novel: memory=${record.id} nearest node=${nearestSemantic[0].id} sim=${sim.toFixed(3)} < threshold=${this.schemaCongruencyThreshold} — episodic path`,
          )
        }
      }
    }

    this.log.debug(
      'ENCODING',
      `→ EXIT memory=${record.id} coord=${temporalCoordinate.toFixed(6)} edges=${backwardNeighbors.length * 2}`,
    )

    return record
  }
}

function simpleHash(content: string): string {
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  return hash.toString(36)
}
