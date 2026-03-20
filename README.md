# Engram

Neuroscience-native temporal memory for AI agents. Implements Temporal Context Model (TCM), hippocampal indexing, and middle-out retrieval — so agents remember *when* things happened, not just *what*.

## Why

Traditional vector-similarity memory treats every memory as an isolated point. Engram models memories as a temporal chain with asymmetric contiguity — recalling "C" retrieves "D" (forward) more strongly than "B" (backward), just like human episodic memory.

## Architecture

```
┌──────────────────────────────────────────────────┐
│                  EngramService                    │
│          remember · recall · forget · consolidate │
├──────────────────────────────────────────────────┤
│  EncodingPipeline          MiddleOutRetrieval     │
│  ┌──────────────────┐      ┌──────────────────┐  │
│  │ TemporalContext   │      │ Expand outward   │  │
│  │   Model (TCM)     │      │ from origin via  │  │
│  │ TimeCellNetwork   │      │ temporal edges   │  │
│  │ HippocampalIndex  │      └──────────────────┘  │
│  └──────────────────┘                             │
│  ConsolidationPipeline                            │
│  ┌──────────────────┐                             │
│  │ Decay · Prune ·  │                             │
│  │ Boost edges      │                             │
│  └──────────────────┘                             │
├──────────────────────────────────────────────────┤
│  Storage (IMemoryStore · IEdgeStore)              │
│  InMemory (built-in) · MongoDB (bring your own)   │
└──────────────────────────────────────────────────┘
```

**TCM** — Maintains a drifting context vector per user. Each new memory blends into context, creating temporal signatures that encode *when* something was experienced relative to everything else.

**Hippocampal Index** — Fast pattern-completion lookup: given a query, find the closest temporal context signature and jump straight to that memory.

**Middle-Out Retrieval** — From the origin memory, walk forward and backward along temporal edges, scoring by weight × directional bias. Forward edges are stronger (asymmetric contiguity).

**Consolidation** — Periodic maintenance: decay edge weights over time, prune weak edges, boost recently-traversed edges. Models memory reconsolidation during "sleep."

## Install

```bash
npm install engram
```

Requires Node >= 22.

## Usage

### Library

```typescript
import { EngramService, InMemoryMemoryStore, InMemoryEdgeStore } from 'engram'

const engram = EngramService.createInMemory()

// Store memories — order matters
await engram.remember('user-1', 'Started the project')
await engram.remember('user-1', 'Defined the requirements')
await engram.remember('user-1', 'Built the prototype')

// Recall — middle-out retrieval from best match
const result = await engram.recall('user-1', 'requirements', {
  maxResults: 5,
  maxHops: 3,
  forwardBias: 2.0,  // forward neighbors scored 2x higher
})

for (const entry of result.chain) {
  const memory = result.memories.find(m => m.id === entry.memoryId)
  console.log(`[${entry.direction}] ${memory?.content} (score: ${entry.score})`)
}

// Forget
await engram.forget('user-1', result.memories[0].id)

// Consolidate — decay, prune, boost
await engram.consolidate('user-1', {
  decayRate: 0.95,
  pruneThreshold: 0.05,
})
```

### Custom Storage

Implement `IMemoryStore` and `IEdgeStore` to back engram with MongoDB, Postgres, etc:

```typescript
const engram = new EngramService(myMongoMemoryStore, myMongoEdgeStore, {
  contextDimension: 64,
  defaultForwardBias: 2.0,
})
```

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

## Configuration

| Parameter | Default | Description |
|---|---|---|
| `contextDimension` | 64 | TCM context vector size |
| `signatureDimension` | 32 | Compressed signature size for index lookup |
| `betaEncoding` | 0.6 | Blend rate when encoding new memories |
| `betaRetrieval` | 0.4 | Blend rate when recalling memories |
| `defaultForwardBias` | 2.0 | Forward edge score multiplier |
| `timeScaleMs` | 86400000 | Time normalization scale (1 day) |
| `neighborK` | 3 | Edges created per new memory |

## License

MIT
