-- =============================================================================
-- Schema public — estrutura (sem dados)
-- Origem: projeto Supabase odwhmyxgpmbxqzxtbxwl (us-east-1), PostgreSQL 17.6
-- Gerado em: 2026-10-20 via Management API (consultas somente leitura
-- ao catálogo: pg_class, pg_attribute, pg_constraint, pg_index, pg_policies,
-- pg_get_functiondef, pg_get_triggerdef, pg_publication_tables).
-- Ordem: extensões -> tipos -> tabelas (PK/UNIQUE/CHECK) -> FKs -> índices ->
-- funções -> RLS -> políticas -> triggers -> publicação realtime.
-- Pensado para rodar do zero num projeto Supabase vazio.
-- =============================================================================

SET check_function_bodies = false;
SET search_path = public, extensions;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
CREATE TYPE public.cautela_status AS ENUM ('ok', 'missing', 'damaged');

CREATE TYPE public.nf_status AS ENUM ('pending', 'waiting_order', 'waiting_docs', 'waiting_schedule', 'paid', 'rc_created');

CREATE TYPE public.transaction_type AS ENUM ('borrow', 'return', 'cautela_check', 'inventory_adjustment');

CREATE TYPE public.user_role AS ENUM ('Administrador', 'Operador');

-- -----------------------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------------------
CREATE TABLE public.app_avatar_sprite_chunks (
  chunk_index integer NOT NULL,
  chunk_text text NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT app_avatar_sprite_chunks_pkey PRIMARY KEY (chunk_index)
);

CREATE TABLE public.app_notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_registration text NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  action_screen text,
  entity_type text,
  entity_id uuid,
  is_read boolean DEFAULT false NOT NULL,
  dismissed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT app_notifications_pkey PRIMARY KEY (id)
);

CREATE TABLE public.avatars_catalog (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  url text NOT NULL,
  category text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT avatars_catalog_pkey PRIMARY KEY (id)
);

CREATE TABLE public.branches (
  id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  name text NOT NULL,
  city text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT branches_pkey PRIMARY KEY (id),
  CONSTRAINT branches_name_key UNIQUE (name)
);

CREATE TABLE public.cautela_audit_items (
  id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  audit_id uuid,
  tool_id uuid,
  status text NOT NULL,
  obs text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT cautela_audit_items_pkey PRIMARY KEY (id),
  CONSTRAINT cautela_audit_items_status_check CHECK ((status = ANY (ARRAY['ok'::text, 'missing'::text, 'damaged'::text])))
);

CREATE TABLE public.cautela_audits (
  id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  user_id text NOT NULL,
  branch_id uuid,
  check_date timestamp with time zone DEFAULT now(),
  signature_url text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT cautela_audits_pkey PRIMARY KEY (id)
);

CREATE TABLE public.cautelas (
  id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  user_id text,
  tool_id uuid,
  status cautela_status DEFAULT 'ok'::cautela_status,
  obs text,
  photos text[],
  last_check timestamp with time zone,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  branch_id uuid,
  type text DEFAULT 'caution'::text,
  CONSTRAINT cautelas_pkey PRIMARY KEY (id),
  CONSTRAINT cautelas_user_id_tool_id_key UNIQUE (user_id, tool_id)
);

CREATE TABLE public.cautelia_audit_items (
  id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  audit_id uuid,
  tool_id uuid,
  status text NOT NULL,
  obs text,
  created_at timestamp with time zone DEFAULT now(),
  stock_tool_id uuid,
  quantity integer DEFAULT 1,
  issue_type text,
  photo_url text,
  CONSTRAINT cautelia_audit_items_pkey PRIMARY KEY (id)
);

CREATE TABLE public.cautelia_audits (
  id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  user_id text NOT NULL,
  branch_id uuid,
  check_date timestamp with time zone DEFAULT now(),
  signature_url text,
  created_at timestamp with time zone DEFAULT now(),
  status text DEFAULT 'pending'::text,
  type text DEFAULT 'caution'::text,
  operator_id text,
  obs text,
  tool_photo_url text,
  CONSTRAINT cautelia_audits_pkey PRIMARY KEY (id)
);

