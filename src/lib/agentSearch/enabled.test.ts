import { agentSearchEnabled } from './enabled'

test('on unless set to an off value', () => {
  expect(agentSearchEnabled({} as NodeJS.ProcessEnv)).toBe(true)
  expect(agentSearchEnabled({ AGENT_SEARCH_ENABLED: 'true' } as never)).toBe(
    true,
  )
  for (const off of ['false', '0', 'OFF', ' no ']) {
    expect(agentSearchEnabled({ AGENT_SEARCH_ENABLED: off } as never)).toBe(
      false,
    )
  }
})
