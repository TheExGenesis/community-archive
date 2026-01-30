# Community Archive Code Audit - January 18, 2026

## Executive Summary

This comprehensive audit examined the Community Archive codebase across four major areas:
1. Database queries and performance
2. React components and frontend
3. API routes and security
4. Code quality and patterns

**Total Issues Found: 89+**
- **Critical**: 6
- **High**: 27
- **Medium**: 35
- **Low**: 21+

---

## Fix Status (Updated January 20, 2026)

### ✅ FIXED - Critical Security Issues

| Issue | Description | Status | PR/Commit |
|-------|-------------|--------|-----------|
| 3.1.1 | Missing auth on `/api/auth/changeuserid` | ✅ FIXED | Merged to main |
| 3.1.2 | Open redirect via x-forwarded-host | ✅ FIXED | Merged to main |
| 3.1.3 | Missing try/catch on request.json() | ✅ FIXED | Merged to main |

### ✅ FIXED - Build/Infrastructure Issues

| Issue | Description | Status | PR/Commit |
|-------|-------------|--------|-----------|
| N/A | Empty `database-types.ts` | ✅ FIXED | PR #303 |
| N/A | Missing Window.supabase type | ✅ FIXED | PR #304 |
| N/A | tsconfig including services/ | ✅ FIXED | PR #304 |

### ⏳ TODO - High Priority (Next Session)

| Issue | Description | File | Recommended Fix |
|-------|-------------|------|-----------------|
| 1.1.1 | N+1 queries in getMostMentionedAccounts | `src/lib/queries/getMostMentionedAccounts.ts` | Batch fetch with `.in()` |
| 1.3.1 | Browser client recreated unnecessarily | `src/lib/queries/getLatestTweets.ts:9` | Use passed `supabase` param |
| 2.1.1 | TweetComponent without React.memo | `src/components/TweetComponent.tsx` | Add React.memo + useMemo |
| 3.2.1 | Unbounded username array | `src/app/api/opt-in/check/route.ts` | Add MAX_USERNAMES=100 limit |
| 3.2.2 | Unvalidated date parameters | `src/app/api/scraping-stats/route.ts` | Add ISO 8601 validation |
| 3.2.3 | Missing granularity enum validation | `src/app/api/scraping-stats/route.ts` | Validate against enum |

### 📋 Remaining Issues by Priority

**High Priority (27 issues):** See sections 1.1, 1.2, 1.3, 2.1-2.6, 3.2, 4.1, 4.3
**Medium Priority (27 issues):** See sections 1.4, 1.5, 2.7, 3.3-3.5, 4.2, 4.5
**Low Priority (16 issues):** See sections 1.6, 4.4, 4.6

---

## Table of Contents

