// Licenses allowed for code that ships to users.
export const RUNTIME_LICENSES = ['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD'];

// Build/test tooling never ships to users, so a few more OSI/permissive licenses are fine there.
export const DEV_ONLY_LICENSES = [...RUNTIME_LICENSES, 'MPL-2.0', 'CC-BY-4.0', 'CC0-1.0', 'BlueOak-1.0.0', 'Python-2.0'];

/**
 * Tokenizes an SPDX license expression into '(', ')', 'AND', 'OR', and identifier
 * tokens. An identifier is either a single SPDX id, or an "X WITH Y" exception
 * clause kept together as one token (the WITH keyword never splits it).
 * @param {string} expr
 * @returns {string[]}
 */
function tokenize(expr) {
  const tokens = [];
  const raw = expr.match(/\(|\)|[^\s()]+/g) ?? [];
  let i = 0;
  while (i < raw.length) {
    const word = raw[i];
    if (word === '(' || word === ')' || word === 'AND' || word === 'OR') {
      tokens.push(word);
      i++;
    } else if (raw[i + 1] === 'WITH' && typeof raw[i + 2] === 'string') {
      tokens.push(`${word} WITH ${raw[i + 2]}`);
      i += 3;
    } else {
      tokens.push(word);
      i++;
    }
  }
  return tokens;
}

/**
 * Recursive-descent SPDX expression evaluator. Grammar (AND binds tighter than OR):
 *   expr  := term (OR term)*
 *   term  := factor (AND factor)*
 *   factor := '(' expr ')' | identifier
 * Any malformed input (unbalanced parens, dangling operator, empty expression,
 * trailing tokens) is treated as not allowed.
 * @param {string | undefined} expr
 * @param {string[]} allowed
 * @returns {boolean}
 */
export function isLicenseAllowed(expr, allowed) {
  if (!expr || !expr.trim()) return false;
  const tokens = tokenize(expr);
  let pos = 0;

  function parseFactor() {
    const token = tokens[pos];
    if (token === undefined || token === 'AND' || token === 'OR' || token === ')') return null;
    if (token === '(') {
      pos++;
      const inner = parseExpr();
      if (inner === null || tokens[pos] !== ')') return null;
      pos++;
      return inner;
    }
    pos++;
    return allowed.includes(token);
  }

  function parseTerm() {
    let result = parseFactor();
    if (result === null) return null;
    while (tokens[pos] === 'AND') {
      pos++;
      const rhs = parseFactor();
      if (rhs === null) return null;
      result = result && rhs;
    }
    return result;
  }

  function parseExpr() {
    let result = parseTerm();
    if (result === null) return null;
    while (tokens[pos] === 'OR') {
      pos++;
      const rhs = parseTerm();
      if (rhs === null) return null;
      result = result || rhs;
    }
    return result;
  }

  const result = parseExpr();
  if (result === null || pos !== tokens.length) return false;
  return result;
}

/**
 * @param {{ packages?: Record<string, { name?: string, license?: string, dev?: boolean, devOptional?: boolean, link?: boolean }> }} lock
 * @returns {{ name: string, license: string, dev: boolean }[]}
 */
export function findLicenseViolations(lock) {
  const violations = [];
  for (const [path, pkg] of Object.entries(lock.packages ?? {})) {
    if (path === '' || pkg.link) continue;
    const dev = Boolean(pkg.dev || pkg.devOptional);
    if (!isLicenseAllowed(pkg.license, dev ? DEV_ONLY_LICENSES : RUNTIME_LICENSES)) {
      violations.push({ name: path.replace(/^.*node_modules\//, ''), license: pkg.license ?? '(none)', dev });
    }
  }
  return violations;
}
