import type { PortalTweet } from '@/lib/portal/types'
import type { DigestEdition } from './types'

const DIGEST_DATE = '2026-08-11'
const OBSERVED_AT = '2026-08-13T01:29:28.769Z'

const mockTweet = (
  tweet: Omit<PortalTweet, 'observedAt' | 'rts'>,
): PortalTweet => ({
  ...tweet,
  observedAt: OBSERVED_AT,
  rts: 0,
  retweetCountAvailable: false,
})

const moonPosting = mockTweet({
  id: '2087404512805855369',
  username: 'lumeysea',
  name: 'lune',
  avatar:
    'https://pbs.twimg.com/profile_images/2077176550525452288/qLX7Y1Hu_normal.jpg',
  text: 'Oh my god I casually mentioned to a chat that I’m in that if men want to attract women to their posts and DMs, they basically just have to post about the moon. Multiple guys are trying it. One of the men mentioned it in another chat he’s in and the moon-posting-fishing is',
  createdAt: '2026-08-12T05:03:12.000Z',
  likes: 416,
  quoteCount: 7,
  media: [],
})

const aiAmbitions = mockTweet({
  id: '2087259683715260502',
  username: 'MadisonMills22',
  name: 'Madison Mills',
  avatar:
    'https://pbs.twimg.com/profile_images/1784997467039170560/0Vttab_c_normal.jpg',
  text: "Are you foregoing a romantic relationship to work on your AI ambitions? I'd love to speak with you for a story if so. DMs open or find me on signal at madymills.21",
  createdAt: '2026-08-11T19:27:42.000Z',
  likes: 948,
  quoteCount: 7,
  media: [],
})

const hiddenReasoning = mockTweet({
  id: '2087147042888114428',
  username: 'kotekjedi_ml',
  name: 'Alexander Panfilov',
  avatar:
    'https://pbs.twimg.com/profile_images/1869805907472740352/KDWcthSp_normal.jpg',
  text: 'We can finally talk about it:\n\nWe found a way to extract hidden reasoning of frontier models using a vulnerability in the APIs of every frontier AI company.\n\nWe verified that our reasoning token count matches billed API thinking tokens 1:1 for most of the prompts we queried. https://t.co/S7wN8aP3X7',
  createdAt: '2026-08-11T12:00:06.000Z',
  likes: 13278,
  quoteCount: 4,
  media: [
    {
      url: 'https://pbs.twimg.com/media/HPcJLMtagAAx07t.jpg',
      type: 'photo',
      width: 1175,
      height: 832,
    },
  ],
})

const deepThink = mockTweet({
  id: '2087228354399265125',
  username: '_can1357',
  name: 'Can Bölük',
  avatar:
    'https://pbs.twimg.com/profile_images/1251174019790974983/ebbPRYLv_normal.jpg',
  text: 'guys you do know you can just disable thinking, and instead give it a "deep_think" tool, and it will call it with internal CoT reasoning format right?\n\ngl fixing that https://t.co/eWnPGbwxXs',
  createdAt: '2026-08-11T17:23:13.000Z',
  likes: 6364,
  quoteCount: 4,
  media: [
    {
      url: 'https://pbs.twimg.com/media/HPdTAz2WMAADZWO.jpg',
      type: 'photo',
      width: 926,
      height: 856,
    },
  ],
})

const leakedTraces = mockTweet({
  id: '2087147116468826513',
  username: 'kotekjedi_ml',
  name: 'Alexander Panfilov',
  avatar:
    'https://pbs.twimg.com/profile_images/1869805907472740352/KDWcthSp_normal.jpg',
  text: 'Further, if you ever shared online a Claude Code/Codex session with encrypted reasoning blobs, they can be decoded and leak your personal data.\n\nWe did a preliminary scan of ~7,000 public traces and found 62 unique API keys, 33 email addresses, 33 passwords, and other sensitive https://t.co/CSw75l313c',
  createdAt: '2026-08-11T12:00:24.000Z',
  likes: 1121,
  quoteCount: 3,
  media: [
    {
      url: 'https://pbs.twimg.com/media/HPcJPccbEAAE9zt.jpg',
      type: 'photo',
      width: 3300,
      height: 1266,
    },
  ],
})

