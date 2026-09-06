import {
  hitMap,
  layoutLabels,
  overlaps,
} from '@/components/conversation-map/drawMap'
import { boundedRange, yearDays, type MapAnnotation } from './types'

const rows = Array.from({ length: 24 }, (_, i) => ({
  id: String(i),
  label: `Moment ${i}`,
  kind: 'snippet',
  day: i * 14,
  rank: i + 1,
  score: 10,
  tweets: [],
})) as MapAnnotation[]
const measure = () => ({
  x: 0,
  y: -10,
  width: 70,
  height: 15,
  lines: ['Moment'],
})
it('reserves avatar space and avoids overlapping labels across the whole year', () => {
  const full = layoutLabels(rows, 1000, 365, 365, () => 300, measure)
  const zoomed = layoutLabels(rows, 1000, 30, 365, () => 300, measure)
  expect(zoomed.labels.length).toBeGreaterThan(full.labels.length)
  expect(zoomed.labels.every((p) => p.width === 98 && p.height === 22)).toBe(
    true,
  )
  expect(
    zoomed.labels.some((a, i) =>
      zoomed.labels.slice(i + 1).some((b) => overlaps(a, b)),
    ),
  ).toBe(false)
  // The renderer pans by translating the same world boxes; hit targets follow it.
  const p = zoomed.labels[10],
    offset = -p.x + 50
  expect(
    hitMap(
      {
        W: 1000,
        H: 440,
        L: 44,
        R: 986,
        points: [],
        labels: [{ ...p, x: p.x + offset }],
      },
      60,
      p.y + 10,
    )?.id,
  ).toBe(p.annotation.id)
})
it('clamps a panned/zoomed range while retaining leap-year boundaries', () => {
  expect(yearDays(2024)).toBe(366)
  expect(boundedRange(360, 30, 366)).toEqual([336, 366])
  expect(boundedRange(-50, 1, 365)).toEqual([0, 7])
})
