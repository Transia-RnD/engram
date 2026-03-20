import { SemanticNode, SemanticEdge, PromotionTier } from '../types/semantic'
import { ISemanticStore } from '../types/storage'
import { cosineSimilarity } from '../math/vectors'
import { v4 as uuid } from 'uuid'

export class InMemorySemanticStore implements ISemanticStore {
  private nodes: Map<string, SemanticNode> = new Map()
  private edges: Map<string, SemanticEdge> = new Map()

  async get(id: string): Promise<SemanticNode | null> {
    return this.nodes.get(id) ?? null
  }

  async getMany(ids: string[]): Promise<SemanticNode[]> {
    return ids.map((id) => this.nodes.get(id)).filter(Boolean) as SemanticNode[]
  }

  async create(
    node: Omit<SemanticNode, 'id' | 'createdAt' | 'accessCount' | 'consolidationCount'>,
  ): Promise<SemanticNode> {
    const full: SemanticNode = {
      ...node,
      id: uuid(),
      accessCount: 0,
      consolidationCount: 0,
      createdAt: new Date(),
    }
    this.nodes.set(full.id, full)
    return full
  }

  async update(id: string, patch: Partial<SemanticNode>): Promise<void> {
    const existing = this.nodes.get(id)
    if (!existing) {
      throw new Error(`InMemorySemanticStore.update: node not found (id=${id})`)
    }
    this.nodes.set(id, { ...existing, ...patch, updatedAt: new Date() })
  }

  async softDelete(id: string): Promise<void> {
    const existing = this.nodes.get(id)
    if (!existing) {
      throw new Error(`InMemorySemanticStore.softDelete: node not found (id=${id})`)
    }
    this.nodes.set(id, { ...existing, softDeleted: true })
  }

  async findByUser(
    userId: string,
    options?: { limit?: number; category?: string; tier?: PromotionTier },
  ): Promise<SemanticNode[]> {
    let results = Array.from(this.nodes.values()).filter(
      (n) => n.userId === userId && !n.softDeleted,
    )
    if (options?.category) {
      results = results.filter((n) => n.category === options.category)
    }
    if (options?.tier) {
      results = results.filter((n) => n.tier === options.tier)
    }
    if (options?.limit) {
      results = results.slice(0, options.limit)
    }
    return results
  }

  async findByContentHash(userId: string, contentHash: string): Promise<SemanticNode | null> {
    for (const node of this.nodes.values()) {
      if (node.userId === userId && node.contentHash === contentHash && !node.softDeleted) {
        return node
      }
    }
    return null
  }

  async findNearestByCentroid(
    userId: string,
    vector: number[],
    k: number,
  ): Promise<SemanticNode[]> {
    const queryVec = Float64Array.from(vector)
    const scored: { node: SemanticNode; score: number }[] = []

    for (const node of this.nodes.values()) {
      if (node.userId !== userId || node.softDeleted) continue
      const nodeVec = Float64Array.from(node.centroidVector)
      const score = cosineSimilarity(queryVec, nodeVec)
      scored.push({ node, score })
    }

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, k).map((s) => s.node)
  }

  async findBySourceMemory(memoryId: string): Promise<SemanticNode[]> {
    return Array.from(this.nodes.values()).filter(
      (n) => !n.softDeleted && n.sourceMemoryIds.includes(memoryId),
    )
  }

  async createEdge(edge: Omit<SemanticEdge, 'id' | 'createdAt'>): Promise<SemanticEdge> {
    const full: SemanticEdge = {
      ...edge,
      id: uuid(),
      createdAt: new Date(),
    }
    this.edges.set(full.id, full)
    return full
  }

  async getEdges(nodeId: string, relationship?: string): Promise<SemanticEdge[]> {
    let results = Array.from(this.edges.values()).filter((e) => e.sourceNodeId === nodeId)
    if (relationship) {
      results = results.filter((e) => e.relationship === relationship)
    }
    return results
  }

  async updateEdge(id: string, patch: Partial<SemanticEdge>): Promise<void> {
    const existing = this.edges.get(id)
    if (!existing) {
      throw new Error(`InMemorySemanticStore.updateEdge: edge not found (id=${id})`)
    }
    this.edges.set(id, { ...existing, ...patch, updatedAt: new Date() })
  }

  async deleteEdge(id: string): Promise<void> {
    this.edges.delete(id)
  }
}
