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
}

export interface ConsolidationOptions {
  pruneThreshold?: number
  decayRate?: number
  replayBoost?: number
  accessBoost?: number
  batchSize?: number
}

export interface EngramConfig {
  contextDimension: number
  signatureDimension: number
  betaEncoding: number
  betaRetrieval: number
  defaultForwardBias: number
  timeScaleMs: number
  neighborK: number
}

export const DEFAULT_CONFIG: EngramConfig = {
  contextDimension: 64,
  signatureDimension: 32,
  betaEncoding: 0.6,
  betaRetrieval: 0.4,
  defaultForwardBias: 2.0,
  timeScaleMs: 86400000, // 1 day in ms
  neighborK: 3,
}
