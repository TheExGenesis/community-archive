'use client'

import { useContext, useMemo, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ProfileLink,
  ProfilePeopleContext,
} from '@/components/agentSearch/ProfilePreview'
import {
  remarkProfileLinks,
  type Person,
} from '@/components/agentSearch/profileLinks'

const INLINE_ELEMENTS = ['p', 'strong', 'em', 'del', 'code', 'a', 'br']
const NO_PEOPLE: ReadonlyMap<string, Person> = new Map()

/** Everyone a weekly edition mentions, so their @handles open profile cards. */
export function WeeklyPeopleProvider({
  people,
  children,
}: {
  people: Person[]
  children: ReactNode
}) {
  const map = useMemo(
    () =>
      new Map(people.map((person) => [person.username.toLowerCase(), person])),
    [people],
  )
  return (
    <ProfilePeopleContext.Provider value={map}>
      {children}
    </ProfilePeopleContext.Provider>
  )
}

/**
 * Inline weekly-digest Markdown. @handles of known people become profile links
 * with a hover card; other links open in a new tab unless `allowLinks` is off.
 */
export function WeeklyText({
  children,
  allowLinks = true,
}: {
  children: string
  allowLinks?: boolean
}) {
  const people = useContext(ProfilePeopleContext) ?? NO_PEOPLE
  const remarkPlugins = useMemo(
    () => [remarkGfm, ...(allowLinks ? [remarkProfileLinks(people)] : [])],
    [people, allowLinks],
  )
  return (
    <ReactMarkdown
      allowedElements={INLINE_ELEMENTS}
      remarkPlugins={remarkPlugins}
      skipHtml
      unwrapDisallowed
      components={{
        p: ({ children: content }) => <>{content}</>,
        a: ({ children: content, href }) => {
          if (!allowLinks || !href) return <>{content}</>
          if (href.startsWith('/user/'))
            return (
              <span className="font-medium text-brand">
                <ProfileLink href={href}>{content}</ProfileLink>
              </span>
            )
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-sm text-brand underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {content}
            </a>
          )
        },
      }}
    >
      {children}
    </ReactMarkdown>
  )
}
