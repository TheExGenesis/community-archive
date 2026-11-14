import type { ReactNode } from 'react'

// The people and organisations we thank on the About and Supporters pages.
// One list, so the two pages cannot drift apart.

const linkClass =
  'font-semibold text-foreground underline-offset-2 transition-colors hover:text-brand hover:underline'

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={linkClass}
    >
      {children}
    </a>
  )
}

const Name = ({ children }: { children: ReactNode }) => (
  <span className="font-semibold text-foreground">{children}</span>
)

const FUNDERS: { key: string; body: ReactNode }[] = [
  {
    key: 'sff',
    body: (
      <>
        <Ext href="https://survivalandflourishing.fund/">
          Survival and Flourishing Fund
        </Ext>
        , and <Name>davidad</Name> for recommending us.
      </>
    ),
  },
  {
    key: 'vitalik',
    body: (
      <>
        <Ext href="https://x.com/VitalikButerin">Vitalik Buterin</Ext>, via
        Kanro.
      </>
    ),
  },
  {
    key: 'pwang',
    body: <Ext href="https://x.com/pwang">Peter Wang</Ext>,
  },
  {
    key: 'lightcone',
    body: (
      <>
        <Name>Lightcone Commons</Name>, at <Name>Richard Ngo</Name>&apos;s
        recommendation.
      </>
    ),
  },
  {
    key: 'metr',
    body: (
      <>
        <Name>Beth Barnes</Name> of <Ext href="https://metr.org/">METR</Ext>,
        whose grant to our founder was the first, and led to the Community
        Archive being built.
      </>
    ),
  },
  {
    key: 'portal',
    body: (
      <>
        The{' '}
        <Ext href="https://xiqo.substack.com/p/through-the-portal">
          Portal residency
        </Ext>
        , where the archive was born.
      </>
    ),
  },
]

export default function FundersThanks({
  className = '',
}: {
  className?: string
}) {
  return (
    <div className={className}>
      <ul className="space-y-2 text-muted-foreground">
        {FUNDERS.map(({ key, body }) => (
          <li key={key}>{body}</li>
        ))}
      </ul>
      <p className="mt-5 text-muted-foreground">
        And to{' '}
        <Ext href="https://www.calcifercomputing.com/">Calcifer Computing</Ext>,
        not for funding but for a data grant of 40 billion tweets, which enables
        research on a much larger scale.
      </p>
    </div>
  )
}
