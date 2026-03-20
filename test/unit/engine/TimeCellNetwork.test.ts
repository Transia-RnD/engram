import { TimeCellNetwork } from '../../../src/engine/TimeCellNetwork'

describe('TimeCellNetwork', () => {
  let tcn: TimeCellNetwork

  beforeEach(() => {
    tcn = new TimeCellNetwork({ timeScaleMs: 86400000 }) // 1 day
  })

  describe('assignCoordinate', () => {
    it('returns a positive number', () => {
      const coord = tcn.assignCoordinate(new Date())
      expect(coord).toBeGreaterThan(0)
    })

    it('later timestamps get higher coordinates (monotonic)', () => {
      const t1 = new Date('2024-01-01')
      const t2 = new Date('2024-01-02')
      const t3 = new Date('2024-06-01')

      const c1 = tcn.assignCoordinate(t1)
      const c2 = tcn.assignCoordinate(t2)
      const c3 = tcn.assignCoordinate(t3)

      expect(c2).toBeGreaterThan(c1)
      expect(c3).toBeGreaterThan(c2)
    })

    it('uses log compression (recent events more spread out relative to epoch)', () => {
      // Epoch is 2020-01-01. Events near epoch have small elapsed time,
      // events far from epoch have large elapsed time.
      // Log compresses large values more, so 1-day gap near epoch > 1-day gap far from epoch.
      const epoch = new Date('2020-01-01').getTime()
      const day = 86400000

      // Two events 1 day apart, near epoch (small elapsed time)
      const nearA = tcn.assignCoordinate(new Date(epoch + 10 * day))
      const nearB = tcn.assignCoordinate(new Date(epoch + 11 * day))
      const nearGap = nearB - nearA

      // Two events 1 day apart, far from epoch (large elapsed time)
      const farA = tcn.assignCoordinate(new Date(epoch + 1000 * day))
      const farB = tcn.assignCoordinate(new Date(epoch + 1001 * day))
      const farGap = farB - farA

      // Near-epoch gap should be larger (log compresses large values more)
      expect(nearGap).toBeGreaterThan(farGap)
    })
  })

  describe('forwardNeighbors', () => {
    it('returns memories with coordinates > target, sorted ascending', () => {
      const coords = [1.0, 2.0, 3.0, 4.0, 5.0]
      const ids = coords.map((c, i) => ({ id: `m${i}`, coordinate: c }))

      const result = tcn.forwardNeighbors(ids, 3.0, 2)
      expect(result.map((r) => r.id)).toEqual(['m3', 'm4']) // coords 4.0, 5.0
    })

    it('respects the k limit', () => {
      const ids = Array.from({ length: 10 }, (_, i) => ({
        id: `m${i}`,
        coordinate: i + 1,
      }))

      const result = tcn.forwardNeighbors(ids, 3, 2)
      expect(result.length).toBe(2)
    })

    it('returns empty if no forward neighbors', () => {
      const ids = [{ id: 'm0', coordinate: 1.0 }]
      const result = tcn.forwardNeighbors(ids, 5.0, 3)
      expect(result).toEqual([])
    })
  })

  describe('backwardNeighbors', () => {
    it('returns memories with coordinates < target, sorted descending by coordinate', () => {
      const coords = [1.0, 2.0, 3.0, 4.0, 5.0]
      const ids = coords.map((c, i) => ({ id: `m${i}`, coordinate: c }))

      const result = tcn.backwardNeighbors(ids, 3.0, 2)
      // Should return closest backward neighbors: 2.0 first, then 1.0
      expect(result.map((r) => r.id)).toEqual(['m1', 'm0']) // coords 2.0, 1.0
    })

    it('returns empty if no backward neighbors', () => {
      const ids = [{ id: 'm0', coordinate: 5.0 }]
      const result = tcn.backwardNeighbors(ids, 1.0, 3)
      expect(result).toEqual([])
    })
  })
})
