# Engram

Neuroscience-native temporal memory for AI agents. Implements Temporal Context Model (TCM), hippocampal indexing, middle-out retrieval, and semantic memory extraction — so agents remember *when* things happened, *what* they mean, and *how confident* they should be.

## Why

Traditional vector-similarity memory treats every memory as an isolated point. Engram models memories as a temporal chain with asymmetric contiguity — recalling "C" retrieves "D" (forward) more strongly than "B" (backward), just like human episodic memory.

Repeated patterns get consolidated into **semantic memory** — context-free knowledge with intelligence-grade confidence scoring (ICD 203 dual-axis). "The user prefers dark mode" is semantic; "The user asked for dark mode on March 5th" is episodic.

## Architecture

```
ENCODING                              CONSOLIDATION
┌─────────────┐                       ┌──────────────────────────┐
│ TCM encode   │──→ MemoryRecord ──→  │ Phase 1: Edge Decay/Prune│
│ HippoIndex   │    TemporalEdge      │ Phase 2: Semantic Extract│
│ EdgeCreation │                       └──────────────────────────┘
│ SchemaGate   │                                │
└─────────────┘                                 ▼
                                      ┌──────────────────┐
RETRIEVAL                             │ SemanticStore     │
┌─────────────────────┐              │  SemanticNode[]   │
│ MiddleOut (episodic) │◀─────────── │  SemanticEdge[]   │
│ + SemanticLookup     │              └──────────────────┘
└─────────────────────┘
```

**TCM** — Maintains a drifting context vector per user. Each new memory blends into context, creating temporal signatures that encode *when* something was experienced relative to everything else.

**Hippocampal Index** — Fast pattern-completion lookup: given a query, find the closest temporal context signature and jump straight to that memory.

**Middle-Out Retrieval** — From the origin memory, walk forward and backward along temporal edges, scoring by weight × directional bias. Forward edges are stronger (asymmetric contiguity).

**Consolidation** — Two-phase background process:
- **Phase 1**: Decay edge weights, prune weak edges, boost recently-traversed edges (temporal edge maintenance)
- **Phase 2**: Extract semantic knowledge from episodic clusters, promote/reinforce semantic nodes, anti-anchoring decay, progressive compression

**Semantic Memory** — Context-free knowledge extracted from repeated episodic patterns via CLS theory (dual learning rates) and BCPNN (Bayesian decontextualization). Confidence scored using ICD 203 dual-axis model with promotion tiers, single-source ceiling, dissent preservation, and anti-anchoring.

## Install

```bash
npm install engram
```

Requires Node >= 22.

## Usage

### Library

```typescript
import { EngramService } from 'engram'

const engram = EngramService.createInMemory()

// Store memories — order matters
await engram.remember('user-1', 'Started the project')
await engram.remember('user-1', 'Defined the requirements')
await engram.remember('user-1', 'Built the prototype')

// Recall — middle-out retrieval from best match
// Returns both episodic memories and semantic nodes
const result = await engram.recall('user-1', 'requirements', {
  maxResults: 5,
  maxHops: 3,
  forwardBias: 2.0, // forward neighbors scored 2x higher
})

for (const entry of result.chain) {
  const memory = result.memories.find((m) => m.id === entry.memoryId)
  console.log(`[${entry.direction}] ${memory?.content} (score: ${entry.score})`)
}

// Semantic nodes (if any have been consolidated)
if (result.semanticNodes?.length) {
  for (const node of result.semanticNodes) {
    console.log(`[semantic] ${node.content} (tier: ${node.tier}, confidence: ${node.confidence.confidence})`)
  }
}

// Forget
await engram.forget('user-1', result.memories[0].id)

// Consolidate — decay edges + extract semantic knowledge
await engram.consolidate('user-1', {
  decayRate: 0.95,
  pruneThreshold: 0.05,
  semantic: {
    minSourcesForCorroborated: 2,
    contextVariabilityThreshold: 0.3,
  },
})
```

### Custom Storage

Implement `IMemoryStore`, `IEdgeStore`, and optionally `ISemanticStore` to back engram with MongoDB, Postgres, etc:

```typescript
const engram = new EngramService(myMongoMemoryStore, myMongoEdgeStore, {
  contextDimension: 64,
  defaultForwardBias: 2.0,
}, myMongoSemanticStore)
```

### Logging

Engram accepts an injectable logger. By default it's silent (library behavior). Wire your own for production observability:

