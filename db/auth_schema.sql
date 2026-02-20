-- ============================================
-- SuperCompare - Auth & User Schema
-- Extension del schema base
-- ============================================

-- Extensión para UUID y crypto
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Zonas / Regiones
-- ============================================
CREATE TABLE IF NOT EXISTS zones (
    id SERIAL PRIMARY KEY,
    code VARCHAR(30) UNIQUE NOT NULL,        -- 'caba', 'gba_norte', 'gba_sur', etc.
    name VARCHAR(100) NOT NULL,               -- 'CABA', 'GBA Norte', 'GBA Sur'
    province VARCHAR(100) NOT NULL DEFAULT 'Buenos Aires',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Qué supermercados operan en cada zona (no todos están en todos lados)
CREATE TABLE IF NOT EXISTS zone_supermarkets (
    id SERIAL PRIMARY KEY,
    zone_id INTEGER NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
    supermarket_id INTEGER NOT NULL REFERENCES supermarkets(id) ON DELETE CASCADE,
    has_delivery BOOLEAN DEFAULT true,
    has_pickup BOOLEAN DEFAULT false,
    delivery_cost DECIMAL(10,2),              -- Costo de envío base (NULL = gratis)
    min_order DECIMAL(10,2),                  -- Monto mínimo de pedido
    notes VARCHAR(200),
    UNIQUE(zone_id, supermarket_id)
);

-- ============================================
-- Usuarios
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,       -- bcrypt hash, NUNCA plaintext
    full_name VARCHAR(200) NOT NULL,
    phone VARCHAR(30),
    
    -- Zona y plan
    zone_id INTEGER REFERENCES zones(id),
    plan VARCHAR(20) NOT NULL DEFAULT 'free',  -- 'free', 'pro', 'trial'
    plan_expires_at TIMESTAMP,
    
    -- Métricas de uso
    total_saved DECIMAL(12,2) DEFAULT 0,       -- Ahorro acumulado
    total_tips DECIMAL(12,2) DEFAULT 0,        -- Propinas dadas
    compares_used INTEGER DEFAULT 0,           -- Para freemium gating
    compares_reset_at TIMESTAMP DEFAULT NOW(), -- Reset mensual
    
    -- Estado
    email_verified BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Supermercados habilitados por usuario (selecciona en onboarding)
CREATE TABLE IF NOT EXISTS user_supermarkets (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    supermarket_id INTEGER NOT NULL REFERENCES supermarkets(id) ON DELETE CASCADE,
    
    -- El usuario puede (opcionalmente) vincular su cuenta del súper
    -- NO almacenamos credenciales, solo metadata
    account_linked BOOLEAN DEFAULT false,      -- ¿Tiene cuenta en ese súper?
    preferred_brands TEXT[],                    -- Marcas preferidas en ese súper
    
    enabled BOOLEAN DEFAULT true,              -- El usuario puede desactivar un súper
    added_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, supermarket_id)
);

-- ============================================
-- Sesiones / Refresh Tokens
-- ============================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,          -- SHA-256 del refresh token
    device_info VARCHAR(300),                  -- User-Agent o device fingerprint
    ip_address INET,
    expires_at TIMESTAMP NOT NULL,
    revoked BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- Rate limiting y seguridad
-- ============================================
CREATE TABLE IF NOT EXISTS login_attempts (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    ip_address INET NOT NULL,
    success BOOLEAN NOT NULL,
    attempted_at TIMESTAMP DEFAULT NOW()
);

