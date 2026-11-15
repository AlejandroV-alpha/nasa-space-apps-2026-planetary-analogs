import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const live = process.env.PLAYWRIGHT_LIVE_API === '1';
const searchPath = '/api/v1/discovered-candidates/search';
const searchPattern = '**' + searchPath + '?*';
const environment = JSON.parse(
  readFileSync('../data/processed/terrestrial-environment.v1.json', 'utf8'),
);
const catalog = JSON.parse(readFileSync('public/data/analogs.v1.json', 'utf8'));
const area = '-66,-23,-65,-22';
const marsFirst = 'NASADEM_HGT_s23w066:0:1';
const moonFirst = 'NASADEM_HGT_s23w066:1:-1';

function recommendations(page: Page) {
  return page.getByRole('complementary', { name: 'Recomendaciones' });
}

test('muestra el contexto NASA POWER del sitio del catálogo', async ({ page }) => {
  if (!live) {
    await page.route('**/api/v1/catalog', (route) => route.fulfill({ json: catalog }));
    await page.route('**/api/v1/sites/siloli-sector/environment', (route) => {
      const { sites, ...metadata } = environment;
      return route.fulfill({
        json: {
          ...metadata,
          site: sites.find((site: { siteId: string }) => site.siteId === 'siloli-sector'),
        },
      });
    });
  }

  await page.goto('/sitios/siloli-sector');
  const panel = page.getByRole('region', { name: 'Contexto ambiental histórico' });
  await expect(panel).toContainText('2025-01-01 a 2025-12-31');
  await expect(panel).toContainText('365 días válidos');
  await expect(panel.getByRole('link', { name: /NASA POWER/ })).toBeVisible();
});

