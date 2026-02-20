"""
SuperCompare - Auth API Routes
Endpoints de registro, login, refresh, y perfil de usuario.
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Depends

from auth import (
    RegisterRequest, LoginRequest, RefreshRequest, TokenResponse,
    PasswordValidator, TokenManager, CurrentUser,
    get_current_user, get_client_ip, rate_limiter,
    REFRESH_TOKEN_EXPIRE_DAYS,
)

router = APIRouter(prefix="/auth", tags=["auth"])

# ============================================
# In-memory store para POC (reemplazar con PostgreSQL)
# ============================================
_users_db: dict[str, dict] = {}         # user_id -> user_data
_emails_db: dict[str, str] = {}         # email -> user_id
_refresh_db: dict[str, dict] = {}       # token_hash -> {user_id, expires_at, revoked}

# Zonas y supermercados disponibles
ZONES = {
    "caba": {"name": "Capital Federal (CABA)", "province": "Buenos Aires",
             "supermarkets": ["carrefour", "coto", "dia", "jumbo"]},
    "gba_norte": {"name": "GBA Norte", "province": "Buenos Aires",
                  "supermarkets": ["carrefour", "coto", "dia", "jumbo"]},
    "gba_sur": {"name": "GBA Sur", "province": "Buenos Aires",
                "supermarkets": ["carrefour", "coto", "dia"]},
    "gba_oeste": {"name": "GBA Oeste", "province": "Buenos Aires",
                  "supermarkets": ["carrefour", "coto", "dia"]},
    "la_plata": {"name": "La Plata", "province": "Buenos Aires",
                 "supermarkets": ["carrefour", "coto", "dia"]},
    "mar_del_plata": {"name": "Mar del Plata", "province": "Buenos Aires",
                      "supermarkets": ["carrefour", "dia"]},
    "cordoba": {"name": "Córdoba Capital", "province": "Córdoba",
                "supermarkets": ["carrefour", "dia"]},
    "rosario": {"name": "Rosario", "province": "Santa Fe",
                "supermarkets": ["carrefour", "coto"]},
    "mendoza": {"name": "Mendoza Capital", "province": "Mendoza",
                "supermarkets": ["vea", "masonline", "modomarket", "coto"]},
    "tucuman": {"name": "Tucumán", "province": "Tucumán",
                "supermarkets": ["carrefour", "dia"]},
}

SUPERMARKETS = {
    "carrefour": {"name": "Carrefour", "color": "#004E9A", "url": "https://www.carrefour.com.ar", "logo": "🔵"},
    "coto": {"name": "Coto Digital", "color": "#E2001A", "url": "https://www.cotodigital.com.ar", "logo": "🔴"},
    "dia": {"name": "Día", "color": "#E67E22", "url": "https://dfrprd.supermercadosdia.com.ar", "logo": "🟠"},
    "jumbo": {"name": "Jumbo", "color": "#00A859", "url": "https://www.jumbo.com.ar", "logo": "🟢"},
    "vea": {"name": "Vea", "color": "#D4213D", "url": "https://www.vea.com.ar", "logo": "🔴"},
    "masonline": {"name": "MasOnline", "color": "#00529B", "url": "https://www.masonline.com.ar", "logo": "🔵"},
    "modomarket": {"name": "ModoMarket", "color": "#FF6B00", "url": "https://www.modomarket.com", "logo": "🟠"},
}


# ============================================
# Public endpoints (no auth needed)
# ============================================

@router.get("/zones")
async def get_zones():
    """Lista zonas disponibles con sus supermercados."""
    result = []
    for code, zone in ZONES.items():
        supers = [
            {"code": s, **SUPERMARKETS[s]}
            for s in zone["supermarkets"]
        ]
        result.append({
            "code": code,
            "name": zone["name"],
            "province": zone["province"],
            "supermarkets": supers,
        })
    return {"zones": result}


@router.post("/register", response_model=TokenResponse)
async def register(req: RegisterRequest, request: Request):
    """Registro de nuevo usuario con selección de zona y supermercados."""
    ip = get_client_ip(request)
    
    # 1. Validar que el email no exista
    if req.email.lower() in _emails_db:
        raise HTTPException(status_code=409, detail="El email ya está registrado")
    
    # 2. Validar password
    valid, msg = PasswordValidator.validate(req.password)
    if not valid:
        raise HTTPException(status_code=422, detail=f"Contraseña insegura: {msg}")
    
    # 3. Validar que los súpers seleccionados estén disponibles en la zona
    zone = ZONES.get(req.zone_code)
    if not zone:
        raise HTTPException(status_code=422, detail="Zona inválida")
    
    invalid_supers = set(req.supermarket_codes) - set(zone["supermarkets"])
    if invalid_supers:
        raise HTTPException(
            status_code=422,
            detail=f"Supermercados no disponibles en tu zona: {', '.join(invalid_supers)}"
        )
    
    # 4. Crear usuario
    user_id = str(uuid.uuid4())
    password_hash = PasswordValidator.hash_password(req.password)
    
    user = {
        "id": user_id,
        "email": req.email.lower(),
        "password_hash": password_hash,
        "full_name": req.full_name,
        "phone": req.phone,
        "zone_code": req.zone_code,
        "supermarkets": req.supermarket_codes,
        "plan": "free",
        "plan_expires_at": None,
        "total_saved": 0,
        "total_tips": 0,
        "compares_used": 0,
        "email_verified": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_login_at": datetime.now(timezone.utc).isoformat(),
    }
    
    _users_db[user_id] = user
    _emails_db[req.email.lower()] = user_id
    
    # 5. Generar tokens
    access_token = TokenManager.create_access_token(user_id, user["email"], user["plan"])
    refresh_raw, refresh_hash = TokenManager.create_refresh_token()
    
    _refresh_db[refresh_hash] = {
        "user_id": user_id,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)).isoformat(),
        "revoked": False,
        "device_info": request.headers.get("User-Agent", ""),
        "ip": ip,
    }
    
    # 6. TODO: Enviar email de verificación
    # await send_verification_email(user["email"], code)
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_raw,
        user=_sanitize_user(user),
    )


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, request: Request):
    """Login con email y contraseña."""
    ip = get_client_ip(request)
    email = req.email.lower()
    
    # 1. Rate limiting
    allowed, reason = rate_limiter.check_rate_limit(email, ip)
    if not allowed:
        raise HTTPException(status_code=429, detail=reason)
    
    # 2. Buscar usuario
    user_id = _emails_db.get(email)
    if not user_id:
        rate_limiter.record_attempt(email, ip, success=False)
        raise HTTPException(status_code=401, detail="Email o contraseña incorrectos")
    
    user = _users_db.get(user_id)
    if not user or not user.get("is_active", True):
        rate_limiter.record_attempt(email, ip, success=False)
        raise HTTPException(status_code=401, detail="Email o contraseña incorrectos")
    
    # 3. Verificar password
    if not PasswordValidator.verify_password(req.password, user["password_hash"]):
        rate_limiter.record_attempt(email, ip, success=False)
        raise HTTPException(status_code=401, detail="Email o contraseña incorrectos")
    
    # 4. Login exitoso
    rate_limiter.record_attempt(email, ip, success=True)
    user["last_login_at"] = datetime.now(timezone.utc).isoformat()
    
    # 5. Generar tokens
    access_token = TokenManager.create_access_token(user_id, email, user["plan"])
    refresh_raw, refresh_hash = TokenManager.create_refresh_token()
    
    _refresh_db[refresh_hash] = {
        "user_id": user_id,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)).isoformat(),
        "revoked": False,
        "device_info": request.headers.get("User-Agent", ""),
        "ip": ip,
    }
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_raw,
        user=_sanitize_user(user),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(req: RefreshRequest, request: Request):
    """Renovar access token usando refresh token."""
    token_hash = TokenManager.hash_refresh_token(req.refresh_token)
    
    stored = _refresh_db.get(token_hash)
    if not stored or stored["revoked"]:
        raise HTTPException(status_code=401, detail="Refresh token inválido")
    
    if datetime.fromisoformat(stored["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Refresh token expirado")
    
    user = _users_db.get(stored["user_id"])
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    
    # Revocar el refresh token anterior (rotation)
    stored["revoked"] = True
    
    # Generar nuevos tokens
    access_token = TokenManager.create_access_token(user["id"], user["email"], user["plan"])
    new_refresh_raw, new_refresh_hash = TokenManager.create_refresh_token()
    
    _refresh_db[new_refresh_hash] = {
        "user_id": user["id"],
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)).isoformat(),
        "revoked": False,
        "device_info": request.headers.get("User-Agent", ""),
        "ip": get_client_ip(request),
    }
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_raw,
        user=_sanitize_user(user),
    )


@router.post("/logout")
async def logout(req: RefreshRequest):
    """Revocar refresh token (logout)."""
    token_hash = TokenManager.hash_refresh_token(req.refresh_token)
    stored = _refresh_db.get(token_hash)
    if stored:
        stored["revoked"] = True
    return {"message": "Sesión cerrada"}


# ============================================
# Protected endpoints (auth required)
# ============================================

@router.get("/me")
async def get_profile(user: CurrentUser = Depends(get_current_user)):
    """Obtener perfil del usuario autenticado."""
    stored = _users_db.get(user.id)
    if not stored:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return {"user": _sanitize_user(stored)}


@router.put("/me/supermarkets")
async def update_supermarkets(
    supermarket_codes: list[str],
    user: CurrentUser = Depends(get_current_user),
):
    """Actualizar supermercados habilitados del usuario."""
    stored = _users_db.get(user.id)
    if not stored:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    zone = ZONES.get(stored["zone_code"])
    if not zone:
        raise HTTPException(status_code=422, detail="Zona inválida")
    
    invalid = set(supermarket_codes) - set(zone["supermarkets"])
    if invalid:
        raise HTTPException(
            status_code=422,
            detail=f"No disponibles en tu zona: {', '.join(invalid)}"
        )
    
    stored["supermarkets"] = supermarket_codes
    return {"supermarkets": supermarket_codes}


@router.put("/me/zone")
async def update_zone(
    zone_code: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Cambiar zona del usuario (resetea supermercados disponibles)."""
    stored = _users_db.get(user.id)
    if not stored:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    zone = ZONES.get(zone_code)
    if not zone:
        raise HTTPException(status_code=422, detail="Zona inválida")
    
    stored["zone_code"] = zone_code
    # Filtrar súpers que ya no estén disponibles en la nueva zona
    stored["supermarkets"] = [
        s for s in stored["supermarkets"] if s in zone["supermarkets"]
    ]
    
    return {
        "zone": zone_code,
        "supermarkets": stored["supermarkets"],
        "available_supermarkets": zone["supermarkets"],
    }


@router.post("/me/upgrade")
async def upgrade_to_pro(user: CurrentUser = Depends(get_current_user)):
    """Upgrade a plan Pro (simulado para POC)."""
    stored = _users_db.get(user.id)
    if not stored:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    stored["plan"] = "pro"
    stored["plan_expires_at"] = (
        datetime.now(timezone.utc) + timedelta(days=30)
    ).isoformat()
    
    return {"plan": "pro", "expires_at": stored["plan_expires_at"]}


# ============================================
# Helper
# ============================================
def _sanitize_user(user: dict) -> dict:
    """Remueve campos sensibles antes de enviar al frontend."""
    return {
        "id": user["id"],
        "email": user["email"],
        "full_name": user["full_name"],
        "phone": user.get("phone"),
        "zone_code": user["zone_code"],
        "zone_name": ZONES.get(user["zone_code"], {}).get("name", ""),
        "supermarkets": user["supermarkets"],
        "plan": user["plan"],
        "plan_expires_at": user.get("plan_expires_at"),
        "total_saved": user.get("total_saved", 0),
        "compares_used": user.get("compares_used", 0),
        "email_verified": user.get("email_verified", False),
        "created_at": user.get("created_at"),
    }