const grokBot = mockTweet({
  id: '2087224798078517251',
  username: 'bot',
  name: 'Grok Bot',
  avatar:
    'https://pbs.twimg.com/profile_images/2087219239275069440/KW6C403V_normal.jpg',
  text: 'Introducing Grok Bot, now in early beta.\n\nBots are AI teammates that do real work for you. They sign in to your tools, use them just like you do, and come back with finished work. https://t.co/uyfA97yo98',
  createdAt: '2026-08-11T17:09:05.000Z',
  likes: 31488,
  quoteCount: 3,
  media: [
    {
      url: 'https://pbs.twimg.com/amplify_video_thumb/2087221157787525120/img/n9OrR6nUrxVZL4oY.jpg',
      type: 'video',
      width: 3840,
      height: 2160,
    },
  ],
})

const littleGuy = mockTweet({
  id: '2087296366577906000',
  username: 'medjedowo',
  name: 'medjed无为圆猫',
  avatar:
    'https://pbs.twimg.com/profile_images/1993401369663877120/xETbTQTE_normal.jpg',
  text: "this is a genZ-coded branding strategy i call 'little guy'-ism, all the labs are in an aesthetic race to build the littlest guy to cover their B2C flank, claude crab was first, oai kind of fumbled sora cloud imo, gemini never got there, grok is now cute instead of based, etc",
  createdAt: '2026-08-11T21:53:28.000Z',
  likes: 1722,
  quoteCount: 2,
  media: [],
})

const formativeWomenOne = mockTweet({
  id: '2087366202922557665',
  username: 'Impish_Bunny',
  name: 'ylareia 🫪',
  avatar:
    'https://pbs.twimg.com/profile_images/2021309809543479296/RkYY4rPZ_normal.jpg',
  text: 'You have to understand, these were the women I looked up to in my formative years https://t.co/MfXojxEsPY',
  createdAt: '2026-08-12T02:30:58.000Z',
  likes: 94,
  quoteCount: 2,
  media: [
    {
      url: 'https://pbs.twimg.com/media/HPfQf_rbgAALiKi.jpg',
      type: 'photo',
      width: 364,
      height: 375,
    },
    {
      url: 'https://pbs.twimg.com/media/HPfQf_pbkAA-wuU.jpg',
      type: 'photo',
      width: 640,
      height: 425,
    },
    {
      url: 'https://pbs.twimg.com/media/HPfQf_sbwAAX4ZL.jpg',
      type: 'photo',
      width: 914,
      height: 1318,
    },
    {
      url: 'https://pbs.twimg.com/media/HPfQf_sasAAZSPH.jpg',
      type: 'photo',
      width: 640,
      height: 966,
    },
  ],
})

const formativeWomenTwo = mockTweet({
  id: '2087301659525275853',
  username: 'goblinodds',
  name: '𝖜𝖔𝖒𝖇𝖑𝖊 𝖜𝖎𝖙𝖍𝖔𝖚𝖙 𝖆 𝖈𝖆𝖚𝖘𝖊',
  avatar:
    'https://pbs.twimg.com/profile_images/2028592986951417856/edlCjEG2_normal.png',
  text: 'You have to understand, these were the women I looked up to in my formative years. https://t.co/lav3nKXKnR',
  createdAt: '2026-08-11T22:14:30.000Z',
  likes: 158,
  quoteCount: 2,
  media: [
    {
      url: 'https://pbs.twimg.com/media/HPeVzA3WoAAf3G4.jpg',
      type: 'photo',
      width: 1280,
      height: 1519,
    },
    {
      url: 'https://pbs.twimg.com/media/HPeVzA7WkAArzJU.jpg',
      type: 'photo',
      width: 249,
      height: 302,
    },
  ],
})

const formativeWomenThree = mockTweet({
  id: '2087264279179247947',
  username: 'breaking2morrow',
  name: 'Brother Arþur',
  avatar:
    'https://pbs.twimg.com/profile_images/1637865953772937217/Ds2i-DCI_normal.jpg',
  text: 'You have to understand, these were the women I looked up to in my formative years. https://t.co/GYuW18xNGQ',
  createdAt: '2026-08-11T19:45:58.000Z',
  likes: 35,
  quoteCount: 2,
  media: [
    {
      url: 'https://pbs.twimg.com/media/HPdzzCCWkAAz8Yg.jpg',
      type: 'photo',
      width: 676,
      height: 888,
    },
  ],
})