CREATE TABLE public.cautelia_reports (
  id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  user_id text NOT NULL,
  tool_id uuid,
  status text DEFAULT 'ok'::text,
  last_check timestamp with time zone DEFAULT now(),
  responsible_name text,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT cautelia_reports_pkey PRIMARY KEY (id),
  CONSTRAINT cautelia_reports_user_id_tool_id_key UNIQUE (user_id, tool_id),
  CONSTRAINT unique_user_tool UNIQUE (user_id, tool_id),
  CONSTRAINT cautelia_reports_status_check CHECK ((status = ANY (ARRAY['ok'::text, 'missing'::text, 'damaged'::text])))
);

CREATE TABLE public.cautelia_standard_tools (
  id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  name text NOT NULL,
  category text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT cautelia_standard_tools_pkey PRIMARY KEY (id),
  CONSTRAINT cautelia_standard_tools_name_key UNIQUE (name)
);

CREATE TABLE public.client_employees (
  id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  client_id uuid NOT NULL,
  name text NOT NULL,
  registration text,
  role text,
  phone text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT client_employees_pkey PRIMARY KEY (id)
);

CREATE TABLE public.clients (
  id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  name text NOT NULL,
  document text,
  contact_name text,
  contact_phone text,
  contact_email text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT clients_pkey PRIMARY KEY (id)
);

CREATE TABLE public.nfs (
  id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  supplier text,
  date date,
  invoice_number text,
  amount numeric(12,2),
  payment_date date,
  order_number text,
  status nf_status DEFAULT 'pending'::nf_status,
  obs text,
  file_url text,
  boleto_url text,
  is_tool boolean DEFAULT false,
  cautela_id uuid,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  type text DEFAULT 'consumo'::text,
  responsible_registration text,
  tool_name text,
  quantity integer DEFAULT 1,
  branch_id uuid,
  ticket_number text,
  classification text DEFAULT 'Diversos'::text,
  boleto_urls text[] DEFAULT '{}'::text[],
  line_number text,
  is_volvo boolean DEFAULT false,
  delivery_invoice_url text,
  delivery_invoice_number text,
  tool_code text,
  group_id uuid,
  CONSTRAINT nfs_pkey PRIMARY KEY (id)
);

CREATE TABLE public.tool_handovers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tool_id uuid NOT NULL,
  request_id uuid,
  lender_registration text NOT NULL,
  borrower_registration text NOT NULL,
  original_owner_registration text,
  handover_type text NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  returned_at timestamp with time zone,
  CONSTRAINT tool_handovers_pkey PRIMARY KEY (id),
  CONSTRAINT tool_handovers_handover_type_check CHECK ((handover_type = ANY (ARRAY['peer_loan'::text, 'loan_transfer'::text, 'transfer'::text]))),
  CONSTRAINT tool_handovers_status_check CHECK ((status = ANY (ARRAY['active'::text, 'returned'::text, 'cancelled'::text])))
);

CREATE TABLE public.tool_issues (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tool_id uuid,
  reported_by text NOT NULL,
  issue_type text NOT NULL,
  notes text,
  status text DEFAULT 'open'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  resolved_at timestamp with time zone,
  standard_tool_id uuid,
  signature_url text,
  photo_url text,
  audit_id uuid,
  CONSTRAINT tool_issues_pkey PRIMARY KEY (id),
  CONSTRAINT tool_issues_issue_type_check CHECK ((issue_type = ANY (ARRAY['damaged'::text, 'missing'::text, 'malfunction'::text, 'part_missing'::text, 'lost'::text, 'wear'::text, 'other'::text]))),
  CONSTRAINT tool_issues_status_check CHECK ((status = ANY (ARRAY['open'::text, 'reviewing'::text, 'resolved'::text, 'closed'::text]))),
  CONSTRAINT tool_issues_target_check CHECK ((num_nonnulls(tool_id, standard_tool_id) = 1))
);

CREATE TABLE public.tool_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tool_id uuid NOT NULL,
  requester_registration text NOT NULL,
  holder_registration text NOT NULL,
  source_bond text DEFAULT 'unknown'::text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  message text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  responded_at timestamp with time zone,
  completed_at timestamp with time zone,
  CONSTRAINT tool_requests_pkey PRIMARY KEY (id),
  CONSTRAINT tool_requests_source_bond_check CHECK ((source_bond = ANY (ARRAY['caution'::text, 'loan'::text, 'unknown'::text]))),
  CONSTRAINT tool_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'refused'::text, 'cancelled'::text, 'completed'::text])))
);

