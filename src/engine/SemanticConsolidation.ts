import { IMemoryStore, ISemanticStore } from '../types/storage'
import { MemoryRecord } from '../types/core'
import {
  SemanticNode,
  SemanticConsolidationConfig,
  SemanticConsolidationResult,
  DEFAULT_SEMANTIC_CONFIG,
  PromotionTier,
} from '../types/semantic'
import { HippocampalIndex } from './HippocampalIndex'
import { cosineSimilarity } from '../math/vectors'
import { createHash } from 'crypto'
import { EngramLogger, NOOP_LOGGER } from '../logger'

const MS_PER_DAY = 86400000

interface MemoryWithSignature {
  memory: MemoryRecord
  signature: number[]
}

interface Cluster {
  memories: MemoryWithSignature[]
  centroid: number[]
  representativeContent: string
}

/**
 * SemanticConsolidation: Phase 2 of the consolidation pipeline.
 *
 * Extracts semantic knowledge from episodic memories through:
 * 1. CLUSTER — group episodic memories by context signature similarity
 * 2. PROMOTE — create new semantic nodes for clusters with sufficient evidence
 * 3. REINFORCE — strengthen existing semantic nodes when new evidence matches
 * 4. ANTI-ANCHORING — decay stale nodes without fresh evidence
 * 5. COMPRESSION — mark well-predicted episodic memories as compressible
 * 6. CASCADE INVALIDATION — recalculate confidence when sources are deleted
 *
 * Neuroscience: CLS theory (dual learning rates), BCPNN (decontextualization)
 * Intelligence: ICD 203 (dual-axis confidence), CIA tradecraft (anti-anchoring, dissent)
 */
export class SemanticConsolidation {
  private readonly log: EngramLogger

  constructor(
    private readonly memoryStore: IMemoryStore,
    private readonly semanticStore: ISemanticStore,
    private readonly index: HippocampalIndex,
    logger: EngramLogger = NOOP_LOGGER,
  ) {
    this.log = logger
  }

  async consolidate(
    userId: string,
    config: SemanticConsolidationConfig = DEFAULT_SEMANTIC_CONFIG,
  ): Promise<SemanticConsolidationResult> {
    const result: SemanticConsolidationResult = {
      promoted: 0,
      reinforced: 0,
      contradictions: 0,
      compressed: 0,
      decayed: 0,
    }

    const allMemories = await this.memoryStore.findByUser(userId)
    const existingNodes = await this.semanticStore.findByUser(userId)

    // Build memory-with-signature list
    const memoriesWithSigs = this.attachSignatures(allMemories)
    const skipped = allMemories.length - memoriesWithSigs.length
    if (skipped > 0) {
      this.log.warn(
        'SEMANTIC_CONSOLIDATE',
        `attachSignatures: ${skipped}/${allMemories.length} memories have no index entry — skipped`,
        { userId, skipped, total: allMemories.length },
      )
    }

    this.log.debug(
      'SEMANTIC_CONSOLIDATE',
      `→ ENTER userId=${userId} memories=${memoriesWithSigs.length} existingNodes=${existingNodes.length}`,
    )

    // Phase 2a: Handle explicit contradictions
    result.contradictions += await this.processContradictions(memoriesWithSigs, existingNodes)

    // Phase 2b: Cluster and promote/reinforce
    const clusters = this.clusterBySignature(memoriesWithSigs, config.clusterSimilarityThreshold)
    this.log.debug(
      'SEMANTIC_CONSOLIDATE',
      `clustered ${memoriesWithSigs.length} memories into ${clusters.length} clusters`,
    )

    for (const cluster of clusters) {
      if (cluster.memories.length < config.minSourcesForCorroborated) continue

      const contextVariability = this.computeContextVariability(cluster)
      if (contextVariability < config.contextVariabilityThreshold) {
        this.log.debug(
          'SEMANTIC_CONSOLIDATE',
          `cluster skipped: contextVariability=${contextVariability.toFixed(3)} < threshold=${config.contextVariabilityThreshold} content="${cluster.representativeContent.slice(0, 60)}"`,
        )
        continue
      }

      // Check for matching existing semantic node
      const matchingNode = await this.findMatchingNode(
        userId,
        cluster.centroid,
        existingNodes,
        config.clusterSimilarityThreshold,
      )

      if (matchingNode) {
        this.log.debug(
          'SEMANTIC_CONSOLIDATE',
          `reinforcing node=${matchingNode.id} tier=${matchingNode.tier} with ${cluster.memories.length} new sources`,
        )
        await this.reinforceNode(matchingNode, cluster, config)
        result.reinforced++
      } else {
        this.log.debug(
          'SEMANTIC_CONSOLIDATE',
          `promoting new node from cluster size=${cluster.memories.length} content="${cluster.representativeContent.slice(0, 60)}"`,
        )
        await this.promoteCluster(userId, cluster, contextVariability, config)
        result.promoted++
      }
    }

    // Phase 2c: Anti-anchoring — decay stale nodes
    const refreshedNodes = await this.semanticStore.findByUser(userId)
    for (const node of refreshedNodes) {
      const daysSinceReinforced = (Date.now() - node.lastReinforcedAt.getTime()) / MS_PER_DAY
      if (daysSinceReinforced > config.staleThresholdDays) {
        const decayedConfidence = node.confidence.confidence * config.staleDecayRate
        this.log.debug(
          'SEMANTIC_ANTI_ANCHOR',
          `decaying node=${node.id} tier=${node.tier} staleDays=${daysSinceReinforced.toFixed(1)} confidence=${node.confidence.confidence.toFixed(3)}→${decayedConfidence.toFixed(3)}`,
        )
        await this.semanticStore.update(node.id, {
          confidence: {
            ...node.confidence,
            confidence: decayedConfidence,
          },
        })
        result.decayed++
      }
    }

    // Phase 2d: Progressive compression
    result.compressed += await this.compressEpisodic(userId, memoriesWithSigs, config)

    // Phase 2e: Cascade invalidation
    await this.cascadeInvalidation(userId, config)

    // Increment consolidation count on all nodes
    const finalNodes = await this.semanticStore.findByUser(userId)
    for (const node of finalNodes) {
      await this.semanticStore.update(node.id, {
        consolidationCount: node.consolidationCount + 1,
      })
    }

    this.log.debug(
      'SEMANTIC_CONSOLIDATE',
      `→ EXIT userId=${userId} promoted=${result.promoted} reinforced=${result.reinforced} decayed=${result.decayed} compressed=${result.compressed} contradictions=${result.contradictions}`,
    )

    return result
  }

