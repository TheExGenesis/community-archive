import { render, screen } from '@testing-library/react'
import { HighlightedChildren, HighlightedText } from './HighlightedText'

test('preserves markdown elements and link targets while highlighting visible text', () => {
  const { container } = render(
    <HighlightedChildren query="c++ idea">
      <strong>A c++ idea</strong> <a href="https://example.com/idea">An idea</a>
    </HighlightedChildren>,
  )
  expect(screen.getByRole('link')).toHaveAttribute(
    'href',
    'https://example.com/idea',
  )
  expect(container.querySelector('strong mark')).toHaveTextContent('c++')
  expect(container.querySelector('a mark')).toHaveTextContent('idea')
  expect(container.querySelectorAll('mark')).toHaveLength(3)
})

test('nested markdown renderers can both highlight without recursive wrappers', () => {
  const Paragraph = ({ children }: { children: React.ReactNode }) => (
    <p>
      <HighlightedChildren query="idea">{children}</HighlightedChildren>
    </p>
  )
  const { container } = render(
    <HighlightedChildren query="idea">
      <Paragraph>An idea</Paragraph>
    </HighlightedChildren>,
  )
  expect(container.querySelectorAll('mark')).toHaveLength(1)
  expect(container.querySelector('mark')).toHaveTextContent('idea')
})

test('highlights literal phrases and regex punctuation without changing the text', () => {
  const text = 'Open source: C++ and open SOURCE.'
  const { container } = render(
    <HighlightedText text={text} query={'"open source" C++'} />,
  )
  expect(container.textContent).toBe(text)
  expect(
    Array.from(container.querySelectorAll('mark'), (m) => m.textContent),
  ).toEqual(['Open source', 'C++', 'open SOURCE'])
})

test('escapes markup in both tweets and queries', () => {
  const text = '<script>alert(1)</script> & 😀'
  const { container } = render(
    <HighlightedText text={text} query={'<script> 😀'} />,
  )
  expect(container.textContent).toBe(text)
  expect(container.querySelector('script')).toBeNull()
  expect(container.querySelectorAll('mark')).toHaveLength(2)
})
