import { Router } from 'express';
import { z } from 'zod';
import { assertTenantAccess } from '../access.js';
import { pagination } from '../validation.js';

export const productSchema = z.object({
  sku: z.string().trim().min(1).max(100).optional().nullable(),
  name: z.string().trim().min(1).max(240),
  description: z.string().trim().max(10000).default(''),
  status: z.enum(['draft', 'active', 'archived']).default('active'),
  priceMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).default('USD'),
  inventoryQuantity: z.number().int().min(0).optional().nullable(),
  attributes: z.record(z.string(), z.unknown()).default({}),
  mediaUrls: z.array(z.string().url()).max(20).default([]),
});

const updateProductSchema = productSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field is required',
});

export function productRoutes(db) {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId);
    const { limit, offset } = pagination(req.query);
    const search = String(req.query.search ?? '').trim();
    const status = String(req.query.status ?? '').trim();
    const result = await db.query(
      `SELECT * FROM catalog_products
       WHERE tenant_id = $1
         AND ($2 = '' OR status = $2)
         AND ($3 = '' OR name ILIKE '%' || $3 || '%' OR sku ILIKE '%' || $3 || '%' OR description ILIKE '%' || $3 || '%')
       ORDER BY updated_at DESC LIMIT $4 OFFSET $5`,
      [req.params.tenantId, status, search, limit, offset],
    );
    res.json({ data: result.rows, pagination: { limit, offset } });
  });

  router.post('/', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId, ['tenant-admin', 'operator', 'catalog-editor']);
    const input = productSchema.parse(req.body);
    const result = await db.query(
      `INSERT INTO catalog_products
       (tenant_id, sku, name, description, status, price_minor, currency, inventory_quantity, attributes, media_urls)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [req.params.tenantId, input.sku, input.name, input.description, input.status, input.priceMinor,
        input.currency, input.inventoryQuantity, input.attributes, input.mediaUrls],
    );
    res.status(201).json({ data: result.rows[0] });
  });

  router.patch('/:productId', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId, ['tenant-admin', 'operator', 'catalog-editor']);
    const input = updateProductSchema.parse(req.body);
    const current = await db.query(
      'SELECT * FROM catalog_products WHERE id = $1 AND tenant_id = $2',
      [req.params.productId, req.params.tenantId],
    );
    if (!current.rowCount) return res.status(404).json({ error: 'product_not_found' });
    const previous = current.rows[0];
    const result = await db.query(
      `UPDATE catalog_products SET
         sku = $3, name = $4, description = $5, status = $6, price_minor = $7,
         currency = $8, inventory_quantity = $9, attributes = $10, media_urls = $11, updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [req.params.productId, req.params.tenantId,
        input.sku !== undefined ? input.sku : previous.sku,
        input.name ?? previous.name,
        input.description ?? previous.description,
        input.status ?? previous.status,
        input.priceMinor ?? Number(previous.price_minor),
        input.currency ?? previous.currency,
        input.inventoryQuantity !== undefined ? input.inventoryQuantity : previous.inventory_quantity,
        input.attributes ?? previous.attributes,
        input.mediaUrls ?? previous.media_urls],
    );
    return res.json({ data: result.rows[0] });
  });

  router.delete('/:productId', async (req, res) => {
    await assertTenantAccess(db, req.identity, req.params.tenantId, ['tenant-admin', 'operator', 'catalog-editor']);
    const result = await db.query(
      `UPDATE catalog_products SET status = 'archived', updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [req.params.productId, req.params.tenantId],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'product_not_found' });
    return res.status(204).end();
  });

  return router;
}