```typescript
import { EngramService, CONSOLE_LOGGER } from 'engram'
import type { EngramLogger } from 'engram'

// Quick debugging
const engram = EngramService.createInMemory({ logger: CONSOLE_LOGGER })

// Production: wire your own logger
const productionLogger: EngramLogger = {
  warn: (tag, msg, data) => myLogger.warn(`[engram:${tag}] ${msg}`, data),
  error: (tag, msg, data) => myLogger.error(`[engram:${tag}] ${msg}`, data),
  debug: (tag, msg, data) => myLogger.debug(`[engram:${tag}] ${msg}`, data),
}
const engram = EngramService.createInMemory({ logger: productionLogger })
```

Log tags follow `UPPER_SNAKE_CASE` convention: `ENCODING`, `ENCODING_SCHEMA_GATE`, `RETRIEVAL`, `RECALL`, `CONSOLIDATION`, `SEMANTIC_CONSOLIDATE`, `SEMANTIC_ANTI_ANCHOR`, `SEMANTIC_CASCADE`, `SEMANTIC_TIER_PROMOTION`, `SEMANTIC_BLEND_CENTROIDS`.

### CLI

```bash
# Store memories
engram remember "Started the project" --user alice --importance 8
engram remember "Defined requirements" --user alice

# Recall
engram recall "project" --user alice --max-results 5

# Forget
engram forget <memory-id> --user alice

# Consolidate
engram consolidate --user alice --decay-rate 0.95

# Run the asymmetric contiguity demo
engram demo
```

## Semantic Memory

Semantic memory extracts context-free knowledge from repeated episodic patterns. When the same information appears across multiple conversations/projects, it gets promoted from episodic to semantic.

### Promotion Tiers (ICD 203)

| Tier | Criteria | Decay Rate |
|---|---|---|
| `raw` | Single observation | Weeks |
| `corroborated` | 2+ independent sources | Months |
| `assessed` | 4+ sources, 2+ consolidation cycles, high context variability | Quarters |
| `baseline` | 8+ sources, confidence ≥ 0.8 | Years |

### Dual-Axis Confidence

Every semantic node has two independent confidence axes:
- **probability**: How likely is this true? (0.0–1.0)
- **confidence**: How strong is the evidence? (0.0–1.0)

Single-source ceiling: confidence capped at 0.6 when only 1 source exists.

### Schema-Gated Encoding

When a new memory matches existing semantic knowledge (cosine similarity ≥ 0.75), it gets fast-path integration — the semantic node is reinforced immediately. Novel memories take the slow episodic path for later consolidation.

### Anti-Anchoring

Semantic nodes not reinforced by fresh evidence within 30 days automatically decay in confidence. Prevents stale assessments from persisting at artificially high confidence.

### Dissent Preservation

Contradictory evidence is recorded as dissent on the semantic node, never silently discarded.

## Configuration

### EngramConfig

| Parameter | Default | Description |
|---|---|---|
| `contextDimension` | 64 | TCM context vector size |
| `signatureDimension` | 32 | Compressed signature size for index lookup |
| `betaEncoding` | 0.6 | Blend rate when encoding new memories (0–1) |
| `betaRetrieval` | 0.4 | Blend rate when recalling memories (0–1) |
| `defaultForwardBias` | 2.0 | Forward edge score multiplier |
| `timeScaleMs` | 86400000 | Time normalization scale (1 day) |
| `neighborK` | 3 | Edges created per new memory |
| `logger` | `NOOP_LOGGER` | Injectable logger (see Logging section) |

### SemanticConsolidationConfig

| Parameter | Default | Description |
|---|---|---|
| `clusterSimilarityThreshold` | 0.7 | Cosine similarity for clustering |
| `contextVariabilityThreshold` | 0.5 | Min distinct contexts for promotion |
| `minSourcesForCorroborated` | 2 | Sources needed for corroborated tier |
| `minSourcesForAssessed` | 4 | Sources needed for assessed tier |
| `minSourcesForBaseline` | 8 | Sources needed for baseline tier |
| `minCyclesForAssessed` | 2 | Consolidation cycles for assessed tier |
| `minConfidenceForBaseline` | 0.8 | Confidence threshold for baseline tier |
| `singleSourceCeiling` | 0.6 | Max confidence with single source |
| `staleDecayRate` | 0.95 | Confidence decay per cycle without reinforcement |
| `staleThresholdDays` | 30 | Days before anti-anchoring kicks in |
| `compressionThreshold` | 0.85 | Similarity for marking episodic as compressible |
| `schemaCongruencyThreshold` | 0.75 | Similarity for schema-gated fast-path |

## Development

```bash
npm test              # run tests
npm run lint          # eslint
npm run lint:fix      # eslint --fix
npm run format        # prettier --write
npm run format:check  # prettier --check
npm run typecheck     # tsc --noEmit
npm run build         # tsc
```

## License

MIT
