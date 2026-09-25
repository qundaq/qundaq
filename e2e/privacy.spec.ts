import { expect, test } from '@playwright/test';

test('production build ships the strict CSP', async ({ page }) => {
  await page.goto('./');
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("connect-src 'self'");
  expect(csp).not.toMatch(/unsafe-(inline|eval)/);
});

test('using the app triggers no CSP violations', async ({ page }) => {
  await page.addInitScript(() => {
    const store: string[] = [];
    (window as unknown as { __cspViolations: string[] }).__cspViolations = store;
    document.addEventListener('securitypolicyviolation', (e) => store.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  await page.goto('./');
  const nav = page.getByRole('navigation', { name: 'Ana gezinme' });
  for (const name of ['Günlük', 'Özet', 'Sesler', 'Ayarlar']) {
    await nav.getByRole('button', { name, exact: true }).click();
  }
  const nightSwitch = page.getByRole('switch');
  await nightSwitch.click();
  await expect(nightSwitch).toBeChecked();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  const violations = await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations);
  expect(violations).toEqual([]);
});