  private attachSignatures(memories: MemoryRecord[]): MemoryWithSignature[] {
    const result: MemoryWithSignature[] = []
    for (const memory of memories) {
      const entry = this.index.getByMemoryId(memory.id)
      if (entry) {
        result.push({ memory, signature: entry.contextSignature })
      }
    }
    return result
  }

  /**
   * Single-linkage clustering by cosine similarity of context signatures.
   */
  private clusterBySignature(memories: MemoryWithSignature[], threshold: number): Cluster[] {
    const assigned = new Set<number>()
    const clusters: Cluster[] = []

    for (let i = 0; i < memories.length; i++) {
      if (assigned.has(i)) continue

      const cluster: MemoryWithSignature[] = [memories[i]]
      assigned.add(i)

      for (let j = i + 1; j < memories.length; j++) {
        if (assigned.has(j)) continue

        const sim = cosineSimilarity(
          Float64Array.from(memories[i].signature),
          Float64Array.from(memories[j].signature),
        )

        if (sim >= threshold) {
          cluster.push(memories[j])
          assigned.add(j)
        }
      }

      if (cluster.length > 0) {
        const centroid = this.computeCentroid(cluster.map((m) => m.signature))
        // Pick highest importance memory as representative
        const representative = cluster.reduce((best, curr) =>
          curr.memory.importance > best.memory.importance ? curr : best,
        )
        clusters.push({
          memories: cluster,
          centroid,
          representativeContent: representative.memory.content,
        })
      }
    }

    return clusters
  }

  private computeCentroid(vectors: number[][]): number[] {
    if (vectors.length === 0) return []
    const dim = vectors[0].length
    const sum = new Array(dim).fill(0)
    for (const v of vectors) {
      for (let i = 0; i < dim; i++) sum[i] += v[i]
    }
    return sum.map((s) => s / vectors.length)
  }

  /**
   * Context variability: how many distinct contexts produced this cluster.
   * Distinct contexts = unique (conversationId, projectId) pairs.
   */
  private computeContextVariability(cluster: Cluster): number {
    if (cluster.memories.length === 0) return 0
    const contexts = new Set<string>()
    for (const { memory } of cluster.memories) {
      const ctx = `${memory.conversationId ?? 'none'}:${memory.projectId ?? 'none'}`
      contexts.add(ctx)
    }
    return contexts.size / cluster.memories.length
  }

