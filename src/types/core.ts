export interface TemporalContextVector {
  values: Float64Array
  capturedAt: Date
}

export interface MemoryRecord {
  id: string
  userId: string
  content: string
  contentEmbedding?: number[]
  temporalContext: TemporalContextVector
  temporalCoordinate: number
  category: string
  importance: number
  emotionalValence: number
  projectId?: string
  conversationId?: string
  source: string
  metadata: Record<string, unknown>
  accessCount: number
  lastAccessedAt?: Date
  createdAt: Date
  updatedAt?: Date
  softDeleted: boolean
}

export interface IndexEntry {
  id: string
  memoryId: string
  userId: string
  contextSignature: number[]
  contentHash: string
  importance: number
  temporalCoordinate: number
  createdAt: Date
}

export interface TemporalEdge {
  id: string
  userId: string
  sourceMemoryId: string
  targetMemoryId: string
  direction: 'forward' | 'backward'
  weight: number
  temporalDistance: number
  lastTraversed?: Date
  traversalCount: number
  createdAt: Date
}
