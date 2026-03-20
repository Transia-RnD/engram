import { MemoryRecord, IndexEntry, TemporalEdge } from './core'
import { SemanticNode, SemanticEdge, PromotionTier } from './semantic'

export interface IMemoryStore {
  get(id: string): Promise<MemoryRecord | null>
  getMany(ids: string[]): Promise<MemoryRecord[]>
  create(record: Omit<MemoryRecord, 'id' | 'accessCount' | 'createdAt'>): Promise<MemoryRecord>
  update(id: string, patch: Partial<MemoryRecord>): Promise<void>
  softDelete(id: string): Promise<void>
  findByUser(
    userId: string,
    options?: { limit?: number; projectId?: string },
  ): Promise<MemoryRecord[]>
  findByTemporalRange(
    userId: string,
    minCoord: number,
    maxCoord: number,
    limit: number,
  ): Promise<MemoryRecord[]>
  findRecentlyAccessed(userId: string, since: Date): Promise<MemoryRecord[]>
}

export interface IIndexStore {
  insert(entry: Omit<IndexEntry, 'id'>): Promise<IndexEntry>
  findNearest(userId: string, signature: number[], k: number): Promise<IndexEntry[]>
  delete(memoryId: string): Promise<void>
  getByMemoryId(memoryId: string): Promise<IndexEntry | null>
  update(id: string, patch: Partial<Pick<IndexEntry, 'importance'>>): Promise<void>
}

export interface IEdgeStore {
  create(edge: Omit<TemporalEdge, 'id' | 'createdAt' | 'traversalCount'>): Promise<TemporalEdge>
  getEdges(
    userId: string,
    memoryId: string,
    direction: 'forward' | 'backward',
  ): Promise<TemporalEdge[]>
  getAllEdges(userId: string): Promise<TemporalEdge[]>
  updateWeight(edgeId: string, newWeight: number): Promise<void>
  incrementTraversal(edgeId: string): Promise<void>
  delete(edgeId: string): Promise<void>
  bulkUpdateWeights(updates: { edgeId: string; newWeight: number }[]): Promise<void>
}

export interface ISemanticStore {
  get(id: string): Promise<SemanticNode | null>
  getMany(ids: string[]): Promise<SemanticNode[]>
  create(
    node: Omit<SemanticNode, 'id' | 'createdAt' | 'accessCount' | 'consolidationCount'>,
  ): Promise<SemanticNode>
  update(id: string, patch: Partial<SemanticNode>): Promise<void>
  softDelete(id: string): Promise<void>
  findByUser(
    userId: string,
    options?: { limit?: number; category?: string; tier?: PromotionTier },
  ): Promise<SemanticNode[]>
  findByContentHash(userId: string, contentHash: string): Promise<SemanticNode | null>
  findNearestByCentroid(userId: string, vector: number[], k: number): Promise<SemanticNode[]>
  findBySourceMemory(memoryId: string): Promise<SemanticNode[]>
  createEdge(edge: Omit<SemanticEdge, 'id' | 'createdAt'>): Promise<SemanticEdge>
  getEdges(nodeId: string, relationship?: string): Promise<SemanticEdge[]>
  updateEdge(id: string, patch: Partial<SemanticEdge>): Promise<void>
  deleteEdge(id: string): Promise<void>
}

export interface StorageProvider {
  createMemoryStore(): IMemoryStore
  createIndexStore(): IIndexStore
  createEdgeStore(): IEdgeStore
  createSemanticStore(): ISemanticStore
}
