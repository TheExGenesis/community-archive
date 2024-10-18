import Link from 'next/link'

const Footer = () => {
  return (
    <footer className="mt-auto py-4 text-center text-sm text-gray-600 dark:text-gray-400">
      <Link href="/data-policy" className="hover:underline">
        Data Policy
      </Link>
    </footer>
  )
}

export default Footer
