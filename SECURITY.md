# Security Policy

## Supported versions

Only the latest deployment at https://qundaq.github.io/qundaq/ is supported. The app updates only when you ask it to (Settings → Check for updates), so if you are on an older version, please update and check whether the issue is still there.

## Scope

Qundaq has no server, no accounts and no network activity after the first load — all data stays on the device. That takes most classic web vulnerabilities off the table, but some things very much remain in scope:

- **CSP bypasses** — any way to load or execute something the Content-Security-Policy should block
- **Service worker cache poisoning** — any way to make the offline cache serve files that were not built by CI, including bypasses of the SHA-256 integrity check on updates
- **Backup-file parsing bugs** — a crafted backup JSON that corrupts or deletes data on restore, or executes anything
- Anything that breaks a commitment in [MANIFESTO.md](MANIFESTO.md) — for example, a code path that could send data off the device

## Reporting a vulnerability

Please report privately via GitHub: go to the repository's **Security** tab and click **"Report a vulnerability"**. Do not open a public issue for a security problem.

This is an unpaid open-source project; there is no bug bounty. You will get a reply, a fix as fast as we can manage, and credit if you want it.
