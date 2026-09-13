type BotIdProtectedRoute = {
  path: string
  method: string
  advancedOptions: {
    checkLevel: 'basic'
  }
}

/**
 * Expensive public reads initiated after the app has loaded in a browser.
 *
 * Keep this list aligned with calls to enforceBotId() in the matching route
 * handlers. BotID only attaches its proof headers to routes declared here.
 */
export const BOT_ID_PROTECTED_ROUTES: BotIdProtectedRoute[] = [
  {
    path: '/api/portal/bangers',
    method: 'GET',
    advancedOptions: { checkLevel: 'basic' },
  },
  {
    path: '/api/portal/stream',
    method: 'GET',
    advancedOptions: { checkLevel: 'basic' },
  },
  {
    path: '/api/profile/*/bangers',
    method: 'GET',
    advancedOptions: { checkLevel: 'basic' },
  },
  {
    path: '/api/profile/*/interactions',
    method: 'GET',
    advancedOptions: { checkLevel: 'basic' },
  },
  {
    path: '/api/profile/*/media',
    method: 'GET',
    advancedOptions: { checkLevel: 'basic' },
  },
  {
    path: '/api/profile/*/sidebar',
    method: 'GET',
    advancedOptions: { checkLevel: 'basic' },
  },
  {
    path: '/api/tweets/*/quotes',
    method: 'GET',
    advancedOptions: { checkLevel: 'basic' },
  },
  {
    path: '/api/tweet-search',
    method: 'GET',
    advancedOptions: { checkLevel: 'basic' },
  },
  {
    path: '/api/user-directory',
    method: 'GET',
    advancedOptions: { checkLevel: 'basic' },
  },
]
