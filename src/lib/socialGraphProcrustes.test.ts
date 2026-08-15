import { alignGraphLayout } from './socialGraphProcrustes'

describe('social graph Procrustes alignment', () => {
  test('removes translation, rotation, and scale from a new layout', () => {
    const reference = {
      a: { x: 0, y: 0 },
      b: { x: 4, y: 0 },
      c: { x: 0, y: 2 },
    }
    const candidate = {
      a: { x: 10, y: -3 },
      b: { x: 10, y: 5 },
      c: { x: 6, y: -3 },
      d: { x: 8, y: 1 },
    }

    const aligned = alignGraphLayout(reference, candidate)

    expect(aligned.a.x).toBeCloseTo(0)
    expect(aligned.a.y).toBeCloseTo(0)
    expect(aligned.b.x).toBeCloseTo(4)
    expect(aligned.b.y).toBeCloseTo(0)
    expect(aligned.c.x).toBeCloseTo(0)
    expect(aligned.c.y).toBeCloseTo(2)
    expect(aligned.d.x).toBeCloseTo(2)
    expect(aligned.d.y).toBeCloseTo(1)
  })

  test('can undo a mirrored layout and carries new nodes along', () => {
    const reference = {
      a: { x: -1, y: -1 },
      b: { x: 1, y: -1 },
      c: { x: -1, y: 1 },
    }
    const aligned = alignGraphLayout(reference, {
      a: { x: -1, y: 1 },
      b: { x: 1, y: 1 },
      c: { x: -1, y: -1 },
      d: { x: 1, y: -1 },
    })

    expect(aligned.a).toEqual(reference.a)
    expect(aligned.b).toEqual(reference.b)
    expect(aligned.c).toEqual(reference.c)
    expect(aligned.d).toEqual({ x: 1, y: 1 })
  })
})
