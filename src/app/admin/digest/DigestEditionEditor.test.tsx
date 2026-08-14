/** @jest-environment jsdom */

import React from 'react'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { AUGUST_11_MOCK_DIGEST } from '@/lib/digest/mock'
import { DigestContentFields } from './DigestEditionEditor'
;(globalThis as typeof globalThis & { React: typeof React }).React = React

jest.mock('./actions', () => ({
  saveDigestEditionAction: jest.fn(),
}))

jest.mock('./MarkdownField', () => ({
  MarkdownField: ({
    name,
    label,
    defaultValue,
  }: {
    name: string
    label: string
    defaultValue: string
  }) => <textarea aria-label={label} name={name} defaultValue={defaultValue} />,
}))

describe('DigestContentFields', () => {
  test('makes validated summary and story copy directly editable', () => {
    render(
      <form>
        <DigestContentFields content={AUGUST_11_MOCK_DIGEST.content} />
      </form>,
    )

    expect(screen.getByLabelText('Bullet 1')).toHaveValue(
      AUGUST_11_MOCK_DIGEST.content.executiveSummary[0],
    )
    expect(screen.getAllByLabelText('Title')[0]).toHaveValue(
      AUGUST_11_MOCK_DIGEST.content.stories[0].title,
    )
    expect(screen.getAllByLabelText('Editor’s note')[0]).toHaveValue(
      AUGUST_11_MOCK_DIGEST.content.stories[0].editorialNote,
    )
  })
})