  private async findMatchingNode(
    userId: string,
    centroid: number[],
    existingNodes: SemanticNode[],
    threshold: number,
  ): Promise<SemanticNode | null> {
    const centroidVec = Float64Array.from(centroid)
    let bestMatch: SemanticNode | null = null
    let bestSim = 0

    for (const node of existingNodes) {
      const sim = cosineSimilarity(centroidVec, Float64Array.from(node.centroidVector))
      if (sim >= threshold && sim > bestSim) {
        bestMatch = node
        bestSim = sim
      }
    }

    return bestMatch
  }

  private async reinforceNode(
    node: SemanticNode,
    cluster: Cluster,
    config: SemanticConsolidationConfig,
  ): Promise<void> {
    const newSourceIds = cluster.memories.map((m) => m.memory.id)
    const allSourceIds = [...new Set([...node.sourceMemoryIds, ...newSourceIds])]
    const newSourceCount = allSourceIds.length

    // Recalculate centroid as running average
    const updatedCentroid = this.blendCentroids(
      node.centroidVector,
      node.sourceCount,
      cluster.centroid,
      cluster.memories.length,
    )

    // Update confidence
    let newConfidence = Math.min(
      1.0,
      node.confidence.confidence + (1 - node.confidence.confidence) * 0.1,
    )
    const newProbability = Math.min(
      1.0,
      node.confidence.probability + (1 - node.confidence.probability) * 0.05,
    )

    // Single-source ceiling
    if (newSourceCount === 1) {
      newConfidence = Math.min(newConfidence, config.singleSourceCeiling)
    }

    // Check tier promotion
    const newTier = this.evaluateTierPromotion(
      node.tier,
      newSourceCount,
      newConfidence,
      this.computeContextVariability(cluster),
      node.consolidationCount,
      config,
    )

    if (newTier !== node.tier) {
      this.log.debug(
        'SEMANTIC_TIER_PROMOTION',
        `node=${node.id} promoted ${node.tier}→${newTier} sources=${newSourceCount} confidence=${newConfidence.toFixed(3)}`,
      )
    }

    await this.semanticStore.update(node.id, {
      sourceMemoryIds: allSourceIds,
      sourceCount: newSourceCount,
      centroidVector: updatedCentroid,
      confidence: { probability: newProbability, confidence: newConfidence },
      tier: newTier,
      lastReinforcedAt: new Date(),
    })
  }

  private blendCentroids(
    existing: number[],
    existingWeight: number,
    incoming: number[],
    incomingWeight: number,
  ): number[] {
    const totalWeight = existingWeight + incomingWeight
    if (totalWeight === 0) {
      this.log.warn(
        'SEMANTIC_BLEND_CENTROIDS',
        `both weights are zero — returning existing centroid unchanged`,
        { existingDim: existing.length, incomingDim: incoming.length },
      )
      return existing.slice()
    }
    if (existing.length !== incoming.length) {
      throw new Error(
        `blendCentroids: dimension mismatch (${existing.length} vs ${incoming.length})`,
      )
    }
    return existing.map((v, i) => (v * existingWeight + incoming[i] * incomingWeight) / totalWeight)
  }

  private async promoteCluster(
    userId: string,
    cluster: Cluster,
    contextVariability: number,
    config: SemanticConsolidationConfig,
  ): Promise<void> {
    const sourceIds = cluster.memories.map((m) => m.memory.id)
    const sourceCount = sourceIds.length

    let confidence = sourceCount >= config.minSourcesForCorroborated ? 0.5 : 0.3
    if (sourceCount === 1) {
      confidence = Math.min(confidence, config.singleSourceCeiling)
    }

    const tier: PromotionTier =
      sourceCount >= config.minSourcesForCorroborated ? 'corroborated' : 'raw'

    await this.semanticStore.create({
      userId,
      content: cluster.representativeContent,
      category: cluster.memories[0].memory.category,
      centroidVector: cluster.centroid,
      contentHash: this.hashContent(cluster.representativeContent),
      tier,
      confidence: {
        probability: cluster.memories[0].memory.importance / 10,
        confidence,
      },
      sourceMemoryIds: sourceIds,
      sourceCount,
      contextVariability,
      dissents: [],
      lastReinforcedAt: new Date(),
      softDeleted: false,
    })
  }

