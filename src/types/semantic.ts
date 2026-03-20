/**
 * Semantic Memory Types
 *
 * Neuroscience basis: CLS theory (dual learning rates), BCPNN (Bayesian decontextualization)
 * Intelligence basis: ICD 203 (dual-axis confidence), CIA tradecraft (ACH, anti-anchoring)
 */

/**
 * Promotion tier — ICD 203 intelligence tiering adapted for memory consolidation.
 *
 * raw          → single observation, no corroboration
 * corroborated → 2+ independent sources agree
 * assessed     → passed contradiction analysis, stable across consolidation cycles
 * baseline     → high-confidence, well-exercised knowledge (pattern-of-life)
 */
export type PromotionTier = 'raw' | 'corroborated' | 'assessed' | 'baseline'

/**
 * ICD 203 dual-axis confidence. These axes are INDEPENDENT:
 * - probability: how likely the knowledge is accurate (what we think)
 * - confidence: how strong the evidence is (how well we know it)
 *
 * A judgment can be "likely true" with "low confidence" (weak evidence)
 * or "unlikely" with "high confidence" (strong disconfirming evidence).
 *
 * Single-source ceiling: confidence capped at 0.6 when sourceCount === 1.
 */
export interface DualAxisConfidence {
  probability: number // 0.0-1.0
  confidence: number // 0.0-1.0
}

/**
 * Dissent record — preserved per ICD 203 tradecraft.
 * When episodic evidence contradicts a semantic node's assessment,
 * the contradiction is recorded rather than silently discarded.
 */
export interface Dissent {
  memoryId: string
  content: string
  recordedAt: Date
}

/**
 * SemanticNode: context-free knowledge extracted from episodic patterns.
 *
 * Neuroscience: hub node in hub-and-spoke semantic organization.
 * The decontextualization process (BCPNN) strengthens the node's
 * self-representation while individual context bindings weaken.
 *
 * Intelligence: assessed knowledge product with dual-axis confidence,
 * tiered promotion, and dissent preservation.
 */
export interface SemanticNode {
  id: string
  userId: string
  content: string // decontextualized knowledge statement
  category: string

  // Similarity / lookup
  centroidVector: number[] // average of source episodic context signatures
  contentHash: string // for dedup detection

  // Confidence model (ICD 203)
  tier: PromotionTier
  confidence: DualAxisConfidence

  // Provenance
  sourceMemoryIds: string[] // episodic memories that contributed
  sourceCount: number // distinct sources
  contextVariability: number // 0-1: distinct contexts / total sources (BCPNN decontextualization)

  // Contradiction tracking
  dissents: Dissent[]

  // Lifecycle
  lastReinforcedAt: Date
  consolidationCount: number // how many consolidation cycles have touched this
  accessCount: number
  lastAccessedAt?: Date
  createdAt: Date
  updatedAt?: Date
  softDeleted: boolean
}

/**
 * Typed relationship between two SemanticNodes.
 * Implements hub-and-spoke organization.
 */
export interface SemanticEdge {
  id: string
  userId: string
  sourceNodeId: string
  targetNodeId: string
  relationship: string // e.g. 'is-a', 'prefers', 'uses', 'contradicts', 'co-occurs'
  weight: number
  createdAt: Date
  updatedAt?: Date
}

/**
 * Result of a semantic consolidation phase.
 */
export interface SemanticConsolidationResult {
  promoted: number // new semantic nodes created
  reinforced: number // existing nodes strengthened
  contradictions: number // dissents recorded
  compressed: number // episodic memories marked as compressible
  decayed: number // semantic nodes whose confidence decayed (anti-anchoring)
}

/**
 * Configuration for semantic consolidation.
 */
export interface SemanticConsolidationConfig {
  /** Cosine similarity threshold for clustering episodic memories (default 0.7) */
  clusterSimilarityThreshold: number
  /** Context variability threshold for semantic promotion (default 0.5) */
  contextVariabilityThreshold: number
  /** Minimum sources for corroborated tier (default 2) */
  minSourcesForCorroborated: number
  /** Minimum sources for assessed tier (default 4) */
  minSourcesForAssessed: number
  /** Minimum sources for baseline tier (default 8) */
  minSourcesForBaseline: number
  /** Minimum consolidation cycles for assessed tier (default 2) */
  minCyclesForAssessed: number
  /** Minimum confidence for baseline tier (default 0.8) */
  minConfidenceForBaseline: number
  /** Single-source confidence ceiling (default 0.6) */
  singleSourceCeiling: number
  /** Anti-anchoring: confidence decay rate per cycle without fresh evidence (default 0.95) */
  staleDecayRate: number
  /** Days without reinforcement before anti-anchoring kicks in (default 30) */
  staleThresholdDays: number
  /** Similarity threshold for marking episodic as compressible (default 0.85) */
  compressionThreshold: number
  /** Schema congruency threshold for fast-path encoding (default 0.75) */
  schemaCongruencyThreshold: number
}

export const DEFAULT_SEMANTIC_CONFIG: SemanticConsolidationConfig = {
  clusterSimilarityThreshold: 0.7,
  contextVariabilityThreshold: 0.5,
  minSourcesForCorroborated: 2,
  minSourcesForAssessed: 4,
  minSourcesForBaseline: 8,
  minCyclesForAssessed: 2,
  minConfidenceForBaseline: 0.8,
  singleSourceCeiling: 0.6,
  staleDecayRate: 0.95,
  staleThresholdDays: 30,
  compressionThreshold: 0.85,
  schemaCongruencyThreshold: 0.75,
}
