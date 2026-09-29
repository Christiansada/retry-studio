import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { sample, compare } from '../../src/model';
test.beforeEach(async ({ page }) => {
  await page.goto('/');
});
test('sample renders and exports all actual evidence', async ({ page }) => {
  await expect(page.getByRole('status')).toContainText('Comparison ready');
  await expect(page.locator('.backoff .score')).toContainText('40');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export evidence' }).click();
  const file = await pending;
  const body = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(body).toEqual(compare(sample));
});
test('editing invalidates results and blank values stay invalid', async ({
  page,
}) => {
  await page.getByLabel('Recovery time (ms)').fill('');
  await expect(
    page.getByRole('button', { name: 'Export evidence' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Compare policies' }).click();
  await expect(page.getByRole('alert')).toContainText('outageMs must be');
  await page.getByLabel('Recovery time (ms)').fill('0');
  await page.getByRole('button', { name: 'Compare policies' }).click();
  await expect(page.locator('.backoff')).toContainText('40');
  await expect(page.locator('.backoff')).toContainText('(1×)');
});
test('imports a scenario and resets to the sample', async ({ page }) => {
  await page.getByLabel('Import scenario JSON').setInputFiles({
    name: 'scenario.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...sample, clients: 2, outageMs: 0 })),
  });
  await expect(page.locator('.backoff .score')).toContainText('2');
  await expect(page.getByLabel('Clients', { exact: true })).toHaveValue('2');
  await page.getByRole('button', { name: 'Reset sample' }).click();
  await expect(page.getByLabel('Clients', { exact: true })).toHaveValue('40');
});
test('invalid and oversized imports remove stale evidence', async ({
  page,
}) => {
  for (const body of [
    '{"clients":"<img src=x onerror=alert(1)>"}',
    ' '.repeat(10001),
  ]) {
    await page.getByLabel('Import scenario JSON').setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from(body),
    });
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Export evidence' }),
    ).toHaveCount(0);
  }
});
test('audit switches policy and client and discloses buckets', async ({
  page,
}) => {
  await page.getByLabel('Policy', { exact: true }).selectOption('jitter');
  await page.getByLabel('Client', { exact: true }).selectOption('2');
  await expect(page.locator('#audit-summary')).toContainText(
    'Full jitter · Client 2',
  );
  const r = compare(sample).jitter.attempts.filter((a) => a.client === 2);
  await expect(page.locator('#audit-body tr')).toHaveCount(r.length);
  await page.getByText('Inspect exact bucket counts').click();
  await expect(
    page.getByRole('region', { name: 'Retry buckets', exact: true }),
  ).toBeVisible();
});
test('keyboard submission and deadline cancellation work', async ({ page }) => {
  await page.getByLabel('Client deadline (ms)').fill('1');
  await page.getByLabel('Client deadline (ms)').press('Enter');
  await expect(page.locator('.backoff')).toContainText('40 deadline stops');
  await expect(page.locator('#audit-body')).toContainText('deadline');
  await page.getByRole('button', { name: 'Reset sample' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Comparison ready');
});
for (const width of [320, 390, 768, 1440])
  test(`accessible without page overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
test('maximum scenario and doubled text remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 960 });
  await page.getByLabel('Clients', { exact: true }).fill('200');
  await page.getByLabel('Launch spacing (ms)').fill('1000');
  await page.getByRole('button', { name: 'Compare policies' }).click();
  await page.addStyleTag({ content: ':root{font-size:32px}' });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole('button', { name: 'Export evidence' }),
  ).toBeVisible();
});
test('no uncaught browser errors during the main flow', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.reload();
  await page.getByRole('button', { name: 'Compare policies' }).click();
  await page.getByRole('button', { name: 'Reset sample' }).click();
  expect(errors).toEqual([]);
});