test.describe('búsqueda contra FastAPI real', () => {
  test.skip(!live, 'Requiere FastAPI local y PLAYWRIGHT_LIVE_API=1');

  test.beforeEach(async ({ page }) => {
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

  test('consulta nueve huellas, preserva ambos rankings, relaciona por ID y recupera la URL', async ({
    page,
  }) => {
    const requests: URL[] = [];
    const errors: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname === searchPath) requests.push(url);
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await page.getByRole('link', { name: 'Explorar el planeta' }).click();
    const list = recommendations(page);
    await expect(
      list.getByText('Selecciona un rectángulo y pulsa Buscar candidatos.'),
    ).toBeVisible();
    expect(requests).toHaveLength(0);

    await page.getByText('Coordenadas de la zona').click();
    for (const [index, name] of ['Oeste', 'Sur', 'Este', 'Norte'].entries()) {
      await page.getByRole('textbox', { name, exact: true }).fill(area.split(',')[index]);
    }
    expect(requests).toHaveLength(0);
    await page.getByRole('textbox', { name: 'Norte', exact: true }).press('Enter');
    await expect(list.getByText('9 huellas medidas que intersectan la zona')).toBeVisible();
    const mars = list.getByRole('region', { name: /Jezero.*9 comparables/ });
    await expect(mars.getByRole('button').first()).toContainText(marsFirst);
    expect(requests[0].searchParams.get('reference_region_id')).toBe('jezero-sector');
    await mars.getByRole('button').first().click();

    await page.getByRole('button', { name: 'Ambos', exact: true }).click();
    const moon = list.getByRole('region', { name: /Polo sur lunar.*9 comparables/ });
    await expect(moon.getByRole('button').first()).toContainText(moonFirst);
    await expect(moon.getByRole('button', { name: new RegExp(marsFirst) })).toContainText(
      'Puesto 9',
    );
    const evidence = page.getByRole('region', { name: 'Comparación topográfica' });
    await expect(evidence.getByRole('table')).toHaveCount(2);
    await expect(evidence.getByRole('heading', { name: /Jezero/ })).toBeVisible();
    await expect(evidence.getByRole('heading', { name: /Polo sur lunar/ })).toBeVisible();
    await evidence.getByText('Sensibilidad a 2 km', { exact: true }).first().click();
    await expect(evidence.getByText('Escala 2 km', { exact: true }).first()).toBeVisible();
    expect(requests).toHaveLength(2);
    expect(requests[1].searchParams.has('reference_region_id')).toBe(false);
    expect(requests[1].searchParams.has('limit')).toBe(false);

    await page.getByRole('button', { name: 'Luna', exact: true }).click();
    await expect(evidence.getByRole('table')).toHaveCount(1);
    await expect(moon.getByRole('button', { name: new RegExp(marsFirst) })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Ambos', exact: true }).click();
    await expect(evidence.getByRole('table')).toHaveCount(2);
    expect(requests).toHaveLength(2);
    await expect(page).toHaveURL(/ventana=/);

    await page.reload();
    await expect(evidence.getByRole('table')).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      await page.evaluate(() => innerWidth),
    );
    expect(errors).toEqual([]);
  });

  test('sincroniza el polígono con la lista, dibuja y consulta solo al confirmar', async ({
    page,
  }) => {
    const longitude = -65.5;
    const latitude = -22.31939000525824;
    const bounds = [longitude - 0.12, latitude - 0.12, longitude + 0.12, latitude + 0.12];
    await page.goto('/explorar?cuerpo=mars&area=' + bounds.join(','));
    const draw = page.getByRole('button', { name: 'Dibujar rectángulo' });
    await expect(draw).toBeEnabled();
    const candidate = recommendations(page).getByRole('button', { name: new RegExp(marsFirst) });
    await expect(candidate).toHaveAttribute('aria-pressed', 'false');
    const canvas = page.locator('.maplibregl-canvas');
    await expect(async () => {
      await canvas.click();
      await expect(candidate).toHaveAttribute('aria-pressed', 'true', { timeout: 500 });
    }).toPass({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: 'Comparación topográfica' })).toBeVisible();

    let searches = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === searchPath) searches++;
    });
    await draw.click();
    await expect(page.getByRole('button', { name: 'Buscar candidatos' })).toBeDisabled();
    await canvas.click({ position: { x: 25, y: 50 } });
    const size = await canvas.boundingBox();
    if (!size) throw new Error('Mapa no visible');
    await canvas.click({ position: { x: size.width - 28, y: size.height - 65 } });
    await expect(draw).toBeEnabled();
    expect(searches).toBe(0);
    const response = page.waitForResponse((item) => new URL(item.url()).pathname === searchPath);
    await page.getByRole('button', { name: 'Buscar candidatos' }).click();
    expect((await response).status()).toBe(200);
    expect(searches).toBe(1);
    await expect(candidate).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Limpiar zona' }).click();
    await expect(
      recommendations(page).getByText('Selecciona un rectángulo y pulsa Buscar candidatos.'),
    ).toBeVisible();
    await expect(page).not.toHaveURL(/area=/);
  });

  test('distingue huellas sin centro, centro sobre el límite y zona sin huellas', async ({
    page,
  }) => {
    const list = recommendations(page);
    await page.goto(
      '/explorar?cuerpo=both&area=-68.787158427,-19.771877211,-68.785158427,-19.769877211',
    );
    await expect(list.getByText('1 huella medida que intersecta la zona')).toBeVisible();
    await expect(list.getByText(/sus centros quedan fuera/)).toBeVisible();

    await page.goto(
      '/explorar?cuerpo=both&area=-68.69073648781516,-19.68156906657477,-68.68973648781515,-19.679569066574768',
    );
    for (const name of [/Jezero.*1 comparable/, /Polo sur lunar.*1 comparable/]) {
      await expect(list.getByRole('region', { name }).getByRole('button').first()).toContainText(
        'NASADEM_HGT_s20w069:-1:-1',
      );
    }

    await page.goto('/explorar?area=0,0,1,1');
    await expect(list.getByText(/No hay huellas medidas publicadas/)).toBeVisible();
  });

  test('divide una selección del antimeridiano en dos consultas reales', async ({ page }) => {
    const requests: URL[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname === searchPath) requests.push(url);
    });
    await page.goto('/explorar?cuerpo=both&area=170,-10,-170,10');
    await expect(
      recommendations(page).getByText(/No hay huellas medidas publicadas/),
    ).toBeVisible();
    expect(
      requests
        .map(({ searchParams }) => [searchParams.get('west'), searchParams.get('east')])
        .sort(),
    ).toEqual([
      ['-180', '-170'],
      ['170', '180'],
    ]);
  });

  test('maneja un 422 real y se recupera después de un 503 inyectado', async ({ page }) => {
    await page.route(
      searchPattern,
      async (route) => {
        const url = new URL(route.request().url());
        url.searchParams.set('limit', '0');
        const response = await route.fetch({ url: url.href });
        expect(response.status()).toBe(422);
        await route.fulfill({ response });
      },
      { times: 1 },
    );
    await page.route(
      searchPattern,
      (route) =>
        route.fulfill({
          status: 503,
          json: { detail: 'Exportación científica no disponible o inválida.' },
        }),
      { times: 1 },
    );
    // Playwright applies the last registered route first.
    await page.goto('/explorar?cuerpo=mars&area=' + area);
    const list = recommendations(page);
    const retry = list.getByRole('button', { name: 'Reintentar', exact: true });
    await expect(
      list.getByText(/El inventario de ventanas medidas no está disponible/),
    ).toBeVisible();
    await expect(retry).toHaveCount(1);
    await retry.click();
    await expect(list.getByText(/FastAPI rechazó los límites/)).toContainText(
      'greater than or equal to 1',
    );
    await expect(retry).toHaveCount(1);
    await retry.click();
    await expect(list.getByText('9 huellas medidas que intersectan la zona')).toBeVisible();
  });
});
