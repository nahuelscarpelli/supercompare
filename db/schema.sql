-- ============================================
-- SuperCompare - Database Schema
-- ============================================

-- Supermercados registrados
CREATE TABLE IF NOT EXISTS supermarkets (
    id SERIAL PRIMARY KEY,
    code VARCHAR(20) UNIQUE NOT NULL,  -- 'carrefour', 'coto', 'dia', 'jumbo'
    name VARCHAR(100) NOT NULL,
    base_url VARCHAR(255) NOT NULL,
    logo_url VARCHAR(255),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Productos canónicos (nuestro catálogo normalizado)
-- Esto es el equivalente a tu Product Catalog en Vlocity
CREATE TABLE IF NOT EXISTS canonical_products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,          -- 'Leche Entera'
    category VARCHAR(100) NOT NULL,      -- 'Lácteos'
    subcategory VARCHAR(100),            -- 'Leche'
    brand VARCHAR(100),                  -- NULL = cualquier marca
    unit VARCHAR(20) NOT NULL,           -- 'lt', 'kg', 'un'
    standard_quantity DECIMAL(10,3),     -- 1.0 (para normalizar precio por unidad)
    keywords TEXT[],                     -- {'leche', 'entera', 'sachet', 'larga vida'}
    ean VARCHAR(13),                     -- Código de barras si lo tenemos
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Productos scrapeados de cada supermercado (raw data)
CREATE TABLE IF NOT EXISTS scraped_products (
    id SERIAL PRIMARY KEY,
    supermarket_id INTEGER REFERENCES supermarkets(id),
    external_id VARCHAR(100),            -- ID del producto en el súper
    raw_name VARCHAR(500) NOT NULL,      -- 'Leche Ent. La Serenísima x 1 Lt.'
    brand VARCHAR(200),
    price DECIMAL(12,2) NOT NULL,
    price_per_unit DECIMAL(12,2),        -- Precio por lt/kg normalizado
    unit VARCHAR(20),
    quantity DECIMAL(10,3),
    image_url VARCHAR(500),
    product_url VARCHAR(500),
    category_path VARCHAR(500),          -- 'Almacén > Aceites > Aceite de Girasol'
    in_stock BOOLEAN DEFAULT true,
    promo_price DECIMAL(12,2),           -- Precio con descuento/promo
    promo_description VARCHAR(200),
    scraped_at TIMESTAMP DEFAULT NOW(),
    -- Índice compuesto para búsquedas rápidas
    UNIQUE(supermarket_id, external_id)
);

-- Matching entre producto canónico y scrapeado
CREATE TABLE IF NOT EXISTS product_matches (
    id SERIAL PRIMARY KEY,
    canonical_id INTEGER REFERENCES canonical_products(id),
    scraped_id INTEGER REFERENCES scraped_products(id),
    match_score DECIMAL(5,4),            -- 0.0000 a 1.0000
    match_method VARCHAR(50),            -- 'ean', 'fuzzy_name', 'manual', 'ai'
    verified BOOLEAN DEFAULT false,      -- Verificado manualmente
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(canonical_id, scraped_id)
);

-- Historial de precios (para tracking de evolución)
CREATE TABLE IF NOT EXISTS price_history (
    id SERIAL PRIMARY KEY,
    scraped_product_id INTEGER REFERENCES scraped_products(id),
    price DECIMAL(12,2) NOT NULL,
    promo_price DECIMAL(12,2),
    recorded_at TIMESTAMP DEFAULT NOW()
);

-- Listas de compras del usuario
CREATE TABLE IF NOT EXISTS shopping_lists (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200),
    ai_prompt TEXT,                       -- El prompt original del usuario
    created_at TIMESTAMP DEFAULT NOW()
);

-- Items de la lista
CREATE TABLE IF NOT EXISTS shopping_list_items (
    id SERIAL PRIMARY KEY,
    list_id INTEGER REFERENCES shopping_lists(id),
    canonical_id INTEGER REFERENCES canonical_products(id),
    quantity INTEGER DEFAULT 1,
    notes VARCHAR(200),                   -- 'La Serenísima preferentemente'
    best_option_scraped_id INTEGER REFERENCES scraped_products(id),
    best_price DECIMAL(12,2)
);

