import Image from 'next/image'
import Link from 'next/link'
import PostHogLink from '@/components/PostHogLink'
import { COMMUNITY_PROJECTS } from '@/lib/communityProjects'

const FEATURED_SLUGS = ['birdseye', 'strands', 'bangers-page']
export default function FeaturedCommunityApps() {
  return (
    <section
      className="mx-auto max-w-6xl px-5 py-12 sm:px-7"
      aria-labelledby="community-apps-title"
    >
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="community-apps-title" className="text-3xl font-bold">
            Community Apps
          </h2>
          <p className="mt-2 text-muted-foreground">
            Tools and experiments made by the community, built with the archive.
          </p>
        </div>
        <Link href="/community" className="text-sm font-semibold text-brand">
          Explore all apps →
        </Link>
      </div>
      <div className="grid gap-6 sm:grid-cols-3">
        {FEATURED_SLUGS.map((slug) => {
          const project = COMMUNITY_PROJECTS.find((item) => item.slug === slug)!
          const external = project.projectUrl?.startsWith('https:')
          return (
            <PostHogLink
              eventName="community_app_action"
              eventProperties={{
                action: 'launch_clicked',
                app_slug: slug,
                source: 'homepage',
                external: Boolean(external),
              }}
              key={slug}
              href={project.projectUrl!}
              target={external ? '_blank' : undefined}
              rel={external ? 'noopener noreferrer' : undefined}
              className="group min-w-0"
            >
              <div
                className={`relative aspect-[16/10] overflow-hidden rounded-xl border border-border bg-gradient-to-br ${project.coverClass}`}
              >
                {project.image ? (
                  <Image
                    src={project.image}
                    alt={`Preview of ${project.name}`}
                    fill
                    sizes="(max-width: 640px) 100vw, 33vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full flex-col justify-end p-6 text-[#0A3547]">
                    <span className="text-xs font-semibold uppercase tracking-wider">
                      {project.category}
                    </span>
                    <span className="mt-2 font-serif text-4xl font-bold">
                      {project.name}
                    </span>
                  </div>
                )}
              </div>
              <h3 className="mt-3 text-lg font-bold group-hover:text-brand">
                {project.name} ↗
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {project.summary}
              </p>
            </PostHogLink>
          )
        })}
      </div>
    </section>
  )
}
