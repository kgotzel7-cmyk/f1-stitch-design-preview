// Static design-only API, sourced from the included F1DB sandbox fixture. No external data calls.
(() => {
  const originalFetch = window.fetch.bind(window);
  const apiScriptUrl = document.currentScript?.src;
  // GitHub Pages project sites live below /<repo>/; resolve the fixture next
  // to that site root via this script's known /static/ location.
  const snapshotUrl = apiScriptUrl
    ? new URL('../snapshot.json', apiScriptUrl)
    : new URL('snapshot.json', window.location.href);
  let snapshotPromise;

  const getSnapshot = () => {
    snapshotPromise ??= originalFetch(snapshotUrl.href, { cache: 'no-cache' }).then(async response => {
      if (!response.ok) throw new Error(`Static data missing (${response.status}): ${snapshotUrl.href}`);
      const body = await response.text();
      try {
        return JSON.parse(body);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Static data is not valid JSON from ${snapshotUrl.href}: ${detail}`);
      }
    });
    return snapshotPromise;
  };

  window.fetch = async (input, init) => {
    const raw = typeof input === 'string' || input instanceof URL ? input : input.url;
    const url = new URL(raw, window.location.href);
    if (!url.pathname.startsWith('/api/')) return originalFetch(input, init);

    const snapshot = await getSnapshot();
    const key = url.pathname + (url.search ? `?${url.searchParams.toString()}` : '');
    if (Object.hasOwn(snapshot, key)) {
      return new Response(JSON.stringify(snapshot[key]), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }
    return new Response(JSON.stringify({ error: 'This pair or page is not included in the representative static preview.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  };
})();