-- ============================================
-- Seed Data: Supermercados
-- ============================================
INSERT INTO supermarkets (code, name, base_url) VALUES
    ('carrefour', 'Carrefour', 'https://www.carrefour.com.ar'),
    ('coto', 'Coto', 'https://www.cotodigital3.com.ar'),
    ('dia', 'Día', 'https://dfrprd.supermercadosdia.com.ar'),
    ('jumbo', 'Jumbo', 'https://www.jumbo.com.ar')
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- Seed Data: ~50 Productos canónicos básicos
-- ============================================
INSERT INTO canonical_products (name, category, subcategory, unit, standard_quantity, keywords) VALUES
    -- Lácteos
    ('Leche Entera 1L', 'Lácteos', 'Leche', 'lt', 1.0, '{"leche","entera","sachet","botella"}'),
    ('Leche Descremada 1L', 'Lácteos', 'Leche', 'lt', 1.0, '{"leche","descremada","sachet","botella"}'),
    ('Yogur Entero 1L', 'Lácteos', 'Yogur', 'lt', 1.0, '{"yogur","entero","natural","bebible"}'),
    ('Manteca 200g', 'Lácteos', 'Manteca', 'gr', 200, '{"manteca","pan"}'),
    ('Queso Cremoso 1kg', 'Lácteos', 'Queso', 'kg', 1.0, '{"queso","cremoso","barra"}'),
    ('Crema de Leche 200ml', 'Lácteos', 'Crema', 'ml', 200, '{"crema","leche","cocina"}'),
    
    -- Almacén
    ('Aceite de Girasol 1.5L', 'Almacén', 'Aceites', 'lt', 1.5, '{"aceite","girasol","cocina"}'),
    ('Aceite de Oliva 500ml', 'Almacén', 'Aceites', 'ml', 500, '{"aceite","oliva","extra","virgen"}'),
    ('Arroz Largo Fino 1kg', 'Almacén', 'Arroz', 'kg', 1.0, '{"arroz","largo","fino","grano"}'),
    ('Fideos Spaghetti 500g', 'Almacén', 'Pastas', 'gr', 500, '{"fideos","spaghetti","pasta","tallarines"}'),
    ('Fideos Tirabuzón 500g', 'Almacén', 'Pastas', 'gr', 500, '{"fideos","tirabuzon","pasta","fusilli"}'),
    ('Harina 000 1kg', 'Almacén', 'Harinas', 'kg', 1.0, '{"harina","000","triple","cero"}'),
    ('Azúcar 1kg', 'Almacén', 'Azúcar', 'kg', 1.0, '{"azucar","blanca","comun"}'),
    ('Sal Fina 500g', 'Almacén', 'Condimentos', 'gr', 500, '{"sal","fina","mesa"}'),
    ('Yerba Mate 1kg', 'Almacén', 'Infusiones', 'kg', 1.0, '{"yerba","mate","con","palo","sin"}'),
    ('Café Molido 500g', 'Almacén', 'Infusiones', 'gr', 500, '{"cafe","molido","torrado"}'),
    ('Té en Saquitos x20', 'Almacén', 'Infusiones', 'un', 20, '{"te","saquitos","negro","hierbas"}'),
    ('Galletitas Crackers 300g', 'Almacén', 'Galletitas', 'gr', 300, '{"galletitas","crackers","agua","salvado"}'),
    ('Mermelada 454g', 'Almacén', 'Dulces', 'gr', 454, '{"mermelada","dulce","frutilla","durazno"}'),
    ('Atún en Lata', 'Almacén', 'Conservas', 'un', 1, '{"atun","lata","conserva","aceite","agua"}'),
    ('Tomate Triturado 520g', 'Almacén', 'Conservas', 'gr', 520, '{"tomate","triturado","pure","salsa"}'),
    ('Lentejas 500g', 'Almacén', 'Legumbres', 'gr', 500, '{"lentejas","legumbres","secas"}'),
    ('Polenta 500g', 'Almacén', 'Harinas', 'gr', 500, '{"polenta","harina","maiz"}'),
    
    -- Bebidas
    ('Agua Mineral 1.5L', 'Bebidas', 'Aguas', 'lt', 1.5, '{"agua","mineral","sin","gas"}'),
    ('Gaseosa Cola 2.25L', 'Bebidas', 'Gaseosas', 'lt', 2.25, '{"gaseosa","cola","coca","pepsi"}'),
    ('Jugo en Polvo', 'Bebidas', 'Jugos', 'un', 1, '{"jugo","polvo","clight","tang"}'),
    ('Cerveza Lata 473ml', 'Bebidas', 'Cervezas', 'ml', 473, '{"cerveza","lata","rubia","quilmes","brahma"}'),
    ('Vino Tinto 750ml', 'Bebidas', 'Vinos', 'ml', 750, '{"vino","tinto","malbec","cabernet"}'),
    
    -- Carnes (precios de referencia, no siempre disponibles online)
    ('Carne Picada Común 1kg', 'Carnes', 'Vacuna', 'kg', 1.0, '{"carne","picada","comun","molida"}'),
    ('Pollo Entero 1kg', 'Carnes', 'Pollo', 'kg', 1.0, '{"pollo","entero","fresco"}'),
    ('Milanesa de Pollo 1kg', 'Carnes', 'Pollo', 'kg', 1.0, '{"milanesa","pollo","rebozada"}'),
    
    -- Frutas y Verduras
    ('Papa 1kg', 'Frutas y Verduras', 'Verduras', 'kg', 1.0, '{"papa","blanca"}'),
    ('Cebolla 1kg', 'Frutas y Verduras', 'Verduras', 'kg', 1.0, '{"cebolla","blanca","morada"}'),
    ('Tomate 1kg', 'Frutas y Verduras', 'Verduras', 'kg', 1.0, '{"tomate","redondo","perita"}'),
    ('Banana 1kg', 'Frutas y Verduras', 'Frutas', 'kg', 1.0, '{"banana","ecuador"}'),
    ('Manzana 1kg', 'Frutas y Verduras', 'Frutas', 'kg', 1.0, '{"manzana","roja","verde","deliciosa"}'),
    ('Lechuga 1un', 'Frutas y Verduras', 'Verduras', 'un', 1, '{"lechuga","crespa","criolla"}'),
    ('Zanahoria 1kg', 'Frutas y Verduras', 'Verduras', 'kg', 1.0, '{"zanahoria"}'),
    ('Limón 1kg', 'Frutas y Verduras', 'Frutas', 'kg', 1.0, '{"limon","tucuman"}'),
    
    -- Panadería
    ('Pan Lactal Blanco', 'Panadería', 'Pan', 'un', 1, '{"pan","lactal","blanco","molde"}'),
    ('Pan Rallado 500g', 'Panadería', 'Pan', 'gr', 500, '{"pan","rallado","rebozador"}'),
    
    -- Limpieza
    ('Detergente 750ml', 'Limpieza', 'Cocina', 'ml', 750, '{"detergente","lavavajilla","cocina"}'),
    ('Lavandina 2L', 'Limpieza', 'Hogar', 'lt', 2.0, '{"lavandina","cloro","desinfectante"}'),
    ('Jabón en Polvo 800g', 'Limpieza', 'Ropa', 'gr', 800, '{"jabon","polvo","ropa","skip","ala"}'),
    ('Papel Higiénico x4', 'Limpieza', 'Papel', 'un', 4, '{"papel","higienico","rollo","doble","hoja"}'),
    
    -- Congelados
    ('Tapas de Empanadas x12', 'Congelados', 'Tapas', 'un', 12, '{"tapas","empanadas","horno","freir"}'),
    ('Tapas de Tarta', 'Congelados', 'Tapas', 'un', 1, '{"tapas","tarta","pascualina","hojaldre"}'),
    ('Papas Fritas Congeladas 700g', 'Congelados', 'Papas', 'gr', 700, '{"papas","fritas","congeladas","bastones"}'),
    
    -- Huevos
    ('Huevos x12', 'Huevos', 'Huevos', 'un', 12, '{"huevos","docena","maple","gallina"}'),
    ('Huevos x30', 'Huevos', 'Huevos', 'un', 30, '{"huevos","maple","30","gallina"}')
ON CONFLICT DO NOTHING;

-- ============================================
-- Índices para performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_scraped_products_supermarket ON scraped_products(supermarket_id);
CREATE INDEX IF NOT EXISTS idx_scraped_products_name ON scraped_products USING gin(to_tsvector('spanish', raw_name));
CREATE INDEX IF NOT EXISTS idx_product_matches_canonical ON product_matches(canonical_id);
CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(scraped_product_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_canonical_keywords ON canonical_products USING gin(keywords);