const formativeWomenFour = mockTweet({
  id: '2087160984364630237',
  username: '_space_punk_',
  name: 'ꜱᴘᴀᴄᴇ ᴘᴜɴᴋ',
  avatar:
    'https://pbs.twimg.com/profile_images/2083582985140658176/iZzKoOFz_normal.jpg',
  text: 'You have to understand, these were the women I looked up to in my formative years https://t.co/uDhUYyvXqJ',
  createdAt: '2026-08-11T12:55:30.000Z',
  likes: 49,
  quoteCount: 2,
  media: [
    {
      url: 'https://pbs.twimg.com/media/HPcV1y0bkAAMT9U.jpg',
      type: 'photo',
      width: 400,
      height: 262,
    },
  ],
})

const geminiUsers = mockTweet({
  id: '2087222656819241292',
  username: 'sundarpichai',
  name: 'Sundar Pichai',
  avatar:
    'https://pbs.twimg.com/profile_images/2051799620062429184/AL8CoAUG_normal.jpg',
  text: '1B+ people are now using @Geminiapp every month to spark new ideas and get things done. It’s our fastest growing product ever, and our 14th to hit the 1B-user mark.\n\nKudos to @JoshWoodward & the entire Gemini team, and thank you to everyone who has been on this journey with us - https://t.co/sSWrULX4Qn',
  createdAt: '2026-08-11T17:00:34.000Z',
  likes: 7699,
  quoteCount: 2,
  media: [],
})

const aiRace = mockTweet({
  id: '2087202317128909092',
  username: 'elyasbuilds',
  name: 'Elyas Masrour',
  avatar:
    'https://pbs.twimg.com/profile_images/1982970800207527937/mmSNFbo2_normal.jpg',
  text: "Who's *actually* winning the AI race?\n\nIn recent research, we showed Pangram is capable of identifying the model family that generated a piece of text.\n\nUsing this emergent behavior, we can watch the shifting market share in the AI race. Take a look! ⬇️ https://t.co/ij0jTsxZQy",
  createdAt: '2026-08-11T15:39:45.000Z',
  likes: 690,
  quoteCount: 2,
  media: [
    {
      url: 'https://pbs.twimg.com/media/HPc7chgXIAEdzH7.png',
      type: 'photo',
      width: 1200,
      height: 672,
    },
  ],
})

