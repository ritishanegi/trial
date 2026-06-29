import { test, expect } from '@playwright/test';

/**
 * E2E tests for the Chat / Query interface.
 *
 * NOTE: These tests require a valid authenticated session.
 * In a full setup, use Playwright's storageState to persist login cookies.
 * For now, tests mock the auth check and navigate directly.
 *
 * See: https://playwright.dev/docs/auth
 */

test.describe('Chat Interface — Unauthenticated', () => {
  test('redirects unauthenticated users away from /dashboard/query', async ({ page }) => {
    await page.goto('/dashboard/query');
    // The middleware should redirect to login
    await expect(page).toHaveURL(/\/(auth\/login|login)/);
  });
});

test.describe('Chat Interface — Authenticated', () => {
  /**
   * Setup: Simulate a logged-in session by injecting an auth cookie.
   * Replace 'nautos_session' and the token value with your actual cookie name/value.
   * For production tests, use `playwright/auth.setup.ts` + storageState.
   */
  test.use({
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:3000',
          localStorage: [],
        },
      ],
    },
  });

  test.beforeEach(async ({ page, context }) => {
    // Mock the auth session API so middleware passes
    await context.route('/api/auth/session', (route) =>
      route.fulfill({
        status: 200,
        json: {
          user: { id: 'usr_test', email: 'captain@vessel.com', tenant_id: 'ten_test' },
        },
      }),
    );

    // Mock the vessels API to avoid real DB calls
    await context.route('/api/vessels', (route) =>
      route.fulfill({ status: 200, json: [] }),
    );

    await page.goto('/dashboard/query');
  });

  test('chat page loads and shows the input area', async ({ page }) => {
    // The page should not be a 404 or error page
    await expect(page.locator('body')).toBeVisible();

    // Look for a text input / textarea (the chat input)
    const chatInput = page
      .locator('textarea, input[type="text"], [role="textbox"]')
      .first();
    await expect(chatInput).toBeVisible({ timeout: 10_000 });
  });

  test('chat input accepts text', async ({ page }) => {
    const chatInput = page
      .locator('textarea, input[type="text"], [role="textbox"]')
      .first();

    await chatInput.fill('What is the MARPOL regulation?');
    await expect(chatInput).toHaveValue('What is the MARPOL regulation?');
  });

  test('can open a doc-scoped chat via URL params', async ({ page }) => {
    const docId = '123e4567-e89b-12d3-a456-426614174000';
    const docTitle = 'MARPOL Annex VI';

    await page.goto(
      `/dashboard/query?docId=${docId}&docTitle=${encodeURIComponent(docTitle)}`,
    );

    // The doc title should appear in the UI as a scope indicator
    await expect(page.getByText(docTitle)).toBeVisible({ timeout: 10_000 });
  });

  test('send button is disabled when input is empty', async ({ page }) => {
    // The submit/send button should not be active when input is blank
    const sendButton = page.getByRole('button', { name: /send|submit|ask/i }).first();
    // Either disabled attribute or aria-disabled
    const isDisabled =
      (await sendButton.getAttribute('disabled')) !== null ||
      (await sendButton.getAttribute('aria-disabled')) === 'true';
    expect(isDisabled).toBe(true);
  });
});
