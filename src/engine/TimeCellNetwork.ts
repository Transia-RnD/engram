export interface TimeCellConfig {
  timeScaleMs: number // normalizing time scale (default: 1 day in ms)
  epoch?: number // reference timestamp (default: 2020-01-01)
}

export interface TemporalItem {
  id: string
  coordinate: number
}

/**
 * TimeCellNetwork (inspired by Eichenbaum, 2014)
 *
 * Assigns temporal coordinates to memories on a log-compressed manifold.
 * Recent events have more resolution (spread out), old events compress together.
 * Enables efficient bidirectional neighbor queries.
 */
export class TimeCellNetwork {
  private readonly timeScale: number
  private readonly epoch: number
  private counter: number = 0
  private lastMs: number = 0

  constructor(config: TimeCellConfig) {
    this.timeScale = config.timeScaleMs
    this.epoch = config.epoch ?? new Date('2020-01-01').getTime()
  }

  /**
   * Assign a temporal coordinate using log compression.
   * coordinate = log(1 + (timestamp - epoch) / timeScale)
   *
   * Adds a tiny monotonic offset to guarantee strict ordering
   * even for events within the same millisecond.
   */
  assignCoordinate(timestamp: Date): number {
    const ms = timestamp.getTime()
    if (ms === this.lastMs) {
      this.counter++
    } else {
      this.counter = 0
      this.lastMs = ms
    }
    const elapsed = ms - this.epoch + this.counter * 0.001
    return Math.log(1 + Math.max(0, elapsed) / this.timeScale)
  }

  /**
   * Find k nearest forward neighbors (coordinates > target), sorted ascending.
   */
  forwardNeighbors(items: TemporalItem[], coordinate: number, k: number): TemporalItem[] {
    return items
      .filter((item) => item.coordinate > coordinate)
      .sort((a, b) => a.coordinate - b.coordinate)
      .slice(0, k)
  }

  /**
   * Find k nearest backward neighbors (coordinates < target), sorted descending by closeness.
   */
  backwardNeighbors(items: TemporalItem[], coordinate: number, k: number): TemporalItem[] {
    return items
      .filter((item) => item.coordinate < coordinate)
      .sort((a, b) => b.coordinate - a.coordinate)
      .slice(0, k)
  }
}
