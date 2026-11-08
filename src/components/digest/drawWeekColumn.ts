import type { MapGeometry } from '@/components/conversation-map/drawMap'
import { DAY, type MapAnnotation } from '@/lib/conversation-map/types'

const NS = 'http://www.w3.org/2000/svg'
const dayFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

function node(
  tag: string,
  attrs: Record<string, string | number>,
  parent: Element,
  text?: string | number,
) {
  const el = document.createElementNS(NS, tag)
  for (const [key, value] of Object.entries(attrs))
    el.setAttribute(key, String(value))
  if (text !== undefined) el.textContent = String(text)
  parent.append(el)
  return el
}

/**
 * The week's conversation map turned on its side for a narrow column: time
 * runs down the page one day per band, and each dot sits as far right as its
 * community quote count. A story's lead tweet carries the story's number.
 * Returns the same geometry as drawMap, so hitMap works unchanged.
 */
export function drawWeekColumn(
  svg: SVGSVGElement,
  rows: MapAnnotation[],
  year: number,
  range: readonly [number, number],
  leaders: Record<string, number>,
): MapGeometry {
  const W = svg.getBoundingClientRect().width,
    span = range[1] - range[0],
    bandHeight = 56,
    L = 50,
    R = W - 14,
    T = 34,
    B = T + span * bandHeight,
    H = B + 10
  const start = Date.UTC(year, 0, 1)
  const y = (day: number) => T + ((day - range[0]) / span) * (B - T)
  const maximum = Math.max(1, ...rows.map((e) => e.score))
  const rawStep = (maximum * 1.15) / 3,
    magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const step = Math.max(
    1,
    ([1, 2, 5, 10].find((n) => n * magnitude >= rawStep) ?? 10) * magnitude,
  )
  const ceiling = Math.ceil((maximum * 1.15) / step) * step
  const x = (score: number) => L + (score / ceiling) * (R - L)

  svg.replaceChildren()
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
  svg.style.minHeight = '0'
  svg.style.height = `${H}px`

  node('text', { x: L, y: 11 }, svg, 'Community quotes →')
  for (let n = 0; n <= ceiling; n += step) {
    node('line', { x1: x(n), x2: x(n), y1: T, y2: B, class: 'map-grid' }, svg)
    node(
      'text',
      { x: x(n), y: T - 7, 'text-anchor': n === 0 ? 'start' : 'middle' },
      svg,
      n,
    )
  }
  for (let day = Math.ceil(range[0]); day <= range[1]; day++) {
    const py = y(day)
    node(
      'line',
      {
        x1: L - 44,
        x2: R,
        y1: py,
        y2: py,
        class: 'map-grid',
        'stroke-dasharray': day === Math.ceil(range[0]) ? '' : '2 4',
      },
      svg,
    )
    if (day + 1 <= range[1] + 1e-9)
      node(
        'text',
        { x: L - 44, y: py + 15 },
        svg,
        dayFormat.format(new Date(start + day * DAY)),
      )
  }

  const points: MapGeometry['points'] = [],
    labels: MapGeometry['labels'] = []
  const inRange = rows.filter((e) => e.day >= range[0] && e.day <= range[1])
  // Draw small dots first so the numbered leads sit on top.
  const ordered = [...inRange].sort(
    (a, b) => Number(a.id in leaders) - Number(b.id in leaders),
  )
  for (const e of ordered) {
    const px = x(e.score),
      py = y(e.day),
      kind = `var(--map-${e.kind})`
    node(
      'line',
      {
        x1: L,
        x2: px,
        y1: py,
        y2: py,
        stroke: kind,
        'stroke-opacity': 0.16,
      },
      svg,
    )
    const number = leaders[e.id]
    if (number) {
      const cx = Math.min(R - 9, Math.max(L + 9, px))
      const badge = node(
        'g',
        {
          'data-candidate': e.id,
          role: 'button',
          tabindex: 0,
          'aria-label': `Story ${number}: ${e.label}`,
          class: 'map-dot',
        },
        svg,
      )
      node(
        'circle',
        {
          cx,
          cy: py,
          r: 9,
          fill: kind,
          stroke: 'var(--map-surface)',
          'stroke-width': 2,
        },
        badge,
      )
      node(
        'text',
        {
          x: cx,
          y: py,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          style: 'fill: white; font-size: 10.5px; font-weight: 700',
        },
        badge,
        number,
      )
      node('title', {}, badge, e.label)
      labels.push({
        annotation: e,
        x: cx - 9,
        y: py - 9,
        width: 18,
        height: 18,
      })
    } else {
      const dot = node(
        'circle',
        {
          cx: px,
          cy: py,
          r: 3.5,
          fill: kind,
          'data-candidate': e.id,
          role: 'button',
          tabindex: 0,
          'aria-label': `Read ${e.label}`,
          class: 'map-dot',
        },
        svg,
      )
      node('title', {}, dot, e.label)
    }
    points.push({ annotation: e, x: px, y: py, width: 0, height: 0 })
  }
  return { W, H, L, R, points, labels }
}
