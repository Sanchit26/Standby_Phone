import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'

// The caller memoizes queries with parameters. Ignore data from the previous query.
export function useQuery<T>(query: () => Promise<T>): { data?: T; error?: string } {
  const [result, setResult] = useState<{ query: typeof query; data?: T; error?: string }>()
  useEffect(() => {
    const sub = liveQuery(query).subscribe({
      next: data => setResult({ query, data }),
      error: () => setResult({ query, error: 'Unable to read local storage.' }),
    })
    return () => sub.unsubscribe()
  }, [query])
  return result?.query === query ? result : {}
}
