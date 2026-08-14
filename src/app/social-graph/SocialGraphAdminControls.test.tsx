import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { requestFullSocialGraphRebuild } from './actions'
import { SocialGraphAdminControls } from './SocialGraphAdminControls'

jest.mock('./actions', () => ({
  requestFullSocialGraphRebuild: jest.fn(),
}))

const requestRebuildMock = jest.mocked(requestFullSocialGraphRebuild)

describe('SocialGraphAdminControls', () => {
  it('queues a full refresh and reports the background handoff', async () => {
    requestRebuildMock.mockResolvedValue({
      ok: true,
      message: 'Full refresh queued.',
    })
    const user = userEvent.setup()
    render(<SocialGraphAdminControls />)

    await user.click(screen.getByRole('button', { name: 'Run full refresh' }))

    expect(requestRebuildMock).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Full refresh queued.',
    )
  })
})
