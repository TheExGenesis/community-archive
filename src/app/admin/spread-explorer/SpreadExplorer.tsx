'use client'

// The TPOT spread explorer's real-usage map, ported from the explorer's
// static/app.js: one full-width hex map coloured by how much more or less a word
// is used in each hex than on average, a month slider with play, named regions,
// anchors by handle, hover details and a side panel for a clicked hex. The model
// map, posts and account lists of the local explorer are not part of this
// hosted version: the data is a static export of aggregate counts.

import { useEffect, useRef } from 'react'
import { realZ, LOW_TWEETS, WINDOW_HALF } from '@/lib/spreadExplorer/stats'
import type {
  SpreadAnchor,
  SpreadMeta,
  SpreadVocab,
  SpreadWord,
} from '@/lib/spreadExplorer/types'

const API = '/api/admin/spread-explorer'
const CLIP = 2.5
const UNUSED = '#19191d'
const STOPS = [
  '#053061',
  '#2166ac',
  '#4393c3',
  '#92c5de',
  '#f7f7f7',
  '#f4a582',
  '#d6604d',
  '#b2182b',
  '#67001f',
].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)))
const ATLAS = [
  '#6f9aa8',
  '#c9a66b',
  '#8d86b5',
  '#86a878',
  '#c98572',
  '#5f86b3',
  '#b58aa5',
  '#a9b46d',
  '#d1a08a',
  '#6aa596',
]
const FONT = '-apple-system, "Segoe UI", Helvetica, Arial, sans-serif'
const REGION_MODES = ['Regions: off', 'Regions: borders', 'Regions: countries']

type Geometry = {
  W: number
  H: number
  r: number
  px: (x: number) => number
  py: (y: number) => number
}

type State = {
  meta: SpreadMeta | null
  vocab: SpreadVocab
  word: string
  t: number
  sel: number[]
  anchors: SpreadAnchor[]
  anchorText: string
  real: SpreadWord | null
  z: (number | null)[][] | null
  used: boolean[][] | null
  regionMode: number
  view: { z: number; x: number; y: number }
  timer: ReturnType<typeof setInterval> | null
  frame: { x0: number; x1: number; y0: number; y1: number } | null
  borders: number[][] | null
  regionColors: string[] | null
  geo: Geometry | null
  timelineGeo: { left: number; bw: number } | null
  loading: number
}

const esc = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
  )

function color(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '#2c2c31'
  const u =
    ((Math.max(-CLIP, Math.min(CLIP, v)) / CLIP + 1) / 2) * (STOPS.length - 1)
  const i = Math.min(STOPS.length - 2, Math.floor(u))
  const f = u - i
  return `rgb(${STOPS[i].map((c, k) => Math.round(c + (STOPS[i + 1][k] - c) * f)).join(',')})`
}

const monthName = (m: string) =>
  new Date(m + '-15').toLocaleString('en', { month: 'short', year: 'numeric' })

async function api<T>(path: string): Promise<T> {
  const r = await fetch(API + path, { credentials: 'same-origin' })
  if (r.status === 404)
    throw new Error('Not available (are you signed in as the admin?)')
  const body = (await r.json().catch(() => ({}))) as { error?: string }
  if (!r.ok) throw new Error(body.error || r.statusText)
  return body as T
}

function hexPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
) {
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (30 + 60 * i)
    ctx[i ? 'lineTo' : 'moveTo'](cx + r * Math.cos(a), cy + r * Math.sin(a))
  }
  ctx.closePath()
}

