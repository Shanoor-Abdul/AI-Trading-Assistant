// Node 18+ undici has a known bug with chunked GZIP compression that throws:
// "invalid distance too far back" when dealing with large LLM JSON payloads.
// This globally intercepts fetch to force 'Accept-Encoding: identity'
// which tells the AI providers to send raw uncompressed JSON, bypassing the bug.

const originalFetch = global.fetch;

if (!(global as any).__fetchPatched) {
  global.fetch = async (url, options: any = {}) => {
    let headers = options.headers;
    
    if (!headers) {
      headers = {};
    } else if (headers instanceof Headers) {
      headers = Object.fromEntries(headers.entries());
    } else if (Array.isArray(headers)) {
      headers = Object.fromEntries(headers);
    } else {
      headers = { ...headers };
    }

    headers['Accept-Encoding'] = 'identity';

    options.headers = headers;
    return originalFetch(url, options);
  };
  (global as any).__fetchPatched = true;
}
