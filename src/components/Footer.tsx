import Link from 'next/link'

const Footer = () => {
  return (
    <footer className="mt-auto py-4 text-center text-sm text-muted-foreground">
      <Link href="/about">About</Link>
      <span className="mx-2">•</span>
      <Link href="/docs">Docs</Link>
      <span className="mx-2">•</span>
      <Link href="/data-policy">Data Policy</Link>
      <span className="mx-2">•</span>
      <Link href="/supporters">Supporters</Link>
      <span className="mx-2">•</span>
      <Link href="/stream-monitor">Stream Monitor</Link>
      <span className="mx-2">•</span>
      <Link href="/missing-accounts">Missing Accounts</Link>
    </footer>
  )
}

export default Footer
