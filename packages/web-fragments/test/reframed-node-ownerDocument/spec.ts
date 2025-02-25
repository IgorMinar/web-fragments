import { test, expect } from '@playwright/test';
const { beforeEach, step } = test;
import { failOnBrowserErrors } from '../playwright.utils';

beforeEach(failOnBrowserErrors);

test('reframed: node.ownerDocument', async ({ page }) => {
	await page.goto('/reframed-node-ownerDocument/');

	await step('ensure the test harness app loaded', async () => {
		await expect(page).toHaveTitle('WF TestBed: reframed-node-ownerDocument');
		await expect(page.locator('h1')).toHaveText('WF TestBed: reframed-node-ownerDocument');
	});

	await step(`ownerDocument of a node nested in a fragment should point to fragment's shadowRoot`, async () => {
		const fragment = page.locator('fragment-host').first();
		const heading = fragment.getByRole('heading');

		await expect(await heading.evaluate((e) => e.ownerDocument instanceof ShadowRoot)).toBe(true);
		await expect(await heading.evaluate((e) => e.ownerDocument === e.getRootNode())).toBe(true);
	});

	await step(`ownerDocument of fragment element itself should point to the parent document`, async () => {
		const fragment = page.locator('fragment-host').first();

		await expect(await fragment.evaluate((e) => e.ownerDocument instanceof Document)).toBe(true);
		await expect(await fragment.evaluate((e) => e.ownerDocument === e.getRootNode())).toBe(true);
	});

	await step(`ownerDocument of an element outside of the fragment should point to the parent document`, async () => {
		const mainH1 = page.locator('h1');

		await expect(await mainH1.evaluate((e) => e.ownerDocument instanceof Document)).toBe(true);
		await expect(await mainH1.evaluate((e) => e.ownerDocument === e.getRootNode())).toBe(true);
	});
});
