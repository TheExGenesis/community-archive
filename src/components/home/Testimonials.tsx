import Link from 'next/link'

const TESTIMONIALS = [
  {
    quote:
      'I just successfully used Community Archive search to find a tweet that Twitter search could not find 😎',
    name: 'Richard D. Bartlett',
    handle: 'RichDecibels',
    href: 'https://x.com/RichDecibels/status/1839277246453842034',
  },
  {
    quote:
      'i have now almost entirely transitioned to searching my tweets via community archive instead of using the native twitter search',
    name: 'universe sweetheart 💓🌈💭',
    handle: 'univrsw3th4rt',
    href: 'https://x.com/univrsw3th4rt/status/1986082324728234161',
  },
  {
    quote:
      "Can't find a tweet using twitter, use community archive db, found it in under a minute. many such cases",
    name: '🐜',
    handle: 'IaimforGOAT',
    href: 'https://x.com/IaimforGOAT/status/1908547676913725763',
  },
  {
    quote:
      'upside of community archive: more deep cuts because i can search your tweets way better',
    name: 'Gustaf',
    handle: 'curiousgustaf',
    href: 'https://x.com/curiousgustaf/status/2081400788367130908',
  },
] as const

export default function Testimonials() {
  return (
    <section className="bg-card py-12 dark:bg-background md:py-16">
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold text-foreground">
            Useful because people use it
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-base text-muted-foreground">
            Search that finds the posts people remember, and public data others
            can build on.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {TESTIMONIALS.map((testimonial) => (
            <Link
              key={testimonial.href}
              href={testimonial.href}
              target="_blank"
              rel="noopener noreferrer"
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
                View source post →
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