-- Códigos de verificación (email, reset password)
CREATE TABLE IF NOT EXISTS verification_codes (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    code VARCHAR(6) NOT NULL,                  -- 6 dígitos
    purpose VARCHAR(30) NOT NULL,              -- 'email_verify', 'password_reset'
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- Vincular shopping_lists al usuario
-- ============================================
ALTER TABLE shopping_lists 
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- ============================================
-- Seed: Zonas de Argentina (AMBA + principales ciudades)
-- ============================================
INSERT INTO zones (code, name, province) VALUES
    ('caba', 'Capital Federal (CABA)', 'Buenos Aires'),
    ('gba_norte', 'GBA Norte (Vicente López, San Isidro, Tigre)', 'Buenos Aires'),
    ('gba_sur', 'GBA Sur (Avellaneda, Lanús, Quilmes)', 'Buenos Aires'),
    ('gba_oeste', 'GBA Oeste (Morón, Merlo, La Matanza)', 'Buenos Aires'),
    ('la_plata', 'La Plata y alrededores', 'Buenos Aires'),
    ('mar_del_plata', 'Mar del Plata', 'Buenos Aires'),
    ('cordoba', 'Córdoba Capital', 'Córdoba'),
    ('rosario', 'Rosario', 'Santa Fe'),
    ('mendoza', 'Mendoza Capital', 'Mendoza'),
    ('tucuman', 'San Miguel de Tucumán', 'Tucumán')
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- Seed: Supermercados disponibles por zona
-- (No todos los súpers llegan a todas las zonas)
-- ============================================
-- CABA: todos los súpers
INSERT INTO zone_supermarkets (zone_id, supermarket_id, has_delivery, min_order)
SELECT z.id, s.id, true, 15000
FROM zones z, supermarkets s
WHERE z.code = 'caba' AND s.code IN ('carrefour', 'coto', 'dia', 'jumbo')
ON CONFLICT (zone_id, supermarket_id) DO NOTHING;

-- GBA Norte: todos
INSERT INTO zone_supermarkets (zone_id, supermarket_id, has_delivery, min_order)
SELECT z.id, s.id, true, 18000
FROM zones z, supermarkets s
WHERE z.code = 'gba_norte' AND s.code IN ('carrefour', 'coto', 'dia', 'jumbo')
ON CONFLICT (zone_id, supermarket_id) DO NOTHING;

-- GBA Sur: sin Jumbo
INSERT INTO zone_supermarkets (zone_id, supermarket_id, has_delivery, min_order)
SELECT z.id, s.id, true, 18000
FROM zones z, supermarkets s
WHERE z.code = 'gba_sur' AND s.code IN ('carrefour', 'coto', 'dia')
ON CONFLICT (zone_id, supermarket_id) DO NOTHING;

-- GBA Oeste: sin Jumbo
INSERT INTO zone_supermarkets (zone_id, supermarket_id, has_delivery, min_order)
SELECT z.id, s.id, true, 18000
FROM zones z, supermarkets s
WHERE z.code = 'gba_oeste' AND s.code IN ('carrefour', 'coto', 'dia')
ON CONFLICT (zone_id, supermarket_id) DO NOTHING;

-- Córdoba: Carrefour, Día
INSERT INTO zone_supermarkets (zone_id, supermarket_id, has_delivery, min_order)
SELECT z.id, s.id, true, 15000
FROM zones z, supermarkets s
WHERE z.code = 'cordoba' AND s.code IN ('carrefour', 'dia')
ON CONFLICT (zone_id, supermarket_id) DO NOTHING;

-- Rosario: Carrefour, Coto
INSERT INTO zone_supermarkets (zone_id, supermarket_id, has_delivery, min_order)
SELECT z.id, s.id, true, 15000
FROM zones z, supermarkets s
WHERE z.code = 'rosario' AND s.code IN ('carrefour', 'coto')
ON CONFLICT (zone_id, supermarket_id) DO NOTHING;

-- Mendoza: Carrefour
INSERT INTO zone_supermarkets (zone_id, supermarket_id, has_delivery, min_order)
SELECT z.id, s.id, true, 15000
FROM zones z, supermarkets s
WHERE z.code = 'mendoza' AND s.code IN ('carrefour')
ON CONFLICT (zone_id, supermarket_id) DO NOTHING;

-- ============================================
-- Índices
-- ============================================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_zone ON users(zone_id);
CREATE INDEX IF NOT EXISTS idx_user_supermarkets_user ON user_supermarkets(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email, attempted_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address, attempted_at);
CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON verification_codes(email, purpose);
