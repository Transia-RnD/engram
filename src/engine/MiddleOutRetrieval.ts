import { MemoryRecord, TemporalEdge } from '../types/core'
import { SemanticNode } from '../types/semantic'
import { EngramLogger, NOOP_LOGGER } from '../logger'

export interface ChainEntry {
  memoryId: string
  score: number
  hopDistance: number
  direction: 'origin' | 'forward' | 'backward'
}

export interface RetrievalResult {
  memories: MemoryRecord[]
  chain: ChainEntry[]
  totalHops: number
  semanticNodes?: SemanticNode[]
}

export interface RetrievalOptions {
  maxHops: number
  relevanceThreshold: number
  maxResults: number
  forwardBias: number
  backwardBias: number
}

interface QueueItem {
  memoryId: string
  edgeWeight: number
  hopDistance: number
  direction: 'forward' | 'backward'
}

type MemoryGetter = (id: string) => Promise<MemoryRecord | null>
type EdgeGetter = (
  userId: string,
  memoryId: string,
  direction: 'forward' | 'backward',
) => Promise<TemporalEdge[]>

/**
 * Middle-Out Retrieval Algorithm
 *
 * Starts at a seed memory and expands bidirectionally along temporal edges.
 * Forward edges (memories that came AFTER) get forwardBias multiplier (default 2x).
 * Backward edges get backwardBias (default 1x).
 *
 * This implements the asymmetric contiguity effect from TCM:
 * recalling item N makes N+1 ~2x more likely to surface than N-1.
 *
 * Hop decay (0.8^hopDistance) prevents infinite expansion.
 */
export class MiddleOutRetrieval {
  private readonly getMemory: MemoryGetter
  private readonly getEdges: EdgeGetter
  private readonly log: EngramLogger
  private readonly hopDecay = 0.8

  constructor(getMemory: MemoryGetter, getEdges: EdgeGetter, logger: EngramLogger = NOOP_LOGGER) {
    this.getMemory = getMemory
    this.getEdges = getEdges
    this.log = logger
  }

  async retrieve(
    userId: string,
    origin: MemoryRecord,
    options: RetrievalOptions,
  ): Promise<RetrievalResult> {
    this.log.debug(
      'RETRIEVAL',
      `→ ENTER origin=${origin.id} maxHops=${options.maxHops} maxResults=${options.maxResults} fwdBias=${options.forwardBias}`,
    )

    const chain: ChainEntry[] = [
      { memoryId: origin.id, score: 1.0, hopDistance: 0, direction: 'origin' },
    ]
    const visited = new Set<string>([origin.id])
    const memories: MemoryRecord[] = [origin]

    // Priority queues (sorted by score descending)
    const forwardQueue: QueueItem[] = []
    const backwardQueue: QueueItem[] = []

    // Seed queues from origin
    const fwdEdges = await this.getEdges(userId, origin.id, 'forward')
    const bwdEdges = await this.getEdges(userId, origin.id, 'backward')

    for (const edge of fwdEdges) {
      forwardQueue.push({
        memoryId: edge.targetMemoryId,
        edgeWeight: edge.weight * options.forwardBias,
        hopDistance: 1,
        direction: 'forward',
      })
    }
    for (const edge of bwdEdges) {
      backwardQueue.push({
        memoryId: edge.targetMemoryId,
        edgeWeight: edge.weight * options.backwardBias,
        hopDistance: 1,
        direction: 'backward',
      })
    }

    let hops = 0
    while (hops < options.maxHops && chain.length < options.maxResults) {
      hops++

      // Sort queues by score (edge weight * hop decay)
      forwardQueue.sort((a, b) => b.edgeWeight - a.edgeWeight)
      backwardQueue.sort((a, b) => b.edgeWeight - a.edgeWeight)

      const candidates: QueueItem[] = []
      if (forwardQueue.length > 0) candidates.push(forwardQueue.shift()!)
      if (backwardQueue.length > 0) candidates.push(backwardQueue.shift()!)

      if (candidates.length === 0) break

      for (const candidate of candidates) {
        if (visited.has(candidate.memoryId)) continue
        if (chain.length >= options.maxResults) break

        visited.add(candidate.memoryId)

        const memory = await this.getMemory(candidate.memoryId)
        if (!memory) continue

        const score = candidate.edgeWeight * Math.pow(this.hopDecay, candidate.hopDistance - 1)

        if (score < options.relevanceThreshold) continue

        chain.push({
          memoryId: memory.id,
          score,
          hopDistance: candidate.hopDistance,
          direction: candidate.direction,
        })
        memories.push(memory)

        // Enqueue this node's edges for further expansion
        const nextEdges = await this.getEdges(userId, memory.id, candidate.direction)
        const bias = candidate.direction === 'forward' ? options.forwardBias : options.backwardBias
        const queue = candidate.direction === 'forward' ? forwardQueue : backwardQueue

        for (const edge of nextEdges) {
          if (!visited.has(edge.targetMemoryId)) {
            queue.push({
              memoryId: edge.targetMemoryId,
              edgeWeight: edge.weight * bias * Math.pow(this.hopDecay, candidate.hopDistance),
              hopDistance: candidate.hopDistance + 1,
              direction: candidate.direction,
            })
          }
        }
      }
    }

    // Sort chain by score descending (origin always first via score 1.0)
    chain.sort((a, b) => b.score - a.score)

    this.log.debug(
      'RETRIEVAL',
      `→ EXIT origin=${origin.id} hops=${hops} results=${Math.min(chain.length, options.maxResults)} visited=${visited.size}`,
    )

    return {
      memories: chain
        .slice(0, options.maxResults)
        .map((c) => memories.find((m) => m.id === c.memoryId)!),
      chain: chain.slice(0, options.maxResults),
      totalHops: hops,
    }
  }
}
