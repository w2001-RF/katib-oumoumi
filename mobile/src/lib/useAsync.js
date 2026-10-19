import { useCallback, useEffect, useState } from 'react';

/**
 * Runs `load` (an async function) when `deps` (strings or numbers) change;
 * `reload()` runs it again. Returns { data, error, loading, reload }.
 * A result that arrives after the screen moved on to other deps is dropped.
 */
export function useAsync(load, deps) {
  const [round, setRound] = useState(0);
  const reload = useCallback(() => setRound((n) => n + 1), []);
  const key = JSON.stringify([...deps, round]);
  const [result, setResult] = useState({ key: null, data: null, error: null });

  useEffect(() => {
    let live = true;
    load().then(
      (data) => live && setResult({ key, data, error: null }),
      (error) => {
        console.error(error);
        if (live) setResult({ key, data: null, error });
      }
    );
    return () => {
      live = false;
    };
    // `key` stands for deps + reloads; `load` is a new closure every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Loading until the result for the current key is in.
  const loading = result.key !== key;
  return { data: loading ? null : result.data, error: loading ? null : result.error, loading, reload };
}
