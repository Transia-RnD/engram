export { EngramService } from './EngramService'

export type { TemporalContextVector, MemoryRecord, TemporalEdge, IndexEntry } from './types/core'
export type {
  IMemoryStore,
  IIndexStore,
  IEdgeStore,
  ISemanticStore,
  StorageProvider,
} from './types/storage'
export type {
  RememberOptions,
  RecallOptions,
  ConsolidationOptions,
  EngramConfig,
} from './types/options'
export { DEFAULT_CONFIG } from './types/options'
export type {
  SemanticNode,
  SemanticEdge,
  DualAxisConfidence,
  PromotionTier,
  Dissent,
  SemanticConsolidationResult,
  SemanticConsolidationConfig,
} from './types/semantic'
export { DEFAULT_SEMANTIC_CONFIG } from './types/semantic'

export { InMemoryMemoryStore, InMemoryEdgeStore } from './storage/InMemoryStores'
export { InMemorySemanticStore } from './storage/InMemorySemanticStore'
export type { RetrievalResult } from './engine/MiddleOutRetrieval'
export type { EngramLogger } from './logger'
export { NOOP_LOGGER, CONSOLE_LOGGER } from './logger'
