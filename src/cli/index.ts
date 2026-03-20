#!/usr/bin/env node
import { Command } from 'commander'
import { EngramService } from '../EngramService'

const engram = EngramService.createInMemory()
const program = new Command()

program
  .name('engram')
  .description('Neuroscience-native temporal memory for AI agents')
  .version('0.1.0')

program
  .command('remember')
  .description('Store a memory with temporal context encoding')
  .argument('<content>', 'The memory content to store')
  .option('-u, --user <userId>', 'User ID', 'default')
  .option('-c, --category <category>', 'Memory category', 'general')
  .option('-i, --importance <n>', 'Importance (1-10)', '5')
  .action(async (content: string, opts: { user: string; category: string; importance: string }) => {
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
  .action(async (query: string, opts: { user: string; maxResults: string; maxHops: string; forwardBias: string }) => {
    const result = await engram.recall(opts.user, query, {
      maxResults: parseInt(opts.maxResults, 10),
      maxHops: parseInt(opts.maxHops, 10),
      forwardBias: parseFloat(opts.forwardBias),
    })

    if (result.memories.length === 0) {
      console.log('No memories found.')
      return
    }

    console.log(`Found ${result.memories.length} memories (${result.totalHops} hops):`)
    console.log()

    for (const entry of result.chain) {
      const memory = result.memories.find((m) => m.id === entry.memoryId)
      if (!memory) continue
      const dir = entry.direction === 'origin' ? '*' : entry.direction === 'forward' ? '>' : '<'
      console.log(`  [${dir}] score=${entry.score.toFixed(4)} hop=${entry.hopDistance}`)
      console.log(`      ${memory.content}`)
      console.log(`      coord=${memory.temporalCoordinate.toFixed(6)} id=${memory.id}`)
      console.log()
    }
  })

program
  .command('forget')
  .description('Soft-delete a memory')
  .argument('<memoryId>', 'The memory ID to forget')
  .option('-u, --user <userId>', 'User ID', 'default')
  .action(async (memoryId: string, opts: { user: string }) => {
    await engram.forget(opts.user, memoryId)
    console.log(`Forgot memory ${memoryId}`)
  })

program
  .command('consolidate')
  .description('Run consolidation (decay, prune, boost)')
  .option('-u, --user <userId>', 'User ID', 'default')
  .option('-d, --decay-rate <n>', 'Decay rate', '0.95')
  .option('-p, --prune-threshold <n>', 'Prune threshold', '0.05')
  .action(async (opts: { user: string; decayRate: string; pruneThreshold: string }) => {
    const result = await engram.consolidate(opts.user, {
      decayRate: parseFloat(opts.decayRate),
      pruneThreshold: parseFloat(opts.pruneThreshold),
    })
    console.log(`Consolidation complete:`)
    console.log(`  Decayed: ${result.decayed} edges`)
    console.log(`  Pruned: ${result.pruned} edges`)
    console.log(`  Boosted: ${result.boosted} edges`)
  })

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
      console.log(`  Encoded: ${content.substring(0, 50)}... → coord=${record.temporalCoordinate.toFixed(6)}`)
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
      const dir = entry.direction === 'origin' ? 'ORIGIN ' : entry.direction === 'forward' ? 'FORWARD' : 'BACKWARD'
      const label = memory.content.split(':')[0]
      console.log(`  [${dir}] ${label.padEnd(10)} score=${entry.score.toFixed(4)} hop=${entry.hopDistance}`)
    }

    console.log()

    // Verify asymmetry
    const scoreOf = (label: string) => {
      const entry = result.chain.find((c) => {
        const m = result.memories.find((m) => m.id === c.memoryId)
        return m?.content.startsWith(label)
      })
      return entry?.score ?? 0
    }

    const deltaScore = scoreOf('Delta')
    const bravoScore = scoreOf('Bravo')

    if (deltaScore > bravoScore) {
      console.log(`PASS: Delta (forward, score=${deltaScore.toFixed(4)}) > Bravo (backward, score=${bravoScore.toFixed(4)})`)
      console.log('      Asymmetric contiguity confirmed!')
    } else {
      console.log(`UNEXPECTED: Delta=${deltaScore.toFixed(4)}, Bravo=${bravoScore.toFixed(4)}`)
    }
  })

program.parse()
