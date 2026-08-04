# Configuração do Supabase SQL

Execute este SQL no Editor SQL do seu projeto Supabase para criar as tabelas necessárias:

```sql
-- Criar Enums (se não existirem)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nf_status') THEN
        CREATE TYPE nf_status AS ENUM ('rc_created', 'waiting_order', 'waiting_docs', 'waiting_schedule', 'paid', 'pending');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_type') THEN
        CREATE TYPE transaction_type AS ENUM ('borrow', 'return', 'cautela_check', 'inventory_adjustment');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cautela_status') THEN
        CREATE TYPE cautela_status AS ENUM ('ok', 'missing', 'damaged');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('Administrador', 'Operador');
    END IF;
END $$;

-- Tabela de Filiais
-- ############################################################################
-- MIGRATION SCRIPT (Execute this if you get "column not found" errors)
-- ############################################################################

ALTER TABLE cautelia_audits ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE cautelia_audits ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'caution';
ALTER TABLE cautelia_audits ADD COLUMN IF NOT EXISTS operator_id TEXT;
ALTER TABLE cautelia_audit_items ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;
ALTER TABLE cautelas ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'caution';

-- ############################################################################

CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Tabela de Acesso de Usuários (Técnicos e Gestores)
CREATE TABLE IF NOT EXISTS users_access (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  registration TEXT UNIQUE NOT NULL, -- Matrícula
  name TEXT NOT NULL,
  role user_role DEFAULT 'Operador',
  branch_id UUID REFERENCES branches(id),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Tabela de NF's
CREATE TABLE IF NOT EXISTS nfs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  supplier TEXT,
  date DATE,
  invoice_number TEXT,
  amount DECIMAL(12,2),
  payment_date DATE,
  order_number TEXT,
  status nf_status DEFAULT 'rc_created',
  type TEXT DEFAULT 'consumo', -- 'consumo' | 'ferramenta' | 'cautela'
  responsible_registration TEXT, -- Matrícula do responsável
  tool_name TEXT, -- Nome da ferramenta (se for tipo ferramenta)
  quantity INTEGER DEFAULT 1,
  branch_id UUID REFERENCES branches(id),
  ticket_number TEXT, -- Número do chamado
  obs TEXT,
  file_url TEXT,
  boleto_url TEXT,
  is_tool BOOLEAN DEFAULT false,
  classification TEXT DEFAULT 'Diversos',
  cautela_id UUID,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Script para adicionar coluna se já existir a tabela
ALTER TABLE nfs ADD COLUMN IF NOT EXISTS classification TEXT DEFAULT 'Diversos';

-- Tabela de Ferramentas
CREATE TABLE IF NOT EXISTS tools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  branch TEXT, -- Nome da filial (redundante para facilidade)
  branch_id UUID REFERENCES branches(id),
  quantity_available INTEGER DEFAULT 0,
  cautela_quantity INTEGER DEFAULT 0,
  borrowed_quantity INTEGER DEFAULT 0,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Tabela de Transações (Auditoria)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tool_id UUID REFERENCES tools(id),
  user_id TEXT, -- matrícula do usuário
  type transaction_type NOT NULL,
  quantity INTEGER NOT NULL,
  branch TEXT, -- Nome da filial
  branch_id UUID REFERENCES branches(id),
  photos TEXT[],
  signature_url TEXT,
  status TEXT DEFAULT 'confirmed',
  obs TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Tabela de Cautelas
CREATE TABLE IF NOT EXISTS cautelas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT, -- matrícula do usuário
  tool_id UUID REFERENCES tools(id),
  branch_id UUID REFERENCES branches(id),
  status cautela_status DEFAULT 'ok',
  type TEXT DEFAULT 'caution', -- 'caution' | 'loan'
  obs TEXT,
  photos TEXT[],
  last_check TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id, tool_id) -- Impede duplicatas e permite upsert
);

-- Script para adicionar restrição UNIQUE se já existir a tabela
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cautelas_user_id_tool_id_key') THEN
        ALTER TABLE cautelas ADD CONSTRAINT cautelas_user_id_tool_id_key UNIQUE (user_id, tool_id);
    END IF;
END $$;

-- Script para adicionar coluna type se já existir
ALTER TABLE cautelas ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'caution';

-- Triggers para Updated At
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Recriar triggers de forma segura
DROP TRIGGER IF EXISTS update_nfs_updated_at ON nfs;
CREATE TRIGGER update_nfs_updated_at BEFORE UPDATE ON nfs FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_tools_updated_at ON tools;
CREATE TRIGGER update_tools_updated_at BEFORE UPDATE ON tools FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_cautelas_updated_at ON cautelas;
CREATE TRIGGER update_cautelas_updated_at BEFORE UPDATE ON cautelas FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Tabela de Ferramentas Padrão (Sugestões globais para Cautela)
CREATE TABLE IF NOT EXISTS cautelia_standard_tools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  category TEXT DEFAULT 'PADRÃO',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Tabela de Vínculo de Técnicos com Ferramentas Padrão (Relatórios de Cautela)
CREATE TABLE IF NOT EXISTS cautelia_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL, -- matrícula do usuário
  tool_id UUID REFERENCES cautelia_standard_tools(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'ok',
  last_check TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id, tool_id) -- Impede duplicatas e permite upsert
);

-- Habilitar RLS e criar políticas (Ajustado para o sistema de login por matrícula)
ALTER TABLE cautelia_standard_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE cautelia_reports ENABLE ROW LEVEL SECURITY;

-- Como o sistema usa um login customizado (via users_access), permitimos acesso para a role 'anon' e 'authenticated'
-- Usando DO para criar políticas apenas se não existirem
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Permitir leitura para todos' AND tablename = 'cautelia_standard_tools') THEN
        CREATE POLICY "Permitir leitura para todos" ON cautelia_standard_tools FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Permitir inserção/edição para todos' AND tablename = 'cautelia_standard_tools') THEN
        CREATE POLICY "Permitir inserção/edição para todos" ON cautelia_standard_tools FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Permitir leitura reports para todos' AND tablename = 'cautelia_reports') THEN
        CREATE POLICY "Permitir leitura reports para todos" ON cautelia_reports FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Permitir inserção/edição reports para todos' AND tablename = 'cautelia_reports') THEN
        CREATE POLICY "Permitir inserção/edição reports para todos" ON cautelia_reports FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- Tabela de Auditorias de Cautela (Histórico e Assinaturas)
CREATE TABLE IF NOT EXISTS cautelia_audits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL, -- matrícula do usuário
  branch_id UUID REFERENCES branches(id),
  signature_url TEXT,
  status TEXT DEFAULT 'signed', -- 'pending' | 'signed'
  type TEXT DEFAULT 'caution', -- 'caution' | 'loan'
  operator_id TEXT, -- Usuário que realizou a cautela
  check_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Script para adicionar coluna type se já existir
ALTER TABLE cautelia_audits ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'caution';

-- Tabela de Itens da Auditoria
CREATE TABLE IF NOT EXISTS cautelia_audit_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  audit_id UUID REFERENCES cautelia_audits(id) ON DELETE CASCADE,
  tool_id UUID REFERENCES cautelia_standard_tools(id),
  stock_tool_id UUID REFERENCES tools(id), -- Adicionado para suportar ferramentas do estoque
  status TEXT DEFAULT 'ok', -- 'ok' | 'missing' | 'damaged'
  quantity INTEGER DEFAULT 1,
  obs TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Script para atualizar tabela se já existir
ALTER TABLE cautelia_audit_items ADD COLUMN IF NOT EXISTS stock_tool_id UUID REFERENCES tools(id);
ALTER TABLE cautelia_audit_items ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;

-- Script para adicionar colunas se já existirem as tabelas
ALTER TABLE cautelia_audits ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'signed';
ALTER TABLE cautelia_audits ADD COLUMN IF NOT EXISTS check_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
ALTER TABLE cautelia_audits ADD COLUMN IF NOT EXISTS operator_id TEXT;

-- Habilitar RLS para as novas tabelas
ALTER TABLE cautelia_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE cautelia_audit_items ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Permitir tudo para todos audits' AND tablename = 'cautelia_audits') THEN
        CREATE POLICY "Permitir tudo para todos audits" ON cautelia_audits FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Permitir tudo para todos audit_items' AND tablename = 'cautelia_audit_items') THEN
        CREATE POLICY "Permitir tudo para todos audit_items" ON cautelia_audit_items FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;
```

## Configuração de Armazenamento (Cloudflare R2)
Este projeto utiliza **Cloudflare R2** para armazenamento de arquivos em vez do Supabase Storage. Certifique-se de configurar as seguintes variáveis de ambiente:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_URL` (URL pública do seu bucket ou domínio customizado)

Os arquivos são organizados automaticamente nas seguintes pastas:
- `ferramentas/`: Fotos de ferramentas
- `nfs/`: PDFs de NF's e Boletos
- `cautelas/`: Fotos e assinaturas de cautelas
- `assinaturas/`: Assinaturas digitais
