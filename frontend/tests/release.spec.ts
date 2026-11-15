import { expect, test } from '@playwright/test';

const windowId = 'NASADEM_HGT_s23w066:0:1';
const discovery = '/api/v1/discovered-candidates';
const study = '/estudios/jezero-andes-terrain-study';

test.describe('entrega contra FastAPI real', () => {
  test.skip(
    process.env.PLAYWRIGHT_LIVE_API !== '1',
    'Requiere FastAPI con las exportaciones de ciencia',
  );

  test('recorre los endpoints restantes desde sus controles', async ({ page, isMobile }) => {
    const paths = new Set<string>();
    page.on('response', (response) => {
      if (response.ok()) paths.add(decodeURIComponent(new URL(response.url()).pathname));
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Ver destacados' }).click();
    await page.getByRole('link', { name: windowId, exact: true }).first().click();
    await expect(page.getByRole('heading', { name: windowId })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Polo sur lunar/ })).toBeVisible();
    await page.getByRole('link', { name: 'Volver al explorador' }).click();
    await page.getByRole('button', { name: 'Cobertura global' }).click();
    await expect(page.getByText(/81 huellas en el inventario/)).toBeVisible();
    await page.getByRole('link', { name: 'Sitios del catálogo', exact: true }).press('Enter');
    await expect(page).toHaveURL(/explorar\/catalogo/);
    await page.getByLabel('País').selectOption('BO');
    await expect(page.getByRole('heading', { name: 'Candidatos (2)' })).toBeVisible();
    if (isMobile) await page.getByRole('button', { name: 'Mapa', exact: true }).click();
    await expect.poll(() => paths.has('/api/v1/geojson/sites')).toBe(true);
    await page.getByText(/Sobre Jezero/).click();
    await page.getByRole('link', { name: 'Abrir ficha de referencia' }).click();
    await expect(page.getByRole('heading', { name: /Jezero/ })).toBeVisible();
    await page.getByRole('link', { name: 'Metodología', exact: true }).click();
    await expect(page.getByText('Conexión con FastAPI · Disponible')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Fuentes científicas' })).toBeVisible();
    await expect(page.getByText(/Versiones y huellas de las exportaciones/)).toBeVisible();
    await page.getByText(/Versiones y huellas de las exportaciones/).click();
    await expect(page.getByText(/candidate-product-evidence.v1.json/)).toBeVisible();
    await page.goto('/ruta-inexistente');
    await expect(page.getByRole('heading', { name: /no encontrada/i })).toBeVisible();
    for (const key of [
      '/health',
      '/api/v1/catalog',
      discovery,
      discovery + '/' + windowId,
      '/api/v1/discovery-coverage',
      '/api/v1/sites',
      '/api/v1/reference-regions',
      '/api/v1/reference-regions/jezero-sector',
      '/api/v1/sources',
      '/api/v1/methods',
      '/api/v1/provenance',
      '/api/v1/science-status',
    ]) {
      await expect.poll(() => paths.has(key), { message: key }).toBe(true);
    }
  });

  test('reserva el ranking ante un 503 opcional y recupera solo el recurso afectado', async ({
    page,
  }) => {
    await page.route('**/api/v1/discovered-candidates/search?*', (route) => {
      if (new URL(route.request().url()).searchParams.get('include_evidence') === 'true') {
        return route.fulfill({
          status: 503,
          json: { detail: 'Exportación opcional no disponible' },
        });
      }
      return route.continue();
    });
    await page.route('**/thermal?*', (route) => route.fulfill({ status: 503 }), { times: 1 });
    await page.goto('/explorar?cuerpo=mars&area=-66,-23,-65,-22');
    await expect(page.getByText(/Ranking topográfico disponible/)).toBeVisible();
    await page.getByRole('button', { name: new RegExp(windowId) }).click();
    await page.getByText('Aplicaciones y evidencia científica', { exact: true }).click();
    await page
      .locator('summary')
      .filter({ hasText: /^Condiciones térmicas$/ })
      .click();
    await page
      .locator('summary')
      .filter({ hasText: /^Aplicaciones para misiones$/ })
      .click();
    await expect(
      page.getByText(/exportación científica está temporalmente inaccesible/),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Usos potenciales' })).toBeVisible();
    await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
    await expect(page.getByText(/temperatura radiométrica equivalente/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Comparación topográfica' })).toBeVisible();
  });

  test('muestra el estudio desde Inicio y maneja IDs científicos desconocidos', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Abrir el caso de estudio' }).click();
    await expect(page).toHaveURL(new RegExp(study));
    await expect(page.getByText(/Investigación exploratoria · Revisión pendiente/)).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Resultados de la investigación' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Fuentes científicas' })).toBeVisible();
    await page.goto('/ventanas/desconocida');
    await expect(page.getByText('El identificador solicitado no está disponible.')).toBeVisible();
    await page.goto('/estudios/desconocido');
    await expect(page.getByText('El identificador solicitado no está disponible.')).toBeVisible();
  });
});
