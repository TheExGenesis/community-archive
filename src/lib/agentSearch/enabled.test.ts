import { agentSearchEnabled, agentSearchLaunched } from './enabled'

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

test('launched only when set to an on value', () => {
  expect(agentSearchLaunched({} as NodeJS.ProcessEnv)).toBe(false)
  for (const off of ['', 'false', '0', 'maybe']) {
    expect(agentSearchLaunched({ AGENT_SEARCH_LAUNCHED: off } as never)).toBe(
      false,
    )
  }
  for (const on of ['true', '1', 'ON', ' yes ']) {
    expect(agentSearchLaunched({ AGENT_SEARCH_LAUNCHED: on } as never)).toBe(
      true,
    )
  }
})
