import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

// CI uses controlled copies of the committed exports. Live mode uses FastAPI through Angular's proxy.
const discovery = JSON.parse(
  readFileSync('../data/processed/discovered-candidates.v1.json', 'utf8'),
);
const catalog = JSON.parse(readFileSync('public/data/analogs.v1.json', 'utf8'));
const environment = JSON.parse(
  readFileSync('../data/processed/terrestrial-environment.v1.json', 'utf8'),
);

test.beforeEach(async ({ page }) => {
  if (process.env.PLAYWRIGHT_LIVE_API !== '1') {
    await page.route('**/api/v1/catalog', (route) => route.fulfill({ json: catalog }));
    await page.route('**/api/v1/discovered-candidates', (route) =>
      route.fulfill({ json: discovery }),
    );
    await page.route('**/api/v1/sites/siloli-sector/environment', (route) => {
      const { sites, ...metadata } = environment;
      return route.fulfill({
        json: {
          ...metadata,
          site: sites.find((site: { siteId: string }) => site.siteId === 'siloli-sector'),
        },
      });
    });
    await page.route('**/health', (route) => route.fulfill({ json: { status: 'ok' } }));
  }
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yPZkAAAAASUVORK5CYII=',
        'base64',
      ),
      headers: { 'access-control-allow-origin': '*' },
    }),
  );
});

test('dibuja, filtra y muestra la comparación publicada para Luna y Marte', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('link', { name: 'Explorar el planeta' }).click();
  await page.getByRole('button', { name: 'Marte', exact: true }).click();
  const mars = page.getByRole('combobox', { name: 'Referencia de Marte' });
  await mars.click();
  await page.getByRole('option', { name: /Jezero/ }).click();
  await page.getByText('Coordenadas de la zona').click();
  const coordinates = [
    ['Oeste', '-70'],
    ['Sur', '-24'],
    ['Este', '-66'],
    ['Norte', '-18'],
  ];
  for (const [label, value] of coordinates) {
    await page.getByRole('textbox', { name: label, exact: true }).fill(value);
  }
  await page.getByRole('textbox', { name: 'Norte', exact: true }).press('Enter');
  await expect(page).toHaveURL(/area=/);
  const draw = page.getByRole('button', { name: 'Dibujar rectángulo' });
  await draw.click();
  await expect(page.getByRole('button', { name: 'Buscar candidatos' })).toBeDisabled();
  const canvas = page.locator('.maplibregl-canvas');
  await canvas.click({ position: { x: 20, y: 30 } });
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Mapa no visible');
  await canvas.click({ position: { x: bounds.width - 30, y: bounds.height - 80 } });
  await expect(draw).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Oeste', exact: true })).not.toHaveValue('');
  await page.getByRole('button', { name: 'Buscar candidatos' }).click();

  const list = page.getByRole('complementary', { name: 'Recomendaciones' });
  const first = list.getByRole('button', { name: /NASADEM_HGT_s23w069:-1:1/ });
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Comparación topográfica' })).toBeVisible();
  await expect(page.getByRole('table')).toContainText('Pendiente mediana');
  await page.getByText('Sensibilidad a 2 km', { exact: true }).click();
  await expect(page.getByText('Escala 2 km', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Comparación topográfica' })).toBeVisible();

  await page.getByRole('button', { name: 'Luna', exact: true }).click();
  await expect(list.getByRole('heading', { name: /Polo sur lunar/ })).toBeVisible();
  await page.getByRole('button', { name: 'Ambos', exact: true }).click();
  await expect(list.getByRole('heading', { name: /Jezero/ })).toBeVisible();
  await expect(list.getByRole('heading', { name: /Polo sur lunar/ })).toBeVisible();

  await page.getByRole('button', { name: 'Limpiar zona' }).click();
  await expect(list.getByText('Selecciona un rectángulo y pulsa Buscar candidatos.')).toBeVisible();
  await page.getByText('Coordenadas de la zona').click();
  for (const [index, [label]] of coordinates.entries()) {
    await page.getByRole('textbox', { name: label, exact: true }).fill(index < 2 ? '0' : '1');
  }
  await page.getByRole('button', { name: 'Buscar candidatos' }).click();
  await expect(
    list.getByText('No se encontraron candidatos publicados dentro de la zona seleccionada.'),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('muestra el contexto NASA POWER del sitio del catálogo', async ({ page }) => {
  await page.goto('/sitios/siloli-sector');
  const panel = page.getByRole('region', { name: 'Contexto ambiental histórico' });
  await expect(panel).toContainText('2025-01-01 a 2025-12-31');
  await expect(panel).toContainText('365 días válidos');
  await expect(panel.getByRole('link', { name: /NASA POWER/ })).toBeVisible();
});

test('selecciona un polígono desde el mapa y sincroniza la lista', async ({ page }) => {
  const mars = discovery.results.find(
    (group: { reference: { id: string } }) => group.reference.id === 'jezero-sector',
  );
  const first = mars.features[0];
  const [longitude, latitude] = first.properties.center;
  const area = [longitude - 0.12, latitude - 0.12, longitude + 0.12, latitude + 0.12];
  await page.goto('/explorar?cuerpo=mars&area=' + area.join(','));
  await expect(page.getByRole('button', { name: 'Dibujar rectángulo' })).toBeEnabled();
  const list = page.getByRole('complementary', { name: 'Recomendaciones' });
  const result = list.getByRole('button', { name: new RegExp(first.id) });
  await expect(result).toHaveAttribute('aria-pressed', 'false');
  const center = page.locator('.maplibregl-canvas');
  await expect(async () => {
    await center.click();
    await expect(result).toHaveAttribute('aria-pressed', 'true', { timeout: 500 });
  }).toPass({ timeout: 5000 });
  await expect(page.getByRole('heading', { name: 'Comparación topográfica' })).toBeVisible();
});
