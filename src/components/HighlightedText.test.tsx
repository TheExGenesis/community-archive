import { render } from '@testing-library/react'
import { HighlightedText } from './HighlightedText'

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