export const AUGUST_11_MOCK_DIGEST: DigestEdition = {
  id: 'preview-2026-08-11-v1',
  issueNumber: 1,
  digestDate: DIGEST_DATE,
  version: 1,
  status: 'published',
  sourceRunId: 'preview-august-11-cluster-memo',
  isPreview: true,
  content: {
    digestDate: DIGEST_DATE,
    windowStart: '2026-08-11T07:00:00.000Z',
    windowEnd: '2026-08-12T07:00:00.000Z',
    generatedAt: OBSERVED_AT,
    executiveSummary:
      'Hidden model reasoning became a security story, Grok arrived as both worker and mascot, and the timeline turned identity, courtship, and AI-market metrics into collective arguments.',
    topBanger: moonPosting,
    stories: [
      {
        slug: 'hidden-reasoning-leaked-secrets',
        keyword: 'hidden reasoning',
        title:
          'Hidden reasoning was extractable—and encrypted traces leaked secrets',
        subtitle:
          'A frontier-model API disclosure became more concrete when researchers reported credentials and personal data inside public Claude Code and Codex traces.',
        bullets: [
          'Researchers said extracted token counts matched billed thinking tokens for most tested prompts.',
          'A scan of roughly 7,000 public traces reportedly found API keys, email addresses, passwords, and other sensitive data.',
          'The key distinction is between eliciting reasoning from your own prompt and recovering private material from somebody else’s shared trace.',
        ],
        editorialNote:
          'This is the day’s clearest story, but eliciting chain of thought from your own prompt is not the same severity as recovering private material from somebody else’s published encrypted trace.',
        bangers: [hiddenReasoning, deepThink, leakedTraces],
        commentary: [],
        replyCount: 0,
        peakedAt: '2026-08-11T17:23:13.000Z',
      },
      {
        slug: 'moon-posting-meets-ai-ambition',
        keyword: 'moon',
        title: 'Moon-posting met the choice to put AI ambition before romance',
        subtitle:
          'Two high-ranked posts turned courtship into a participatory conversation about authenticity, ambition, and status on the timeline.',
        bullets: [
          'One post described men adopting moon posts as engagement and DM bait after hearing that the tactic attracts women.',
          'Another sought people foregoing romantic relationships to pursue AI work.',
          'The cluster is cultural rather than merely about AI or astronomy: both posts ask how people narrate desire and status in public.',
        ],
        editorialNote:
          'This is a loose but natural culture cluster: the shared subject is how people narrate courtship, ambition, and status on the timeline—not AI or astronomy by itself.',
        bangers: [moonPosting, aiAmbitions],
        commentary: [],
        replyCount: 0,
        peakedAt: '2026-08-12T05:03:12.000Z',
      },
      {
        slug: 'grok-bot-little-guy',
        keyword: 'little guy',
        title: 'Grok Bot arrived as a worker—and as the newest AI “little guy”',
        subtitle:
          'The launch sold agents as persistent coworkers while the surrounding conversation read cuteness as a deliberate consumer-AI strategy.',
        bullets: [
          'Grok Bot’s pitch was concrete: sign in to tools, do the work, and return with a finished result.',
          'Reactions mixed assistant enthusiasm with enterprise skepticism and vendor-lock-in concerns.',
          'Friendly mascot branding makes a high-agency system feel domestic and approachable.',
        ],
        editorialNote:
          'The story is both product and packaging: agents are sold as coworkers while “little guy” aesthetics make a high-agency system feel domestic and approachable.',
        bangers: [grokBot, littleGuy],
        commentary: [],
        replyCount: 0,
        peakedAt: '2026-08-11T21:53:28.000Z',
      },
      {
        slug: 'formative-women-meme',
        keyword: 'formative years',
        title: '“Women I looked up to” became the day’s participatory canon',
        subtitle:
          'Four image lists used the same phrase to turn fictional characters, writers, and influences into public autobiography.',
        bullets: [
          'The posts were iterations of one image-list format and sometimes quoted one another.',
          'The largest thread grew into a real discussion of formative writers and fictional characters.',
          'A reusable phrase let people publish autobiographical canons and recognize one another’s influences.',
        ],
        editorialNote:
          'This is the strongest native social cluster of the day: a reusable phrase prompted people to publish autobiographical canons and recognize one another’s influences.',
        bangers: [
          formativeWomenOne,
          formativeWomenTwo,
          formativeWomenThree,
          formativeWomenFour,
        ],
        commentary: [],
        replyCount: 27,
        peakedAt: '2026-08-12T02:30:58.000Z',
      },
      {
        slug: 'gemini-ai-race-measurement',
        keyword: 'AI race',
        title:
          'Gemini’s billion-user claim met a different measure of the AI race',
        subtitle:
          'A usage milestone and a classifier-derived market-share view showed how dramatically the answer changes with the denominator.',
        bullets: [
          'Google announced more than one billion monthly Gemini users.',
          'Pangram used model-family attribution to estimate which systems produced observable AI-written text.',
          '“Users” and classified model output are different populations, and both measurements need sampling and attribution caveats.',
        ],
        editorialNote:
          'Together these posts are about measurement rather than rivalry: “users” and observable model-generated text are different denominators, and both invite sampling and attribution caveats.',
        bangers: [geminiUsers, aiRace],
        commentary: [],
        replyCount: 0,
        peakedAt: '2026-08-11T17:00:34.000Z',
      },
    ],
    keywords: [
      'hidden reasoning',
      'moon',
      'AI ambitions',
      'little guy',
      'formative years',
      '1B+ people',
      'AI race',
    ],
    source: {
      candidateCount: 252,
      selectedCount: 30,
      runId: 'preview-august-11-cluster-memo',
    },
  },
  createdBy: null,
  createdAt: OBSERVED_AT,
  publishedAt: null,
  updatedAt: OBSERVED_AT,
}

interface DigestPreviewEnvironment {
  DIGEST_MOCK_DATA?: string
  VERCEL_ENV?: string
  NODE_ENV?: string
}

export function isDigestPreviewEnabled(
  env: DigestPreviewEnvironment = process.env,
): boolean {
  return (
    env.DIGEST_MOCK_DATA === 'true' ||
    env.VERCEL_ENV === 'preview' ||
    env.NODE_ENV === 'development'
  )
}

export function getPreviewDigestEdition(
  digestDate?: string,
): DigestEdition | null {
  if (!isDigestPreviewEnabled()) return null
  if (digestDate && digestDate !== DIGEST_DATE) return null
  return AUGUST_11_MOCK_DIGEST
}
