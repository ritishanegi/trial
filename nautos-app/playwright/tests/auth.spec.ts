import { test, expect } from '@playwright/test';

/**
 * E2E tests for the Authentication flow.
 * These tests verify the login and registration pages render correctly
 * and that the form controls are present and functional.
 */

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/login');
  });

  test('renders the login page with correct title and branding', async ({ page }) => {
    await expect(page).toHaveTitle(/nautos/i);

    // Brand panel (visible on large screens only, but present in DOM)
    const brandName = page.getByText('nautos');
    await expect(brandName.first()).toBeVisible();

    const tagline = page.getByText('Maritime Intelligence Platform');
    await expect(tagline).toBeVisible();
  });

  test('renders the login form with all required fields', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();

    const emailInput = page.locator('#email');
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute('type', 'email');
    await expect(emailInput).toHaveAttribute('required', '');

    const passwordInput = page.locator('#password');
    await expect(passwordInput).toBeVisible();
    await expect(passwordInput).toHaveAttribute('type', 'password');
    await expect(passwordInput).toHaveAttribute('required', '');

    const submitButton = page.getByRole('button', { name: /log in/i });
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeEnabled();
  });

  test('password toggle shows and hides password', async ({ page }) => {
    const passwordInput = page.locator('#password');
    const toggleButton = page.getByRole('button', { name: /show password/i });

    // Initially type=password
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Click toggle — should reveal password
    await toggleButton.click();
    await expect(passwordInput).toHaveAttribute('type', 'text');
    await expect(page.getByRole('button', { name: /hide password/i })).toBeVisible();

    // Click again — should hide
    await page.getByRole('button', { name: /hide password/i }).click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('has a link to the registration page', async ({ page }) => {
    const registerLink = page.getByRole('link', { name: /register your company/i });
    await expect(registerLink).toBeVisible();
    await expect(registerLink).toHaveAttribute('href', '/auth/register');
  });

  test('shows loading state when form is submitted', async ({ page }) => {
    // Intercept the login API to slow it down so we can assert loading state
    await page.route('/api/auth/login', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({ status: 401, json: { error: 'Invalid credentials' } });
    });

    await page.locator('#email').fill('test@example.com');
    await page.locator('#password').fill('wrongpassword');
    await page.getByRole('button', { name: /log in/i }).click();

    // Loading spinner should appear
    await expect(page.getByText(/logging in/i)).toBeVisible();
  });

  test('shows error message on invalid credentials', async ({ page }) => {
    await page.route('/api/auth/login', (route) =>
      route.fulfill({ status: 401, json: { error: 'Invalid email or password' } }),
    );

    await page.locator('#email').fill('wrong@example.com');
    await page.locator('#password').fill('badpassword');
    await page.getByRole('button', { name: /log in/i }).click();

    await expect(page.getByText('Invalid email or password')).toBeVisible();
  });

  test('redirects to dashboard on successful login', async ({ page }) => {
    await page.route('/api/auth/login', (route) =>
      route.fulfill({ status: 200, json: { success: true } }),
    );

    await page.locator('#email').fill('captain@vessel.com');
    await page.locator('#password').fill('correctpassword');
    await page.getByRole('button', { name: /log in/i }).click();

    await expect(page).toHaveURL('/dashboard');
  });
});

test.describe('Register Page', () => {
  test('renders the registration page', async ({ page }) => {
    await page.goto('/auth/register');
    await expect(page).toHaveURL('/auth/register');
    // Verify the page loads without errors
    await expect(page.locator('body')).toBeVisible();
  });
});
