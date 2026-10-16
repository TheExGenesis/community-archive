import type { ChapterSection } from './chapterSections'

export const CURATED_SECTIONS: Record<
  string,
  Record<number, ChapterSection[]>
> = {
  // @christineist. Each label names what every tweet in the section shares;
  // the title quotes the first tweet listed, which leads the section.
  '826134955549790208': {
    2022: [
      {
        slug: 'unabashedly-weird',
        label: 'tpot',
        title: 'unabashedly weird on this app',
        tweetIds: [
          '1502765137714835456', // thankful to those who are unabashedly weird
          '1551996871584796672', // I made a guide to tpot!
          '1605591960810446848', // Try my fake twitter, I made it
          '1528053626442162176', // can we have designated tpot hubs all
          '1591536191459196928', // today I am reading about full fractal
          '1500134291774136320', // I want to hear everything about vibe
        ],
      },
      {
        slug: 'play-with-your-identity',
        label: 'playing with identity',
        title: 'ways to play with your identity',
        tweetIds: [
          '1569948503685890048', // Ways to play with your identity, life
          '1569948792384012291', // 4. Be more agreeable, less agreeable. Be
          '1567309182248034305', // Want to meet the faces behind the
          '1561507307065774086', // after some experimentation I have decided that
          '1594597266685583360', // what is the best way to see
        ],
      },
      {
        slug: 'career-rotation',
        label: 'work and careers',
        title: 'a year or two of career rotation',
        tweetIds: [
          '1536465560287911936', // after college there should a year or
          '1519384823613198336', // my ideal end state is not to
          '1565017895817449473', // I’m learning a lot from my manager
          '1504604261920911374', // what do people in tpot even do
        ],
      },
      {
        slug: 'singles-group-chat',
        label: 'dating and relationships',
        title: 'a massive singles group chat',
        tweetIds: [
          '1600686131569229824', // instead of a date me profile (which
          '1510342335837601794', // my flirting style is to not flirt
          '1491682876697432069', // people who do relationship check ins, what
          '1594584962031755264', // i guess marriage is when you’re hanging
        ],
      },
    ],
    2023: [
      {
        slug: 'beginnings-of-a-relationship',
        label: 'dating and relationships',
        title: 'how you start a relationship',
        tweetIds: [
          '1720092106335899905', // I’ve been thinking about beginnings of a
          '1682133841832738816', // I want to hear stories about how
          '1720495046317715879', // I think a nontrivial amount of whether
          '1664297160987525121', // it’s amazing how thinking that someone likes
          '1716632810142748940', // it’s so hot to be asked out
        ],
      },
      {
        slug: 'keeping-in-touch-with-friends',
        label: 'friendship',
        title: 'keeping in touch with friends',
        tweetIds: [
          '1686537748117929989', // On keeping in touch with friends— Similar
          '1668622764683710468', // to have deep friendships you have to
          '1629710003870515200', // It’s extremely important to find friends who
          '1688240707482624000', // how to make friends as good as
        ],
      },
      {
        slug: 'five-dollars-back-and-forth',
        label: 'the tpot scene',
        title: 'sending $5 back and forth for arbitrary small tasks',
        tweetIds: [
          '1675937321437519872', // We are entering the era of tpot
          '1673783325746659330', // @QiaochuYuan @_inju @univrsw3th4rt tpot x grand budapest
          '1682229717829832704', // Hellooo if you are single and interested
          '1719875104216412263', // omg omg omg just in 📣, first
        ],
      },
      {
        slug: 'decisions-compound',
        label: 'life decisions',
        title: 'decisions and decision making skills compound',
        tweetIds: [
          '1683951437716549636', // being in your late twenties is a
          '1686848679137902592', // everything might not turn out like you
          '1673210624464265217', // being more decisive is an extremely high
          '1654205815044313097', // *sees top 5 regrets* oh okay, so
        ],
      },
      {
        slug: 'languishing',
        label: 'creativity',
        title: 'languishing is an important aspect of the creative process',
        tweetIds: [
          '1657102796418842624', // languishing is an important aspect of the
          '1677708469363933186', // Hello twitter I would like feedback on
          '1740119967708987794', // On feeling each gesture— I. When I
        ],
      },
    ],
    2024: [
      {
        slug: 'little-groups',
        label: 'friendship',
        title: 'little groups of 3-4 friends',
        tweetIds: [
          '1851528581190496499', // make little groups of 3-4 friends. little
          '1812364916906471452', // sometimes I meet a cool person who
          '1845142607774589399', // feeling childishly sad that friendships can inevitably
          '1815212935121400013', // I sort of envisioned going to all
          '1787216296993804657', // it doesn’t actually work to move to
          '1767938091371860135', // me: I need community, I need to
        ],
      },
      {
        slug: 'crossed-wires-with-love',
        label: 'love and dating',
        title: 'wires that I often get crossed with love',
        tweetIds: [
          '1779733714152702124', // wires that I often get crossed with
          '1780801621011685885', // oh my god what a love story
          '1764487022922944812', // I grieve every marriage and 50 years
          '1796569338184716468', // thinking about how relationships require both your
          '1824491550732325364', // dating is so cute. like yeah sure
          '1790530430317506689', // "your desire for status is inversely correlated
        ],
      },
      {
        slug: 'what-is-your-gift',
        label: 'talent and mastery',
        title: 'what is your gift?',
        tweetIds: [
          '1870511170354102435', // what is your gift? what do people
          '1816636343545659896', // "Ask yourself what other people seem weirdly
          '1865193823833342327', // I will fail to achieve mastery in
          '1871963304429826108', // every one of my friends who is
        ],
      },
      {
        slug: 'lush-and-full-of-sinkholes',
        label: 'inner work',
        title: 'the mind is lush and full of sinkholes',
        tweetIds: [
          '1821940561861042286', // the mind is lush and full of
          '1742695713006637298', // I’m finding the cure to a lot
          '1768063040409481645', // After IFS rabbit hole I significantly reduced
          '1766894369779700184', // I took mdma yesterday and I met
        ],
      },
    ],
    2025: [
      {
        slug: 'self-reinforcing-life',
        label: 'life design',
        title: 'a self reinforcing life',
        tweetIds: [
          '1939336962634379386', // - establish a good relationship with yourself
          '1943160409776624000', // Establish a good relationship with yourself
          '1993844011128508545', // Build a self reinforcing life 💥
          '1941739989487730765', // an unexpected but lovely side effect of
        ],
      },
      {
        slug: 'self-actualizing-people',
        label: 'self-actualization',
        title: 'descriptions for self actualizing people',
        tweetIds: [
          '2001044839907914080', // I love reading these descriptions for self
          '1999491409875755084', // most interesting traits imo: - absence of
          '2000786738860396623', // in summary: - dropping of defenses, an
          '1998839022924210200', // ch 11 on self actualizing people
          '1999745513134977102', // much evil lies downstream of insecurity
        ],
      },
      {
        slug: 'nyc-in-october',
        label: 'vibetober in nyc',
        title: 'everyone should come to nyc in october',
        tweetIds: [
          '1953280891641270684', // everyone should come to nyc in october
          '1972660631011574032', // what would you like to hyperstition for
          '1984328799865967079', // it’s the last day of Vibetober!!! would
          '1985133318451466320', // 🍁 Post-Vibetober Hyperstition Market 🍁 Socializing doesn’t
        ],
      },
      {
        slug: 'write-every-day',
        label: 'writing and making',
        title: 'write/publish every day for the month of jan',
        tweetIds: [
          '1999747201338343708', // inkuary. write/publish every day for the month
          '1951278607772303389', // I started a podcast! My first episode
          '1932127691219849675', // yesterday I sat down to write and
          '1928327839473979738', // I think it’s possible absolutely no one
        ],
      },
      {
        slug: 'letting-your-body-carry-you',
        label: 'movement and the body',
        title: 'letting your body carry you',
        tweetIds: [
          '1944559102417359198', // the more I improvise (on piano, in
          '1964084312816419274', // I think one of the most consistent
          '1946046527371198494', // > felt mopey > went climbing anyways
          '1927529271334937062', // my sister introduced me to these new
        ],
      },
    ],
    2026: [
      {
        slug: 'friends-to-close-friends',
        label: 'friendship',
        title: 'how to go from friends to close friends',
        tweetIds: [
          '2056850826845434327', // The problem of “how to go from
          '2056139632262218232', // what do your friends ask you for
          '2047059484564926742', // super not into the whole "meet 5
          '2027274733209731578', // what traits or skills do you find/hear
          '2076383598576357730', // establish a good relationship with yourself make
        ],
      },
      {
        slug: 'a-new-brain',
        label: 'inner growth',
        title: 'my brain opened a new brain',
        tweetIds: [
          '2030656994969854120', // i had a weird experience while meditating
          '2007502981386907946', // curious to hear stories of people who
          '2051042129254965667', // reading Adult children of emotionally immature parents
          '2054259444226183553', // how often has your gut led you
          '2110050717587390799', // maslow on young people not being remotely
        ],
      },
      {
        slug: 'cuties-ramen-profitable',
        label: 'building cuties',
        title: 'cuties is now ramen profitable',
        tweetIds: [
          '2110042232330019079', // cuties is now ramen profitable ☺️🙏
          '2077060773570867688', // Cuties! Classifieds section is live!! 📰💛 currently
          '2023501388970663938', // someone should definitely fund me for cuties
          '2078155459484111076', // support me by joining cuties today 😳
          '2069571872719872079', // it will soon be costly to be
        ],
      },
      {
        slug: 'reassuring-amount-of-detail',
        label: 'nyc and sf',
        title: 'a reassuring amount of detail',
        tweetIds: [
          '2075335856122954096', // i find nyc to have a reassuring
          '2063308548147138699', // everyone should come to nyc for june
          '2088331271747535082', // its so painful for someone who likes
          '2074178051353514439', // helloo we have a new schelling point
        ],
      },
    ],
  },
}
