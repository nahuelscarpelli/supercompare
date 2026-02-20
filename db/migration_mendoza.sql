-- ============================================
-- SuperCompare - Migration: Mendoza Supermarkets
-- Run AFTER schema.sql + auth_schema.sql
-- ============================================

-- Agregar los 4 supermercados de Mendoza
INSERT INTO supermarkets (code, name, base_url, logo_url, active) VALUES
    ('vea',        'Vea',        'https://www.vea.com.ar',              NULL, true),
    ('masonline',  'MasOnline',  'https://www.masonline.com.ar',        NULL, true),
    ('modomarket', 'ModoMarket', 'https://www.modomarket.com',          NULL, true),
    ('coto',       'Coto Digital','https://www.cotodigital.com.ar',      NULL, true)
ON CONFLICT (code) DO UPDATE SET 
    name = EXCLUDED.name,
    base_url = EXCLUDED.base_url,
    active = true;

-- Vincular los 4 a zona Mendoza
INSERT INTO zone_supermarkets (zone_id, supermarket_id, has_delivery, min_order, notes)
SELECT z.id, s.id, true, 10000, 
    CASE s.code
        WHEN 'vea' THEN 'Cencosud – VTEX Intelligent Search'
        WHEN 'masonline' THEN 'ChangoMAS/GDN – VTEX Intelligent Search'
        WHEN 'modomarket' THEN 'VTEX Classic Catalog System'
        WHEN 'coto' THEN 'Oracle ATG Endeca JSON'
    END
FROM zones z, supermarkets s
WHERE z.code = 'mendoza' AND s.code IN ('vea', 'masonline', 'modomarket', 'coto')
ON CONFLICT (zone_id, supermarket_id) DO NOTHING;

-- También vincular Coto a CABA y GBA (ya está en esas zonas en la vida real)
INSERT INTO zone_supermarkets (zone_id, supermarket_id, has_delivery, min_order)
SELECT z.id, s.id, true, 15000
FROM zones z, supermarkets s
WHERE z.code IN ('caba', 'gba_norte', 'gba_sur', 'gba_oeste') 
  AND s.code = 'coto'
ON CONFLICT (zone_id, supermarket_id) DO NOTHING;

-- Vea también opera en varias zonas de Buenos Aires
INSERT INTO zone_supermarkets (zone_id, supermarket_id, has_delivery, min_order)
SELECT z.id, s.id, true, 15000
FROM zones z, supermarkets s
WHERE z.code IN ('caba', 'gba_norte', 'gba_sur', 'gba_oeste') 
  AND s.code = 'vea'
ON CONFLICT (zone_id, supermarket_id) DO NOTHING;
