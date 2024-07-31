import { QueryCache } from '@tanstack/react-query'

const queryCache = new QueryCache()

beforeEach(() => {
  // Any setup you need before each test
})

afterEach(() => {
  queryCache.clear()
  // Any cleanup you need after each test
})