export default function SpreadExplorer() {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = root.current
    if (!el) return
    const $ = <T extends HTMLElement>(sel: string) => el.querySelector(sel) as T
    const S: State = {
      meta: null,
      vocab: [],
      word: 'psychosis',
      t: 0,
      sel: [],
      anchors: [],
      anchorText: '',
      real: null,
      z: null,
      used: null,
      regionMode: 1,
      view: { z: 1, x: 0, y: 0 },
      timer: null,
      frame: null,
      borders: null,
      regionColors: null,
      geo: null,
      timelineGeo: null,
      loading: 0,
    }
    const cleanups: (() => void)[] = []
    const on = <K extends keyof HTMLElementEventMap>(
      target: HTMLElement | Window,
      type: K | string,
      fn: (ev: any) => void,
      opts?: AddEventListenerOptions,
    ) => {
      target.addEventListener(type, fn as EventListener, opts)
      cleanups.push(() =>
        target.removeEventListener(type, fn as EventListener, opts),
      )
    }

    // ---- geometry
    function frame() {
      if (S.frame) return S.frame
      const hx = S.meta!.hex
      const q = (v: number[], p: number) => {
        const o = v
          .map((x, i) => [x, hx.accounts[i]])
          .sort((a, b) => a[0] - b[0])
        const total = o.reduce((s, x) => s + x[1], 0)
        let run = 0
        for (const [x, w] of o) {
          run += w
          if (run >= p * total) return x
        }
        return o[o.length - 1][0]
      }
      const m = 3 * hx.size
      return (S.frame = {
        x0: q(hx.x, 0.01) - m,
        x1: q(hx.x, 0.99) + m,
        y0: q(hx.y, 0.01) - m,
        y1: q(hx.y, 0.99) + m,
      })
    }
    function geometry(cv: HTMLCanvasElement): Geometry {
      const hx = S.meta!.hex,
        f = frame(),
        pad = 10,
        W = cv.clientWidth,
        aspect = (f.y1 - f.y0) / (f.x1 - f.x0)
      const H = Math.round(
        Math.max(360, Math.min(W * aspect, window.innerHeight - 250)),
      )
      const k = Math.min(
        (W - 2 * pad) / (f.x1 - f.x0),
        (H - 2 * pad) / (f.y1 - f.y0),
      )
      const ox = (W - k * (f.x1 - f.x0)) / 2,
        oy = (H - k * (f.y1 - f.y0)) / 2
      const v = S.view
      const zx = (sx: number) => (sx - W / 2) * v.z + W / 2 + v.x * W
      const zy = (sy: number) => (sy - H / 2) * v.z + H / 2 + v.y * H
      return {
        W,
        H,
        r: hx.size * k * v.z,
        px: (x) => zx(ox + (x - f.x0) * k),
        py: (y) => zy(H - oy - (y - f.y0) * k),
      }
    }
    let viewFrame = 0
    function setView(z: number, x: number, y: number) {
      z = Math.max(0.35, Math.min(12, z))
      const lim = Math.max(0, z - 1) / 2 + 0.3
      S.view = {
        z,
        x: Math.max(-lim, Math.min(lim, x)),
        y: Math.max(-lim, Math.min(lim, y)),
      }
      cancelAnimationFrame(viewFrame)
      viewFrame = requestAnimationFrame(render)
    }

    // ---- regions
    function regionColor(r: number): string {
      const regions = S.meta!.regions
      const own = regions[r]?.colour_dark || regions[r]?.colour
      if (own) return own
      if (!S.regionColors) {
        // fallback: greedy atlas palette, touching regions differ
        const hx = S.meta!.hex,
          reg = S.meta!.hex_region,
          n = regions.length,
          reach = (1.8 * hx.size) ** 2
        const touch: Set<number>[] = Array.from({ length: n }, () => new Set())
        for (let a = 0; a < reg.length; a++)
          for (let b = a + 1; b < reg.length; b++)
            if (
              reg[a] !== reg[b] &&
              (hx.x[a] - hx.x[b]) ** 2 + (hx.y[a] - hx.y[b]) ** 2 < reach
            ) {
              touch[reg[a]].add(reg[b])
              touch[reg[b]].add(reg[a])
            }
        const pick = new Array<number>(n).fill(-1),
          used = new Array<number>(ATLAS.length).fill(0)
        Array.from({ length: n }, (_, i) => i)
          .sort((a, b) => touch[b].size - touch[a].size)
          .forEach((i) => {
            const taken = new Set(Array.from(touch[i]).map((j) => pick[j]))
            let best = -1
            ATLAS.forEach((_, c) => {
              if (!taken.has(c) && (best < 0 || used[c] < used[best])) best = c
            })
            pick[i] = best < 0 ? i % ATLAS.length : best
            used[pick[i]]++
          })
        S.regionColors = pick.map((c) => ATLAS[c])
      }
      return S.regionColors[r]
    }
    function regionBorders(): number[][] {
      if (S.borders) return S.borders
      const hx = S.meta!.hex,
        reg = S.meta!.hex_region,
        reach = (1.8 * hx.size) ** 2,
        out: number[][] = []
      const cell = new Map<string, number[]>()
      const key = (x: number, y: number) =>
        Math.round(x / (2 * hx.size)) + ':' + Math.round(y / (2 * hx.size))
      hx.x.forEach((x, h) => {
        const k = key(x, hx.y[h])
        if (!cell.has(k)) cell.set(k, [])
        cell.get(k)!.push(h)
      })
      hx.x.forEach((x, h) => {
        const cx = Math.round(x / (2 * hx.size)),
          cy = Math.round(hx.y[h] / (2 * hx.size))
        for (let i = -1; i <= 1; i++)
          for (let j = -1; j <= 1; j++)
            for (const n of cell.get(cx + i + ':' + (cy + j)) || []) {
              if (n <= h || reg[n] === reg[h]) continue
              const dx = hx.x[n] - x,
                dy = hx.y[n] - hx.y[h],
                d2 = dx * dx + dy * dy
              if (d2 > reach) continue
              const d = Math.sqrt(d2),
                mx = x + dx / 2,
                my = hx.y[h] + dy / 2
              const ux = ((-dy / d) * hx.size) / 2,
                uy = ((dx / d) * hx.size) / 2
              out.push([mx - ux, my - uy, mx + ux, my + uy])
            }
      })
      return (S.borders = out)
    }
    function drawRegions(
      ctx: CanvasRenderingContext2D,
      g: Geometry,
      political: boolean,
    ) {
      ctx.beginPath()
      for (const [x1, y1, x2, y2] of regionBorders()) {
        ctx.moveTo(g.px(x1), g.py(y1))
        ctx.lineTo(g.px(x2), g.py(y2))
      }
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = political ? '#111113' : '#0e0e10b8'
      ctx.lineWidth = political
        ? Math.min(3.5, 1.8 + S.view.z * 0.25)
        : Math.min(3, 1.4 + S.view.z * 0.2)
      ctx.stroke()
      // names: biggest regions first; a label that would overlap one already placed waits until you zoom in
      const size = Math.min(14, 10.5 + (S.view.z - 1) * 0.9),
        placed: { x: number; y: number; w: number; h: number }[] = []
      ctx.font = `600 ${size}px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ;(
        ctx as CanvasRenderingContext2D & { letterSpacing?: string }
      ).letterSpacing = '0.7px'
      const byAccounts = S.meta!.regions.slice().sort(
        (a, b) => b.accounts - a.accounts,
      )
      for (const r of byAccounts) {
        const text = (r.short || r.name).toUpperCase(),
          lines = ['']
        for (const w of text.split(' ')) {
          const last = lines[lines.length - 1]
          if ((last + ' ' + w).length > 14 && last) lines.push(w)
          else lines[lines.length - 1] = (last + ' ' + w).trim()
        }
        const x = g.px(r.x),
          y = g.py(r.y)
        const w =
            Math.max(...lines.map((l) => ctx.measureText(l).width)) +
            size * 0.12 * 14 +
            10,
          h = lines.length * (size + 3) + 6
        if (x < -w || x > g.W + w || y < -h || y > g.H + h) continue
        if (
          placed.some(
            (b) =>
              Math.abs(b.x - x) < (b.w + w) / 2 &&
              Math.abs(b.y - y) < (b.h + h) / 2,
          )
        )
          continue
        placed.push({ x, y, w, h })
        lines.forEach((line, i) => {
          const ly = y + (i - (lines.length - 1) / 2) * (size + 3)
          ctx.strokeStyle = '#0e0e10e0'
          ctx.lineWidth = 3.5
          ctx.strokeText(line, x, ly)
          ctx.fillStyle = '#ffffffee'
          ctx.fillText(line, x, ly)
        })
      }
      ctx.textAlign = 'start'
      ctx.textBaseline = 'alphabetic'
      ;(
        ctx as CanvasRenderingContext2D & { letterSpacing?: string }
      ).letterSpacing = '0px'
    }
    function drawAnchors(ctx: CanvasRenderingContext2D, g: Geometry) {
      const placed = S.anchors.filter((a) => !a.missing && a.hex >= 0)
      if (!placed.length) return
      const cx = g.W / 2,
        cy = g.H / 2
      ctx.font = `600 12px ${FONT}`
      const boxes: { x: number; y: number; w: number }[] = []
      placed.forEach((a) => {
        const x = g.px(a.x),
          y = g.py(a.y),
          label = '@' + a.handle,
          w = ctx.measureText(label).width + 12
        let dx = x - cx,
          dy = y - cy
        const d = Math.hypot(dx, dy) || 1
        dx /= d
        dy /= d
        let lx = x + dx * 90 - w / 2,
          ly = y + dy * 70
        lx = Math.max(4, Math.min(g.W - w - 4, lx))
        ly = Math.max(14, Math.min(g.H - 8, ly))
        for (
          let tries = 0;
          tries < 12 &&
          boxes.some(
            (b) => Math.abs(b.y - ly) < 20 && lx < b.x + b.w && b.x < lx + w,
          );
          tries++
        )
          ly += 20
        boxes.push({ x: lx, y: ly, w })
        ctx.strokeStyle = '#f2c14e'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(lx + w / 2, ly - 5)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(x, y, 5, 0, 7)
        ctx.fillStyle = '#0e0e10'
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = '#111113ee'
        ctx.fillRect(lx, ly - 14, w, 19)
        ctx.strokeRect(lx, ly - 14, w, 19)
        ctx.fillStyle = '#f2c14e'
        ctx.fillText(label, lx + 6, ly)
      })
    }

    // ---- the map
    function drawMap() {
      const cv = $<HTMLCanvasElement>('canvas.spx-map')
      if (!cv.clientWidth || !S.meta) return
      const g = geometry(cv),
        dpr = window.devicePixelRatio || 1,
        hx = S.meta.hex
      cv.width = g.W * dpr
      cv.height = g.H * dpr
      cv.style.height = g.H + 'px'
      const ctx = cv.getContext('2d')!
      ctx.scale(dpr, dpr)
      S.geo = g
      const political = S.regionMode === 2
      const z = S.z
      if (!z && !political) return
      for (let h = 0; h < hx.x.length; h++) {
        const c = political
          ? regionColor(S.meta.hex_region[h])
          : S.used && !S.used[h][S.t] && z![h][S.t] != null
            ? UNUSED
            : color(z![h][S.t])
        hexPath(ctx, g.px(hx.x[h]), g.py(hx.y[h]), g.r)
        ctx.fillStyle = c
        ctx.fill()
        ctx.strokeStyle = c
        ctx.lineWidth = 0.7
        ctx.stroke()
      }
      for (const h of S.sel) {
        hexPath(ctx, g.px(hx.x[h]), g.py(hx.y[h]), g.r * 0.94)
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 2
        ctx.stroke()
      }
      if (S.regionMode) drawRegions(ctx, g, political)
      drawAnchors(ctx, g)
    }
    function hexAt(ev: MouseEvent): number {
      const cv = $<HTMLCanvasElement>('canvas.spx-map'),
        g = S.geo,
        hx = S.meta!.hex,
        b = cv.getBoundingClientRect()
      if (!g) return -1
      const x = ev.clientX - b.left,
        y = ev.clientY - b.top
      let best = -1,
        bd = g.r * g.r
      for (let h = 0; h < hx.x.length; h++) {
        const d = (g.px(hx.x[h]) - x) ** 2 + (g.py(hx.y[h]) - y) ** 2
        if (d < bd) {
          bd = d
          best = h
        }
      }
      return best
    }
    function drawTimeline() {
      const cv = $<HTMLCanvasElement>('canvas.spx-timeline'),
        dpr = window.devicePixelRatio || 1,
        W = cv.clientWidth,
        H = cv.clientHeight
      cv.width = W * dpr
      cv.height = H * dpr
      const ctx = cv.getContext('2d')!
      ctx.scale(dpr, dpr)
      const months = S.meta!.months,
        T = months.length,
        left = 46,
        bottom = 20,
        top = 10
      const total = S.real ? S.real.total : [],
        max = Math.max(1, ...total),
        bw = (W - left - 8) / T
      ctx.font = `11px ${FONT}`
      ctx.fillStyle = '#9a9aa3'
      ctx.fillText('uses / month', 4, 12)
      ctx.fillText(String(max), 4, top + 14)
      const gap = bw > 4 ? 2 : 0.5
      months.forEach((m, t) => {
        const x = left + t * bw,
          h = ((H - bottom - top) * (total[t] || 0)) / max
        if (t === S.t) {
          ctx.fillStyle = '#ffffff33'
          ctx.fillRect(x, top, Math.max(bw - gap, 2), H - bottom - top)
        }
        ctx.fillStyle = t === S.t ? '#ffb48a' : '#e8875f'
        ctx.fillRect(x, H - bottom - h, bw - gap, h)
        if (m.endsWith('-01') || m.endsWith('-07')) {
          ctx.fillStyle = '#9a9aa3'
          ctx.fillText(monthName(m), x, H - 5)
        }
      })
      S.timelineGeo = { left, bw }
    }
    function drawCellChart() {
      const cv = $<HTMLCanvasElement>('canvas.spx-cellchart'),
        dpr = window.devicePixelRatio || 1,
        W = cv.clientWidth,
        H = cv.clientHeight
      if (!W) return
      cv.width = W * dpr
      cv.height = H * dpr
      const ctx = cv.getContext('2d')!
      ctx.scale(dpr, dpr)
      const T = S.meta!.months.length
      const y = (v: number) =>
          H / 2 - (Math.max(-3, Math.min(3, v)) / 3) * (H / 2 - 6),
        x = (t: number) => 6 + (t * (W - 12)) / (T - 1)
      ctx.strokeStyle = '#2a2a30'
      ctx.beginPath()
      ctx.moveTo(0, H / 2)
      ctx.lineTo(W, H / 2)
      ctx.stroke()
      ctx.fillStyle = '#ffffff22'
      ctx.fillRect(x(S.t) - 2, 0, 4, H)
      if (S.z && S.sel.length) {
        ctx.beginPath()
        ctx.strokeStyle = '#e8875f'
        ctx.lineWidth = 1.8
        let pen = false
        for (let t = 0; t < T; t++) {
          const vs = S.sel
            .map((h) => S.z![h][t])
            .filter((v): v is number => v != null)
          if (!vs.length) {
            pen = false
            continue
          }
          const v = vs.reduce((a, b) => a + b, 0) / vs.length
          ctx[pen ? 'lineTo' : 'moveTo'](x(t), y(v))
          pen = true
        }
        ctx.stroke()
      }
      ctx.font = `10px ${FONT}`
      ctx.fillStyle = '#9a9aa3'
      ctx.fillText(
        "sd above or below this word's average, selected hexes",
        6,
        11,
      )
    }

    // ---- rendering
    function render() {
      if (!S.meta) return
      const m = S.meta,
        now = monthName(m.months[S.t])
      $('.spx-month').textContent = now
      const slider = $<HTMLInputElement>('.spx-slider')
      slider.max = String(m.months.length - 1)
      slider.value = String(S.t)
      const uses = S.real ? S.real.total.reduce((a, b) => a + b, 0) : 0
      $('.spx-title').textContent = `How “${S.word}” spread · ${now}`
      $('.spx-sub').textContent = S.real
        ? `${uses.toLocaleString()} real uses, ${monthName(m.months[0])} – ${monthName(m.months[m.months.length - 1])} · each hex is a group of socially close accounts · colour = standard deviations above (red) or below (blue) this word's own average · 3-month window around ${now}`
        : ''
      drawMap()
      drawTimeline()
      if (S.sel.length) drawCellChart()
      $('.spx-foot').textContent =
        `${m.accounts.on_map.toLocaleString()} accounts on the map of ${m.accounts.listed.toLocaleString()} · scroll to zoom, drag to pan, double-click to reset · dark = word not used in the window · grey = fewer than ${LOW_TWEETS} tweets in the window · ${m.caveats.join(' · ')} · export ${m.version}`
      writeHash()
    }
    async function loadWord() {
      $('.spx-err').textContent = ''
      const token = ++S.loading
      try {
        const real = await api<SpreadWord>(
          '/word?w=' + encodeURIComponent(S.word),
        )
        if (token !== S.loading) return // a newer word is on its way
        S.real = real
        const out = realZ(real.uses, S.meta!.tweets)
        S.z = out ? out.z : null
        S.used = out ? out.used : null
        if (!real.known)
          $('.spx-err').textContent =
            `“${S.word}” was never used in the corpus (whole words only; one word at a time).`
        else if (!out)
          $('.spx-err').textContent = `No uses of “${S.word}” in the window.`
      } catch (e) {
        $('.spx-err').textContent = String((e as Error).message || e)
        S.real = null
        S.z = null
        S.used = null
      }
      render()
      if (S.sel.length) showPanel()
    }
    async function loadAnchors() {
      const t = S.anchorText.trim()
      try {
        S.anchors = t
          ? (
              await api<{ anchors: SpreadAnchor[] }>(
                '/anchors?handles=' + encodeURIComponent(t),
              )
            ).anchors
          : []
      } catch (e) {
        $('.spx-err').textContent = String((e as Error).message || e)
        return
      }
      const missing = S.anchors
        .filter((a) => a.missing)
        .map((a) => '@' + a.handle)
      const off = S.anchors
        .filter((a) => !a.missing && a.hex < 0)
        .map((a) => '@' + a.handle)
      $('.spx-err').textContent = [
        missing.length ? 'Not found: ' + missing.join(', ') : '',
        off.length ? 'Not on the map: ' + off.join(', ') : '',
      ]
        .filter(Boolean)
        .join(' · ')
      render()
    }

    // ---- hover
    function regionTip(h: number): string {
      const r = S.meta!.regions[S.meta!.hex_region[h]]
      if (!r) return ''
      return (
        `<br><span class="d">region:</span> <b>${esc(r.name)}</b> <span class="d">· ${r.accounts.toLocaleString()} accounts</span>` +
        `<br><span class="d">${r.reps
          .slice(0, 5)
          .map((x) => '@' + esc(x))
          .join(
            ', ',
          )}</span><br><span class="d">region's words: ${esc(r.terms.slice(0, 8).join(', '))}</span>`
      )
    }
    function tip(ev: MouseEvent) {
      const h = hexAt(ev),
        tipEl = $('.spx-tip')
      if (h < 0 || !S.meta) {
        tipEl.style.display = 'none'
        return
      }
      const m = S.meta,
        hx = m.hex,
        lo = Math.max(0, S.t - WINDOW_HALF),
        hi = Math.min(m.months.length - 1, S.t + WINDOW_HALF)
      let uses = 0,
        tweets = 0
      for (let t = lo; t <= hi; t++) {
        uses += S.real ? S.real.uses[h][t] : 0
        tweets += m.tweets[h][t]
      }
      const z = S.z && S.z[h][S.t]
      const sd = z != null ? (z >= 0 ? '+' : '') + z.toFixed(1) + ' sd' : '—'
      const reps = hx.reps[h]
        .slice(0, 5)
        .map(
          (r) =>
            `<span class="${r.ca ? 'ca' : 'acc'}">@${esc(r.handle)}</span>`,
        )
        .join(', ')
      tipEl.innerHTML =
        `<b>${hx.accounts[h]} accounts</b> <span class="d">· ${hx.ca[h]} in the Community Archive</span><br>` +
        `<span class="d">this window:</span> ${uses} uses in ${tweets.toLocaleString()} tweets<br>` +
        `<span class="d">real</span> ${uses ? sd : 'not used'}` +
        (reps ? `<br><span class="d">central accounts:</span> ${reps}` : '') +
        (m.hex_terms[h] && m.hex_terms[h].length
          ? `<br><span class="d">this cell's words:</span> ${esc(m.hex_terms[h].join(', '))}`
          : '') +
        regionTip(h)
      tipEl.style.display = 'block'
      tipEl.style.left =
        Math.min(window.innerWidth - 320, ev.clientX + 14) + 'px'
      tipEl.style.top = ev.clientY + 14 + 'px'
    }

    // ---- side panel for the selected hexes (aggregate data only: no posts in the hosted version)
    function showPanel() {
      root.current?.classList.toggle('drawer', S.sel.length > 0)
      if (!S.sel.length) {
        render()
        return
      }
      const m = S.meta!,
        hx = m.hex,
        n = S.sel.reduce((a, h) => a + hx.accounts[h], 0),
        ca = S.sel.reduce((a, h) => a + hx.ca[h], 0)
      $('.spx-celltitle').textContent =
        S.sel.length === 1
          ? `Cell ${S.sel[0]} · ${n} accounts`
          : `${S.sel.length} cells · ${n} accounts`
      const total = S.real
        ? S.sel.reduce(
            (a, h) => a + S.real!.uses[h].reduce((x, y) => x + y, 0),
            0,
          )
        : 0
      $('.spx-cellsub').textContent =
        `${ca} in the Community Archive · ${total.toLocaleString()} uses of “${S.word}” over all months`
      const regions = Array.from(new Set(S.sel.map((h) => m.hex_region[h])))
        .map((r) => m.regions[r])
        .filter(Boolean)
      $('.spx-list').innerHTML =
        `<h4>Central accounts</h4>` +
        S.sel
          .map(
            (h) =>
              `<div class="row"><span class="d">cell ${h}</span><span>${hx.reps[h].map((r) => `<a target="_blank" rel="noopener" href="https://x.com/${esc(r.handle)}">@${esc(r.handle)}</a>${r.ca ? '<span class="ca">CA</span>' : ''}`).join(', ') || '<span class="d">none</span>'}</span></div>`,
          )
          .join('') +
        `<h4>Words of these cells</h4><div class="row"><span>${esc(S.sel.flatMap((h) => m.hex_terms[h] || []).join(', ')) || '<span class="d">none</span>'}</span></div>` +
        (regions.length
          ? `<h4>Region${regions.length > 1 ? 's' : ''}</h4>` +
            regions
              .map(
                (r) =>
                  `<div class="row"><span><b>${esc(r.name)}</b>${r.note ? ` <span class="d">· ${esc(r.note)}</span>` : ''}<br><span class="d">${r.reps
                    .slice(0, 6)
                    .map((x) => '@' + esc(x))
                    .join(', ')}</span></span></div>`,
              )
              .join('')
          : '') +
        `<p class="d note">Posts and per-account lists are only in the local explorer: this page serves a static export of counts.</p>`
      render()
    }

    // ---- word picker: suggestions from the vocabulary as you type
    function showPicker(filter: string) {
      const f = filter.trim().toLowerCase(),
        picker = $('.spx-picker')
      const words = f
        ? S.vocab.filter((w) => w[0].startsWith(f)).slice(0, 20)
        : S.vocab.slice(0, 20)
      picker.innerHTML =
        (f && !words.some((w) => w[0] === f)
          ? `<div class="any" data-w="${esc(f)}">Search “${esc(f)}” <span>Enter</span></div>`
          : '') +
        (words.length
          ? '<div class="cols"><span>word</span><span>uses since 2024</span></div>'
          : '') +
        words
          .map(
            (w) =>
              `<div class="w${w[0] === S.word ? ' cur' : ''}" data-w="${esc(w[0])}"><span>${esc(w[0])}</span><span>${w[1].toLocaleString()}</span></div>`,
          )
          .join('')
      picker.style.display = picker.innerHTML ? 'block' : 'none'
    }

    // ---- URL state
    function writeHash() {
      const p = new URLSearchParams({ w: S.word, t: String(S.t) })
      if (S.sel.length) p.set('c', S.sel.join('.'))
      if (S.anchorText.trim()) p.set('a', S.anchorText.replace(/\s+/g, ''))
      if (S.regionMode !== 1) p.set('r', String(S.regionMode))
      history.replaceState(null, '', '#' + p)
    }
    function readHash() {
      const p = new URLSearchParams(location.hash.slice(1)),
        n = S.meta!.months.length
      if (p.get('w')) S.word = p.get('w')!
      if (p.get('t')) S.t = Math.max(0, Math.min(n - 1, +p.get('t')! || 0))
      S.sel = (p.get('c') || '')
        .split('.')
        .filter(Boolean)
        .map(Number)
        .filter((h) => h >= 0 && h < S.meta!.hex.x.length)
      S.anchorText = p.get('a') || ''
      if (p.get('r') != null)
        S.regionMode = Math.max(0, Math.min(2, +p.get('r')! || 0))
    }
    function setT(t: number) {
      const n = S.meta!.months.length
      S.t = (t + n) % n
      render()
    }
    function play(onOff: boolean) {
      if (S.timer) clearInterval(S.timer)
      S.timer = onOff ? setInterval(() => setT(S.t + 1), 600) : null
      $('.spx-play').textContent = onOff ? '❚❚' : '▶'
      $('.spx-play').classList.toggle('on', onOff)
    }

    let cancelled = false
    ;(async function init() {
      try {
        ;[S.meta, S.vocab] = await Promise.all([
          api<SpreadMeta>('/meta'),
          api<SpreadVocab>('/vocab').catch(() => [] as SpreadVocab),
        ])
      } catch (e) {
        $('.spx-err').textContent = String((e as Error).message || e)
        return
      }
      if (cancelled) return
      S.t = S.meta.months.length - 1
      readHash()
      const wordInput = $<HTMLInputElement>('.spx-word'),
        anchorsInput = $<HTMLInputElement>('.spx-anchors'),
        picker = $('.spx-picker')
      wordInput.value = S.word
      anchorsInput.value = S.anchorText
      const pick = (w: string) => {
        w = w.trim().toLowerCase()
        picker.style.display = 'none'
        wordInput.blur()
        if (w) {
          S.word = w
          wordInput.value = w
          loadWord()
        } else wordInput.value = S.word
      }
      on(wordInput, 'focus', () => {
        wordInput.select()
        showPicker('')
      })
      on(wordInput, 'input', () => showPicker(wordInput.value))
      on(wordInput, 'keydown', (ev: KeyboardEvent) => {
        if (ev.key === 'Enter') pick(wordInput.value)
        if (ev.key === 'Escape') pick('')
      })
      on(wordInput, 'blur', () =>
        setTimeout(() => {
          picker.style.display = 'none'
          wordInput.value = S.word
        }, 150),
      )
      on(picker, 'mousedown', (ev: MouseEvent) => {
        const row = (ev.target as HTMLElement).closest(
          '[data-w]',
        ) as HTMLElement | null
        if (row) {
          ev.preventDefault()
          pick(row.dataset.w || '')
        }
      })
      on(anchorsInput, 'change', () => {
        S.anchorText = anchorsInput.value
        loadAnchors()
      })
      on($('.spx-slider'), 'input', (e: Event) => {
        play(false)
        setT(+(e.target as HTMLInputElement).value)
      })
      on($('.spx-play'), 'click', () => play(!S.timer))
      const regionsBtn = $('.spx-regions')
      regionsBtn.textContent = REGION_MODES[S.regionMode]
      regionsBtn.classList.toggle('on', S.regionMode > 0)
      on(regionsBtn, 'click', () => {
        S.regionMode = (S.regionMode + 1) % 3
        regionsBtn.textContent = REGION_MODES[S.regionMode]
        regionsBtn.classList.toggle('on', S.regionMode > 0)
        render()
      })
      on($('.spx-close'), 'click', () => {
        S.sel = []
        showPanel()
      })
      const cv = $<HTMLCanvasElement>('canvas.spx-map')
      let drag: { x: number; y: number; vx: number; vy: number } | null = null,
        moved = false
      on(
        cv,
        'wheel',
        (ev: WheelEvent) => {
          ev.preventDefault()
          const b = cv.getBoundingClientRect(),
            v = S.view,
            z = Math.max(
              0.35,
              Math.min(12, v.z * Math.exp(-ev.deltaY * 0.0015)),
            )
          const mx = ev.clientX - b.left - b.width / 2,
            my = ev.clientY - b.top - b.height / 2,
            f = z / v.z
          setView(
            z,
            (mx - (mx - v.x * b.width) * f) / b.width,
            (my - (my - v.y * b.height) * f) / b.height,
          )
        },
        { passive: false },
      )
      on(cv, 'mousedown', (ev: MouseEvent) => {
        drag = { x: ev.clientX, y: ev.clientY, vx: S.view.x, vy: S.view.y }
        moved = false
      })
      on(window, 'mouseup', () => {
        drag = null
      })
      on(cv, 'dblclick', () => setView(1, 0, 0))
      on(cv, 'mousemove', (ev: MouseEvent) => {
        if (
          drag &&
          (moved || Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) > 4)
        ) {
          moved = true
          $('.spx-tip').style.display = 'none'
          const b = cv.getBoundingClientRect()
          setView(
            S.view.z,
            drag.vx + (ev.clientX - drag.x) / b.width,
            drag.vy + (ev.clientY - drag.y) / b.height,
          )
        } else tip(ev)
      })
      on(cv, 'mouseleave', () => {
        $('.spx-tip').style.display = 'none'
      })
      on(cv, 'click', (ev: MouseEvent) => {
        if (moved) {
          moved = false
          return
        }
        const h = hexAt(ev)
        if (h < 0) return
        if (ev.shiftKey)
          S.sel = S.sel.includes(h)
            ? S.sel.filter((x) => x !== h)
            : S.sel.concat(h)
        else S.sel = S.sel.length === 1 && S.sel[0] === h ? [] : [h]
        play(false)
        showPanel()
      })
      on($('.spx-timeline'), 'click', (ev: MouseEvent) => {
        const g = S.timelineGeo,
          b = (ev.target as HTMLElement).getBoundingClientRect()
        if (!g) return
        play(false)
        setT(
          Math.max(
            0,
            Math.min(
              S.meta!.months.length - 1,
              Math.floor((ev.clientX - b.left - g.left) / g.bw),
            ),
          ),
        )
      })
      on(window, 'resize', render)
      on(window, 'hashchange', () => {
        const w = S.word,
          a = S.anchorText
        readHash()
        wordInput.value = S.word
        anchorsInput.value = S.anchorText
        if (S.word !== w) loadWord()
        else if (S.anchorText !== a) loadAnchors()
        else showPanel()
      })
      if (S.anchorText) await loadAnchors()
      root.current?.classList.toggle('drawer', S.sel.length > 0)
      await loadWord()
    })()

    return () => {
      cancelled = true
      if (S.timer) clearInterval(S.timer)
      cancelAnimationFrame(viewFrame)
      cleanups.forEach((fn) => fn())
    }
  }, [])

  return (
    <div className="spx" ref={root}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <header>
        <span className="wordbox">
          <label htmlFor="spx-word">Word</label>
          <input
            id="spx-word"
            className="spx-word"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="type any word"
          />
          <div className="spx-picker" />
        </span>
        <button type="button" className="spx-play" title="Play / pause">
          ▶
        </button>
        <input
          className="spx-slider"
          type="range"
          min={0}
          max={0}
          defaultValue={0}
          aria-label="Month"
        />
        <span className="spx-month" />
        <span>
          <label htmlFor="spx-anchors">Anchors</label>
          <input
            id="spx-anchors"
            className="spx-anchors"
            type="text"
            placeholder="handles, comma-separated"
            spellCheck={false}
          />
        </span>
        <button
          type="button"
          className="spx-regions"
          title="Show the map's regions: off, borders, or coloured like countries"
        >
          Regions
        </button>
        <span className="spx-legend">
          −2.5 sd <i /> +2.5 sd
        </span>
      </header>
      <main>
        <h1 className="spx-title" />
        <div className="spx-sub" />
        <div className="map">
          <h2>REAL usage</h2>
          <canvas className="spx-map" />
        </div>
        <canvas className="spx-timeline" />
        <div className="spx-foot" />
        <div className="spx-err" />
      </main>
      <aside>
        <button type="button" className="spx-close" title="Close">
          ✕
        </button>
        <div className="head">
          <h3 className="spx-celltitle" />
          <div className="d spx-cellsub" />
          <canvas className="spx-cellchart" />
        </div>
        <div className="spx-list" />
      </aside>
      <div className="spx-tip" />
    </div>
  )
}

