import { getMobileNav, navAnalyticsDestination } from './navigation'
import fs from 'fs'
import path from 'path'
import ts from 'typescript'
import {
  analyticsRoutes,
  analyticsRoute,
  sanitizeAnalyticsUrl,
} from './analyticsRoutes'
import { allowedEventProperties, sanitizePostHogEvent } from './posthog'
import type { CaptureResult } from 'posthog-js/dist/module.slim'

function files(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name)
    return entry.isDirectory() ? files(full) : [full]
  })
}
const source = path.join(process.cwd(), 'src')

it('classifies every actual page, including explicit non-product exclusions', () => {
  const routes = files(path.join(source, 'app'))
    .filter((file) => /\/page\.tsx$/.test(file))
    .map((file) => {
      const route = path
        .relative(path.join(source, 'app'), path.dirname(file))
        .split(path.sep)
        .filter(
          (segment) =>
            segment && !segment.startsWith('(') && !segment.startsWith('@'),
        )
        .join('/')
      return `/${route}`
    })
  expect(routes.filter((route) => !(route in analyticsRoutes))).toEqual([])
  expect(analyticsRoute('/birdseye/profiles').group).toBe('admin')
})

it('rejects unregistered literal events anywhere in product source before release', () => {
  const missing: string[] = []
  for (const file of files(source).filter(
    (file) => /\.tsx?$/.test(file) && !file.includes('.test.'),
  )) {
    const ast = ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    )
    const visit = (node: ts.Node) => {
      let name: string | undefined
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(ast) === 'capturePostHogEvent' &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      )
        name = node.arguments[0].text
      if (
        ts.isJsxAttribute(node) &&
        node.name.getText(ast) === 'eventName' &&
        node.initializer &&
        ts.isStringLiteral(node.initializer)
      )
        name = node.initializer.text
      if (name && !(name in allowedEventProperties))
        missing.push(`${path.relative(source, file)}: ${name}`)
      ts.forEachChild(node, visit)
    }
    visit(ast)
  }
  expect(missing).toEqual([])
})

it.each([
  [
    'website_section_ready',
    { page: 'graph', section: 'navigation_shell', navigation_type: 'unknown' },
  ],
  [
    'website_section_ready',
    {
      page: 'search',
      section: 'profile_feed',
      navigation_type: 'document',
      elapsed_ms: 45,
    },
  ],
  [
    'search_results_received',
    { phase: 'canonical', page: 1, result_count: 0, elapsed_ms: 125 },
  ],
  [
    'search_results_failed',
    { error_category: 'request_failed', elapsed_ms: 125 },
  ],
  ['own_tweet_deleted', {}],
  ['product_action', { feature: 'birdseye', action: 'topic_opened' }],
])(
  'delivers %s through the actual sanitizer without content',
  (event, properties) => {
    const result = sanitizePostHogEvent({
      event,
      uuid: 'test-event',
      properties: {
        ...properties,
        query: 'private words',
        topic: 'private topic',
        $current_url:
          'https://www.community-archive.org/birdseye?username=private&cluster_id=secret',
      },
    } as CaptureResult)
    expect(result).not.toBeNull()
    expect(result!.properties).toMatchObject(properties)
    expect(JSON.stringify(result)).not.toMatch(/private|secret/)
  },
)

it('normalizes route parameters and fails closed for unexpected routes', () => {
  expect(
    sanitizeAnalyticsUrl(
      'https://www.community-archive.org/user/private-person?q=secret#token',
    ),
  ).toBe('https://www.community-archive.org/user/[account_id]')
  expect(
    sanitizeAnalyticsUrl(
      'https://www.community-archive.org/new/private?code=secret',
    ),
  ).toBe('https://www.community-archive.org/unknown')
  expect(sanitizeAnalyticsUrl('https://outside.example/private?q=secret')).toBe(
    'https://outside.example',
  )
})

it('accepts every rendered navigation destination for all audiences', () => {
  for (const member of [false, true]) {
    for (const admin of [false, true]) {
      for (const item of getMobileNav(member, admin)) {
        const event = sanitizePostHogEvent({
          event: 'navigation_item_clicked',
          uuid: 'navigation-test',
          properties: {
            destination: navAnalyticsDestination(item.href),
            surface: 'mobile',
            already_active: false,
          },
        })
        expect(event).not.toBeNull()
      }
    }
  }
})
