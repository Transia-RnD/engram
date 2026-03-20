import { MemoryRecord } from '../types/core'
import { RememberOptions } from '../types/options'
import { IMemoryStore, IEdgeStore } from '../types/storage'
import { TemporalContextModel } from '../engine/TemporalContextModel'
import { TimeCellNetwork } from '../engine/TimeCellNetwork'
import { HippocampalIndex } from '../engine/HippocampalIndex'
import { contiguityWeight } from '../math/decay'

export interface EncodingConfig {
  neighborK: number
  forwardBias?: number
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

  constructor(
    tcm: TemporalContextModel,
    tcn: TimeCellNetwork,
    index: HippocampalIndex,
    memoryStore: IMemoryStore,
    edgeStore: IEdgeStore,
    config: EncodingConfig,
  ) {
    this.tcm = tcm
    this.tcn = tcn
    this.index = index
    this.memoryStore = memoryStore
    this.edgeStore = edgeStore
    this.neighborK = config.neighborK
    this.forwardBias = config.forwardBias ?? 2.0
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
