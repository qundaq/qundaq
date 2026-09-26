# Contributing to Qundaq

Thank you for helping. Qundaq is a small app with a strict promise — what parents record about their babies stays on their phone — and every contribution has to keep that promise. Read [MANIFESTO.md](MANIFESTO.md) first; it explains the commitments and how CI enforces them.

## Getting started

You need Node 24 or newer (`engines` is enforced with `engine-strict`) and npm.

```bash
npm ci        # install; install scripts are disabled by .npmrc
npm run dev   # dev server (no service worker, no CSP)
```

## Checks

| Script                   | What it does                                                |
| ------------------------ | ----------------------------------------------------------- |
| `npm run format`         | Formats everything with Prettier                            |
| `npm run format:check`   | Fails if anything is not formatted                          |
| `npm run lint`           | ESLint (type-checked rules)                                 |
| `npm run typecheck`      | TypeScript, `tsc --noEmit`                                  |
| `npm test`               | Unit tests (Vitest)                                         |
| `npm run build`          | Production build, service worker, and the external-URL scan |
| `npm run check:licenses` | License policy for every installed package                  |
| `npm run e2e`            | Playwright end-to-end tests (offline, privacy, update gate) |
| `npm run verify`         | Every check above except `format`, in order                 |

Run `npm run verify` before opening a pull request. The e2e tests need browsers installed once:

```bash
npx playwright install chromium webkit
```

## Code style

- **Prettier is the formatter** (100 columns, single quotes). Don't argue with it; run `npm run format`.
- **ESLint** runs typescript-eslint's type-checked rules plus the react-hooks rules, including the React Compiler rules. Fix warnings rather than disabling them.
- **Comments say why, not what** — and one line where possible. If the code needs a comment to explain what it does, rewrite the code.
- **One blank line between logical blocks**, none inside them.
- **No barrel files.** Import from the module that defines the thing.

A repository-wide formatting commit is listed in `.git-blame-ignore-revs`. GitHub skips it automatically; for local `git blame`, run once:

```bash
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

## Hard rules

These are project principles, not preferences. CI enforces each one, and a pull request that breaks one will not be merged.

1. **Runtime dependencies are exactly `react`, `react-dom` and `dexie`.** Adding one requires a written justification in the pull request (see the PR template), and the bar is high.
2. **No network activity after first load.** No fetch calls, external URLs, CDNs, fonts or remote images. Enforced by `scripts/check-no-external-urls.mjs` and the CSP e2e test.
3. **Every UI string exists in both locales**, `src/i18n/tr.ts` and `src/i18n/en.ts`. Enforced by `tests/i18n.test.ts`.

## Commits

Conventional commits, imperative, lowercase:

```
feat(sounds): add rain intensity control
fix(backup): keep deletions when merging a restore
docs: clarify the restore preview
```

## Code of conduct

Everyone participating is expected to follow the [code of conduct](CODE_OF_CONDUCT.md).
