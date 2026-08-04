-- 1. Add status column for location/status
ALTER TABLE public.tools ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'disponivel';

-- 2. Add image_urls array column
ALTER TABLE public.tools ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}';

-- 3. Migrate existing image_url (if present) to image_urls array
UPDATE public.tools 
SET image_urls = ARRAY[image_url] 
WHERE image_url IS NOT NULL AND (cardinality(image_urls) = 0 OR image_urls IS NULL);