  private evaluateTierPromotion(
    currentTier: PromotionTier,
    sourceCount: number,
    confidence: number,
    contextVariability: number,
    consolidationCount: number,
    config: SemanticConsolidationConfig,
  ): PromotionTier {
    // baseline check (highest tier)
    if (
      sourceCount >= config.minSourcesForBaseline &&
      confidence >= config.minConfidenceForBaseline &&
      (currentTier === 'assessed' || currentTier === 'baseline')
    ) {
      return 'baseline'
    }

    // assessed check
    if (
      sourceCount >= config.minSourcesForAssessed &&
      contextVariability >= config.contextVariabilityThreshold &&
      consolidationCount >= config.minCyclesForAssessed &&
      (currentTier === 'corroborated' || currentTier === 'assessed')
    ) {
      return 'assessed'
    }

    // corroborated check
    if (
      sourceCount >= config.minSourcesForCorroborated &&
      (currentTier === 'raw' || currentTier === 'corroborated')
    ) {
      return 'corroborated'
    }

    return currentTier
  }

  private async compressEpisodic(
    userId: string,
    memories: MemoryWithSignature[],
    config: SemanticConsolidationConfig,
  ): Promise<number> {
    let compressed = 0
    const assessedNodes = (await this.semanticStore.findByUser(userId)).filter(
      (n) => n.tier === 'assessed' || n.tier === 'baseline',
    )

    for (const { memory, signature } of memories) {
      if (memory.metadata.semanticCompressed) continue

      const sigVec = Float64Array.from(signature)
      for (const node of assessedNodes) {
        const sim = cosineSimilarity(sigVec, Float64Array.from(node.centroidVector))
        if (sim >= config.compressionThreshold) {
          await this.memoryStore.update(memory.id, {
            metadata: {
              ...memory.metadata,
              semanticCompressed: true,
              semanticNodeId: node.id,
            },
          })
          compressed++
          break
        }
      }
    }

    return compressed
  }

  private async cascadeInvalidation(
    userId: string,
    config: SemanticConsolidationConfig,
  ): Promise<void> {
    const nodes = await this.semanticStore.findByUser(userId)

    for (const node of nodes) {
      let validSources = 0
      for (const sourceId of node.sourceMemoryIds) {
        const source = await this.memoryStore.get(sourceId)
        if (source && !source.softDeleted) {
          validSources++
        }
      }

      if (validSources < node.sourceCount) {
        const lostCount = node.sourceCount - validSources
        this.log.warn(
          'SEMANTIC_CASCADE',
          `node=${node.id} lost ${lostCount}/${node.sourceCount} source memories — recalculating confidence`,
          { nodeId: node.id, validSources, originalCount: node.sourceCount, tier: node.tier },
        )

        // Sources were lost — recalculate confidence
        const ratio = node.sourceCount > 0 ? validSources / node.sourceCount : 0
        const newConfidence = node.confidence.confidence * ratio

        // Apply single-source ceiling
        const cappedConfidence =
          validSources === 1 ? Math.min(newConfidence, config.singleSourceCeiling) : newConfidence

        // Update source count and potentially demote tier
        const validSourceIds = []
        for (const sourceId of node.sourceMemoryIds) {
          const source = await this.memoryStore.get(sourceId)
          if (source && !source.softDeleted) {
            validSourceIds.push(sourceId)
          }
        }

        await this.semanticStore.update(node.id, {
          sourceMemoryIds: validSourceIds,
          sourceCount: validSources,
          confidence: {
            ...node.confidence,
            confidence: cappedConfidence,
          },
        })
      }
    }
  }

  private async processContradictions(
    memories: MemoryWithSignature[],
    existingNodes: SemanticNode[],
  ): Promise<number> {
    let contradictions = 0

    for (const { memory } of memories) {
      const contradictedNodeId = memory.metadata.contradicts as string | undefined
      if (!contradictedNodeId) continue

      const node = existingNodes.find((n) => n.id === contradictedNodeId)
      if (!node) continue

      // Check if this dissent is already recorded
      const alreadyRecorded = node.dissents.some((d) => d.memoryId === memory.id)
      if (alreadyRecorded) continue

      const updatedDissents = [
        ...node.dissents,
        {
          memoryId: memory.id,
          content: memory.content,
          recordedAt: new Date(),
        },
      ]

      await this.semanticStore.update(node.id, {
        dissents: updatedDissents,
      })
      contradictions++
    }

    return contradictions
  }

  private hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex').slice(0, 16)
  }
}
