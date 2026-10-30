import { expect, test } from '@playwright/test';
import { fill, phone } from './helpers.js';

test('the privacy line links to how the data is used, and coming back keeps the answers', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('a gente usa seus dados só pra organizar o clube e entrar em contato sobre ele.')).toBeVisible();
  const typed = phone(testInfo);
  await fill(page, typed, { optIn: true });

  await page.getByRole('link', { name: 'como usamos seus dados' }).click();
  await expect(page).toHaveURL(/\/privacidade$/);
  await expect(page.getByRole('heading', { level: 1, name: 'como usamos seus dados' })).toBeVisible();
  for (const section of ['quem organiza', 'por que pedimos seu nome e seu WhatsApp', 'o convite pro teste digital', 'por quanto tempo', 'pra parar, corrigir ou apagar']) {
    await expect(page.getByRole('heading', { level: 2, name: section })).toBeVisible();
  }

  await page.getByRole('link', { name: 'voltar pro formulário' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByLabel('sim, eu toparia')).toBeChecked();
  await expect(page.getByLabel('sim, me chama pra testar também')).toBeChecked();
  await expect(page.getByLabel('seu WhatsApp')).toHaveValue(typed);
});

test('opened on its own, "voltar pro formulário" goes to the form', async ({ page }) => {
  await page.goto('/privacidade');
  await page.getByRole('link', { name: 'voltar pro formulário' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /a gente tá/ })).toBeVisible();
});

test('information still missing is marked as pending, never shown as real', async ({ page }) => {
  await page.goto('/privacidade');
  const pending = page.locator('[data-pending]');
  await expect(pending).toHaveText(['[IDENTIFICAÇÃO DOS RESPONSÁVEIS]', '[CANAL DE CONTATO PARA PRIVACIDADE]']);
});
