import { MemoryRecord, IndexEntry, TemporalEdge } from '../types/core'
import { IMemoryStore, IEdgeStore } from '../types/storage'
import { v4 as uuid } from 'uuid'

/**
 * In-memory implementations of storage interfaces for testing and CLI usage.
 */
export class InMemoryMemoryStore implements IMemoryStore {
  private records: Map<string, MemoryRecord> = new Map()

  async get(id: string): Promise<MemoryRecord | null> {
    return this.records.get(id) ?? null
  }

  async getMany(ids: string[]): Promise<MemoryRecord[]> {
    return ids.map((id) => this.records.get(id)).filter(Boolean) as MemoryRecord[]
  }

  async create(
    record: Omit<MemoryRecord, 'id' | 'accessCount' | 'createdAt'>,
  ): Promise<MemoryRecord> {
    const full: MemoryRecord = {
      ...record,
      id: uuid(),
      accessCount: 0,
      createdAt: new Date(),
    }
    this.records.set(full.id, full)
    return full
  }

  async update(id: string, patch: Partial<MemoryRecord>): Promise<void> {
    const existing = this.records.get(id)
    if (existing) {
      this.records.set(id, { ...existing, ...patch, updatedAt: new Date() })
    }
  }

  async softDelete(id: string): Promise<void> {
    const existing = this.records.get(id)
    if (existing) {
      this.records.set(id, { ...existing, softDeleted: true })
    }
  }

  async findByUser(
    userId: string,
    options?: { limit?: number; projectId?: string },
  ): Promise<MemoryRecord[]> {
    let results = Array.from(this.records.values()).filter(
      (r) => r.userId === userId && !r.softDeleted,
    )
    if (options?.projectId) {
      results = results.filter((r) => r.projectId === options.projectId)
    }
    results.sort((a, b) => a.temporalCoordinate - b.temporalCoordinate)
    if (options?.limit) results = results.slice(0, options.limit)
    return results
  }

  async findByTemporalRange(
    userId: string,
    minCoord: number,
    maxCoord: number,
    limit: number,
  ): Promise<MemoryRecord[]> {
    return Array.from(this.records.values())
      .filter(
        (r) =>
          r.userId === userId &&
          !r.softDeleted &&
          r.temporalCoordinate >= minCoord &&
          r.temporalCoordinate <= maxCoord,
      )
      .sort((a, b) => a.temporalCoordinate - b.temporalCoordinate)
      .slice(0, limit)
  }

  async findRecentlyAccessed(userId: string, since: Date): Promise<MemoryRecord[]> {
    return Array.from(this.records.values()).filter(
      (r) =>
        r.userId === userId &&
        !r.softDeleted &&
        r.lastAccessedAt &&
        r.lastAccessedAt >= since,
    )
  }
}

export class InMemoryEdgeStore implements IEdgeStore {
  private edges: Map<string, TemporalEdge> = new Map()

  async create(
    edge: Omit<TemporalEdge, 'id' | 'createdAt' | 'traversalCount'>,
  ): Promise<TemporalEdge> {
    const full: TemporalEdge = {
      ...edge,
      id: uuid(),
      traversalCount: 0,
      createdAt: new Date(),
    }
    this.edges.set(full.id, full)
    return full
  }

  async getEdges(
    userId: string,
    memoryId: string,
    direction: 'forward' | 'backward',
  ): Promise<TemporalEdge[]> {
    return Array.from(this.edges.values()).filter(
      (e) =>
        e.userId === userId &&
        e.sourceMemoryId === memoryId &&
        e.direction === direction,
    )
  }

  async getAllEdges(userId: string): Promise<TemporalEdge[]> {
    return Array.from(this.edges.values()).filter((e) => e.userId === userId)
  }

  async updateWeight(edgeId: string, newWeight: number): Promise<void> {
    const edge = this.edges.get(edgeId)
    if (edge) this.edges.set(edgeId, { ...edge, weight: newWeight })
  }

  async incrementTraversal(edgeId: string): Promise<void> {
    const edge = this.edges.get(edgeId)
    if (edge) {
      this.edges.set(edgeId, {
        ...edge,
        traversalCount: edge.traversalCount + 1,
        lastTraversed: new Date(),
      })
    }
  }

  async delete(edgeId: string): Promise<void> {
    this.edges.delete(edgeId)
  }

  async bulkUpdateWeights(
    updates: { edgeId: string; newWeight: number }[],
  ): Promise<void> {
    for (const { edgeId, newWeight } of updates) {
      await this.updateWeight(edgeId, newWeight)
    }
  }
}
