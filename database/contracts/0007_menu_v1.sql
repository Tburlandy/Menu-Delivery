create schema if not exists menus;

alter table menus.menus add column if not exists address text;
alter table menus.menus add column if not exists phone text;
alter table menus.menus add column if not exists whatsapp text;
alter table menus.menus add column if not exists theme jsonb not null default '{}'::jsonb;
alter table menus.menus add column if not exists status text not null default 'ACTIVE' check(status in('ACTIVE','INACTIVE','ARCHIVED'));

create table if not exists menus.source_batches(
  id uuid primary key default gen_random_uuid(), menu_id uuid not null references menus.menus(id) on delete cascade,
  status text not null check(status in('UPLOADING','QUEUED','PROCESSING','PUBLISHED','FAILED')),
  runner_job_id uuid, published_version_id uuid references menus.versions(id), error_message text,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists menus.source_images(
  id uuid primary key default gen_random_uuid(), source_batch_id uuid not null references menus.source_batches(id) on delete cascade,
  storage_path text not null unique, mime_type text not null, size_bytes bigint not null check(size_bytes>0), position integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists menus.categories(
  id uuid primary key default gen_random_uuid(), menu_id uuid not null references menus.menus(id) on delete cascade,
  name text not null check(length(trim(name))>0), description text not null default '', position integer not null default 0,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists menus.items(
  id uuid primary key default gen_random_uuid(), menu_id uuid not null references menus.menus(id) on delete cascade,
  category_id uuid not null references menus.categories(id) on delete cascade,
  title text not null check(length(trim(title))>0), description text not null default '', price_cents integer check(price_cents is null or price_cents>=0),
  image_url text, available boolean not null default true, position integer not null default 0, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists menus.publications(
  id uuid primary key default gen_random_uuid(), menu_id uuid not null references menus.menus(id) on delete cascade,
  version_id uuid not null references menus.versions(id) on delete cascade, idempotency_key text not null,
  published_by uuid references auth.users(id), published_at timestamptz not null default now(), unique(menu_id,idempotency_key)
);
create table if not exists menus.delivery_settings(
  menu_id uuid primary key references menus.menus(id) on delete cascade, whatsapp text not null, pickup_enabled boolean not null default true,
  payment_methods text[] not null default array['PIX','DINHEIRO','CARTAO']::text[], minimum_order_cents integer not null default 0 check(minimum_order_cents>=0),
  updated_at timestamptz not null default now()
);
create table if not exists menus.delivery_areas(
  id uuid primary key default gen_random_uuid(), menu_id uuid not null references menus.menus(id) on delete cascade,
  name text not null check(length(trim(name))>0), fee_cents integer not null check(fee_cents>=0), enabled boolean not null default true,
  position integer not null default 0, unique(menu_id,name)
);
create table if not exists menus.orders(
  id uuid primary key default gen_random_uuid(), menu_id uuid not null references menus.menus(id), publication_version_id uuid not null references menus.versions(id),
  submission_key text not null, customer_name text not null, fulfillment_kind text not null check(fulfillment_kind in('PICKUP','DELIVERY')),
  delivery_area_id uuid references menus.delivery_areas(id), delivery_area_name text, delivery_address text, payment_method text not null, notes text not null default '',
  subtotal_cents integer not null check(subtotal_cents>=0), delivery_fee_cents integer not null check(delivery_fee_cents>=0), total_cents integer not null check(total_cents>=0),
  fingerprint_hash text not null, status text not null default 'HANDED_OFF' check(status in('HANDED_OFF','CANCELED')),
  created_at timestamptz not null default now(), unique(menu_id,submission_key)
);
create table if not exists menus.order_lines(
  id uuid primary key default gen_random_uuid(), order_id uuid not null references menus.orders(id) on delete cascade,
  item_id uuid not null, title text not null, unit_price_cents integer not null check(unit_price_cents>=0), quantity integer not null check(quantity>0), note text not null default '', line_total_cents integer not null check(line_total_cents>=0)
);
create table if not exists menus.rate_limits(
  fingerprint_hash text not null, menu_id uuid not null references menus.menus(id) on delete cascade, window_started_at timestamptz not null,
  attempts integer not null default 1 check(attempts>0), primary key(fingerprint_hash,menu_id,window_started_at)
);

create index if not exists menu_categories_order_idx on menus.categories(menu_id,position,id);
create index if not exists menu_items_order_idx on menus.items(menu_id,category_id,position,id);
create index if not exists menu_versions_recent_idx on menus.versions(menu_id,version desc);
create index if not exists menu_orders_recent_idx on menus.orders(menu_id,created_at desc);
create index if not exists menu_source_batches_idx on menus.source_batches(menu_id,created_at desc);
create unique index if not exists menu_source_batches_runner_job_uidx on menus.source_batches(runner_job_id) where runner_job_id is not null;
alter table menus.categories drop constraint if exists menus_categories_id_menu_unique;
alter table menus.categories add constraint menus_categories_id_menu_unique unique(id,menu_id);
alter table menus.items drop constraint if exists menus_items_category_same_menu_fk;
alter table menus.items add constraint menus_items_category_same_menu_fk foreign key(category_id,menu_id) references menus.categories(id,menu_id) on delete cascade;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('menu-source-images','menu-source-images',false,12582912,array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function menus.unit_for_menu(p_menu_id uuid) returns uuid language sql stable security definer set search_path='' as $$
  select m.unit_id from menus.menus m where m.id=p_menu_id
$$;
revoke all on function menus.unit_for_menu(uuid) from public,anon; grant execute on function menus.unit_for_menu(uuid) to authenticated,service_role;

create or replace function menus.has_entitlement(p_unit_id uuid,p_product text) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from core.entitlements e where e.unit_id=p_unit_id and e.product_code=p_product and e.status in('ACTIVE','GRACE_PERIOD'))
$$;
revoke all on function menus.has_entitlement(uuid,text) from public,anon,authenticated; grant execute on function menus.has_entitlement(uuid,text) to service_role;

alter table menus.source_batches enable row level security;
alter table menus.source_images enable row level security;
alter table menus.categories enable row level security;
alter table menus.items enable row level security;
alter table menus.publications enable row level security;
alter table menus.delivery_settings enable row level security;
alter table menus.delivery_areas enable row level security;
alter table menus.orders enable row level security;
alter table menus.order_lines enable row level security;
alter table menus.rate_limits enable row level security;
alter table menus.menus enable row level security;
alter table menus.versions enable row level security;

drop policy if exists menus_read on menus.menus; drop policy if exists menus_manage on menus.menus;
create policy menus_read on menus.menus for select to authenticated using(unit_id is not null and security.has_permission((select auth.uid()),unit_id,'menu:view'));
create policy menus_edit on menus.menus for update to authenticated using(unit_id is not null and security.has_permission((select auth.uid()),unit_id,'menu:edit')) with check(unit_id is not null and security.has_permission((select auth.uid()),unit_id,'menu:edit'));
create policy versions_read on menus.versions for select to authenticated using(security.has_permission((select auth.uid()),menus.unit_for_menu(menu_id),'menu:view'));
create policy categories_read on menus.categories for select to authenticated using(security.has_permission((select auth.uid()),menus.unit_for_menu(menu_id),'menu:view'));
create policy categories_edit on menus.categories for all to authenticated using(security.has_permission((select auth.uid()),menus.unit_for_menu(menu_id),'menu:edit')) with check(security.has_permission((select auth.uid()),menus.unit_for_menu(menu_id),'menu:edit'));
create policy items_read on menus.items for select to authenticated using(security.has_permission((select auth.uid()),menus.unit_for_menu(menu_id),'menu:view'));
create policy items_edit on menus.items for all to authenticated using(security.has_permission((select auth.uid()),menus.unit_for_menu(menu_id),'menu:edit')) with check(security.has_permission((select auth.uid()),menus.unit_for_menu(menu_id),'menu:edit'));
create policy source_batches_read on menus.source_batches for select to authenticated using(security.has_permission((select auth.uid()),menus.unit_for_menu(menu_id),'menu:view'));
create policy source_images_read on menus.source_images for select to authenticated using(exists(select 1 from menus.source_batches b where b.id=source_batch_id and security.has_permission((select auth.uid()),menus.unit_for_menu(b.menu_id),'menu:view')));
create policy publications_read on menus.publications for select to authenticated using(security.has_permission((select auth.uid()),menus.unit_for_menu(menu_id),'menu:view'));
create policy delivery_settings_read on menus.delivery_settings for select to authenticated using(security.has_permission((select auth.uid()),menus.unit_for_menu(menu_id),'menu:view'));
create policy delivery_settings_manage on menus.delivery_settings for all to authenticated using(security.has_permission((select auth.uid()),menus.unit_for_menu(menu_id),'delivery:manage')) with check(security.has_permission((select auth.uid()),menus.unit_for_menu(menu_id),'delivery:manage'));
create policy delivery_areas_read on menus.delivery_areas for select to authenticated using(security.has_permission((select auth.uid()),menus.unit_for_menu(menu_id),'menu:view'));
create policy delivery_areas_manage on menus.delivery_areas for all to authenticated using(security.has_permission((select auth.uid()),menus.unit_for_menu(menu_id),'delivery:manage')) with check(security.has_permission((select auth.uid()),menus.unit_for_menu(menu_id),'delivery:manage'));
create policy orders_read on menus.orders for select to authenticated using(security.has_permission((select auth.uid()),menus.unit_for_menu(menu_id),'delivery:manage'));
create policy order_lines_read on menus.order_lines for select to authenticated using(exists(select 1 from menus.orders o where o.id=order_id and security.has_permission((select auth.uid()),menus.unit_for_menu(o.menu_id),'delivery:manage')));

create or replace function menus.publish_menu_version(p_menu_id uuid,p_reason text,p_actor_id uuid,p_idempotency_key text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_menu menus.menus%rowtype; v_version integer; v_version_id uuid; v_snapshot jsonb;
begin
  select * into v_menu from menus.menus where id=p_menu_id for update; if not found then raise exception 'MENU_NOT_FOUND'; end if;
  select p.version_id into v_version_id from menus.publications p where p.menu_id=p_menu_id and p.idempotency_key=p_idempotency_key; if v_version_id is not null then return v_version_id; end if;
  select coalesce(max(v.version),0)+1 into v_version from menus.versions v where v.menu_id=p_menu_id;
  select jsonb_build_object(
    'profile',jsonb_build_object('name',v_menu.name,'description',v_menu.description,'coverImageUrl',v_menu.cover_image_url,'logoImageUrl',v_menu.logo_image_url,'address',v_menu.address,'phone',v_menu.phone,'theme',v_menu.theme),
    'categories',coalesce(jsonb_agg(category_row order by category_position),'[]'::jsonb)
  ) into v_snapshot
  from (
    select c.position category_position,jsonb_build_object('id',c.id,'name',c.name,'description',c.description,'position',c.position,
      'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'title',i.title,'description',i.description,'priceCents',i.price_cents,'imageUrl',i.image_url,'available',i.available,'position',i.position) order by i.position,i.id) from menus.items i where i.category_id=c.id),'[]'::jsonb)) category_row
    from menus.categories c where c.menu_id=p_menu_id and c.active=true
  ) q;
  insert into menus.versions(menu_id,version,snapshot,reason) values(p_menu_id,v_version,coalesce(v_snapshot,jsonb_build_object('profile',jsonb_build_object('name',v_menu.name),'categories','[]'::jsonb)),p_reason) returning id into v_version_id;
  insert into menus.publications(menu_id,version_id,idempotency_key,published_by) values(p_menu_id,v_version_id,p_idempotency_key,p_actor_id);
  update menus.menus set current_publication_id=v_version_id,updated_at=now() where id=p_menu_id;
  return v_version_id;
end $$;
revoke all on function menus.publish_menu_version(uuid,text,uuid,text) from public,anon,authenticated; grant execute on function menus.publish_menu_version(uuid,text,uuid,text) to service_role;

create or replace function menus.accept_menu_extraction(p_source_batch_id uuid,p_extraction jsonb,p_job_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_batch menus.source_batches%rowtype; v_category jsonb; v_item jsonb; v_category_id uuid; v_position integer:=0; v_item_position integer; v_version_id uuid;
begin
  select * into v_batch from menus.source_batches where id=p_source_batch_id for update; if not found then raise exception 'SOURCE_BATCH_NOT_FOUND'; end if;
  if v_batch.published_version_id is not null then return v_batch.published_version_id; end if;
  if jsonb_typeof(p_extraction->'categories')<>'array' or jsonb_array_length(p_extraction->'categories')=0 then raise exception 'INVALID_EXTRACTION'; end if;
  delete from menus.items where menu_id=v_batch.menu_id; delete from menus.categories where menu_id=v_batch.menu_id;
  for v_category in select value from jsonb_array_elements(p_extraction->'categories') loop
    if length(trim(coalesce(v_category->>'name','')))=0 then raise exception 'INVALID_CATEGORY'; end if;
    insert into menus.categories(menu_id,name,position) values(v_batch.menu_id,trim(v_category->>'name'),v_position) returning id into v_category_id; v_position:=v_position+1; v_item_position:=0;
    for v_item in select value from jsonb_array_elements(v_category->'items') loop
      if length(trim(coalesce(v_item->>'title','')))=0 then raise exception 'INVALID_ITEM'; end if;
      insert into menus.items(menu_id,category_id,title,description,price_cents,position,metadata)
      values(v_batch.menu_id,v_category_id,trim(v_item->>'title'),trim(coalesce(v_item->>'description','')),case when v_item ? 'priceCents' then (v_item->>'priceCents')::integer else null end,v_item_position,jsonb_build_object('extractionConfidence',coalesce((v_item->>'confidence')::numeric,0)));
      v_item_position:=v_item_position+1;
    end loop;
  end loop;
  v_version_id:=menus.publish_menu_version(v_batch.menu_id,'AI_EXTRACTION',v_batch.created_by,'source-batch:'||v_batch.id::text);
  update menus.source_batches set status='PUBLISHED',runner_job_id=p_job_id,published_version_id=v_version_id,updated_at=now() where id=v_batch.id;
  return v_version_id;
end $$;
revoke all on function menus.accept_menu_extraction(uuid,jsonb,uuid) from public,anon,authenticated; grant execute on function menus.accept_menu_extraction(uuid,jsonb,uuid) to service_role;

create or replace function menus.rollback_menu_version(p_menu_id uuid,p_version_id uuid,p_actor_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from menus.versions v where v.id=p_version_id and v.menu_id=p_menu_id) then raise exception 'VERSION_NOT_FOUND'; end if;
 update menus.menus set current_publication_id=p_version_id,updated_at=now() where id=p_menu_id;
 insert into menus.publications(menu_id,version_id,idempotency_key,published_by) values(p_menu_id,p_version_id,'rollback:'||gen_random_uuid()::text,p_actor_id);
end $$;
revoke all on function menus.rollback_menu_version(uuid,uuid,uuid) from public,anon,authenticated; grant execute on function menus.rollback_menu_version(uuid,uuid,uuid) to service_role;

create or replace function menus.get_public_menu(p_slug text,p_require_delivery boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_menu menus.menus%rowtype; v_version menus.versions%rowtype; v_delivery jsonb;
begin
 select * into v_menu from menus.menus where slug=p_slug and status='ACTIVE'; if not found or v_menu.current_publication_id is null then return null; end if;
 if v_menu.unit_id is null then if v_menu.prospect_id is null or p_require_delivery then return null; end if; else if not menus.has_entitlement(v_menu.unit_id,'MENU') then return null; end if; if p_require_delivery and not menus.has_entitlement(v_menu.unit_id,'WHATSAPP_DELIVERY') then return null; end if; end if;
 select * into v_version from menus.versions where id=v_menu.current_publication_id and menu_id=v_menu.id; if not found then return null; end if;
 if p_require_delivery then select jsonb_build_object('whatsapp',d.whatsapp,'pickupEnabled',d.pickup_enabled,'paymentMethods',d.payment_methods,'minimumOrderCents',d.minimum_order_cents,'areas',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'feeCents',a.fee_cents) order by a.position,a.name) from menus.delivery_areas a where a.menu_id=v_menu.id and a.enabled=true),'[]'::jsonb)) into v_delivery from menus.delivery_settings d where d.menu_id=v_menu.id; if v_delivery is null then return null; end if; end if;
 return jsonb_build_object('menuId',v_menu.id,'slug',v_menu.slug,'publicationVersionId',v_version.id,'snapshot',v_version.snapshot,'delivery',v_delivery);
end $$;
revoke all on function menus.get_public_menu(text,boolean) from public; grant execute on function menus.get_public_menu(text,boolean) to anon,authenticated,service_role;

create or replace function menus.create_delivery_order(p_slug text,p_submission_key text,p_fingerprint_hash text,p_customer_name text,p_fulfillment_kind text,p_delivery_area_id uuid,p_address text,p_payment_method text,p_notes text,p_lines jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_menu menus.menus%rowtype; v_version menus.versions%rowtype; v_settings menus.delivery_settings%rowtype; v_area menus.delivery_areas%rowtype; v_order_id uuid; v_line jsonb; v_item jsonb; v_quantity integer; v_price integer; v_subtotal integer:=0; v_fee integer:=0; v_window timestamptz:=date_trunc('minute',now())-make_interval(mins => mod(extract(minute from now())::integer,10)); v_attempts integer; v_existing jsonb;
begin
 select * into v_menu from menus.menus where slug=p_slug and status='ACTIVE' for share; if not found or v_menu.unit_id is null or v_menu.current_publication_id is null then raise exception 'DELIVERY_UNAVAILABLE'; end if;
 if not menus.has_entitlement(v_menu.unit_id,'MENU') or not menus.has_entitlement(v_menu.unit_id,'WHATSAPP_DELIVERY') then raise exception 'DELIVERY_UNAVAILABLE'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_menu.id::text||':'||p_submission_key,0));
 select * into v_settings from menus.delivery_settings where menu_id=v_menu.id; if not found then raise exception 'DELIVERY_NOT_CONFIGURED'; end if;
 if length(trim(coalesce(p_submission_key,'')))<16 then raise exception 'INVALID_SUBMISSION_KEY'; end if; if length(trim(coalesce(p_customer_name,'')))<2 then raise exception 'CUSTOMER_NAME_REQUIRED'; end if;
 select jsonb_build_object(
   'id',o.id,'whatsapp',v_settings.whatsapp,'customerName',o.customer_name,
   'fulfillment',case when o.fulfillment_kind='DELIVERY' then jsonb_build_object('kind','DELIVERY','address',o.delivery_address,'areaName',o.delivery_area_name,'feeCents',o.delivery_fee_cents) else jsonb_build_object('kind','PICKUP') end,
   'paymentMethod',o.payment_method,'notes',o.notes,
   'lines',coalesce((select jsonb_agg(jsonb_build_object('title',l.title,'unitPriceCents',l.unit_price_cents,'quantity',l.quantity,'note',l.note) order by l.id) from menus.order_lines l where l.order_id=o.id),'[]'::jsonb),
   'totalCents',o.total_cents
 ) into v_existing from menus.orders o where o.menu_id=v_menu.id and o.submission_key=p_submission_key; if v_existing is not null then return v_existing; end if;
 insert into menus.rate_limits(fingerprint_hash,menu_id,window_started_at,attempts) values(p_fingerprint_hash,v_menu.id,v_window,1) on conflict(fingerprint_hash,menu_id,window_started_at) do update set attempts=menus.rate_limits.attempts+1 returning attempts into v_attempts; if v_attempts>8 then raise exception 'RATE_LIMITED'; end if;
 select * into v_version from menus.versions where id=v_menu.current_publication_id and menu_id=v_menu.id; if not found then raise exception 'PUBLICATION_NOT_FOUND'; end if;
 if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'EMPTY_CART'; end if; if jsonb_array_length(p_lines)>100 then raise exception 'CART_TOO_LARGE'; end if;
 if p_fulfillment_kind='DELIVERY' then select * into v_area from menus.delivery_areas where id=p_delivery_area_id and menu_id=v_menu.id and enabled=true; if not found then raise exception 'INVALID_DELIVERY_AREA'; end if; if length(trim(coalesce(p_address,'')))<5 then raise exception 'ADDRESS_REQUIRED'; end if; v_fee:=v_area.fee_cents; elsif p_fulfillment_kind='PICKUP' then if not v_settings.pickup_enabled then raise exception 'PICKUP_DISABLED'; end if; else raise exception 'INVALID_FULFILLMENT'; end if;
 if not p_payment_method=any(v_settings.payment_methods) then raise exception 'INVALID_PAYMENT_METHOD'; end if;
 for v_line in select value from jsonb_array_elements(p_lines) loop
   v_quantity:=(v_line->>'quantity')::integer; if v_quantity<=0 or v_quantity>99 then raise exception 'INVALID_QUANTITY'; end if;
   select item into v_item from jsonb_array_elements(v_version.snapshot->'categories') c cross join lateral jsonb_array_elements(c->'items') item where item->>'id'=v_line->>'itemId' and coalesce((item->>'available')::boolean,true)=true limit 1;
   if v_item is null or not(v_item ? 'priceCents') or v_item->>'priceCents' is null then raise exception 'ITEM_NOT_ORDERABLE'; end if; v_price:=(v_item->>'priceCents')::integer; v_subtotal:=v_subtotal+(v_price*v_quantity);
 end loop;
 if v_subtotal<v_settings.minimum_order_cents then raise exception 'MINIMUM_ORDER_NOT_MET'; end if;
 insert into menus.orders(menu_id,publication_version_id,submission_key,customer_name,fulfillment_kind,delivery_area_id,delivery_area_name,delivery_address,payment_method,notes,subtotal_cents,delivery_fee_cents,total_cents,fingerprint_hash)
 values(v_menu.id,v_version.id,p_submission_key,trim(p_customer_name),p_fulfillment_kind,case when p_fulfillment_kind='DELIVERY' then v_area.id end,case when p_fulfillment_kind='DELIVERY' then v_area.name end,case when p_fulfillment_kind='DELIVERY' then trim(p_address) end,p_payment_method,trim(coalesce(p_notes,'')),v_subtotal,v_fee,v_subtotal+v_fee,p_fingerprint_hash) returning id into v_order_id;
 for v_line in select value from jsonb_array_elements(p_lines) loop
   v_quantity:=(v_line->>'quantity')::integer; select item into v_item from jsonb_array_elements(v_version.snapshot->'categories') c cross join lateral jsonb_array_elements(c->'items') item where item->>'id'=v_line->>'itemId' limit 1; v_price:=(v_item->>'priceCents')::integer;
   insert into menus.order_lines(order_id,item_id,title,unit_price_cents,quantity,note,line_total_cents) values(v_order_id,(v_item->>'id')::uuid,v_item->>'title',v_price,v_quantity,left(trim(coalesce(v_line->>'note','')),1000),v_price*v_quantity);
 end loop;
 return jsonb_build_object('id',v_order_id,'whatsapp',v_settings.whatsapp,'customerName',trim(p_customer_name),'fulfillment',case when p_fulfillment_kind='DELIVERY' then jsonb_build_object('kind','DELIVERY','address',trim(p_address),'areaName',v_area.name,'feeCents',v_fee) else jsonb_build_object('kind','PICKUP') end,'paymentMethod',p_payment_method,'notes',trim(coalesce(p_notes,'')),'lines',(select jsonb_agg(jsonb_build_object('title',l.title,'unitPriceCents',l.unit_price_cents,'quantity',l.quantity,'note',l.note) order by l.id) from menus.order_lines l where l.order_id=v_order_id),'totalCents',v_subtotal+v_fee);
end $$;
revoke all on function menus.create_delivery_order(text,text,text,text,text,uuid,text,text,text,jsonb) from public,anon,authenticated; grant execute on function menus.create_delivery_order(text,text,text,text,text,uuid,text,text,text,jsonb) to service_role;
revoke insert,update,delete on menus.versions from authenticated,anon;
