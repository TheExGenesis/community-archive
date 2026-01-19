'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

export default function HeaderSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`)
    } else {
      router.push('/search')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="hidden sm:flex items-center">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          type="search"
          placeholder="Search tweets..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8 pr-3 py-1.5 h-9 w-40 lg:w-56 text-sm bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:ring-blue-500"
        />
      </div>
    </form>
  )
}
