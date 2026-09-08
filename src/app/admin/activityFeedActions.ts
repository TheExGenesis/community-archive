'use server'
import { loadActivityPage } from './activityFeedData'
export async function loadActivityPageAction(input: unknown) {
  return loadActivityPage(input)
}
