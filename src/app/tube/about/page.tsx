import Link from 'next/link'
import { TubeAboutStats } from '@/components/tube/TubePages'

export const metadata = {
  title: 'About · CA Tube',
  description: 'How CA Tube picks, ranks and shows videos.',
}

export default function TubeAboutPage() {
  return (
    <article className="max-w-2xl space-y-4 px-4 pb-16 pt-6 text-sm leading-relaxed sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">About CA Tube</h1>
      <p>
        CA Tube is YouTube as seen through the{' '}
        <Link href="/" className="underline underline-offset-2">
          Community Archive
        </Link>
        : every video linked from archived tweets by at least two different accounts. Not what an
        algorithm thinks you will click on, but what people in this corner of the internet kept
        telling each other to watch.
      </p>
      <TubeAboutStats />

      <h2 className="pt-4 text-base font-semibold">How it works</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong>Comments are tweets.</strong> Under each video you see the archived tweets that
          shared it, most liked first, with a link to the full tweet and the person’s archive.
        </li>
        <li>
          <strong>Recommendations without an account.</strong> Two videos are related when the same
          people shared both. “Best for you” starts from what you watch and like and walks those
          connections. Thumbs down shows you less of a neighbourhood. Your history, likes and watch
          later list live in this browser’s local storage and nowhere else.
        </li>
        <li>
          <strong>Honest thumbnails.</strong> By default every video shows a frame YouTube takes
          from the middle of the video instead of the uploader’s thumbnail. You can switch back in{' '}
          <Link href="/tube/settings" className="underline underline-offset-2">
            Settings
          </Link>
          .
        </li>
        <li>
          <strong>Hidden gems</strong> are videos only two or three accounts shared, where those
          tweets got a lot of love.
        </li>
        <li>
          <strong>Categories, summaries and playlists</strong> are written by Claude from each
          video’s title and the tweets that shared it.
        </li>
      </ul>

      <h2 className="pt-4 text-base font-semibold">Make your own</h2>
      <p>
        The whole catalogue, with each video’s nearest neighbours, is one file:{' '}
        <a href="/tube/videos.json" className="underline underline-offset-2">
          videos.json
        </a>
        . The scripts that build it are in the{' '}
        <a
          href="https://github.com/TheExGenesis/community-archive/tree/main/scripts/tube"
          className="underline underline-offset-2"
        >
          repository
        </a>
        . Point your Claude at them and ask for your own version.
      </p>
      <p className="text-muted-foreground">
        Inspired by Andrej Karpathy’s HackerTube, which does the same for Hacker News comments.
      </p>
    </article>
  )
}
