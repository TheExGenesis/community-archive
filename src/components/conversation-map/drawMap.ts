import { DAY, yearDays, type MapAnnotation } from '@/lib/conversation-map/types'

const NS = 'http://www.w3.org/2000/svg'
const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})
const monthFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  timeZone: 'UTC',
})
type Box = { x: number; y: number; width: number; height: number }
type Shape = Box & { lines: string[] }
type Target = Box & { annotation: MapAnnotation }
export type MapGeometry = {
  L: number
  R: number
  W: number
  H: number
  points: Target[]
  labels: Target[]
}
const measurements = new Map<string, Shape>()
const color = (kind: string) => `var(--map-${kind})`
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
function measure(svg: SVGSVGElement, label: string, width: number): Shape {
  const key = width + '|' + label
  const cached = measurements.get(key)
  if (cached) return cached
  const text = node(
    'text',
    { class: 'map-callout', visibility: 'hidden' },
    svg,
  ) as SVGTextElement
  const span = node('tspan', {}, text) as SVGTSpanElement
  const fits = (value: string) => {
    span.textContent = value
    return span.getComputedTextLength() <= width
  }
  const lines = ['']
  for (const word of label.split(' ')) {
    const test = (lines[lines.length - 1] + ' ' + word).trim()
    if (fits(test)) {
      lines[lines.length - 1] = test
      continue
    }
    if (lines[lines.length - 1]) lines.push('')
    for (const char of word) {
      const i = lines.length - 1
      if (lines[i] && !fits(lines[i] + char)) lines.push(char)
      else lines[i] += char
    }
  }
  if (lines.length > 3) {
    lines.length = 3
    while (lines[2] && !fits(lines[2] + '…'))
      lines[2] = Array.from(lines[2]).slice(0, -1).join('')
    lines[2] += '…'
  }
  span.remove()
  lines.forEach((line, i) =>
    node('tspan', { x: 0, dy: i ? 15 : 0 }, text, line),
  )
  const b = text.getBBox(),
    shape = { x: b.x, y: b.y, width: b.width, height: b.height, lines }
  text.remove()
  measurements.set(key, shape)
  return shape
}
export const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width + 8 &&
  a.x + a.width + 8 > b.x &&
  a.y < b.y + b.height + 6 &&
  a.y + a.height + 6 > b.y

/** Full-year layout: no viewport offset or selected tweet enters disclosure. */
export function layoutLabels(
  rows: MapAnnotation[],
  width: number,
  span: number,
  days: number,
  y: (score: number) => number,
  measureText: (label: string, width: number) => Shape,
) {
  const plotWidth = width - 58,
    pixelsPerDay = plotWidth / span,
    worldWidth = days * pixelsPerDay
  const points = rows.map((annotation) => ({
    annotation,
    x: annotation.day * pixelsPerDay,
    y: y(annotation.score),
  }))
  const budget = Math.min(
    rows.length,
    Math.ceil(((width < 430 ? 3 : width < 700 ? 5 : 8) * days) / span),
  )
  const labels: Array<
    Target & { shape: Shape; pointX: number; pointY: number }
  > = []
  for (const p of [...points].sort(
    (a, b) => a.annotation.rank - b.annotation.rank,
  )) {
    if (labels.length >= budget) break
    const shape = measureText(
      p.annotation.label,
      Math.min(width < 430 ? 124 : 195, plotWidth - 12) - 28,
    )
    const w = shape.width + 28,
      h = Math.max(22, shape.height)
    const x = Math.max(4, Math.min(worldWidth - w - 4, p.x - w / 2))
    for (let lane = 0; lane < 10; lane++) {
      const box = { x, y: p.y - 18 - h - lane * (h + 13), width: w, height: h }
      if (box.y < 36 || labels.some((other) => overlaps(box, other))) continue
      if (
        points.some(
          (q) =>
            q.x > x - 5 &&
            q.x < x + w + 5 &&
            q.y > box.y - 5 &&
            q.y < box.y + h + 5,
        )
      )
        continue
      labels.push({
        ...box,
        annotation: p.annotation,
        shape,
        pointX: p.x,
        pointY: p.y,
      })
      break
    }
  }
  return { labels, pixelsPerDay }
}

