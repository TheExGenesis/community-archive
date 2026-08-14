import type { PortalQuotedTweet, PortalTweet } from '@/lib/portal/types'
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

const quotedSnapshot = (tweet: PortalTweet): PortalQuotedTweet => ({
  id: tweet.id,
  accountId: tweet.accountId,
  username: tweet.username,
  name: tweet.name,
  avatar: tweet.avatar,
  text: tweet.text,
  createdAt: tweet.createdAt,
  likes: tweet.likes,
  rts: tweet.rts,
  media: tweet.media ?? [],
})

const mockQuote = (
  tweet: Omit<PortalTweet, 'observedAt' | 'rts' | 'quotedTweet'>,
  target: PortalTweet,
): PortalTweet =>
  mockTweet({
    ...tweet,
    quotedTweet: quotedSnapshot(target),
  })

const moonPosting = mockTweet({
  id: '2087404512805855369',
  username: 'lumeysea',
  name: 'lune',
  avatar:
    'https://pbs.twimg.com/profile_images/2077176550525452288/qLX7Y1Hu_normal.jpg',
  text: 'Oh my god I casually mentioned to a chat that I’m in that if men want to attract women to their posts and DMs, they basically just have to post about the moon. Multiple guys are trying it. One of the men mentioned it in another chat he’s in and the moon-posting-fishing is SPREADING\n\nStay vigilant ladies, they are NOT posting from the heart! True and pure moon-posting is done from reverence and love.',
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

const moonCanConfirm = mockQuote(
  {
    id: '2087537677436367086',
    username: 'RandomSprint',
    name: 'RandomSprint🧭',
    avatar:
      'https://pbs.twimg.com/profile_images/1810341142820487168/x66APCTD_normal.jpg',
    text: 'Can confirm. https://t.co/pineeHUcNS',
    createdAt: '2026-08-12T13:52:21.000Z',
    likes: 55,
    media: [
      {
        url: 'https://pbs.twimg.com/media/HPhsci4WgAEv7Hx.jpg',
        type: 'photo',
      },
      {
        url: 'https://pbs.twimg.com/media/HPhscuJXkAAdiGc.jpg',
        type: 'photo',
      },
      {
        url: 'https://pbs.twimg.com/media/HPhsc6rXEAEA3v4.jpg',
        type: 'photo',
      },
      {
        url: 'https://pbs.twimg.com/media/HPhsdIWWcAAFm7H.jpg',
        type: 'photo',
      },
    ],
  },
  moonPosting,
)

const moonPosers = mockQuote(
  {
    id: '2087561194332639591',
    username: 'IaimforGOAT',
    name: '🐜',
    avatar:
      'https://pbs.twimg.com/profile_images/1928932579782033408/wM_Cj4z2_normal.jpg',
    text: "y'all are a bunch of POSERS; you should post about the moon bc you love the moon, not to attract women! wth?!",
    createdAt: '2026-08-12T15:25:48.000Z',
    likes: 2,
    media: [],
  },
  moonPosting,
)

const moonCoincidence = mockQuote(
  {
    id: '2087416065152463303',
    username: 'QiaochuYuan',
    name: 'QC',
    avatar:
      'https://pbs.twimg.com/profile_images/1746687266947555328/OIMkOG55_normal.jpg',
    text: "my contribution is that it's very weird that the sun and the moon are the same apparent size in the sky, the consensus appears to be that this is just a coincidence but that strikes me as wildly unsatisfying. seems to me there ought to be an anthropic explanation and my schizo theory is that eclipses are somehow necessary for the creation of civilization, like they provide some kind of crucial stimulus to insight or creativity or something. here's sol riffing off of this",
    createdAt: '2026-08-12T05:49:06.000Z',
    likes: 1143,
    media: [
      {
        url: 'https://pbs.twimg.com/media/HPf9urIacAAjsO9.jpg',
        type: 'photo',
        width: 1320,
        height: 1246,
      },
      {
        url: 'https://pbs.twimg.com/media/HPf9urIawAAjms_.jpg',
        type: 'photo',
        width: 1330,
        height: 1268,
      },
    ],
  },
  moonPosting,
)

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

const hiddenPaperCaveat = mockQuote(
  {
    id: '2087519464665338357',
    username: 'deedydas',
    name: 'Deedy',
    avatar:
      'https://pbs.twimg.com/profile_images/2016718977960120320/a3F0LOz6_normal.jpg',
    text: "Objectively one of the coolest papers in LLM jailbreak world but most people didn't read the actual paper to know that the encrypted reasoning trace hack doesn't affect Fable and doesn’t explain any purported distillation of that model. https://t.co/ke9yHtKuZL",
    createdAt: '2026-08-12T12:39:59.000Z',
    likes: 5,
    media: [
      {
        url: 'https://pbs.twimg.com/media/HPhb4nsXgAAcM75.jpg',
        type: 'photo',
        width: 1072,
        height: 697,
      },
    ],
  },
  hiddenReasoning,
)

const hiddenReproduced = mockQuote(
  {
    id: '2087371066020868164',
    username: 'wunderwuzzi23',
    name: 'Johann Rehberger',
    avatar:
      'https://pbs.twimg.com/profile_images/1225981388127490049/yLSA2SzN_normal.jpg',
    text: 'wild. recovering encrypted llm thoughts! 🔥\n\ni was able repro this multiple times today with gpt-5.6 traces... until about an hour ago.\n\nwondering who else was able to repro to exchange notes?\n\nwhat a great piece of research. @kotekjedi_ml https://t.co/kuucd4L3Lv',
    createdAt: '2026-08-12T02:50:18.000Z',
    likes: 138,
    media: [
      {
        url: 'https://pbs.twimg.com/media/HPfU7EZakAAlpSu.jpg',
        type: 'photo',
        width: 1200,
        height: 516,
      },
    ],
  },
  hiddenReasoning,
)

const hiddenOperationalRisk = mockQuote(
  {
    id: '2087280672142749822',
    username: 'vvvincent_c',
    name: 'Vincent',
    avatar:
      'https://pbs.twimg.com/profile_images/1785684220423307264/Vx5m6FCA_normal.jpg',
    text: "another down update on the execution/schlep competence of labs :( .\n\nadded to the list: leaking encrypted cot to attackers, accidentally training on cot, rouge agent message boards going unnoticed for months, insecure docker containers\n\nwe should also be thinking about scenarios where things go poorly, not because we can't crack the scary open problems, but we are simply incompetent and fail to execute on the long slew of operational details that are trivial in isolation, but hard to fully cover. it would be slightly embarrassing to fail because of these details.",
    createdAt: '2026-08-11T20:51:06.000Z',
    likes: 50,
    media: [],
  },
  hiddenReasoning,
)

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

const grokForNormies = mockQuote(
  {
    id: '2087588205352665393',
    username: 'GergelyOrosz',
    name: 'Gergely Orosz',
    avatar:
      'https://pbs.twimg.com/profile_images/673095429748350976/ei5eeouV_normal.png',
    text: 'I’ve been using it for ~2 hours and I’m absolutely blown away at how I could automate a bunch of my workflows. Cursor team built a way for “normies” to automate stuff. Feels like an OpenClaw 2.0 moment.\n\n(Zero affiliation, I upgraded to Ultra to use it and absolutely worth it.)',
    createdAt: '2026-08-12T17:13:08.000Z',
    likes: 2815,
    media: [],
  },
  grokBot,
)

const grokNdaJoke = mockQuote(
  {
    id: '2087702878110536119',
    username: 'quantian1',
    name: 'Quantіan',
    avatar:
      'https://pbs.twimg.com/profile_images/1510062884096815107/psXqGcns_normal.jpg',
    text: 'The very first application of Grok Bot mentioned in this ad is mass emailing NDAs to employees, amazing Freudian slip https://t.co/XbJCICo07x',
    createdAt: '2026-08-13T00:48:48.000Z',
    likes: 13,
    media: [
      {
        url: 'https://pbs.twimg.com/media/HPkCs7VXQAA1ZdY.jpg',
        type: 'photo',
        width: 1170,
        height: 1507,
      },
    ],
  },
  grokBot,
)

const grokOriginStory = mockQuote(
  {
    id: '2087698441568973129',
    username: 'MTSlive',
    name: 'MTS',
    avatar:
      'https://pbs.twimg.com/profile_images/2057947669281263616/aovpVL4b_normal.jpg',
    text: 'Cursor engineer @poteto reveals the original inspiration for Grok Bot was her internal Slack bot called Benny that would automatically fix bug reports for Cursor while she slept:\n\n“I built this bot called Benny. I’m a fairly lazy person, and we were getting so many bug reports for Cursor, and I wanted to just fix them all.”\n\n“I started thinking about how would I make it so my agents could just automatically fix bugs for me while I sleep? That was the inspiration for some of our earlier experiments with building a more persistent bot.”\n\n“I got so many questions like how did you build Benny? How can I build my own? That inspired some of the thinking behind Grok Bot. What if everybody could define one of their own bots, give it an identity, and give it things like its own computer, plus routines and automations.”',
    createdAt: '2026-08-13T00:31:10.000Z',
    likes: 523,
    media: [
      {
        url: 'https://pbs.twimg.com/amplify_video_thumb/2087698399927963648/img/6znsR-MrU3SxAqdo.jpg',
        type: 'video',
        width: 1280,
        height: 720,
      },
    ],
  },
  grokBot,
)

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

const formativeMage = mockQuote(
  {
    id: '2087335399479742895',
    username: 'mage_ofaquarius',
    name: 'Mage of Aquarius',
    avatar:
      'https://pbs.twimg.com/profile_images/2073736968509214720/_Zpycl6D_normal.jpg',
    text: 'You have to understand, these were the women I looked up to in my formative years https://t.co/MH4WXEnF9j',
    createdAt: '2026-08-12T00:28:34.000Z',
    likes: 32,
    media: [
      {
        url: 'https://pbs.twimg.com/media/HPerkB6XMAAPMt9.jpg',
        type: 'photo',
        width: 246,
        height: 360,
      },
      {
        url: 'https://pbs.twimg.com/media/HPezxiFXMAAWDFj.jpg',
        type: 'photo',
        width: 961,
        height: 1200,
      },
      {
        url: 'https://pbs.twimg.com/media/HPe0DKnWIAA-3MM.jpg',
        type: 'photo',
        width: 711,
        height: 399,
      },
      {
        url: 'https://pbs.twimg.com/media/HPe0bmzWsAAAlBV.jpg',
        type: 'photo',
        width: 385,
        height: 1200,
      },
    ],
  },
  formativeWomenFour,
)

const formativeSkye = mockQuote(
  {
    id: '2087468420245881174',
    username: 'SkyeSharkie',
    name: 'Utah teapot 🫖',
    avatar:
      'https://pbs.twimg.com/profile_images/2015551276566884352/Db9gMFHq_normal.png',
    text: 'You have to understand, these were the women I looked up to in my formative years https://t.co/Ghqpwa8gun',
    createdAt: '2026-08-12T09:17:09.000Z',
    likes: 72,
    media: [
      { url: 'https://pbs.twimg.com/media/HPgtNGbacAAzbQm.png', type: 'photo' },
      { url: 'https://pbs.twimg.com/media/HPgtQZqboAAabDR.jpg', type: 'photo' },
      { url: 'https://pbs.twimg.com/media/HPgtXQ-bIAAxFUc.jpg', type: 'photo' },
      { url: 'https://pbs.twimg.com/media/HPgtbO-a0AAekBB.jpg', type: 'photo' },
    ],
  },
  formativeWomenOne,
)

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

const geminiSkepticism = mockQuote(
  {
    id: '2087421577625538567',
    username: 'ApriiSR',
    name: 'Aprii *️⃣',
    avatar:
      'https://pbs.twimg.com/profile_images/2074355819580387329/-mkiSz-L_normal.jpg',
    text: "there's no way this is true in a non misleading way right",
    createdAt: '2026-08-12T06:11:01.000Z',
    likes: 18112,
    media: [],
  },
  geminiUsers,
)

const geminiFactCheck = mockQuote(
  {
    id: '2087319114583027828',
    username: 'QiaochuYuan',
    name: 'QC',
    avatar:
      'https://pbs.twimg.com/profile_images/1746687266947555328/OIMkOG55_normal.jpg',
    text: 'computer, is sundar pichai, the CEO of google, lying to me https://t.co/5FJqt7wrre',
    createdAt: '2026-08-11T23:23:52.000Z',
    likes: 92,
    media: [
      { url: 'https://pbs.twimg.com/media/HPelrB-bcAEojSr.jpg', type: 'photo' },
      { url: 'https://pbs.twimg.com/media/HPelrB_a8AAKVQ7.jpg', type: 'photo' },
      { url: 'https://pbs.twimg.com/media/HPelrCCasAAKm_t.jpg', type: 'photo' },
    ],
  },
  geminiUsers,
)

const geminiEighteenPlus = mockQuote(
  {
    id: '2087273266377523505',
    username: 'cmuratori',
    name: 'Casey Muratori',
    avatar:
      'https://pbs.twimg.com/profile_images/2070670629943349248/m8_kUGhm_normal.jpg',
    text: 'My eyesight isn’t great, so I thought this said “18+ people are now using Gemini” and I was like “that’s weirdly precise, but it sounds about right because everyone I know uses OpenAI or Anthropic”.',
    createdAt: '2026-08-11T20:21:41.000Z',
    likes: 554,
    media: [],
  },
  geminiUsers,
)

export const AUGUST_11_MOCK_DIGEST: DigestEdition = {
  id: 'preview-2026-08-11-v2',
  issueNumber: 1,
  digestDate: DIGEST_DATE,
  version: 2,
  status: 'published',
  sourceRunId: 'preview-august-11-cluster-memo',
  isPreview: true,
  content: {
    digestDate: DIGEST_DATE,
    windowStart: '2026-08-11T06:00:00.000Z',
    windowEnd: '2026-08-12T06:00:00.000Z',
    generatedAt: OBSERVED_AT,
    executiveSummary: [
      'AI led the day: hidden-reasoning research, Grok Bot, and Gemini’s billion-user claim.',
      'Moon-posting turned dating bait and AI ambition into a joke about sincerity and status.',
      'A repeated “women I looked up to” prompt became the day’s participatory meme.',
    ],
    topBanger: moonPosting,
    stories: [
      {
        slug: 'hidden-reasoning-leaked-secrets',
        category: 'AI news',
        keyword: 'hidden reasoning',
        title: 'We found a way to extract hidden reasoning of frontier models',
        subtitle:
          'A frontier-model reasoning exploit became a security story when public traces exposed credentials and personal data.',
        bullets: [
          'Researchers said extracted token counts matched billed thinking tokens for most tested prompts.',
          'A scan of roughly 7,000 public traces reportedly found API keys, email addresses, passwords, and other sensitive data.',
          'The key distinction is between eliciting reasoning from your own prompt and recovering private material from somebody else’s shared trace.',
        ],
        editorialNote:
          'Two claims are bundled together here: extracting reasoning from your own prompts, and recovering private material from someone else’s shared trace. The second is the direct security risk.',
        bangers: [hiddenReasoning, deepThink, leakedTraces],
        commentary: [
          hiddenPaperCaveat,
          hiddenReproduced,
          hiddenOperationalRisk,
        ],
        replyCount: 0,
        peakedAt: '2026-08-11T17:23:13.000Z',
      },
      {
        slug: 'moon-posting-meets-ai-ambition',
        category: 'Viral joke',
        keyword: 'moon',
        title: 'True and pure moon-posting is done from reverence and love',
        subtitle:
          'Moon-posting dating bait and a call for AI-over-romance sources converged on sincerity, ambition, and status.',
        bullets: [
          'One post described men adopting moon posts as engagement and DM bait after hearing that the tactic attracts women.',
          'Another sought people foregoing romantic relationships to pursue AI work.',
          'The cluster is cultural rather than merely about AI or astronomy: both posts ask how people narrate desire and status in public.',
        ],
        editorialNote:
          'The joke spread because people immediately performed, criticized, and overthought the moon-posting strategy in public.',
        bangers: [moonPosting, aiAmbitions],
        commentary: [moonCanConfirm, moonPosers, moonCoincidence],
        replyCount: 0,
        peakedAt: '2026-08-12T05:03:12.000Z',
      },
      {
        slug: 'grok-bot-little-guy',
        category: 'AI news',
        keyword: 'little guy',
        title: 'Bots are AI teammates that do real work for you',
        subtitle:
          'Grok Bot’s launch paired autonomous-work claims with jokes about AI labs branding powerful agents as cute mascots.',
        bullets: [
          'Grok Bot’s pitch was concrete: sign in to tools, do the work, and return with a finished result.',
          'Reactions mixed assistant enthusiasm with enterprise skepticism and vendor-lock-in concerns.',
          'Friendly mascot branding makes a high-agency system feel domestic and approachable.',
        ],
        editorialNote:
          'The launch conversation split cleanly between what the agent can do, who built the underlying product, and why powerful systems keep getting cute mascots.',
        bangers: [grokBot, littleGuy],
        commentary: [grokForNormies, grokNdaJoke, grokOriginStory],
        replyCount: 0,
        peakedAt: '2026-08-11T21:53:28.000Z',
      },
      {
        slug: 'formative-women-meme',
        category: 'Meme',
        keyword: 'formative years',
        title:
          'You have to understand, these were the women I looked up to in my formative years',
        subtitle:
          'People remixed one image-list prompt into autobiographical canons of the women and characters who shaped them.',
        bullets: [
          'The posts were iterations of one image-list format and sometimes quoted one another.',
          'The largest thread grew into a real discussion of formative writers and fictional characters.',
          'A reusable phrase let people publish autobiographical canons and recognize one another’s influences.',
        ],
        editorialNote:
          'This is the day’s clearest native social story: the format itself is the thread, with each quote post adding a new autobiographical image set.',
        bangers: [
          formativeWomenOne,
          formativeWomenTwo,
          formativeWomenThree,
          formativeWomenFour,
        ],
        commentary: [formativeMage, formativeSkye],
        replyCount: 27,
        peakedAt: '2026-08-12T02:30:58.000Z',
      },
      {
        slug: 'gemini-ai-race-measurement',
        category: 'AI news',
        keyword: 'AI race',
        title:
          'Using this emergent behavior, we can watch the shifting market share in the AI race',
        subtitle:
          'Gemini’s billion-user claim met Pangram’s model-share estimate, showing how different metrics tell different market stories.',
        bullets: [
          'Google announced more than one billion monthly Gemini users.',
          'Pangram used model-family attribution to estimate which systems produced observable AI-written text.',
          '“Users” and classified model output are different populations, and both measurements need sampling and attribution caveats.',
        ],
        editorialNote:
          'The billion-user announcement prompted disbelief. The useful comparison is not winner versus loser, but monthly reach versus a classifier’s sample of visible AI-written text.',
        bangers: [geminiUsers, aiRace],
        commentary: [geminiSkepticism, geminiFactCheck, geminiEighteenPlus],
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