1. [Database & Performance Issues](#1-database--performance-issues)
2. [React & Frontend Issues](#2-react--frontend-issues)
3. [API & Security Issues](#3-api--security-issues)
4. [Code Quality Issues](#4-code-quality-issues)
5. [Priority Action Items](#5-priority-action-items)

---

## 1. Database & Performance Issues

### 1.1 N+1 Query Problems (HIGH SEVERITY)

#### Issue 1.1.1: Sequential queries in loop for mentioned users
**File**: `src/lib/queries/getMostMentionedAccounts.ts:24-51`

```typescript
const mentionedUsers = await Promise.all(
  users
    .filter((user: any) => user.screen_name !== username)
    .map(async (user: any) => {
      const { data: profile } = await supabase
        .from('profile')
        .select('*')
        .eq('account_id', user.user_id)
        // ...
      const { data: account } = await supabase
        .from('account')
        .select('*')
        .eq('account_id', user.user_id)
      // ...
    }),
)
```

**Problem**: For each user in the result set, this makes 2 separate database queries. 10 users = 20 queries when 1-2 batch queries would suffice.

**Recommendation**: Use `in()` filters to batch fetch all profiles and accounts at once.

---

#### Issue 1.1.2: Sequential enrichment queries in tweet fetches
**File**: `src/lib/tweet.ts:113-128`

```typescript
if (tweet.mentioned_users) {
  const enrichedMentionedUsers = await Promise.all(
    tweet.mentioned_users.map(async (userRecord: any) => {
      const accountData = await getMentionedUserAccount(supabase, userRecord.mentioned_user.screen_name)
    })
  )
}
```

**Problem**: Calls `getMentionedUserAccount()` for each mentioned user (2 queries per user). 10 mentions = 20 queries.

---

#### Issue 1.1.3: Multiple profile queries in getLatestTweets
**File**: `src/lib/queries/getLatestTweets.ts:59-161`

**Problem**: Fetches profile data 3 separate times for different contexts instead of consolidating.

---

### 1.2 Inefficient Query Patterns (HIGH SEVERITY)

#### Issue 1.2.1: SELECT * in database functions
**File**: `supabase/schemas/070_functions.sql` (Lines 198, 1396+)

```sql
RETURN QUERY SELECT * FROM public.get_streaming_stats_hourly_streamed_only(...)
```

**Problem**: SELECT * wastes bandwidth and processing.

---

#### Issue 1.2.2: Missing pagination in direct queries
**File**: `src/lib/queries/getTweetCountByDate.ts:42-52`

**Problem**: Query fetches all tweets without pagination. Millions of tweets = memory issues.

---

#### Issue 1.2.3: Inefficient string searching with ILIKE
**File**: `src/lib/queries/tweetQueries.ts:160-173`

```typescript
if (criteria.mentionedUser) {
  query = query.ilike('full_text', `%@${criteria.mentionedUser}%`);
}
if (criteria.hashtags && criteria.hashtags.length > 0) {
  criteria.hashtags.forEach(tag => {
    query = query.ilike('full_text', `%#${tag}%`);
  });
}
```

**Problem**: Multiple ILIKE filters cause full table scans. Should use FTS.

---

### 1.3 Connection Handling Issues (HIGH SEVERITY)

#### Issue 1.3.1: Browser client recreated unnecessarily
**File**: `src/lib/queries/getLatestTweets.ts:9`

```typescript
const getLatestTweets = async (
  supabase: any,  // Receives client as parameter
  count: number,
) => {
  const newSupabaseClient = createBrowserClient()  // Creates NEW client!
```

**Problem**: Creates a new browser client instead of using the passed one.

---

### 1.4 Missing Indexes (MEDIUM SEVERITY)

| Table | Missing Index | Impact |
|-------|--------------|--------|
| `private.tweet_user` | `user_id`, `(user_id, created_at)` | Slow lookups |
| `profile` | `archive_upload_id` (for user-scoped views) | Slow ordering |
| `tweets` | Composite `(account_id, created_at DESC)` | Suboptimal sort |

---

### 1.5 Client-Side Aggregation (MEDIUM SEVERITY)

**File**: `src/lib/queries/getTweetCountByDate.ts:54-86`

**Problem**: Fetches all tweets then groups in JavaScript. Should use server-side SQL aggregation with `date_trunc()`.

---

### 1.6 Duplicate Indexes (LOW SEVERITY)

**File**: `supabase/schemas/030_indexes.sql:22-26, 65-68`

```sql
CREATE INDEX "idx_likes_account_id" ON "public"."likes" ...
CREATE INDEX "likes_account_id_idx" ON "public"."likes" ...  -- DUPLICATE
```

---

## 2. React & Frontend Issues

### 2.1 Missing Memoization (HIGH SEVERITY)

#### Issue 2.1.1: TweetComponent without React.memo
**File**: `src/components/TweetComponent.tsx:100-370`

- 270+ line component without memoization
- Expensive regex operations inside render
- `formatText()` function recreated on every render

**Recommendation**: Wrap with `React.memo()` and memoize expensive operations.

---

#### Issue 2.1.2: Inline CSV export function
**File**: `src/components/UnifiedTweetList.tsx:29-67`

```typescript
const handleExportCsv = () => {  // Recreated on every render
  // 39 lines of CSV generation logic
}
```

**Recommendation**: Use `useCallback`.

---

#### Issue 2.1.3: Activity tracker calculations
**File**: `src/components/activity-tracker.tsx:68-179`

**Problem**: Complex grid calculations with `eachDayOfInterval` run every render without `useMemo`.

---

### 2.2 State Management Problems (HIGH SEVERITY)

#### Issue 2.2.1: Supabase client initialization antipattern
**Files**: `src/components/TweetList.tsx:32-36`, `src/components/SearchTweets.tsx:31-38`

```typescript
const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
useEffect(() => {
  setSupabase(createBrowserClient());  // Triggers re-render
}, []);
```

**Problem**: State update triggers unnecessary re-render.

---

#### Issue 2.2.2: Missing React Query integration
**Files**: `src/components/TopMentionedMissingUsers.tsx:47-95`, `src/components/SearchTweets.tsx:40-87`

**Problem**: Manual state management instead of using TanStack Query (already in project). No caching, refetching, or background updates.

---

### 2.3 Missing Error Boundaries (HIGH SEVERITY)

#### Issue 2.3.1: Dynamic imports without error handling
**File**: `src/app/layout.tsx:14-16, 58`

```typescript
const DynamicSignIn = dynamic(() => import('@/components/SignIn'), {
  ssr: false,
})
// <DynamicSignIn /> with no fallback error handling
```

**Problem**: If SignIn fails to load, entire page white-screens.

---

### 2.4 Accessibility Issues (HIGH SEVERITY)

#### Issue 2.4.1: Missing ARIA labels
**File**: `src/components/SearchTweets.tsx:106-126`

```tsx
<input
  type="text"
  placeholder="Enter search query"  // Only has placeholder, no label
/>
<button onClick={handleSearch}>  // No aria-label
```

---

#### Issue 2.4.2: Avatar links missing accessibility
**File**: `src/components/AvatarList.tsx:26-59`

**Problem**: Links lack `aria-label` or `title` attributes.

---

### 2.5 Component Anti-Patterns (HIGH SEVERITY)

#### Issue 2.5.1: Components doing too much
**File**: `src/components/file-upload-dialog.tsx` (318 lines)

Handles: dialog state, date parsing, archive stats, file upload, progress tracking, error handling, success UI

**Recommendation**: Split into `ArchiveStatsDisplay`, `AdvancedOptionsForm`, `UploadProgressTracker`, `UploadResultsDisplay`.

---

#### Issue 2.5.2: Index as key in lists
**File**: `src/components/TweetComponent.tsx:170-185`

```tsx
return formattedText.split(urlRegex).map((part, index) => {
  return <a key={index} ...>  // ANTI-PATTERN
```

---

### 2.6 Type Safety Issues (HIGH SEVERITY)

```typescript
// Multiple files use any[] for tweet data
const [tweetsExact, setTweetsExact] = useState<any[]>([])

// UnifiedTweetList props
interface UnifiedTweetListProps {
  tweets: any[]  // Should use TweetData type
}
```

---

### 2.7 Bundle Size Issues (MEDIUM SEVERITY)

**File**: `src/components/TweetComponent.tsx:5`

```typescript
import { FaHeart, FaRetweet, FaExternalLinkAlt, FaReply } from 'react-icons/fa'
```

**Problem**: Imports entire react-icons/fa library for 4 icons. Should use lucide-react (already in project) or tree-shakeable imports.

---

## 3. API & Security Issues

### 3.1 Critical Security Vulnerabilities

#### Issue 3.1.1: Missing authentication on admin operations (CRITICAL) ✅ FIXED
**File**: `src/app/api/auth/changeuserid/route.ts:6-14`
**Status**: ✅ **FIXED** - Authentication, authorization, and input validation added.

~~```typescript
export async function POST(request: NextRequest) {
  const supabase = createServerAdminClient(cookies())
  const { userId, providerId, userName } = await request.json()

  // NO AUTHENTICATION CHECK! Modifies ANY user's auth record
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { provider_id: providerId, user_name: lowerUserName },
  })
```~~

**Applied Fix**: Added `getUser()` check, user.id !== userId check, try/catch for JSON parsing.

---

#### Issue 3.1.2: Open redirect via x-forwarded-host (HIGH) ✅ FIXED
**File**: `src/app/api/auth/callback/route.ts:29-40`
**Status**: ✅ **FIXED** - Added `isAllowedHost()` validation function.

~~```typescript
const forwardedHost = request.headers.get('x-forwarded-host')
if (forwardedHost) {
  return NextResponse.redirect(`https://${forwardedHost}${next}`)  // VULNERABLE!
}
```~~

**Applied Fix**: Added `isAllowedHost()` that validates against `NEXT_ALLOWED_AUTH_REDIRECT_DOMAINS` env var, localhost, and *.vercel.app.

---

#### Issue 3.1.3: Missing error handling on request.json() (HIGH) ✅ FIXED
**File**: `src/app/api/auth/changeuserid/route.ts:8`
**Status**: ✅ **FIXED** - Added try/catch wrapper.

~~```typescript
const { userId, providerId, userName } = await request.json()  // Can throw SyntaxError!
```~~

**Applied Fix**: Wrapped in try/catch, returns 400 on invalid JSON.

---

### 3.2 Input Validation Issues (HIGH SEVERITY)

#### Issue 3.2.1: Unbounded username array
**File**: `src/app/api/opt-in/check/route.ts:46-47`

```typescript
const usernameList = usernames!.split(',').map(u => u.trim().toLowerCase())
// No size limit! Attacker can send thousands of usernames
```

**Fix**: Add limit
```typescript
const MAX_USERNAMES = 100
if (usernameList.length > MAX_USERNAMES) {
  return NextResponse.json({ error: 'Too many usernames' }, { status: 400 })
}
```

---

#### Issue 3.2.2: Unvalidated date parameters
**Files**: `src/app/api/scraping-stats/route.ts:76-83`, `src/app/api/scraper-count/route.ts:25-29`

**Problem**: Date strings passed directly to RPC without ISO 8601 validation.

---

#### Issue 3.2.3: Missing granularity enum validation
**Files**: `src/app/api/scraping-stats/route.ts:8`, `src/app/api/tweet-counts/route.ts:10`

```typescript
const granularity = searchParams.get('granularity') || 'hour'
// No validation - invalid values passed to RPC
```

---

### 3.3 Information Disclosure (MEDIUM SEVERITY)

#### Issue 3.3.1: Internal errors exposed to clients
**Files**: Multiple API routes

```typescript
return NextResponse.json({ error: error.message }, { status: 400 })
// Exposes: "duplicate key value violates unique constraint 'optin_username_key'"
```

---

### 3.4 Missing Rate Limiting (MEDIUM SEVERITY)

All 10+ API endpoints lack rate limiting:
- `/api/opt-in/check` - accepts unbounded username lists
- `/api/scraping-stats` - no throttling
- `/api/tweet-counts` - no protection

---

### 3.5 Development Endpoint Risk (MEDIUM SEVERITY)

**File**: `src/app/api/auth/dev-login/route.ts:7`

```typescript
if (process.env.NODE_ENV !== 'development') {
  return NextResponse.json(...)
}
```

**Risk**: If `NODE_ENV` is unset, dev login is accessible.

---

## 4. Code Quality Issues

### 4.1 Type Safety Issues (HIGH SEVERITY)

| File | Line | Issue |
|------|------|-------|
| `src/lib/tweet.ts` | 5 | `tweet_id: any` instead of `string` |
| `src/lib/queries/getLatestTweets.ts` | 4 | `supabase: any` |
| `src/lib/queries/getMostMentionedAccounts.ts` | 14 | `.rpc(...) as any` |
| `src/lib/queries/tweetQueries.ts` | 23 | `(rawData as any[])` |
| `src/lib/upload-archive/validateContent.ts` | 108 | `contents as any` |

---

### 4.2 Code Duplication (MEDIUM SEVERITY)

1. **Date filtering logic duplicated** in:
   - `src/lib/upload-archive/filterArchiveTweetsByDate.ts`
   - `src/lib/upload-archive/applyOptionsToArchive.ts`

2. **Tweet date reduction** duplicated in:
   - `src/lib/db_insert.ts`
   - `src/lib/upload-archive/calculateArchiveStats.ts`

3. **Profile enrichment pattern** duplicated across query files

---

### 4.3 Error Handling Gaps (HIGH SEVERITY)

**File**: `src/lib/db_insert.ts:103-105`

```typescript
const {data: lastUploadedArchive, error: lastUploadedArchiveError} = await supabase.from('archive_upload')...
// lastUploadedArchiveError is captured but NEVER CHECKED
```

---

### 4.4 Logging Issues (LOW SEVERITY)

- 11+ `console.log()` in `src/lib/db_insert.ts` - should use `devLog()`
- Debug comment blocks left in `OpenCollectiveContributors.tsx`
- `console.log('handleSearch', ...)` in production code

---

### 4.5 Testing Gaps (MEDIUM SEVERITY)

**Critical paths not tested**:
- Archive upload pipeline (`src/lib/upload-archive/`)
- Core data insertion (`src/lib/db_insert.ts`)
- Retry operation logic

Only example tests found in `src/app/test-examples/`.

---

### 4.6 TODO/FIXME Comments

```typescript
// src/app/mission-control/page.tsx:8
// export const revalidate = 0; // TODO: Decide on revalidation strategy
```

---

## 5. Priority Action Items

### Critical (Fix Immediately)

1. ~~**Add authentication check to `/api/auth/changeuserid`**~~ ✅ DONE
2. ~~**Fix open redirect in auth callback**~~ ✅ DONE
3. ~~**Add try/catch around `request.json()` calls**~~ ✅ DONE
4. **Fix N+1 queries in `getMostMentionedAccounts`** - Batch fetch instead of loops

### High Priority (Next Session)

1. **Fix browser client recreation in `getLatestTweets.ts`** - Use passed supabase param
2. Add input validation (array limits, date format, enum validation) to all API routes
3. Fix type safety issues - replace `any` types with proper interfaces
4. Add error boundaries around dynamic imports
5. Add React.memo and useMemo to TweetComponent
6. Implement rate limiting on public endpoints

### Medium Priority (This Sprint)

1. Consolidate duplicate code (date filtering, profile enrichment)
2. Replace client-side aggregation with SQL functions
3. Add comprehensive error handling to database operations
4. Integrate React Query for data fetching components
5. Add accessibility labels and keyboard navigation
6. Create missing database indexes

### Low Priority (Backlog)

1. Remove duplicate indexes
2. Clean up console.log statements
3. Add JSDoc documentation
4. Expand test coverage
5. Extract magic strings to constants

---

## Summary Tables

### By Category

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| Database/Performance | 0 | 8 | 6 | 5 |
| React/Frontend | 0 | 12 | 8 | 3 |
| API/Security | 3 | 4 | 8 | 2 |
| Code Quality | 0 | 3 | 5 | 6 |
| **Total** | **3** | **27** | **27** | **16** |

### By Severity Distribution

```
Critical:  ████ 3
High:      ████████████████████████████ 27
Medium:    ████████████████████████████ 27
Low:       █████████████████ 16
```

---

*Audit completed: January 18, 2026*
*Last updated: January 20, 2026*
*Auditor: Claude Code*

---

## Changelog

- **Jan 20, 2026**: Critical security fixes merged to main (3.1.1, 3.1.2, 3.1.3). Build issues fixed (PRs #303, #304). Added Fix Status section.
