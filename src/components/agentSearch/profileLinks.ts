import { userProfileHref } from '@/lib/navigation'

/** Someone whose tweets the run returned, keyed by lower-case handle. */
export interface Person {
  username: string
  accountId?: string
}

export interface MdNode {
  type: string
  value?: string
  url?: string
  children?: MdNode[]
}

// An @handle not preceded by a word character, a slash or another @, so
// emails and URLs are left alone.
const HANDLE = /(^|[^\w/@])@(\w{1,15})(?!\w)/g

/**
 * Turns @handles in the answer's text into links to Community Archive
 * profiles, for the people in `people` only. Text already inside a link or
 * code is left as written.
 */
export function remarkProfileLinks(people: ReadonlyMap<string, Person>) {
  const split = (value: string): MdNode[] => {
    const nodes: MdNode[] = []
    let last = 0
    for (const match of Array.from(value.matchAll(HANDLE))) {
      const person = people.get(match[2].toLowerCase())
      if (!person) continue
      const start = (match.index ?? 0) + match[1].length
      if (start > last)
        nodes.push({ type: 'text', value: value.slice(last, start) })
      nodes.push({
        type: 'link',
        url: userProfileHref(person.username, person.accountId),
        children: [{ type: 'text', value: `@${match[2]}` }],
      })
      last = start + match[2].length + 1
    }
    if (!nodes.length) return [{ type: 'text', value }]
    if (last < value.length)
      nodes.push({ type: 'text', value: value.slice(last) })
    return nodes
  }
  const walk = (node: MdNode) => {
    if (
      !node.children ||
      ['link', 'linkReference', 'inlineCode', 'code'].includes(node.type)
    ) {
      return
    }
    node.children = node.children.flatMap((child) => {
      if (child.type === 'text' && child.value) return split(child.value)
      walk(child)
      return [child]
    })
  }
  return () => (tree: MdNode) => walk(tree)
}
