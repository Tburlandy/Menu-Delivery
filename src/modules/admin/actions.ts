'use server';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requireMenuAccess, type MenuPermission } from '../../lib/core/require-menu-access';
import { createAdminClient } from '../../lib/supabase/server';

function cents(value: FormDataEntryValue | null) {
  if (value === null || String(value).trim() === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error('INVALID_PRICE');
  const result = Math.round(parsed * 100);
  if (!Number.isSafeInteger(result)) throw new Error('INVALID_PRICE');
  return result;
}

async function menuForUnit(unitId: string, permission: MenuPermission = 'menu:edit') {
  const product = permission === 'delivery:manage' ? 'WHATSAPP_DELIVERY' : 'MENU';
  const access = await requireMenuAccess(unitId, permission, product);
  const { data: menu, error } = await access.db.schema('menus').from('menus').select('*').eq('unit_id', unitId).single();
  if (error || !menu) throw error ?? new Error('MENU_NOT_FOUND');
  return { ...access, menu };
}


function refresh(unitId: string) {
  revalidatePath(`/menus/${unitId}`);
  revalidatePath(`/menus/${unitId}/versions`);
  revalidatePath(`/menus/${unitId}/delivery`);
}

export async function updateMenuProfile(unitId: string, form: FormData) {
  const { db, menu } = await menuForUnit(unitId, 'menu:edit');
  const patch = {
    name: String(form.get('name') ?? '').trim(),
    description: String(form.get('description') ?? '').trim(),
    address: String(form.get('address') ?? '').trim(),
    phone: String(form.get('phone') ?? '').trim(),
    whatsapp: String(form.get('whatsapp') ?? '').replace(/\D/g, ''),
  };
  if (!patch.name) throw new Error('MENU_NAME_REQUIRED');
  const { error } = await db.schema('menus').from('menus').update(patch).eq('id', menu.id);
  if (error) throw error;
  refresh(unitId);
}

export async function uploadMenuAsset(unitId: string, kind: 'cover' | 'logo' | 'item', file: File) {
  const { menu } = await menuForUnit(unitId, 'menu:edit');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size <= 0 || file.size > 8 * 1024 * 1024) throw new Error('INVALID_IMAGE');
  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${menu.id}/${kind}/${randomUUID()}.${extension}`;
  const admin = createAdminClient();
  const { error } = await admin.storage.from('menu-public-assets').upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (error) throw error;
  return admin.storage.from('menu-public-assets').getPublicUrl(path).data.publicUrl;
}

export async function uploadAndSetBrandImage(unitId: string, kind: 'cover' | 'logo', form: FormData) {
  const file = form.get('file');
  if (!(file instanceof File) || file.size <= 0) throw new Error('IMAGE_REQUIRED');
  const url = await uploadMenuAsset(unitId, kind, file);
  await setBrandImages(unitId, kind === 'cover' ? { coverUrl: url } : { logoUrl: url });
}

export async function setBrandImages(unitId: string, input: { coverUrl?: string; logoUrl?: string }) {
  const { db, menu } = await menuForUnit(unitId, 'menu:edit');
  const patch: Record<string, string | null> = {};
  if (input.coverUrl !== undefined) patch.cover_image_url = input.coverUrl || null;
  if (input.logoUrl !== undefined) patch.logo_image_url = input.logoUrl || null;
  const { error } = await db.schema('menus').from('menus').update(patch).eq('id', menu.id);
  if (error) throw error;
  refresh(unitId);
}

export async function addCategory(unitId: string, form: FormData) {
  const { db, menu } = await menuForUnit(unitId, 'menu:edit');
  const name = String(form.get('name') ?? '').trim();
  if (!name) throw new Error('CATEGORY_NAME_REQUIRED');
  const { count } = await db.schema('menus').from('categories').select('id', { count: 'exact', head: true }).eq('menu_id', menu.id);
  const { error } = await db.schema('menus').from('categories').insert({ menu_id: menu.id, name, description: String(form.get('description') ?? '').trim(), position: count ?? 0 });
  if (error) throw error;
  refresh(unitId);
}

export async function updateCategory(unitId: string, categoryId: string, input: { name?: string; description?: string; position?: number; active?: boolean }) {
  const { db, menu } = await menuForUnit(unitId, 'menu:edit');
  if (input.name !== undefined && !input.name.trim()) throw new Error('CATEGORY_NAME_REQUIRED');
  const patch = { ...input, ...(input.name !== undefined ? { name: input.name.trim() } : {}) };
  const { error } = await db.schema('menus').from('categories').update(patch).eq('id', categoryId).eq('menu_id', menu.id);
  if (error) throw error;
  refresh(unitId);
}

export async function updateCategoryFromForm(unitId: string, categoryId: string, form: FormData) {
  await updateCategory(unitId, categoryId, {
    name: String(form.get('name') ?? ''),
    description: String(form.get('description') ?? ''),
    position: Number(form.get('position') ?? 0),
    active: form.get('active') === 'on',
  });
}

export async function deleteCategory(unitId: string, categoryId: string) {
  const { db, menu } = await menuForUnit(unitId, 'menu:edit');
  const { error } = await db.schema('menus').from('categories').delete().eq('id', categoryId).eq('menu_id', menu.id);
  if (error) throw error;
  refresh(unitId);
}

export async function addItem(unitId: string, form: FormData) {
  const { db, menu } = await menuForUnit(unitId, 'menu:edit');
  const categoryId = String(form.get('categoryId') ?? '');
  const title = String(form.get('title') ?? '').trim();
  if (!categoryId || !title) throw new Error('ITEM_FIELDS_REQUIRED');
  const { data: category, error: categoryError } = await db.schema('menus').from('categories').select('id').eq('id', categoryId).eq('menu_id', menu.id).single();
  if (categoryError || !category) throw categoryError ?? new Error('CATEGORY_NOT_FOUND');
  const { count } = await db.schema('menus').from('items').select('id', { count: 'exact', head: true }).eq('category_id', categoryId);
  const { error } = await db.schema('menus').from('items').insert({
    menu_id: menu.id,
    category_id: categoryId,
    title,
    description: String(form.get('description') ?? '').trim(),
    price_cents: cents(form.get('price')),
    position: count ?? 0,
    available: true,
  });
  if (error) throw error;
  refresh(unitId);
}

export async function updateItem(unitId: string, itemId: string, input: { title?: string; description?: string; priceCents?: number | null; imageUrl?: string | null; available?: boolean; position?: number; categoryId?: string }) {
  const { db, menu } = await menuForUnit(unitId, 'menu:edit');
  if (input.title !== undefined && !input.title.trim()) throw new Error('ITEM_TITLE_REQUIRED');
  if (input.priceCents !== undefined && input.priceCents !== null && (!Number.isSafeInteger(input.priceCents) || input.priceCents < 0)) throw new Error('INVALID_PRICE');
  if (input.categoryId) {
    const { data: target, error } = await db.schema('menus').from('categories').select('id').eq('id', input.categoryId).eq('menu_id', menu.id).single();
    if (error || !target) throw error ?? new Error('CATEGORY_NOT_FOUND');
  }
  const patch: Record<string, unknown> = {
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description.trim() } : {}),
    ...(input.priceCents !== undefined ? { price_cents: input.priceCents } : {}),
    ...(input.imageUrl !== undefined ? { image_url: input.imageUrl } : {}),
    ...(input.available !== undefined ? { available: input.available } : {}),
    ...(input.position !== undefined ? { position: input.position } : {}),
    ...(input.categoryId ? { category_id: input.categoryId } : {}),
  };
  const { error } = await db.schema('menus').from('items').update(patch).eq('id', itemId).eq('menu_id', menu.id);
  if (error) throw error;
  refresh(unitId);
}

export async function updateItemFromForm(unitId: string, itemId: string, form: FormData) {
  const image = form.get('image');
  const clearImage = form.get('clearImage') === 'on';
  const uploadedImageUrl = image instanceof File && image.size > 0 ? await uploadMenuAsset(unitId, 'item', image) : undefined;
  const categoryId = String(form.get('categoryId') ?? '').trim();
  await updateItem(unitId, itemId, {
    title: String(form.get('title') ?? ''),
    description: String(form.get('description') ?? ''),
    priceCents: cents(form.get('price')),
    available: form.get('available') === 'on',
    position: Number(form.get('position') ?? 0),
    ...(categoryId ? { categoryId } : {}),
    ...(uploadedImageUrl ? { imageUrl: uploadedImageUrl } : clearImage ? { imageUrl: null } : {}),
  });
}

export async function deleteItem(unitId: string, itemId: string) {
  const { db, menu } = await menuForUnit(unitId, 'menu:edit');
  const { error } = await db.schema('menus').from('items').delete().eq('id', itemId).eq('menu_id', menu.id);
  if (error) throw error;
  refresh(unitId);
}

export async function publishMenu(unitId: string, reason = 'MANUAL_PUBLISH') {
  const { user, db, menu } = await menuForUnit(unitId, 'menu:publish');
  const { data, error } = await db.schema('menus').rpc('publish_menu_version', { p_menu_id: menu.id, p_reason: reason, p_actor_id: user.id, p_idempotency_key: `manual:${randomUUID()}` });
  if (error) throw error;
  refresh(unitId);
  return data;
}

export async function rollbackMenu(unitId: string, versionId: string) {
  const { user, db, menu } = await menuForUnit(unitId, 'menu:publish');
  const { error } = await db.schema('menus').rpc('rollback_menu_version', { p_menu_id: menu.id, p_version_id: versionId, p_actor_id: user.id });
  if (error) throw error;
  refresh(unitId);
}

export async function saveDeliverySettings(unitId: string, input: { whatsapp: string; pickupEnabled: boolean; paymentMethods: string[]; minimumOrderCents: number }) {
  const { db, menu } = await menuForUnit(unitId, 'delivery:manage');
  const whatsapp = input.whatsapp.replace(/\D/g, '');
  const methods = [...new Set(input.paymentMethods.map(v => v.trim()).filter(Boolean))];
  if (whatsapp.length < 10 || !methods.length || !Number.isSafeInteger(input.minimumOrderCents) || input.minimumOrderCents < 0) throw new Error('INVALID_DELIVERY_SETTINGS');
  const { error } = await db.schema('menus').from('delivery_settings').upsert({ menu_id: menu.id, whatsapp, pickup_enabled: input.pickupEnabled, payment_methods: methods, minimum_order_cents: input.minimumOrderCents, updated_at: new Date().toISOString() });
  if (error) throw error;
  refresh(unitId);
}

export async function addDeliveryArea(unitId: string, input: { name: string; feeCents: number }) {
  const { db, menu } = await menuForUnit(unitId, 'delivery:manage');
  if (!input.name.trim() || !Number.isSafeInteger(input.feeCents) || input.feeCents < 0) throw new Error('INVALID_DELIVERY_AREA');
  const { count } = await db.schema('menus').from('delivery_areas').select('id', { count: 'exact', head: true }).eq('menu_id', menu.id);
  const { error } = await db.schema('menus').from('delivery_areas').insert({ menu_id: menu.id, name: input.name.trim(), fee_cents: input.feeCents, position: count ?? 0 });
  if (error) throw error;
  refresh(unitId);
}

export async function updateDeliveryArea(unitId: string, areaId: string, input: { name: string; feeCents: number; enabled: boolean; position: number }) {
  const { db, menu } = await menuForUnit(unitId, 'delivery:manage');
  if (!input.name.trim() || !Number.isSafeInteger(input.feeCents) || input.feeCents < 0) throw new Error('INVALID_DELIVERY_AREA');
  const { error } = await db.schema('menus').from('delivery_areas').update({ name: input.name.trim(), fee_cents: input.feeCents, enabled: input.enabled, position: input.position }).eq('id', areaId).eq('menu_id', menu.id);
  if (error) throw error;
  refresh(unitId);
}

export async function deleteDeliveryArea(unitId: string, areaId: string) {
  const { db, menu } = await menuForUnit(unitId, 'delivery:manage');
  const { error } = await db.schema('menus').from('delivery_areas').delete().eq('id', areaId).eq('menu_id', menu.id);
  if (error) throw error;
  refresh(unitId);
}
