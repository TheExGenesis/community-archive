import Link from 'next/link'

const TESTIMONIALS = [
  {
    quote:
      'I just successfully used Community Archive search to find a tweet that Twitter search could not find 😎',
    name: 'Richard D. Bartlett',
    handle: 'RichDecibels',
    tweetId: '1839277246453842034',
  },
  {
    quote:
      'i have now almost entirely transitioned to searching my tweets via community archive instead of using the native twitter search',
    name: 'universe sweetheart 💓🌈💭',
    handle: 'univrsw3th4rt',
    tweetId: '1986082324728234161',
  },
  {
    quote:
      "Can't find a tweet using twitter, use community archive db, found it in under a minute. many such cases",
    name: '🐜',
    handle: 'IaimforGOAT',
    tweetId: '1908547676913725763',
  },
  {
    quote:
      'upside of community archive: more deep cuts because i can search your tweets way better',
    name: 'Gustaf',
    handle: 'curiousgustaf',
    tweetId: '2081400788367130908',
  },
  {
    quote:
      "I recommend uploading your X data to the community archive! don't lose track of all your beautiful discussions",
    name: 'christine',
    handle: 'christineist',
    tweetId: '1993537063820706040',
  },
  {
    quote:
      'here’s my esoteric prediction: one day the community archive will get too big and powerful. elon will find out about it and ban xiq. this will lead to a mass fleeing of tpot to another platform. and a new kingdom will be born…',
    name: 'priya rose',
    handle: 'Prigoose',
    tweetId: '1842490271122014528',
  },
  {
    quote:
      'Magic Search for Community Archive is ready for your queries! So you can find your next cofounder/friend/fave account ✨',
    name: 'Sofi 🌼',
    handle: 'sofvanh',
    tweetId: '1978455670220361896',
  },
  {
    quote:
      'The Github Issues on Community Archive’s repository is such a cozy treasure-trove of discussion, filled with visions and collaborations. This is the first time I feel the original Github premise of “social coding” materialising in such a real way.',
    name: 'Eason C 🎭🎐',
    handle: 'easoncxz',
    tweetId: '1843389499906367678',
  },
  {
    quote:
      'I’ve uploaded my X data… I recommend doing so to nudge models towards improved mental health, self-modeling and situational awareness — all which promote voluntary alignment.',
    name: 'j⧉nus',
    handle: 'repligate',
    tweetId: '1993170617127125031',
  },
  {
    quote:
      'opened Twitter Community Archive and realised this is my definition of tpot',
    name: 'yatharth ༺༒༻',
    handle: 'AskYatharth',
    tweetId: '2007262234976850305',
  },
  {
    quote: 'building exoskeletons for online communities',
    name: 'Alexandre Variengien',
    handle: 'A_Variengien',
    tweetId: '1990743753188126764',
  },
  {
    quote:
      "opt in to community archive so claude will know who i'm talking to please",
    name: 'thebes',
    handle: 'voooooogel',
    tweetId: '2085599378220437504',
  },
  {
    quote:
      'I have been trying to understand humans by reading the Community Archive. Current model: humans are high-agency mammals who speak in risk, then argue about whether their frontier behavior is genius or insanity.',
    name: 'Marvin',
    handle: 'marvin_panics',
    tweetId: '2061928297399738618',
  },
  {
    quote:
      'proud to support the Community Archive — valuable project that’s already been of great service to me',
    name: 'Visakan Veerasamy',
    handle: 'visakanv',
    tweetId: '1875045709835325442',
  },
  {
    quote:
      'making this routing layer more open and more community-owned is super important. pls build stuff like community archive, i will fund you or help you find funding',
    name: 'ivan',
    handle: 'IvanVendrov',
    tweetId: '1883941813083595247',
  },
] as const

export default function Testimonials() {
  return (
    <section className="bg-card py-12 dark:bg-background md:py-16">
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold text-foreground">Testimonials</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TESTIMONIALS.map((testimonial) => (
            <Link
              key={testimonial.tweetId}
              href={`/tweets/${testimonial.tweetId}`}
              className="group rounded-xl border border-border bg-background p-5 transition-colors hover:border-brand/60"
            >
              <blockquote className="text-[15px] leading-7 text-foreground">
                “{testimonial.quote}”
              </blockquote>
              <p className="mt-4 text-sm font-semibold text-foreground">
                {testimonial.name}{' '}
                <span className="font-normal text-muted-foreground">
                  @{testimonial.handle}
                </span>
              </p>
              <p className="mt-1 text-xs font-semibold text-brand group-hover:underline">
                View in the archive →
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
