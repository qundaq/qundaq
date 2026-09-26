import type { Plugin } from 'vite';

// Only in production builds: the Vite dev server relies on inline scripts/styles for HMR.
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export function injectCsp(html: string): string {
  if (!html.includes('<head>'))
    throw new Error('index.html has no <head> tag to attach the CSP to');
  return html.replace(
    '<head>',
    `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">`,
  );
}

export function cspPlugin(): Plugin {
  return {
    name: 'qundaq:csp',
    apply: 'build',
    transformIndexHtml: { order: 'post', handler: injectCsp },
  };
}
