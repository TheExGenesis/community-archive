'use client'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function AdvancedSearchForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize state from URL params or defaults
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [from, setFrom] = useState(searchParams.get('fromUser') || '');
  const [to, setTo] = useState(searchParams.get('replyToUser') || ''); // Renamed URL param for clarity
  const [since, setSince] = useState(searchParams.get('sinceDate') || '');
  const [until, setUntil] = useState(searchParams.get('untilDate') || '');
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  // Effect to update form fields if URL search params change (e.g., browser back/forward)
  useEffect(() => {
    setQuery(searchParams.get('q') || '');
    setFrom(searchParams.get('fromUser') || '');
    setTo(searchParams.get('replyToUser') || '');
    setSince(searchParams.get('sinceDate') || '');
    setUntil(searchParams.get('untilDate') || '');
    // Determine if advanced options should be shown based on if any advanced fields have values
    if (searchParams.get('fromUser') || searchParams.get('replyToUser') || searchParams.get('sinceDate') || searchParams.get('untilDate')) {
      setShowAdvancedOptions(true);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (from) params.set('fromUser', from);
    if (to) params.set('replyToUser', to);
    if (since) params.set('sinceDate', since);
    if (until) params.set('untilDate', until);

    router.push(`/search?${params.toString()}`);
  };

  const inputClasses = "w-full rounded border p-2 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:placeholder-slate-400 focus:ring-blue-500 focus:border-blue-500";
  const labelClasses = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

  return (
    <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="main-search" className={labelClasses}>Search terms</label>
        <input
            id="main-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
            placeholder="Keywords... (e.g., concert, live event)"
            className={inputClasses}
        />
          {/* Simplified placeholder, as colon-based filters are not directly handled by this form anymore before sending to URL*/}
          {/* <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">You can use from:, to:, since: YYYY-MM-DD, until: YYYY-MM-DD.</p> */}
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
          className="w-full justify-between dark:text-white dark:border-slate-600 dark:hover:bg-slate-700"
        >
          Filter by User / Date Range
          {showAdvancedOptions ? (
            <ChevronUp className="ml-2 h-4 w-4" />
          ) : (
            <ChevronDown className="ml-2 h-4 w-4" />
          )}
        </Button>

        {showAdvancedOptions && (
          <div className="space-y-4 border-t dark:border-slate-700 pt-4">
            <div>
              <label htmlFor="from-user" className={labelClasses}>From user</label>
            <input
                id="from-user"
              type="text"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
                placeholder="username (without @)"
                className={inputClasses}
            />
            </div>
            <div>
              <label htmlFor="to-user" className={labelClasses}>To user (in reply to username)</label>
            <input
                id="to-user"
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
                placeholder="username (without @)"
                className={inputClasses}
            />
            </div>
            <div>
              <label
                htmlFor="since-date"
                className={labelClasses}
              >
                From date:
              </label>
              <input
                id="since-date"
                type="date"
                value={since}
                onChange={(e) => setSince(e.target.value)}
                className={`${inputClasses} mt-1`}
              />
            </div>
            <div>
              <label
                htmlFor="until-date"
                className={labelClasses}
              >
                To date:
              </label>
              <input
                id="until-date"
                type="date"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
                className={`${inputClasses} mt-1`}
              />
            </div>
          </div>
        )}

        <Button
          type="submit"
          className="w-full rounded bg-blue-600 p-3 text-lg text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 transition-colors duration-300"
          // disabled={isLoading} // isLoading state is removed
        >
          Search
        </Button>
      </form>
      {/* Results display (ScrollArea and Tweet mapping) is REMOVED from here */}
    </div>
  )
}
