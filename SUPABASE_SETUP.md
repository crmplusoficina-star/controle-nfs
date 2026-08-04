# Configuração do Supabase para Avatares

Para que o sistema de troca de avatares funcione corretamente, você precisa criar a tabela de catálogo no seu Supabase.

### Passo 1: Acesse o SQL Editor
Vá para o [Dashboard do Supabase](https://app.supabase.com/), selecione seu projeto e clique em **SQL Editor** no menu lateral.

### Passo 2: Execute o Script
Copie o conteúdo abaixo e execute no SQL Editor do Supabase:

```sql
-- 1. Cria a tabela de catálogo de avatares no schema público
CREATE TABLE IF NOT EXISTS public.avatars_catalog (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);

-- 2. CRÍTICO: Desativa o RLS para que o App consiga ler os avatares sem erro de permissão
ALTER TABLE public.avatars_catalog DISABLE ROW LEVEL SECURITY;

-- 3. Limpa e Insere as opções (Total de 14 avatares iniciais)
TRUNCATE public.avatars_catalog;

INSERT INTO public.avatars_catalog (url, category) VALUES
-- ANIMAIS
('https://api.dicebear.com/9.x/thumbs/svg?seed=Lion', 'Animal'),
('https://api.dicebear.com/9.x/thumbs/svg?seed=Tiger', 'Animal'),
('https://api.dicebear.com/9.x/thumbs/svg?seed=Wolf', 'Animal'),
('https://api.dicebear.com/9.x/thumbs/svg?seed=Fox', 'Animal'),
('https://api.dicebear.com/9.x/thumbs/svg?seed=Bear', 'Animal'),
('https://api.dicebear.com/9.x/thumbs/svg?seed=Panda', 'Animal'),
('https://api.dicebear.com/9.x/thumbs/svg?seed=Dog', 'Animal'),
('https://api.dicebear.com/9.x/thumbs/svg?seed=Cat', 'Animal'),
('https://api.dicebear.com/9.x/thumbs/svg?seed=Eagle', 'Animal'),
('https://api.dicebear.com/9.x/thumbs/svg?seed=Shark', 'Animal'),
-- ROBÔS
('https://api.dicebear.com/9.x/bottts/svg?seed=Spark', 'Robô'),
('https://api.dicebear.com/9.x/bottts/svg?seed=Circuit', 'Robô'),
-- PIXEL
('https://api.dicebear.com/9.x/pixel-art/svg?seed=Rex', 'Pixel'),
('https://api.dicebear.com/9.x/pixel-art/svg?seed=Roxy', 'Pixel');

-- 4. Garante que a coluna avatar_url existe em users_access
ALTER TABLE public.users_access ADD COLUMN IF NOT EXISTS avatar_url TEXT;
```

> **Atenção:** Se o catálogo mostrar apenas "EXEMPLO (ERRO DB)", significa que o comando de desativar o **RLS** falhou ou você não rodou o script. Rode novamente o script acima.

### Passo 3: Pronto!
Agora você poderá escolher entre estas opções no seu perfil dentro do app.
