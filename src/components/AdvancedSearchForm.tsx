'use client'
import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'

const parseQuery = (q: string) => {
  const parts = q.split(' ');
  const options: { [key: string]: string } = {};
  const words: string[] = [];
  const validFilters = ['from', 'to', 'since', 'until'];

  parts.forEach((part) => {
    const separatorIndex = part.indexOf(':');
    if (separatorIndex > 0) { // must not start with ':' and must contain ':'
      const key = part.substring(0, separatorIndex);
      const value = part.substring(separatorIndex + 1);
      if (validFilters.includes(key) && value) {
        options[key] = value;
        return; // Go to next part
      }
    }
    words.push(part); // Not a valid filter, so it's a keyword
  });

  return { options, words };
};

export default function AdvancedSearchForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState('');
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  // Effect to set initial query from URL params
  useEffect(() => {
    const q = searchParams.get('q') || '';
    const fromUser = searchParams.get('fromUser') || '';
    const replyToUser = searchParams.get('replyToUser') || '';
    const sinceDate = searchParams.get('sinceDate') || '';
    const untilDate = searchParams.get('untilDate') || '';
    
    const parts = [q];
    if (fromUser) parts.push(`from:${fromUser}`);
    if (replyToUser) parts.push(`to:${replyToUser}`);
    if (sinceDate) parts.push(`since:${sinceDate}`);
    if (untilDate) parts.push(`until:${untilDate}`);
    
    setQuery(parts.filter(p => p).join(' ').trim());

    // if (fromUser || replyToUser || sinceDate || untilDate) {
    //   setShowAdvancedOptions(true);
    // }
  }, [searchParams]);

  // Derive values for advanced fields from the main query string
  const { from, to, since, until } = useMemo(() => {
    const { options } = parseQuery(query);
    return {
      from: options.from || '',
      to: options.to || '',
      since: options.since || '',
      until: options.until || '',
    };
  }, [query]);

  const handleFilterChange = (filter: 'from' | 'to' | 'since' | 'until', value: string) => {
    const { words, options } = parseQuery(query);

    // Update the specific filter's value
    if (value) {
      options[filter] = value;
    } else {
      delete options[filter];
    }

    // Reconstruct the query string
    const newFilterParts = Object.entries(options).map(([key, val]) => `${key}:${val}`);
    const newQuery = [...words, ...newFilterParts].join(' ');
    setQuery(newQuery.trim().replace(/\s+/g, ' '));
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const { options, words } = parseQuery(query);
    const mainQuery = words.join(' ').trim();

    const params = new URLSearchParams();
    if (mainQuery) params.set('q', mainQuery);
    if (options.from) params.set('fromUser', options.from);
    if (options.to) params.set('replyToUser', options.to);
    if (options.since) params.set('sinceDate', options.since);
    if (options.until) params.set('untilDate', options.until);

    router.push(`/search?${params.toString()}`);
  };

  const inputClasses = "w-full rounded border p-2 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:placeholder-slate-400 focus:ring-blue-500 focus:border-blue-500";
  const labelClasses = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

  return (
    <div className="bg-slate-100 dark:bg-card p-6 md:p-8 rounded-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="main-search" className={labelClasses}>Search terms</label>
        <input
            id="main-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tweets (use from:, to:, since:, until: for advanced search)"
            className={inputClasses}
        />
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
              onChange={(e) => handleFilterChange('from', e.target.value)}
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
              onChange={(e) => handleFilterChange('to', e.target.value)}
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
                onChange={(e) => handleFilterChange('since', e.target.value)}
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
                onChange={(e) => handleFilterChange('until', e.target.value)}
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
