-- SETUP AVATARS FOR USERS_ACCESS
-- Execute este script no SQL Editor do seu Dashboard Supabase

-- 1. Cria a tabela de catálogo de avatares se não existir
CREATE TABLE IF NOT EXISTS avatars_catalog (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Limpa e insere opções pré-definidas (Dicebear v9 - Avataaars)
TRUNCATE avatars_catalog;

INSERT INTO avatars_catalog (url, category) VALUES
('https://api.dicebear.com/9.x/avataaars/svg?seed=Felix&backgroundType=gradientLinear&backgroundColor=b6e3f4,c0aede,d1d4f9', 'Avatar'),
('https://api.dicebear.com/9.x/avataaars/svg?seed=Aneka&backgroundType=gradientLinear&backgroundColor=b6e3f4,c0aede,d1d4f9', 'Avatar'),
('https://api.dicebear.com/9.x/avataaars/svg?seed=Caleb&backgroundType=gradientLinear&backgroundColor=b6e3f4,c0aede,d1d4f9', 'Avatar'),
('https://api.dicebear.com/9.x/avataaars/svg?seed=Jade&backgroundType=gradientLinear&backgroundColor=b6e3f4,c0aede,d1d4f9', 'Avatar'),
('https://api.dicebear.com/9.x/avataaars/svg?seed=Max&backgroundType=gradientLinear&backgroundColor=b6e3f4,c0aede,d1d4f9'),
('https://api.dicebear.com/9.x/avataaars/svg?seed=Bella&backgroundType=gradientLinear&backgroundColor=b6e3f4,c0aede,d1d4f9', 'Avatar'),
('https://api.dicebear.com/9.x/adventurer/svg?seed=Milo&backgroundType=gradientLinear&backgroundColor=b6e3f4,c0aede,d1d4f9', 'Adventure'),
('https://api.dicebear.com/9.x/adventurer/svg?seed=Sasha&backgroundType=gradientLinear&backgroundColor=b6e3f4,c0aede,d1d4f9', 'Adventure'),
('https://api.dicebear.com/9.x/bottts/svg?seed=Spark&backgroundType=gradientLinear&backgroundColor=b6e3f4,c0aede,d1d4f9', 'Robot'),
('https://api.dicebear.com/9.x/bottts/svg?seed=Circuit&backgroundType=gradientLinear&backgroundColor=b6e3f4,c0aede,d1d4f9', 'Robot'),
('https://api.dicebear.com/9.x/pixel-art/svg?seed=Rex&backgroundType=gradientLinear&backgroundColor=b6e3f4,c0aede,d1d4f9', 'Pixel'),
('https://api.dicebear.com/9.x/pixel-art/svg?seed=Roxy&backgroundType=gradientLinear&backgroundColor=b6e3f4,c0aede,d1d4f9', 'Pixel');

-- 3. Adiciona a coluna avatar_url na users_access se ainda não existir
ALTER TABLE users_access ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 4. Exemplo de atualização (Opcional - você pode fazer via UI no App)
-- UPDATE users_access SET avatar_url = 'https://api.dicebear.com/9.x/avataaars/svg?seed=Felix&backgroundType=gradientLinear&backgroundColor=b6e3f4,c0aede,d1d4f9' WHERE registration = '19124';

-- Verifique as opções cadastradas:
SELECT * FROM avatars_catalog;