export function drawMap(
  svg: SVGSVGElement,
  overview: SVGSVGElement,
  rows: MapAnnotation[],
  year: number,
  range: readonly [number, number],
): MapGeometry {
  const W = svg.getBoundingClientRect().width,
    H = W < 500 ? 400 : 440,
    L = 44,
    R = W - 14,
    T = 28,
    B = H - 39
  const days = yearDays(year),
    start = Date.UTC(year, 0, 1),
    span = Math.round((range[1] - range[0]) * 1e6) / 1e6
  const x = (day: number) => L + ((day - range[0]) / span) * (R - L)
  const maximum = Math.max(1, ...rows.map((e) => e.score))
  const rawStep = (maximum * 1.2) / 5,
    magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const step = Math.max(
    1,
    ([1, 2, 5, 10].find((n) => n * magnitude >= rawStep) ?? 10) * magnitude,
  )
  const ceiling = Math.ceil((maximum * 1.2) / step) * step
  const y = (score: number) => B - (score / ceiling) * (B - T)
  svg.replaceChildren()
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
  const defs = node('defs', {}, svg),
    clip = node('clipPath', { id: 'map-plot-clip' }, defs)
  node('rect', { x: L, y: T, width: R - L, height: B - T }, clip)
  for (let n = 0; n <= ceiling; n += step) {
    node('line', { x1: L, x2: R, y1: y(n), y2: y(n), class: 'map-grid' }, svg)
    node('text', { x: L - 10, y: y(n) + 4, 'text-anchor': 'end' }, svg, n)
  }
  node('text', { x: L, y: 13 }, svg, 'Community quotes')
  const maxTicks = Math.max(2, Math.floor((R - L) / 95)),
    ticks: number[] = []
  if (span > 100) {
    for (let m = 0; m < 12; m += Math.max(1, Math.ceil(12 / maxTicks)))
      ticks.push((Date.UTC(year, m, 1) - start) / DAY)
  } else {
    const base = span > 50 ? 14 : span > 20 ? 7 : span > 9 ? 3 : 1,
      stride = base * Math.max(1, Math.ceil(span / (base * maxTicks)))
    for (
      let day = Math.ceil(range[0] / stride) * stride;
      day <= range[1];
      day += stride
    )
      ticks.push(day)
  }
  for (const day of ticks.filter((d) => d >= range[0] && d <= range[1])) {
    const px = x(day)
    node(
      'text',
      {
        x: px,
        y: B + 24,
        'text-anchor': px < L + 30 ? 'start' : px > R - 30 ? 'end' : 'middle',
      },
      svg,
      (span > 100 ? monthFormat : dateFormat).format(
        new Date(start + day * DAY),
      ),
    )
  }
  const marks = node('g', { 'clip-path': 'url(#map-plot-clip)' }, svg),
    points: Target[] = [],
    labels: Target[] = []
  for (const e of rows.filter((e) => e.day >= range[0] && e.day <= range[1])) {
    const px = x(e.day),
      py = y(e.score)
    node(
      'line',
      {
        x1: px,
        x2: px,
        y1: py,
        y2: B,
        stroke: color(e.kind),
        'stroke-opacity': 0.12,
      },
      marks,
    )
    const dot = node(
      'circle',
      {
        cx: px,
        cy: py,
        r: 4,
        fill: color(e.kind),
        'data-candidate': e.id,
        role: 'button',
        tabindex: 0,
        'aria-label': `Read ${e.label}`,
        class: 'map-dot',
      },
      marks,
    )
    node('title', {}, dot, e.label)
    points.push({ annotation: e, x: px, y: py, width: 0, height: 0 })
  }
  const layout = layoutLabels(rows, W, span, days, y, (label, width) =>
    measure(svg, label, width),
  )
  const offset = L - range[0] * layout.pixelsPerDay
  const labelClip = node('g', { 'clip-path': 'url(#map-plot-clip)' }, svg)
  const world = node(
    'g',
    { 'data-label-world': '', transform: `translate(${offset},0)` },
    labelClip,
  )
  for (const [index, p] of Array.from(layout.labels.entries())) {
    const group = node(
      'g',
      {
        'data-label': p.annotation.id,
        'data-world-x': p.x,
        'data-world-y': p.y,
      },
      world,
    )
    const endX = Math.max(p.x + 5, Math.min(p.x + p.width - 5, p.pointX)),
      endY = p.y + p.height + 4
    node(
      'path',
      {
        d: `M${p.pointX},${p.pointY - 6} L${p.pointX},${endY + 5} L${endX},${endY}`,
        fill: 'none',
        stroke: 'var(--map-muted)',
        'stroke-opacity': 0.48,
        'stroke-width': 0.9,
      },
      group,
    )
    const text = node(
      'text',
      {
        class: 'map-callout',
        transform: `translate(${p.x + 28 - p.shape.x},${p.y + (p.height - p.shape.height) / 2 - p.shape.y})`,
      },
      group,
    )
    p.shape.lines.forEach((line, i) =>
      node('tspan', { x: 0, dy: i ? 15 : 0 }, text, line),
    )
    const inView = p.x + offset + p.width > L && p.x + offset < R,
      author = p.annotation.tweets[0],
      ax = p.x + 11,
      ay = p.y + p.height / 2
    node(
      'circle',
      {
        cx: ax,
        cy: ay,
        r: 11,
        fill: 'var(--map-selection)',
        stroke: 'var(--map-border)',
      },
      group,
    )
    node(
      'text',
      {
        x: ax,
        y: ay,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        class: 'map-initials',
      },
      group,
      author.username.slice(0, 2).toUpperCase(),
    )
    if (
      inView &&
      /^https:\/\/pbs\.twimg\.com\/profile_images\//.test(author.avatar ?? '')
    ) {
      const avatarClip = node('clipPath', { id: `map-avatar-${index}` }, defs)
      node('circle', { cx: ax, cy: ay, r: 11 }, avatarClip)
      const img = node(
        'image',
        {
          x: p.x,
          y: ay - 11,
          width: 22,
          height: 22,
          href: author.avatar!,
          preserveAspectRatio: 'xMidYMid slice',
          'clip-path': `url(#map-avatar-${index})`,
          class: 'map-avatar',
          'aria-hidden': 'true',
        },
        group,
      )
      img.addEventListener('error', () => img.remove(), { once: true })
    }
    if (inView) labels.push({ ...p, x: p.x + offset })
  }
  svg.dataset.zoom = String(days / span)
  overview.replaceChildren()
  overview.setAttribute('viewBox', `0 0 ${W} 62`)
  const ox = (day: number) => L + (day / days) * (R - L)
  node(
    'rect',
    {
      x: L,
      y: 5,
      width: R - L,
      height: 29,
      fill: 'var(--map-selection)',
      rx: 2,
    },
    overview,
  )
  for (const e of rows)
    node(
      'line',
      {
        x1: ox(e.day),
        x2: ox(e.day),
        y1: 9,
        y2: 30,
        stroke: color(e.kind),
        'stroke-opacity': 0.5,
      },
      overview,
    )
  node(
    'rect',
    {
      x: ox(range[0]),
      y: 5,
      width: ox(range[1]) - ox(range[0]),
      height: 29,
      fill: 'var(--map-accent)',
      'fill-opacity': 0.07,
      stroke: 'var(--map-accent)',
      rx: 2,
    },
    overview,
  )
  for (const d of range)
    node(
      'rect',
      {
        x: ox(d) - 3,
        y: 3,
        width: 6,
        height: 33,
        rx: 2,
        fill: 'var(--map-accent)',
      },
      overview,
    )
  for (let m = 0; m < 12; m += W < 430 ? 3 : W < 700 ? 2 : 1)
    node(
      'text',
      {
        x: ox((Date.UTC(year, m, 1) - start) / DAY),
        y: 56,
        'text-anchor': m === 0 ? 'start' : 'middle',
      },
      overview,
      monthFormat.format(new Date(Date.UTC(year, m, 1))),
    )
  return { W, H, L, R, points, labels }
}

export function hitMap(g: MapGeometry, x: number, y: number) {
  if (x < g.L || x > g.R) return
  const label = g.labels.find(
    (b) =>
      x >= b.x - 5 &&
      x <= b.x + b.width + 5 &&
      y >= b.y - 5 &&
      y <= b.y + b.height + 5,
  )
  if (label) return label.annotation
  let closest: MapAnnotation | undefined,
    distance = 18
  for (const p of g.points) {
    const d = Math.hypot(x - p.x, y - p.y)
    if (d < distance) {
      closest = p.annotation
      distance = d
    }
  }
  return closest
}
