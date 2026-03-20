#!/usr/bin/env node
import { Command } from 'commander'
import { EngramService, CONSOLE_LOGGER } from '../index'

function createEngram(verbose: boolean) {
  return EngramService.createInMemory(verbose ? { logger: CONSOLE_LOGGER } : {})
}

const program = new Command()

program
  .name('engram')
  .description('Neuroscience-native temporal memory for AI agents')
  .version('0.1.0')
  .option('-v, --verbose', 'Enable debug logging')

program
  .command('remember')
  .description('Store a memory with temporal context encoding')
  .argument('<content>', 'The memory content to store')
  .option('-u, --user <userId>', 'User ID', 'default')
  .option('-c, --category <category>', 'Memory category', 'general')
  .option('-i, --importance <n>', 'Importance (1-10)', '5')
  .action(async (content: string, opts: { user: string; category: string; importance: string }) => {
    const engram = createEngram(program.opts().verbose)
    const record = await engram.remember(opts.user, content, {
      category: opts.category,
      importance: parseInt(opts.importance, 10),
    })
    console.log(`Stored memory ${record.id}`)
    console.log(`  Content: ${record.content}`)
    console.log(`  Temporal coordinate: ${record.temporalCoordinate.toFixed(6)}`)
    console.log(`  Category: ${record.category}`)
    console.log(`  Importance: ${record.importance}`)
  })

program
  .command('recall')
  .description('Retrieve memories using middle-out temporal retrieval')
  .argument('<query>', 'The recall query')
  .option('-u, --user <userId>', 'User ID', 'default')
  .option('-n, --max-results <n>', 'Max results', '5')
  .option('-h, --max-hops <n>', 'Max traversal hops', '5')
  .option('-f, --forward-bias <n>', 'Forward bias multiplier', '2.0')
  .option('--no-semantic', 'Exclude semantic nodes from results')
  .option('--min-semantic-confidence <n>', 'Min semantic confidence', '0.1')
  .action(
    async (
      query: string,
      opts: {
        user: string
        maxResults: string
        maxHops: string
        forwardBias: string
        semantic: boolean
        minSemanticConfidence: string
      },
    ) => {
      const engram = createEngram(program.opts().verbose)
      const result = await engram.recall(opts.user, query, {
        maxResults: parseInt(opts.maxResults, 10),
        maxHops: parseInt(opts.maxHops, 10),
        forwardBias: parseFloat(opts.forwardBias),
        includeSemanticNodes: opts.semantic,
        minSemanticConfidence: parseFloat(opts.minSemanticConfidence),
      })

      if (result.memories.length === 0 && (!result.semanticNodes || result.semanticNodes.length === 0)) {
        console.log('No memories found.')
        return
      }

      // Episodic memories
      if (result.memories.length > 0) {
        console.log(`Found ${result.memories.length} episodic memories (${result.totalHops} hops):`)
        console.log()

        for (const entry of result.chain) {
          const memory = result.memories.find((m) => m.id === entry.memoryId)
          if (!memory) continue
          const dir =
            entry.direction === 'origin' ? '*' : entry.direction === 'forward' ? '>' : '<'
          console.log(`  [${dir}] score=${entry.score.toFixed(4)} hop=${entry.hopDistance}`)
          console.log(`      ${memory.content}`)
          console.log(`      coord=${memory.temporalCoordinate.toFixed(6)} id=${memory.id}`)
          console.log()
        }
      }

      // Semantic nodes
      if (result.semanticNodes && result.semanticNodes.length > 0) {
        console.log(`Found ${result.semanticNodes.length} semantic nodes:`)
        console.log()

        for (const node of result.semanticNodes) {
          const tierIcon =
            node.tier === 'baseline'
              ? '####'
              : node.tier === 'assessed'
                ? '###'
                : node.tier === 'corroborated'
                  ? '##'
                  : '#'
          console.log(
            `  [${tierIcon}] ${node.tier} | prob=${node.confidence.probability.toFixed(2)} conf=${node.confidence.confidence.toFixed(2)}`,
          )
          console.log(`      ${node.content}`)
          console.log(
            `      sources=${node.sourceCount} variability=${node.contextVariability.toFixed(2)} id=${node.id}`,
          )
          if (node.dissents.length > 0) {
            console.log(`      dissents: ${node.dissents.length}`)
          }
          console.log()
        }
      }
    },
  )

