import { expect, test } from '@playwright/test';
import { addBabyInSettings, babyCard, openTab } from './support/tracking';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
});

test.describe('babies', () => {
  test('first run shows an empty state and adds a baby from Home', async ({ page }) => {
    await expect(page.getByText('Başlamak için bir bebek ekleyin.')).toBeVisible();
    await page.getByRole('button', { name: 'Bebek ekle', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Bebek ekle' });
    await dialog.getByLabel('İsim').fill('Ada');
    await dialog.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(babyCard(page, 'Ada')).toBeVisible();
  });

  test('a blank name is refused with a message', async ({ page }) => {
    await page.getByRole('button', { name: 'Bebek ekle', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Bebek ekle' });
    await dialog.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Bir isim girin.');
    await expect(dialog).toBeVisible();
  });

  test('babies can be renamed and deleted in Settings', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await addBabyInSettings(page, 'Can');

    await page.getByRole('listitem').filter({ hasText: 'Ada' }).getByRole('button', { name: 'Düzenle' }).click();
    const dialog = page.getByRole('dialog', { name: 'Bebeği düzenle' });
    await dialog.getByLabel('İsim').fill('Ada Nur');
    await dialog.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'Ada Nur' })).toBeVisible();

    page.once('dialog', (confirm) => void confirm.accept());
    await page.getByRole('listitem').filter({ hasText: 'Can' }).getByRole('button', { name: 'Sil' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'Can' })).toHaveCount(0);

    await openTab(page, 'Ana');
    await expect(babyCard(page, 'Ada Nur')).toBeVisible();
    await expect(babyCard(page, 'Can')).toHaveCount(0);
  });
});
