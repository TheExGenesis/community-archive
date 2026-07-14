import Link from 'next/link'

const Footer = () => {
  return (
    <footer className="mt-auto py-4 text-center text-sm text-muted-foreground">
      <Link href="/about" className="hover:underline">
        About
      </Link>
      <span className="mx-2">•</span>
      <Link href="/data-policy" className="hover:underline">
        Data Policy
      </Link>
    </footer>
  )
}

export default Footer
