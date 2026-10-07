import { isCrawlerAgent, isLinkPreviewAgent } from './crawlers'

const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

describe('isCrawlerAgent', () => {
  it.each([
    [
      'Googlebot',
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    ],
    [
      'Bingbot',
      'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    ],
    [
      'GPTBot',
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)',
    ],
    [
      'ClaudeBot',
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
    ],
    [
      'AhrefsBot',
      'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
    ],
    [
      'Bytespider',
      'Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)',
    ],
    [
      'Yahoo Slurp',
      'Mozilla/5.0 (compatible; Yahoo! Slurp; http://help.yahoo.com/help/us/ysearch/slurp)',
    ],
    [
      'Google inspection',
      'Mozilla/5.0 (compatible; Google-InspectionTool/1.0)',
    ],
    ['headless Chrome', CHROME.replace('Chrome/', 'HeadlessChrome/')],
    ['missing agent', ''],
  ])('treats %s as a crawler', (_name, ua) => {
    expect(isCrawlerAgent(ua)).toBe(true)
  })

  it.each([
    ['desktop Chrome', CHROME],
    [
      'iPhone Safari',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    ],
    [
      'CUBOT Android phone',
      'Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    ],
    ['Twitterbot', 'Twitterbot/1.0'],
    ['Slackbot', 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)'],
    [
      'Discordbot',
      'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
    ],
    [
      'iMessage',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0',
    ],
  ])('lets %s generate', (_name, ua) => {
    expect(isCrawlerAgent(ua)).toBe(false)
  })
})

describe('isLinkPreviewAgent', () => {
  it('recognizes share unfurlers only', () => {
    expect(isLinkPreviewAgent('LinkedInBot/1.0')).toBe(true)
    expect(isLinkPreviewAgent(CHROME)).toBe(false)
  })
})