const CSS = `
.spx { --bg:#0e0e10; --panel:#17171a; --line:#2a2a30; --text:#e8e8ea; --dim:#9a9aa3; --accent:#f2c14e;
  background:var(--bg); color:var(--text); font:14px/1.4 ${FONT}; min-height:100vh; position:relative; }
.spx * { box-sizing:border-box; }
.spx header { display:flex; flex-wrap:wrap; gap:10px 16px; align-items:center; padding:10px 16px; border-bottom:1px solid var(--line); }
.spx header label { color:var(--dim); font-size:12px; margin-right:4px; }
.spx input[type=text] { background:var(--panel); color:var(--text); border:1px solid var(--line); border-radius:6px; padding:6px 8px; font:inherit; }
.spx .spx-word { width:190px; font-weight:600; }
.spx .wordbox { position:relative; }
.spx .spx-picker { display:none; position:absolute; top:36px; left:0; width:330px; max-height:70vh; overflow:auto; background:#1d1d22; border:1px solid var(--line);
  border-radius:8px; z-index:30; box-shadow:0 10px 30px #000a; font-size:13px; }
.spx .spx-picker .w, .spx .spx-picker .cols { display:grid; grid-template-columns:1fr 110px; gap:6px; padding:4px 10px; }
.spx .spx-picker .cols { color:var(--dim); font-size:11px; }
.spx .spx-picker .cols span + span, .spx .spx-picker .w span + span { text-align:right; color:var(--dim); font-variant-numeric:tabular-nums; }
.spx .spx-picker .w { cursor:pointer; } .spx .spx-picker .w:hover, .spx .spx-picker .any:hover { background:#2e2e36; }
.spx .spx-picker .w.cur span:first-child { color:var(--accent); }
.spx .spx-picker .any { padding:7px 10px; cursor:pointer; border-bottom:1px solid var(--line); } .spx .spx-picker .any span { color:var(--dim); font-size:11px; }
.spx .spx-anchors { width:300px; }
.spx button { background:var(--panel); color:var(--text); border:1px solid var(--line); border-radius:6px; padding:6px 10px; font:inherit; cursor:pointer; }
.spx button.on { border-color:var(--accent); color:var(--accent); }
.spx .spx-slider { width:260px; accent-color:#4a8fe0; }
.spx .spx-month { font-weight:700; min-width:128px; display:inline-block; }
.spx .spx-legend { display:flex; align-items:center; gap:6px; color:var(--dim); font-size:12px; margin-left:auto; }
.spx .spx-legend i { display:block; width:150px; height:10px; border-radius:3px;
  background:linear-gradient(90deg,#053061,#2166ac,#4393c3,#92c5de,#f7f7f7,#f4a582,#d6604d,#b2182b,#67001f); }
.spx main { padding:14px 20px 28px; transition:margin-right .15s; }
.spx.drawer main { margin-right:400px; }
.spx h1 { font-size:22px; margin:0 0 4px; letter-spacing:-.01em; font-weight:700; }
.spx .spx-sub { color:var(--dim); font-size:12px; margin-bottom:12px; min-height:16px; }
.spx .map { background:#111113; border:1px solid #1c1c21; border-radius:12px; position:relative; overflow:hidden; }
.spx .map h2 { position:absolute; top:10px; left:14px; z-index:2; font-size:12px; font-weight:700; letter-spacing:.06em; margin:0; padding:4px 9px; color:var(--text);
  background:#0e0e10cc; border-radius:6px; pointer-events:none; }
.spx .map canvas { display:block; width:100%; cursor:crosshair; }
.spx .spx-timeline { display:block; width:100%; height:104px; margin-top:16px; background:#111113; border:1px solid #1c1c21; border-radius:12px; cursor:pointer; }
.spx .spx-foot { color:var(--dim); font-size:11px; margin-top:8px; }
.spx .spx-err { color:#ff8f8f; font-size:12px; min-height:16px; }
.spx .spx-tip { position:fixed; pointer-events:none; background:#1d1d22; border:1px solid var(--line); border-radius:8px; padding:8px 10px;
  font-size:12px; max-width:300px; display:none; z-index:20; box-shadow:0 6px 20px #0008; }
.spx .spx-tip b { color:var(--text); } .spx .d { color:var(--dim); }
.spx .acc { color:#cfd8ff; } .spx .ca { color:var(--accent); font-size:11px; margin-left:3px; }
.spx aside { position:absolute; top:0; right:0; bottom:0; width:400px; background:var(--panel); border-left:1px solid var(--line);
  display:none; flex-direction:column; z-index:10; }   /* inside the page, so the site's header never covers it */
.spx.drawer aside { display:flex; }
.spx aside .head { padding:12px 14px 8px; border-bottom:1px solid var(--line); }
.spx aside .head h3 { margin:0 0 2px; font-size:15px; font-weight:600; }
.spx aside .head .d { font-size:12px; }
.spx .spx-close { position:absolute; top:8px; right:10px; border:none; background:none; font-size:18px; color:var(--dim); }
.spx .spx-cellchart { display:block; width:100%; height:90px; margin-top:6px; }
.spx .spx-list { overflow:auto; flex:1; padding:4px 14px 20px; }
.spx .spx-list h4 { margin:12px 0 4px; font-size:12px; color:var(--dim); text-transform:uppercase; letter-spacing:.04em; }
.spx .row { display:flex; justify-content:space-between; gap:8px; padding:5px 0; border-bottom:1px solid var(--line); font-size:13px; }
.spx .row a { color:#9db8ff; text-decoration:none; }
.spx .note { font-size:12px; margin-top:14px; }
@media (max-width: 1100px) { .spx.drawer main { margin-right:0; } .spx aside { width:100%; } }
`