program
  .command('forget')
  .description('Soft-delete a memory')
  .argument('<memoryId>', 'The memory ID to forget')
  .option('-u, --user <userId>', 'User ID', 'default')
  .action(async (memoryId: string, opts: { user: string }) => {
    const engram = createEngram(program.opts().verbose)
    await engram.forget(opts.user, memoryId)
    console.log(`Forgot memory ${memoryId}`)
  })

program
  .command('consolidate')
  .description('Run consolidation (edge decay/prune + semantic extraction)')
  .option('-u, --user <userId>', 'User ID', 'default')
  .option('-d, --decay-rate <n>', 'Edge decay rate', '0.95')
  .option('-p, --prune-threshold <n>', 'Edge prune threshold', '0.05')
  .option('--no-semantic', 'Skip semantic consolidation (Phase 2)')
  .option('--stale-days <n>', 'Anti-anchoring: days before decay', '30')
  .option('--stale-decay <n>', 'Anti-anchoring: decay rate per cycle', '0.95')
  .action(
    async (opts: {
      user: string
      decayRate: string
      pruneThreshold: string
      semantic: boolean
      staleDays: string
      staleDecay: string
    }) => {
      const engram = createEngram(program.opts().verbose)
      const result = await engram.consolidate(opts.user, {
        decayRate: parseFloat(opts.decayRate),
        pruneThreshold: parseFloat(opts.pruneThreshold),
        semantic: opts.semantic
          ? {
              staleThresholdDays: parseInt(opts.staleDays, 10),
              staleDecayRate: parseFloat(opts.staleDecay),
            }
          : undefined,
      })

      console.log('Consolidation complete:')
      console.log(`  Phase 1 (edges):`)
      console.log(`    Decayed: ${result.decayed}`)
      console.log(`    Pruned: ${result.pruned}`)
      console.log(`    Boosted: ${result.boosted}`)

      if (result.semantic) {
        console.log(`  Phase 2 (semantic):`)
        console.log(`    Promoted: ${result.semantic.promoted}`)
        console.log(`    Reinforced: ${result.semantic.reinforced}`)
        console.log(`    Contradictions: ${result.semantic.contradictions}`)
        console.log(`    Compressed: ${result.semantic.compressed}`)
        console.log(`    Decayed (anti-anchoring): ${result.semantic.decayed}`)
      }
    },
  )

program
  .command('demo')
  .description('Run the asymmetric contiguity demo')
  .action(async () => {
    const demo = EngramService.createInMemory()
    const userId = 'demo'

    console.log('=== Engram: Asymmetric Contiguity Demo ===')
    console.log()
    console.log('Encoding sequence: [A, B, C, D, E]')
    console.log()

    const memories = [
      'Alpha: The project started with a brainstorm session',
      'Bravo: We identified the key requirements',
      'Charlie: The architecture was designed',
      'Delta: Implementation began with the core engine',
      'Echo: Testing confirmed the system works',
    ]

    for (const content of memories) {
      const record = await demo.remember(userId, content)
      console.log(
        `  Encoded: ${content.substring(0, 50)}... → coord=${record.temporalCoordinate.toFixed(6)}`,
      )
    }

    console.log()
    console.log('Recalling from "Charlie" (middle of sequence)...')
    console.log()

    const result = await demo.recall(userId, 'Charlie: The architecture was designed', {
      maxResults: 10,
      maxHops: 5,
    })

    for (const entry of result.chain) {
      const memory = result.memories.find((m) => m.id === entry.memoryId)
      if (!memory) continue
      const dir =
        entry.direction === 'origin'
          ? 'ORIGIN '
          : entry.direction === 'forward'
            ? 'FORWARD'
            : 'BACKWARD'
      const label = memory.content.split(':')[0]
      console.log(
        `  [${dir}] ${label.padEnd(10)} score=${entry.score.toFixed(4)} hop=${entry.hopDistance}`,
      )
    }

    console.log()

    // Verify asymmetry
    const scoreOf = (label: string) => {
      const entry = result.chain.find((c) => {
        const m = result.memories.find((mem) => mem.id === c.memoryId)
        return m?.content.startsWith(label)
      })
      return entry?.score ?? 0
    }

    const deltaScore = scoreOf('Delta')
    const bravoScore = scoreOf('Bravo')

    if (deltaScore > bravoScore) {
      console.log(
        `PASS: Delta (forward, score=${deltaScore.toFixed(4)}) > Bravo (backward, score=${bravoScore.toFixed(4)})`,
      )
      console.log('      Asymmetric contiguity confirmed!')
    } else {
      console.log(`UNEXPECTED: Delta=${deltaScore.toFixed(4)}, Bravo=${bravoScore.toFixed(4)}`)
    }
  })

program.parse()
