import snapshot from './snapshot.json'
import {
  geometry,
  hitCell,
  initialCamera,
  placeLabels,
  selectionOutline,
  transform,
} from './geometry'

describe('hero geometry', () => {
  const geo = geometry(snapshot)
  it('uses one outer boundary for adjacent selected cells despite rounded source coordinates', () => {
    const edge = geo.edges.find((e) => e.cells.length === 2)!
    expect(selectionOutline(geo.edges, new Set(edge.cells))).toHaveLength(10)
    expect(selectionOutline(geo.edges, new Set([edge.cells[0]]))).toHaveLength(
      6,
    )
  })
  it('keeps hit testing and labels aligned in wide and tall viewports', () => {
    for (const [width, height] of [
      [1200, 480],
      [360, 700],
    ]) {
      const t = transform(geo.bounds, width, height, {
        ...initialCamera,
        zoom: 2.5,
        x: 2,
        y: -1,
      })
      const cell = snapshot.cells[74]
      const pixel = { x: cell.x * t.scale + t.x, y: -cell.y * t.scale + t.y }
      expect(
        hitCell(snapshot, {
          x: (pixel.x - t.x) / t.scale,
          y: (pixel.y - t.y) / t.scale,
        }),
      ).toBe(74)
    }
    expect(hitCell(snapshot, { x: -999, y: -999 })).toBeNull()
  })
  it('greedily rejects overlapping and clipped labels', () => {
    const labels = [
      {
        text: 'Country',
        x: 100,
        y: 100,
        size: 12,
        region: 1,
        kind: 'country' as const,
      },
      {
        text: 'Word',
        x: 105,
        y: 103,
        size: 10,
        region: 1,
        kind: 'word' as const,
      },
      {
        text: 'Clipped',
        x: 0,
        y: 100,
        size: 12,
        region: 1,
        kind: 'word' as const,
      },
    ]
    expect(placeLabels(labels, (text) => text.length * 7, 300, 300)).toEqual([
      labels[0],
    ])
  })
  it('ships aggregates only, with no private mock content', () => {
    expect(snapshot.cells).toHaveLength(1730)
    expect(snapshot.regions).toHaveLength(24)
    expect(snapshot.clusters.length).toBeGreaterThan(50)
    expect(JSON.stringify(snapshot)).not.toMatch(
      /"(?:username|accountId|avatar|reps|tweets|text)":/,
    )
  })
})
