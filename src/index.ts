export { EngramService } from './EngramService'

export type {
  TemporalContextVector,
  MemoryRecord,
  TemporalEdge,
  IndexEntry,
} from './types/core'
export type {
  IMemoryStore,
  IIndexStore,
  IEdgeStore,
  StorageProvider,
} from './types/storage'
export type {
  RememberOptions,
  RecallOptions,
  ConsolidationOptions,
  EngramConfig,
} from './types/options'
export { DEFAULT_CONFIG } from './types/options'

export { InMemoryMemoryStore, InMemoryEdgeStore } from './storage/InMemoryStores'
export type { RetrievalResult } from './engine/MiddleOutRetrieval'
