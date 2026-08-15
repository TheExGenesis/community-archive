/** @jest-environment jsdom */

import React from 'react'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { AUGUST_11_MOCK_DIGEST } from '@/lib/digest/mock'
import {
  DigestContentFields,
  DigestEditionEditor,
  DigestValidatedOutputEditor,
} from './DigestEditionEditor'
;(globalThis as typeof globalThis & { React: typeof React }).React = React

jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  useFormStatus: () => ({
    action: null,
    data: null,
    method: null,
    pending: false,
  }),
}))

jest.mock('./actions', () => ({
  saveDigestEditionAction: '/save-digest-edition',
  stageEditedDigestEditionAction: '/stage-edited-digest-edition',
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

  test('offers draft and immediate publish actions for edited copy', () => {
    render(
      <DigestEditionEditor
        edition={AUGUST_11_MOCK_DIGEST}
        runId="00000000-0000-4000-8000-000000000001"
      />,
    )

    expect(
      screen.getByRole('button', {
        name: `Save as draft v${AUGUST_11_MOCK_DIGEST.version + 1}`,
      }),
    ).toHaveAttribute('value', 'draft')
    expect(screen.getByRole('button', { name: 'Publish now' })).toHaveAttribute(
      'value',
      'publish',
    )
  })

  test('offers draft and immediate publish actions beside validated copy', () => {
    render(
      <DigestValidatedOutputEditor
        content={AUGUST_11_MOCK_DIGEST.content}
        runId="00000000-0000-4000-8000-000000000001"
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Save as draft' }),
    ).toHaveAttribute('value', 'draft')
    expect(screen.getByRole('button', { name: 'Publish now' })).toHaveAttribute(
      'value',
      'publish',
    )
  })
})
