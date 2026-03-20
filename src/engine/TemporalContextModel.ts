import { zeros, normalize, scale, add, randomProjectionMatrix, project } from '../math/vectors'

export interface TCMConfig {
  contextDimension: number
  betaEncoding: number
  betaRetrieval: number
  signatureDimension?: number
}

/**
 * Temporal Context Model (Howard & Kahana, 2002)
 *
 * Maintains a slowly-drifting context vector per user.
 * When an item is encoded, its input representation is blended with the current context.
 * The contiguity effect emerges naturally: items encoded close together share similar contexts.
 *
 * Asymmetry: after recalling item N, the context is updated toward N's stored context.
 * Because context at encoding already contained forward-looking drift, the updated context
 * is more similar to N+1's stored context than N-1's.
 */
export class TemporalContextModel {
  private contexts: Map<string, Float64Array> = new Map()
  private readonly dim: number
  private readonly betaEnc: number
  private readonly betaRec: number
  private readonly projectionMatrix: Float64Array[]
  private readonly sigDim: number

  constructor(config: TCMConfig) {
    this.dim = config.contextDimension
    this.betaEnc = config.betaEncoding
    this.betaRec = config.betaRetrieval
    this.sigDim = config.signatureDimension ?? 32
    this.projectionMatrix = randomProjectionMatrix(this.sigDim, this.dim)
  }

  /**
   * Get the current context state for a user.
   * Returns a copy (does not expose internal state).
   */
  getContext(userId: string): Float64Array {
    const ctx = this.contexts.get(userId)
    if (!ctx) return zeros(this.dim)
    return Float64Array.from(ctx)
  }

  /**
   * Encode a new item: blend its input representation with the current context.
   * Returns the context state AT ENCODING TIME (snapshot).
   *
   * TCM equation: context_new = β_enc * normalize(input) + (1 - β_enc) * context_old
   */
  encode(userId: string, input: Float64Array): Float64Array {
    const current = this.contexts.get(userId) ?? zeros(this.dim)
    const normalizedInput = normalize(input)

    // TCM drift: blend input with current context
    const inputContribution = scale(normalizedInput, this.betaEnc)
    const contextContribution = scale(current, 1 - this.betaEnc)
    const newContext = normalize(add(inputContribution, contextContribution))

    // Snapshot the context at encoding time (before storing as current)
    const encodingContext = Float64Array.from(newContext)

    // Update the running context
    this.contexts.set(userId, newContext)

    return encodingContext
  }

  /**
   * Recall: update the current context toward a stored context.
   * Returns the updated context state after retrieval.
   *
   * TCM equation: context_retrieved = β_rec * stored_context + (1 - β_rec) * context_current
   *
   * The forward asymmetry emerges because:
   * - The stored context already contained forward drift from encoding
   * - Blending it back pulls the current context toward that forward-biased state
   * - This makes the updated context more similar to N+1's context than N-1's
   */
  recall(userId: string, storedContext: Float64Array): Float64Array {
    const current = this.contexts.get(userId) ?? zeros(this.dim)

    const storedContribution = scale(storedContext, this.betaRec)
    const currentContribution = scale(current, 1 - this.betaRec)
    const retrieved = normalize(add(storedContribution, currentContribution))

    this.contexts.set(userId, Float64Array.from(retrieved))

    return retrieved
  }

  /**
   * Compress a full context vector (64-dim) to an index signature (32-dim).
   * Uses random projection (Johnson-Lindenstrauss) to preserve relative distances.
   */
  compressToSignature(context: Float64Array): number[] {
    const projected = project(this.projectionMatrix, context)
    const normalized = normalize(projected)
    return Array.from(normalized)
  }

  /**
   * Reset a user's context to zero (e.g., on session start).
   */
  resetContext(userId: string): void {
    this.contexts.set(userId, zeros(this.dim))
  }

  /**
   * Generate an input representation from content.
   * For now, uses a simple hash-based projection. In production,
   * this could use an embedding model.
   */
  contentToInput(content: string): Float64Array {
    const v = zeros(this.dim)
    // Simple deterministic hash-based projection
    for (let i = 0; i < content.length; i++) {
      const code = content.charCodeAt(i)
      const idx = (code * 31 + i * 7) % this.dim
      v[idx] += (code % 2 === 0 ? 1 : -1) * (1 / Math.sqrt(content.length))
    }
    return normalize(v)
  }
}
