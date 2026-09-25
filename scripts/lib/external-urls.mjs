// URLs that may appear in the production bundle as inert text.
// Every entry must explain why it is never fetched.
// An entry ending in "/" allows every URL that starts with it; any other entry must equal the whole URL.
export const ALLOWED_URLS = [
  // XML namespace identifiers (SVG/MathML/XHTML) used by react-dom; never fetched.
  'http://www.w3.org/',
  // React production error messages print this link as text; never fetched.
  'https://react.dev/errors/',
  // Dexie's "IndexedDB API missing" error message prints this doc link as text; never fetched. Exact match.
  'https://tinyurl.com/y2uuvskb',
  // Dexie's "transaction committed too early" error message prints this doc link as text; never fetched. Exact match.
  'http://bit.ly/2kdckMn',
];

// Absolute http(s)/ws(s) URLs anywhere, plus protocol-relative URLs ("//host.tld/...") that start
// right after a quote or backtick, where they would be string literals the browser could load.
const URL_PATTERN =
  /(?:https?|wss?):\/\/[^\s"'`<>()\\]+|(?<=["'`])\/\/(?:[a-z0-9-]+\.)+[a-z0-9-]+(?::\d+)?(?:[/?#][^\s"'`<>()\\]*)?/gi;

/**
 * @param {string} url
 * @param {string[]} allowed
 */
function isAllowed(url, allowed) {
  return allowed.some((entry) => (entry.endsWith('/') ? url.startsWith(entry) : url === entry));
}

/**
 * @param {string} text
 * @param {string[]} [allowed]
 * @returns {string[]}
 */
export function findDisallowedUrls(text, allowed = ALLOWED_URLS) {
  const found = new Set();
  for (const match of text.matchAll(URL_PATTERN)) {
    if (!isAllowed(match[0], allowed)) found.add(match[0]);
  }
  return [...found];
}
