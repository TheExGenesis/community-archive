import {
  monthlyActivity,
  birdseyeGroups,
  yearlySummaries,
  participantUsername,
} from './birdseye-layout'
import type { BirdseyeAnalysis, BirdseyeCluster } from './types'
const idAt = (date: string) =>
  (
    (BigInt(new Date(date).getTime()) - BigInt('1288834974657')) <<
    BigInt(22)
  ).toString()
test('monthly chart starts and ends at cited months, fills gaps, and deduplicates IDs', () => {
  const june = idAt('2021-06-15')
  expect(
    monthlyActivity([june, june, idAt('2021-08-03'), 'bad', '123']),
  ).toEqual([
    { month: '2021-06', count: 1 },
    { month: '2021-07', count: 0 },
    { month: '2021-08', count: 1 },
  ])
  expect(monthlyActivity([])).toEqual([])
  expect(monthlyActivity([june])).toEqual([{ month: '2021-06', count: 1 }])
})
test('overview ranks macro topics by unique references and includes ungrouped topics', () => {
  const analysis = {
    groups: [
      { name: 'Small', clusterIds: ['a'] },
      { name: 'Big', clusterIds: ['b', 'c', 'hidden'] },
    ],
    clusters: [
      { id: 'a', name: 'A', tweetIds: ['1'] },
      { id: 'b', name: 'B', tweetIds: ['2', '3'] },
      { id: 'c', name: 'C', tweetIds: ['3', '4', '5'] },
      { id: 'd', name: 'D', tweetIds: ['6'] },
    ],
  } as BirdseyeAnalysis
  const groups = birdseyeGroups(analysis)
  expect(groups[0].name).toBe('Big')
  expect(groups[0].tweetIds).toHaveLength(4)
  expect(groups[0].topics.map((topic) => topic.id)).toEqual(['c', 'b'])
  expect(
    groups.find((group) => group.name === 'More topics')?.topics[0].id,
  ).toBe('d')
})
test('year summaries are chronological and cropped to the cited date range', () => {
  const cluster = {
    tweetIds: [idAt('2020-05-04'), idAt('2022-09-12')],
    sections: [
      {
        name: 'Yearly summaries',
        items: ['2022', '2019', '2020', '2023'].map((label) => ({ label })),
      },
    ],
  } as BirdseyeCluster
  expect(yearlySummaries(cluster).map((item) => item.label)).toEqual([
    '2020',
    '2022',
  ])
})
test('person avatars require a known participant handle, not just a short entity name', () => {
  expect(participantUsername('@Christineist', ['christineist'])).toBe(
    'christineist',
  )
  expect(participantUsername('Book', ['christineist'])).toBeNull()
  expect(participantUsername('Wong Kar Wai', ['christineist'])).toBeNull()
})
