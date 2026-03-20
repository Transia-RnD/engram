export interface RememberOptions {
  category?: string
  importance?: number
  emotionalValence?: number
  projectId?: string
  conversationId?: string
  source?: string
  metadata?: Record<string, unknown>
  embedding?: number[]
}

export interface RecallOptions {
  maxHops?: number
  relevanceThreshold?: number
  maxResults?: number
  forwardBias?: number
  backwardBias?: number
  projectId?: string
  /** Include semantic nodes in results (default true) */
  includeSemanticNodes?: boolean
  /** Minimum confidence.confidence for semantic results (default 0.1) */
  minSemanticConfidence?: number
}

import { SemanticConsolidationConfig } from './semantic'
import { EngramLogger, NOOP_LOGGER } from '../logger'

export interface ConsolidationOptions {
  pruneThreshold?: number
  decayRate?: number
  replayBoost?: number
  accessBoost?: number
  batchSize?: number
  /** Semantic consolidation config (Phase 2). Omit to skip semantic consolidation. */
  semantic?: Partial<SemanticConsolidationConfig>
}

export interface EngramConfig {
  contextDimension: number
  signatureDimension: number
  betaEncoding: number
  betaRetrieval: number
  defaultForwardBias: number
  timeScaleMs: number
  neighborK: number
  logger: EngramLogger
}

export const DEFAULT_CONFIG: EngramConfig = {
  contextDimension: 64,
  signatureDimension: 32,
  betaEncoding: 0.6,
  betaRetrieval: 0.4,
  defaultForwardBias: 2.0,
  timeScaleMs: 86400000, // 1 day in ms
  neighborK: 3,
  logger: NOOP_LOGGER,
}
