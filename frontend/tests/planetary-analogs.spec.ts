import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const live = process.env.PLAYWRIGHT_LIVE_API === '1';
const catalog = JSON.parse(readFileSync('public/data/analogs.v1.json', 'utf8'));
const provenance = JSON.parse(readFileSync('public/data/analogs.v1.provenance.json', 'utf8'));

// CI exercises navigation with a controlled copy of the scientific export.
// Set PLAYWRIGHT_LIVE_API=1 to exercise the same flow against running FastAPI.
test.beforeEach(async ({ page }) => {
  if (live) {
    return;
  }

  await page.route('**/api/v1/catalog', (route) => route.fulfill({ json: catalog }));

  await page.route('**/api/v1/reference-regions', (route) =>
    route.fulfill({
      json: {
        total: catalog.referenceRegions.length,
        items: catalog.referenceRegions,
      },
    }),
  );
  await page.route(/\/api\/v1\/sites\?/, (route) => {
    const { searchParams } = new URL(route.request().url());
    const items = catalog.sites.filter(
      (site: {
        assessments: { targetBody: string; referenceRegionId: string }[];
        country: string;
      }) =>
        (!searchParams.has('country') || searchParams.get('country') === site.country) &&
        site.assessments.some(
          (a) =>
            a.targetBody === searchParams.get('target_body') &&
            (!searchParams.has('reference_region_id') ||
              a.referenceRegionId === searchParams.get('reference_region_id')),
        ),
    );
    return route.fulfill({ json: { total: items.length, items } });
  });
  await page.route(/\/api\/v1\/sites\/[^/?]+$/, (route) => {
    const site = catalog.sites.find((item: { id: string }) =>
      new URL(route.request().url()).pathname.endsWith('/' + item.id),
    );
    return route.fulfill(site ? { json: site } : { status: 404 });
  });
  await page.route(/\/api\/v1\/geojson\/sites\?/, (route) =>
    route.fulfill({
      json: {
        type: 'FeatureCollection',
        features: catalog.sites.map((site: { id: string; name: string; geometry: unknown }) => ({
          type: 'Feature',
          id: site.id,
          geometry: site.geometry,
          properties: { id: site.id, name: site.name },
        })),
      },
    }),
  );
  await page.route('**/api/v1/sources', (route) =>
    route.fulfill({ json: { items: catalog.sources, total: catalog.sources.length } }),
  );
  await page.route('**/api/v1/methods', (route) =>
    route.fulfill({ json: { items: catalog.methods, total: catalog.methods.length } }),
  );
  await page.route('**/api/v1/provenance', (route) => route.fulfill({ json: provenance }));
  await page.route('**/api/v1/compare', async (route) => {
    const request = route.request().postDataJSON();
    expect(request).toEqual({
      reference_region_id: 'jezero-sector',
      site_ids: ['siloli-sector', 'coipasa-sector'],
    });
    const section = catalog.referenceRegions.find(
      (region: { id: string }) => region.id === 'jezero-sector',
    );
    const sites = request.site_ids.map((id: string) =>
      catalog.sites.find((site: { id: string }) => site.id === id),
    );
    await route.fulfill({
      json: {
        ...request,
        dataset_status: 'draft',
        notice: 'Diferencias descriptivas. Revisión científica pendiente.',
        rows: [
          {
            key: 'slope-median',
            reference: section.metrics[0],
            sites: sites.map((site: { metrics: unknown[] }) => site.metrics[0]),
            comparable: true,
            signed_differences: [5.172, -0.6587],
            reason: null,
          },
        ],
      },
    });
  });
});

test('explora, abre una ficha, compara y conserva la selección después de recargar', async ({
  page,
  isMobile,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page).toHaveTitle('Planetary Analogs | Inicio');
  await page.getByRole('link', { name: 'Explorar análogos terrestres' }).click();
  await expect(page.getByRole('heading', { name: 'Explorar candidatos' })).toBeVisible();
  await page.getByRole('link', { name: 'Sitios del catálogo' }).click();
  await page.getByRole('button', { name: 'Luna', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Amboy/ })).toBeVisible();
  await page.getByRole('button', { name: 'Marte', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Región de referencia' })).toContainText(
    'Jezero',
  );
  await page.getByRole('link', { name: /Ver ficha de Siloli/ }).click();
  await expect(page.getByRole('heading', { name: /Siloli/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Indicadores topográficos' })).toBeVisible();
  await page.getByRole('link', { name: 'Volver al explorador' }).click();
  await page.getByRole('button', { name: /Comparación: Siloli/ }).click();
  await page.getByRole('button', { name: /Comparación: Coipasa/ }).click();
  await page.getByRole('link', { name: 'Abrir comparación' }).click();
  const response = page.waitForResponse(
    (result) => result.url().endsWith('/api/v1/compare') && result.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Comparar', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page.getByRole('table')).toContainText('Pendiente mediana');
  await expect(page.getByRole('table')).toContainText('Diferencia +5,172°');
  if (isMobile) {
    const scrollable = page.getByRole('region', { name: 'Resultados' });
    const horizontalOffset = await scrollable.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
      return element.scrollLeft;
    });
    expect(horizontalOffset).toBeGreaterThan(0);
  }
  await page.getByRole('link', { name: 'Volver al explorador' }).click();
  expect(new URL(page.url()).searchParams.get('sitios')).toBe('siloli-sector,coipasa-sector');
  await page.reload();
  await expect(page.getByText('2 seleccionados.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Metodología', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Procedencia y sensibilidad' })).toBeVisible();
  await expect(page.getByText(/Huella SHA-256/)).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Secciones de metodología' })
    .getByRole('link', { name: 'Sensibilidad' })
    .click();
  await expect(page).toHaveURL(/\/metodologia#sensitivity$/);
  expect(errors).toEqual([]);
});

test('sincroniza la selección de un marcador con la lista', async ({ page, isMobile }) => {
  // The basemap is incidental to this test; serve a transparent tile to avoid network dependence.
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
  const worker = page.waitForResponse((response) =>
    response.url().includes('maplibre-gl-worker.mjs'),
  );
  await page.goto('/explorar/catalogo?cuerpo=mars&region=jezero-sector');
  if (isMobile) {
    await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  }
  const marker = page.getByRole('button', { name: /Seleccionar en el mapa: Siloli/ });
  await marker.click();
  expect((await worker).status()).toBe(200);
  await expect(marker).toHaveAttribute('aria-pressed', 'true');
  if (isMobile) {
    await page.getByRole('button', { name: 'Lista', exact: true }).click();
  }
  await expect(page.getByRole('button', { name: /^Siloli/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: /^Coipasa/ }).click();
  if (isMobile) {
    await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  }
  await expect(
    page.getByRole('button', { name: /Seleccionar en el mapa: Coipasa/ }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );
});

test('ofrece recuperación cuando FastAPI no está disponible', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/v1/catalog', (route) => {
    attempts++;
    if (attempts === 1) {
      return route.fulfill({ status: 503, json: { detail: 'Catálogo no disponible' } });
    }
    return route.fulfill({ json: catalog });
  });
  await page.goto('/explorar/catalogo');
  await expect(
    page.getByText('La exportación científica está temporalmente inaccesible.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Candidatos (2)' })).toBeVisible();
});