CREATE TABLE public.tools (
  id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  branch text,
  quantity_available integer DEFAULT 0,
  cautela_quantity integer DEFAULT 0,
  borrowed_quantity integer DEFAULT 0,
  image_url text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  branch_id uuid,
  status text DEFAULT 'disponivel'::text,
  image_urls text[] DEFAULT '{}'::text[],
  location text,
  brand text,
  CONSTRAINT tools_pkey PRIMARY KEY (id),
  CONSTRAINT tools_code_branch_key UNIQUE (code, branch_id)
);

CREATE TABLE public.tools_emergency_snapshot_20260818 (
  id uuid,
  code text,
  name text,
  branch text,
  quantity_available integer,
  cautela_quantity integer,
  borrowed_quantity integer,
  image_url text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  branch_id uuid,
  status text,
  image_urls text[],
  location text,
  brand text
);

CREATE TABLE public.transactions (
  id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  tool_id uuid,
  user_id text,
  type transaction_type NOT NULL,
  quantity integer DEFAULT 1 NOT NULL,
  branch text,
  photos text[],
  signature_url text,
  status text DEFAULT 'confirmed'::text,
  obs text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  branch_id uuid,
  CONSTRAINT transactions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.users_access (
  id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
  name text NOT NULL,
  registration text,
  role text DEFAULT 'Operador'::text NOT NULL,
  branch_id uuid,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  avatar_url text NOT NULL,
  profile_completed boolean DEFAULT false NOT NULL,
  CONSTRAINT users_access_pkey PRIMARY KEY (id),
  CONSTRAINT users_access_registration_key UNIQUE (registration),
  CONSTRAINT users_access_avatar_url_allowed CHECK (((avatar_url IS NULL) OR (avatar_url ~ '^/api/avatar/(fox|gorilla|jaguar|panther|armadillo|bison|bear|beaver|wolf|rhino)$'::text) OR (avatar_url ~ '^https?://'::text)))
);

-- -----------------------------------------------------------------------------
-- Chaves estrangeiras
-- -----------------------------------------------------------------------------
ALTER TABLE ONLY public.cautela_audit_items ADD CONSTRAINT cautela_audit_items_audit_id_fkey FOREIGN KEY (audit_id) REFERENCES cautela_audits(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.cautela_audit_items ADD CONSTRAINT cautela_audit_items_tool_id_fkey FOREIGN KEY (tool_id) REFERENCES tools(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.cautela_audits ADD CONSTRAINT cautela_audits_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id);

ALTER TABLE ONLY public.cautelas ADD CONSTRAINT cautelas_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id);

ALTER TABLE ONLY public.cautelas ADD CONSTRAINT cautelas_tool_id_fkey FOREIGN KEY (tool_id) REFERENCES tools(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.cautelia_audit_items ADD CONSTRAINT cautelia_audit_items_audit_id_fkey FOREIGN KEY (audit_id) REFERENCES cautelia_audits(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.cautelia_audit_items ADD CONSTRAINT cautelia_audit_items_stock_tool_id_fkey FOREIGN KEY (stock_tool_id) REFERENCES tools(id);

ALTER TABLE ONLY public.cautelia_audit_items ADD CONSTRAINT cautelia_audit_items_tool_id_fkey FOREIGN KEY (tool_id) REFERENCES cautelia_standard_tools(id);

ALTER TABLE ONLY public.cautelia_reports ADD CONSTRAINT cautelia_reports_tool_id_fkey FOREIGN KEY (tool_id) REFERENCES cautelia_standard_tools(id);

ALTER TABLE ONLY public.client_employees ADD CONSTRAINT client_employees_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.nfs ADD CONSTRAINT nfs_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id);

ALTER TABLE ONLY public.nfs ADD CONSTRAINT nfs_cautela_id_fkey FOREIGN KEY (cautela_id) REFERENCES cautelas(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.tool_handovers ADD CONSTRAINT tool_handovers_request_id_fkey FOREIGN KEY (request_id) REFERENCES tool_requests(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.tool_handovers ADD CONSTRAINT tool_handovers_tool_id_fkey FOREIGN KEY (tool_id) REFERENCES tools(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tool_issues ADD CONSTRAINT tool_issues_audit_id_fkey FOREIGN KEY (audit_id) REFERENCES cautelia_audits(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.tool_issues ADD CONSTRAINT tool_issues_standard_tool_id_fkey FOREIGN KEY (standard_tool_id) REFERENCES cautelia_standard_tools(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tool_issues ADD CONSTRAINT tool_issues_tool_id_fkey FOREIGN KEY (tool_id) REFERENCES tools(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tool_requests ADD CONSTRAINT tool_requests_tool_id_fkey FOREIGN KEY (tool_id) REFERENCES tools(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tools ADD CONSTRAINT tools_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id);

ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id);

ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_tool_id_fkey FOREIGN KEY (tool_id) REFERENCES tools(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.users_access ADD CONSTRAINT users_access_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- Índices (exceto os que sustentam PK/UNIQUE)
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX app_notifications_entity_unique_idx ON public.app_notifications USING btree (user_registration, type, entity_type, entity_id) WHERE (entity_id IS NOT NULL);

CREATE INDEX app_notifications_unread_idx ON public.app_notifications USING btree (user_registration, is_read, created_at DESC) WHERE (dismissed_at IS NULL);

CREATE INDEX app_notifications_user_idx ON public.app_notifications USING btree (user_registration, created_at DESC);

CREATE INDEX idx_cautela_audit_items_audit ON public.cautela_audit_items USING btree (audit_id);

CREATE INDEX idx_cautela_audits_user ON public.cautela_audits USING btree (user_id);

CREATE INDEX idx_cautelas_user_id ON public.cautelas USING btree (user_id);

CREATE INDEX cautelia_reports_user_last_check_idx ON public.cautelia_reports USING btree (user_id, last_check DESC);

CREATE INDEX idx_client_employees_client_id ON public.client_employees USING btree (client_id);

CREATE INDEX idx_nfs_status ON public.nfs USING btree (status);

CREATE INDEX tool_handovers_borrower_idx ON public.tool_handovers USING btree (borrower_registration, created_at DESC);

CREATE INDEX tool_handovers_lender_idx ON public.tool_handovers USING btree (lender_registration, created_at DESC);

CREATE UNIQUE INDEX tool_handovers_one_active_per_tool_idx ON public.tool_handovers USING btree (tool_id) WHERE (status = 'active'::text);

CREATE INDEX tool_handovers_tool_idx ON public.tool_handovers USING btree (tool_id, created_at DESC);

CREATE INDEX tool_issues_reporter_idx ON public.tool_issues USING btree (reported_by, created_at DESC);

CREATE INDEX tool_issues_standard_tool_user_idx ON public.tool_issues USING btree (standard_tool_id, reported_by, status);

CREATE INDEX tool_issues_tool_idx ON public.tool_issues USING btree (tool_id, created_at DESC);

CREATE INDEX tool_requests_holder_idx ON public.tool_requests USING btree (holder_registration, created_at DESC);

CREATE INDEX tool_requests_requester_idx ON public.tool_requests USING btree (requester_registration, created_at DESC);

CREATE INDEX tool_requests_tool_idx ON public.tool_requests USING btree (tool_id, created_at DESC);

CREATE INDEX idx_tools_branch ON public.tools USING btree (branch);

CREATE INDEX idx_tools_code ON public.tools USING btree (code);

CREATE INDEX idx_transactions_tool_id ON public.transactions USING btree (tool_id);

CREATE INDEX idx_transactions_user_id ON public.transactions USING btree (user_id);

-- -----------------------------------------------------------------------------
-- Funções
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.block_tool_delete_during_recovery()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if current_user in ('anon','authenticated') then
    raise exception 'Exclusão de ferramentas temporariamente bloqueada durante recuperação do inventário.' using errcode = 'P0001';
  end if;
  return old;
end;
$function$;

CREATE OR REPLACE FUNCTION public.canonicalize_users_access_avatar()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.avatar_url := public.normalize_shared_avatar(new.avatar_url, new.registration);
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.default_shared_avatar(p_key text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  source_text text := coalesce(nullif(trim(p_key), ''), 'ferramentaria');
  hash_value bigint := 0;
  avatar_ids text[] := array['fox','gorilla','jaguar','panther','armadillo','bison','bear','beaver','wolf','rhino'];
  index_value integer;
  position_value integer;
begin
  for position_value in 1..char_length(source_text) loop
    hash_value := mod(hash_value * 31 + ascii(substr(source_text, position_value, 1)), 4294967296);
  end loop;
  index_value := mod(hash_value, array_length(avatar_ids, 1))::integer + 1;
  return '/api/avatar/' || avatar_ids[index_value];
end;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_users_access_avatar()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.avatar_url is null
     or btrim(new.avatar_url) = ''
     or new.avatar_url <> all (array[
       '/avatars/guardian.webp',
       '/avatars/voltage.webp',
       '/avatars/crystal.webp',
       '/avatars/radar.webp',
       '/avatars/forge.webp',
       '/avatars/operator.webp'
     ]) then
    new.avatar_url := public.ferramentaria_avatar_for_key(
      coalesce(new.registration, new.id::text, new.name)
    );
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ferramentaria_avatar_for_key(p_key text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  source_key text := coalesce(nullif(btrim(p_key), ''), 'ferramentaria');
  hash_value bigint := 0;
  position_index integer;
  avatar_index integer;
begin
  for position_index in 1..char_length(source_key) loop
    hash_value := mod(
      hash_value * 31 + ascii(substr(source_key, position_index, 1)),
      4294967296
    );
  end loop;

  avatar_index := mod(hash_value, 6)::integer;

  return (array[
    '/avatars/guardian.webp',
    '/avatars/voltage.webp',
    '/avatars/crystal.webp',
    '/avatars/radar.webp',
    '/avatars/forge.webp',
    '/avatars/operator.webp'
  ])[avatar_index + 1];
end;
$function$;

CREATE OR REPLACE FUNCTION public.normalize_shared_avatar(p_value text, p_key text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  avatar text := trim(coalesce(p_value, ''));
begin
  if avatar ~ '^/api/avatar/(fox|gorilla|jaguar|panther|armadillo|bison|bear|beaver|wolf|rhino)(\?.*)?$' then
    return regexp_replace(avatar, '\?.*$', '');
  end if;

  if avatar ~ '^https?://[^/]+/api/avatar/(fox|gorilla|jaguar|panther|armadillo|bison|bear|beaver|wolf|rhino)(\?.*)?$' then
    return regexp_replace(avatar, '^https?://[^/]+(/api/avatar/[^?]+).*$','\1');
  end if;

  if avatar ~ '^https?://' and avatar !~* 'api\.dicebear\.com' and avatar !~ '/avatars/' then
    return avatar;
  end if;

  return public.default_shared_avatar(p_key);
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_admins_on_new_cautela()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_user_name text;
  v_tool_name text;
  v_kind text := lower(coalesce(new.type, 'caution'));
  v_title text;
  v_message text;
begin
  select name
    into v_user_name
  from public.users_access
  where registration = new.user_id
  limit 1;

  select name
    into v_tool_name
  from public.tools
  where id = new.tool_id
  limit 1;

  v_title := case
    when v_kind = 'loan' then 'Novo empréstimo registrado'
    else 'Nova cautela registrada'
  end;

  v_message := format(
    '%s recebeu %s como %s.',
    coalesce(nullif(v_user_name, ''), 'Colaborador ' || coalesce(new.user_id, 'não identificado')),
    coalesce(nullif(v_tool_name, ''), 'uma ferramenta'),
    case when v_kind = 'loan' then 'empréstimo' else 'cautela' end
  );

  insert into public.app_notifications (
    user_registration,
    type,
    title,
    message,
    action_screen,
    entity_type,
    entity_id,
    is_read
  )
  select
    registration,
    'caution_activity',
    v_title,
    v_message,
    'caution',
    'cautela',
    new.id,
    false
  from public.users_access
  where active = true
    and role = 'Administrador';

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_tool_handover_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tool_name text;
  v_lender_name text;
  v_borrower_name text;
  v_is_peer boolean := lower(coalesce(new.handover_type, '')) = 'peer_loan';
  v_admin_title text;
  v_admin_message text;
begin
  select name into v_tool_name from public.tools where id = new.tool_id;
  select name into v_lender_name from public.users_access where registration = new.lender_registration limit 1;
  select name into v_borrower_name from public.users_access where registration = new.borrower_registration limit 1;

  insert into public.app_notifications (
    user_registration, type, title, message, action_screen, entity_type, entity_id
  ) values (
    new.borrower_registration,
    'tool_handover',
    case when v_is_peer then 'Ferramenta emprestada para você' else 'Responsabilidade transferida para você' end,
    coalesce(v_tool_name, 'Uma ferramenta') || case when v_is_peer then ' foi emprestada para você por ' else ' teve a responsabilidade transferida para você por ' end || coalesce(v_lender_name, new.lender_registration) || ' (#' || new.lender_registration || ').',
    'my-tools',
    'tool_handover',
    new.id
  );

  v_admin_title := case when v_is_peer then 'Empréstimo entre colaboradores' else 'Transferência entre colaboradores' end;
  v_admin_message := coalesce(v_tool_name, 'Ferramenta') || ': ' || coalesce(v_lender_name, new.lender_registration) || ' (#' || new.lender_registration || ') → ' || coalesce(v_borrower_name, new.borrower_registration) || ' (#' || new.borrower_registration || ').';

  insert into public.app_notifications (
    user_registration, type, title, message, action_screen, entity_type, entity_id, is_read
  )
  select
    ua.registration,
    'handover_activity',
    v_admin_title,
    v_admin_message,
    'history',
    'tool_handover',
    new.id,
    false
  from public.users_access ua
  where ua.active = true
    and ua.role = 'Administrador';

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_tool_request_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  tool_name text;
begin
  select name into tool_name from public.tools where id = new.tool_id;
  insert into public.app_notifications (
    user_registration, type, title, message, action_screen, entity_type, entity_id
  ) values (
    new.holder_registration,
    'tool_request',
    'Pedido de ferramenta',
    new.requester_registration || ' pediu ' || coalesce(tool_name, 'uma ferramenta') || '.',
    'orders',
    'tool_request',
    new.id
  ) on conflict do nothing;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_tool_request_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  tool_name text;
  status_title text;
  status_message text;
begin
  if new.status is distinct from old.status then
    select name into tool_name from public.tools where id = new.tool_id;
    status_title := case new.status
      when 'accepted' then 'Pedido aceito'
      when 'refused' then 'Pedido recusado'
      when 'cancelled' then 'Pedido cancelado'
      when 'completed' then 'Ferramenta entregue'
      else 'Pedido atualizado'
    end;
    status_message := coalesce(tool_name, 'A ferramenta') || ' teve o pedido atualizado para ' || new.status || '.';

    insert into public.app_notifications (
      user_registration, type, title, message, action_screen, entity_type, entity_id
    ) values (
      new.requester_registration,
      'tool_request_' || new.status,
      status_title,
      status_message,
      'orders',
      'tool_request',
      new.id
    ) on conflict do nothing;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_toolbox_status(p_user_registration text, p_standard_tool_id uuid, p_status text, p_signature_url text, p_issue_type text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_photo_url text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_registration text := btrim(coalesce(p_user_registration, ''));
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_issue_type text := lower(btrim(coalesce(p_issue_type, '')));
  v_user_name text;
  v_branch_id uuid;
  v_tool_name text;
  v_audit_id uuid;
  v_now timestamptz := now();
  v_previous_status text;
  v_message text;
begin
  if v_registration = '' then
    raise exception 'Matrícula obrigatória.';
  end if;

  if v_status not in ('ok', 'missing', 'damaged') then
    raise exception 'Status inválido.';
  end if;

  if btrim(coalesce(p_signature_url, '')) = '' then
    raise exception 'A assinatura é obrigatória.';
  end if;

  select name, branch_id
    into v_user_name, v_branch_id
  from public.users_access
  where registration = v_registration
    and active = true
  limit 1;

  if v_user_name is null then
    raise exception 'Colaborador não encontrado ou inativo.';
  end if;

  select name
    into v_tool_name
  from public.cautelia_standard_tools
  where id = p_standard_tool_id;

  if v_tool_name is null then
    raise exception 'Item da caixa de ferramentas não encontrado.';
  end if;

  select status
    into v_previous_status
  from public.cautelia_reports
  where user_id = v_registration
    and tool_id = p_standard_tool_id
  limit 1;

  insert into public.cautelia_audits (
    user_id,
    branch_id,
    check_date,
    signature_url,
    status,
    type,
    operator_id,
    obs
  ) values (
    v_registration,
    v_branch_id,
    v_now,
    p_signature_url,
    'signed',
    'toolbox_status',
    v_registration,
    nullif(btrim(coalesce(p_notes, '')), '')
  ) returning id into v_audit_id;

  insert into public.cautelia_audit_items (
    audit_id,
    tool_id,
    status,
    obs,
    quantity,
    issue_type,
    photo_url
  ) values (
    v_audit_id,
    p_standard_tool_id,
    v_status,
    nullif(btrim(coalesce(p_notes, '')), ''),
    1,
    case when v_status = 'ok' then null else nullif(v_issue_type, '') end,
    nullif(btrim(coalesce(p_photo_url, '')), '')
  );

  insert into public.cautelia_reports (
    user_id,
    tool_id,
    status,
    last_check,
    responsible_name
  ) values (
    v_registration,
    p_standard_tool_id,
    v_status,
    v_now,
    v_user_name
  )
  on conflict (user_id, tool_id)
  do update set
    status = excluded.status,
    last_check = excluded.last_check,
    responsible_name = excluded.responsible_name;

  update public.tool_issues
  set status = 'closed', resolved_at = v_now
  where standard_tool_id = p_standard_tool_id
    and reported_by = v_registration
    and status in ('open', 'reviewing');

  if v_status in ('missing', 'damaged') then
    if v_status = 'missing' then
      v_issue_type := 'missing';
    elsif v_issue_type not in ('damaged', 'malfunction', 'part_missing', 'lost', 'wear', 'other') then
      v_issue_type := 'damaged';
    end if;

    insert into public.tool_issues (
      tool_id,
      standard_tool_id,
      reported_by,
      issue_type,
      notes,
      status,
      signature_url,
      photo_url,
      audit_id
    ) values (
      null,
      p_standard_tool_id,
      v_registration,
      v_issue_type,
      nullif(btrim(coalesce(p_notes, '')), ''),
      'open',
      p_signature_url,
      nullif(btrim(coalesce(p_photo_url, '')), ''),
      v_audit_id
    );
  end if;

  v_message := case v_status
    when 'ok' then format('%s confirmou %s como OK.', v_user_name, v_tool_name)
    when 'missing' then format('%s informou que não recebeu %s.', v_user_name, v_tool_name)
    else format('%s informou dano em %s.', v_user_name, v_tool_name)
  end;

  insert into public.app_notifications (
    user_registration,
    type,
    title,
    message,
    action_screen,
    entity_type,
    entity_id,
    is_read
  )
  select
    registration,
    'toolbox_status',
    case v_status
      when 'ok' then 'Status da caixa atualizado'
      when 'missing' then 'Item não recebido'
      else 'Item danificado'
    end,
    v_message,
    'caution',
    'toolbox_status',
    v_audit_id,
    false
  from public.users_access
  where active = true
    and role = 'Administrador'
    and registration <> v_registration;

  return v_audit_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_user_avatar()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.avatar_url :=
    'https://api.dicebear.com/9.x/adventurer-neutral/svg?seed=animal-' ||
    replace(lower(NEW.name), ' ', '-') ||
    '-' || NEW.registration;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- (sem RLS no banco de origem: avatars_catalog, tools_emergency_snapshot_20260818)
-- -----------------------------------------------------------------------------
ALTER TABLE public.app_avatar_sprite_chunks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.cautela_audit_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.cautela_audits ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.cautelas ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.cautelia_audit_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.cautelia_audits ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.cautelia_reports ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.cautelia_standard_tools ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.client_employees ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.nfs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tool_handovers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tool_issues ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tool_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tools ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.users_access ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- Políticas
-- -----------------------------------------------------------------------------
CREATE POLICY "Public avatar sprite read" ON public.app_avatar_sprite_chunks AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY full_access_app_notifications ON public.app_notifications AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY full_access_avatars_catalog ON public.avatars_catalog AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY "Allow all branches" ON public.branches AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY full_access_branches ON public.branches AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY full_access_cautela_audit_items ON public.cautela_audit_items AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY full_access_cautela_audits ON public.cautela_audits AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY "Allow all cautelas" ON public.cautelas AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY full_access_cautelas ON public.cautelas AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY "Permitir tudo para todos audit_items" ON public.cautelia_audit_items AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY all_audit_items ON public.cautelia_audit_items AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY audit_items_full_access ON public.cautelia_audit_items AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY full_access_audit_items ON public.cautelia_audit_items AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY full_access_cautelia_audit_items ON public.cautelia_audit_items AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY policy_audit_items ON public.cautelia_audit_items AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY "Permitir tudo para todos audits" ON public.cautelia_audits AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY all_audits ON public.cautelia_audits AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY audit_full_access ON public.cautelia_audits AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY full_access_audits ON public.cautelia_audits AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY full_access_cautelia_audits ON public.cautelia_audits AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY policy_audits ON public.cautelia_audits AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY "Permitir inserção/edição reports para todos" ON public.cautelia_reports AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY "Permitir leitura reports para todos" ON public.cautelia_reports AS PERMISSIVE FOR SELECT TO public USING (true);

CREATE POLICY "Permitir tudo para usuários autenticados reports" ON public.cautelia_reports AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY all_reports ON public.cautelia_reports AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY full_access_cautelia_reports ON public.cautelia_reports AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY full_access_reports ON public.cautelia_reports AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY policy_reports ON public.cautelia_reports AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY "Permitir inserção/edição para todos" ON public.cautelia_standard_tools AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY "Permitir leitura para todos" ON public.cautelia_standard_tools AS PERMISSIVE FOR SELECT TO public USING (true);

CREATE POLICY "Permitir tudo para usuários autenticados" ON public.cautelia_standard_tools AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY all_standard_tools ON public.cautelia_standard_tools AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY full_access_cautelia_standard_tools ON public.cautelia_standard_tools AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY full_access_standard_tools ON public.cautelia_standard_tools AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY policy_standard_tools ON public.cautelia_standard_tools AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY "Permitir tudo para todos client_employees" ON public.client_employees AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY "Permitir tudo para todos clients" ON public.clients AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY "Allow all nfs" ON public.nfs AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY full_access_nfs ON public.nfs AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY full_access_tool_handovers ON public.tool_handovers AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY full_access_tool_issues ON public.tool_issues AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY full_access_tool_requests ON public.tool_requests AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY "Allow all tools" ON public.tools AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY full_access_tools ON public.tools AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY "Allow all transactions" ON public.transactions AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY full_access_transactions ON public.transactions AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY "Allow all users_access" ON public.users_access AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY full_access_users_access ON public.users_access AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------
CREATE TRIGGER trg_cautelas_updated BEFORE UPDATE ON public.cautelas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_cautelas_updated_at BEFORE UPDATE ON public.cautelas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_notify_admins_on_new_cautela AFTER INSERT ON public.cautelas FOR EACH ROW EXECUTE FUNCTION notify_admins_on_new_cautela();

CREATE TRIGGER update_cautelas_updated_at BEFORE UPDATE ON public.cautelas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_cautelia_reports_updated_at BEFORE UPDATE ON public.cautelia_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_reports_updated BEFORE UPDATE ON public.cautelia_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cautelia_reports_updated_at BEFORE UPDATE ON public.cautelia_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_nfs_updated BEFORE UPDATE ON public.nfs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_nfs_updated_at BEFORE UPDATE ON public.nfs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_nfs_updated_at BEFORE UPDATE ON public.nfs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER tool_handover_insert_notification AFTER INSERT ON public.tool_handovers FOR EACH ROW EXECUTE FUNCTION notify_tool_handover_insert();

CREATE TRIGGER tool_request_insert_notification AFTER INSERT ON public.tool_requests FOR EACH ROW EXECUTE FUNCTION notify_tool_request_insert();

CREATE TRIGGER tool_request_status_notification AFTER UPDATE OF status ON public.tool_requests FOR EACH ROW EXECUTE FUNCTION notify_tool_request_status();

CREATE TRIGGER trg_block_tool_delete_during_recovery BEFORE DELETE ON public.tools FOR EACH ROW EXECUTE FUNCTION block_tool_delete_during_recovery();

CREATE TRIGGER trg_tools_updated BEFORE UPDATE ON public.tools FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_tools_updated_at BEFORE UPDATE ON public.tools FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tools_updated_at BEFORE UPDATE ON public.tools FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER users_access_avatar_canonical_trigger BEFORE INSERT OR UPDATE OF avatar_url, registration ON public.users_access FOR EACH ROW EXECUTE FUNCTION canonicalize_users_access_avatar();

-- -----------------------------------------------------------------------------
-- Realtime (publicação supabase_realtime)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.app_notifications;

ALTER PUBLICATION supabase_realtime ADD TABLE public.cautelia_audit_items;

ALTER PUBLICATION supabase_realtime ADD TABLE public.cautelia_audits;

ALTER PUBLICATION supabase_realtime ADD TABLE public.cautelia_reports;

ALTER PUBLICATION supabase_realtime ADD TABLE public.tool_handovers;

ALTER PUBLICATION supabase_realtime ADD TABLE public.tool_issues;

ALTER PUBLICATION supabase_realtime ADD TABLE public.tools;

ALTER PUBLICATION supabase_realtime ADD TABLE public.users_access;

