// Static design-only API, sourced from the included F1DB sandbox fixture. No external data calls.
(() => {
  const originalFetch = window.fetch.bind(window);
  let snapshotPromise;
  window.fetch = async (input, init) => {
    const raw = typeof input === 'string' ? input : input.url;
    const url = new URL(raw, window.location.href);
    if (!url.pathname.startsWith('/api/')) return originalFetch(input, init);
    snapshotPromise ??= originalFetch(new URL('snapshot.json', document.baseURI)).then(r => {if (!r.ok) throw new Error('Static data missing'); return r.json();});
    const snapshot = await snapshotPromise;
    const key = url.pathname + (url.search ? '?' + url.searchParams.toString() : '');
    if (Object.hasOwn(snapshot, key)) return new Response(JSON.stringify(snapshot[key]), {status:200, headers:{'Content-Type':'application/json'}});
    return new Response(JSON.stringify({error:'This pair or page is not included in the representative static preview.'}),{status:404,headers:{'Content-Type':'application/json'}});
  };
})();
