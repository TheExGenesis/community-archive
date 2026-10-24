import { remarkProfileLinks, type MdNode, type Person } from './profileLinks'

const people = new Map<string, Person>([
  ['csgbwk', { username: 'csgbwk', accountId: '1' }],
  ['pradyuprasad', { username: 'PradyuPrasad', accountId: '2' }],
])

const paragraph = (...children: MdNode[]) => ({
  type: 'root',
  children: [{ type: 'paragraph', children }],
})
const text = (value: string): MdNode => ({ type: 'text', value })

function run(tree: ReturnType<typeof paragraph>) {
  remarkProfileLinks(people)()(tree)
  return tree.children[0].children ?? []
}

test('a known handle links to its profile, keeping the text around it', () => {
  expect(
    run(paragraph(text('@csgbwk was there, as was @pradyuprasad.'))),
  ).toEqual([
    {
      type: 'link',
      url: '/user/csgbwk',
      children: [text('@csgbwk')],
    },
    text(' was there, as was '),
    {
      type: 'link',
      url: '/user/PradyuPrasad',
      children: [text('@pradyuprasad')],
    },
    text('.'),
  ])
})

test('unknown handles, emails and handles already in links or code stay as written', () => {
  const link: MdNode = {
    type: 'link',
    url: 'https://x.com',
    children: [text('@csgbwk')],
  }
  const code: MdNode = { type: 'inlineCode', value: '@csgbwk' }
  const nodes = run(
    paragraph(text('@someone_else mailed a@csgbwk.com '), link, code),
  )
  expect(nodes).toEqual([
    text('@someone_else mailed a@csgbwk.com '),
    link,
    code,
  ])
})

test('handles inside bold text link too', () => {
  const tree = paragraph({ type: 'strong', children: [text('@csgbwk')] })
  const [strong] = run(tree)
  expect(strong.children).toEqual([
    { type: 'link', url: '/user/csgbwk', children: [text('@csgbwk')] },
  ])
})
