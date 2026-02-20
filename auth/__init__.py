"""
SuperCompare - Authentication & Security Module
JWT + bcrypt + rate limiting + refresh tokens
"""
import os
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from dataclasses import dataclass

import bcrypt
import jwt
from fastapi import HTTPException, Request, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, field_validator
import re

# ============================================
# Config
# ============================================
JWT_SECRET = os.getenv("JWT_SECRET", secrets.token_hex(32))
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 30
MAX_LOGIN_ATTEMPTS = 5          # Por email en ventana de tiempo
LOGIN_ATTEMPT_WINDOW = 15       # Minutos
MAX_LOGIN_ATTEMPTS_IP = 20      # Por IP en ventana
BCRYPT_ROUNDS = 12


# ============================================
# Password Security
# ============================================
class PasswordValidator:
    """Validación de contraseñas robusta."""
    MIN_LENGTH = 8
    
    COMMON_PASSWORDS = {
        "password", "12345678", "qwerty123", "abc12345",
        "password1", "iloveyou", "123456789", "admin123",
        "letmein1", "welcome1", "monkey12", "master12",
    }
    
    @classmethod
    def validate(cls, password: str) -> tuple[bool, str]:
        if len(password) < cls.MIN_LENGTH:
            return False, f"Mínimo {cls.MIN_LENGTH} caracteres"
        if password.lower() in cls.COMMON_PASSWORDS:
            return False, "Contraseña muy común, elegí otra"
        if not re.search(r'[A-Z]', password):
            return False, "Incluí al menos una mayúscula"
        if not re.search(r'[a-z]', password):
            return False, "Incluí al menos una minúscula"
        if not re.search(r'[0-9]', password):
            return False, "Incluí al menos un número"
        return True, "OK"
    
    @classmethod
    def hash_password(cls, password: str) -> str:
        salt = bcrypt.gensalt(rounds=BCRYPT_ROUNDS)
        return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
    
    @classmethod
    def verify_password(cls, password: str, password_hash: str) -> bool:
        return bcrypt.checkpw(
            password.encode('utf-8'),
            password_hash.encode('utf-8')
        )


# ============================================
# Token Management
# ============================================
class TokenManager:
    """Manejo de JWT access tokens y refresh tokens."""
    
    @staticmethod
    def create_access_token(user_id: str, email: str, plan: str = "free") -> str:
        payload = {
            "sub": user_id,
            "email": email,
            "plan": plan,
            "type": "access",
            "iat": datetime.now(timezone.utc),
            "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        }
        return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    
    @staticmethod
    def create_refresh_token() -> tuple[str, str]:
        """Retorna (token_raw, token_hash) — guardamos solo el hash en DB."""
        raw = secrets.token_urlsafe(64)
        hashed = hashlib.sha256(raw.encode()).hexdigest()
        return raw, hashed
    
    @staticmethod
    def hash_refresh_token(raw_token: str) -> str:
        return hashlib.sha256(raw_token.encode()).hexdigest()
    
    @staticmethod
    def decode_access_token(token: str) -> dict:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            if payload.get("type") != "access":
                raise HTTPException(status_code=401, detail="Token inválido")
            return payload
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token expirado")
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Token inválido")
    
    @staticmethod
    def generate_verification_code() -> str:
        """Genera código de 6 dígitos para verificación de email."""
        return f"{secrets.randbelow(1000000):06d}"


# ============================================
# Rate Limiter (in-memory para POC, Redis en prod)
# ============================================
class RateLimiter:
    """Rate limiting por email e IP para login attempts."""
    
    def __init__(self):
        # En producción: Redis. Para POC: dict en memoria.
        self._attempts: dict[str, list[datetime]] = {}
    
    def _clean_old(self, key: str, window_minutes: int):
        if key not in self._attempts:
            return
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=window_minutes)
        self._attempts[key] = [
            t for t in self._attempts[key] if t > cutoff
        ]
    
    def record_attempt(self, email: str, ip: str, success: bool):
        """Registra un intento de login."""
        now = datetime.now(timezone.utc)
        for key in [f"email:{email}", f"ip:{ip}"]:
            if key not in self._attempts:
                self._attempts[key] = []
            self._attempts[key].append(now)
    
    def check_rate_limit(self, email: str, ip: str) -> tuple[bool, str]:
        """Chequea si el email/IP está rate-limited. Retorna (allowed, reason)."""
        # Check por email
        self._clean_old(f"email:{email}", LOGIN_ATTEMPT_WINDOW)
        email_attempts = len(self._attempts.get(f"email:{email}", []))
        if email_attempts >= MAX_LOGIN_ATTEMPTS:
            return False, f"Demasiados intentos. Esperá {LOGIN_ATTEMPT_WINDOW} minutos."
        
        # Check por IP
        self._clean_old(f"ip:{ip}", LOGIN_ATTEMPT_WINDOW)
        ip_attempts = len(self._attempts.get(f"ip:{ip}", []))
        if ip_attempts >= MAX_LOGIN_ATTEMPTS_IP:
            return False, "Demasiados intentos desde esta conexión."
        
        return True, "OK"


# Singleton
rate_limiter = RateLimiter()


# ============================================
# Request Models (Pydantic)
# ============================================
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    phone: Optional[str] = None
    zone_code: str
    supermarket_codes: list[str]  # ['carrefour', 'coto', 'dia']
    
    @field_validator('full_name')
    @classmethod
    def validate_name(cls, v):
        v = v.strip()
        if len(v) < 2:
            raise ValueError('Nombre muy corto')
        if len(v) > 200:
            raise ValueError('Nombre muy largo')
        return v
    
    @field_validator('supermarket_codes')
    @classmethod
    def validate_supermarkets(cls, v):
        if not v or len(v) == 0:
            raise ValueError('Seleccioná al menos un supermercado')
        valid = {'carrefour', 'coto', 'dia', 'jumbo'}
        for code in v:
            if code not in valid:
                raise ValueError(f'Supermercado inválido: {code}')
        return v
    
    @field_validator('zone_code')
    @classmethod
    def validate_zone(cls, v):
        valid = {
            'caba', 'gba_norte', 'gba_sur', 'gba_oeste',
            'la_plata', 'mar_del_plata', 'cordoba', 'rosario',
            'mendoza', 'tucuman'
        }
        if v not in valid:
            raise ValueError('Zona inválida')
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "Bearer"
    expires_in: int = ACCESS_TOKEN_EXPIRE_MINUTES * 60
    user: dict


# ============================================
# FastAPI Dependencies
# ============================================
security = HTTPBearer(auto_error=False)


@dataclass
class CurrentUser:
    """Usuario autenticado extraído del JWT."""
    id: str
    email: str
    plan: str


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> CurrentUser:
    """Dependency de FastAPI: extrae y valida el usuario del JWT."""
    if not credentials:
        raise HTTPException(status_code=401, detail="No autenticado")
    
    payload = TokenManager.decode_access_token(credentials.credentials)
    
    return CurrentUser(
        id=payload["sub"],
        email=payload["email"],
        plan=payload.get("plan", "free"),
    )


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[CurrentUser]:
    """Como get_current_user pero permite requests sin auth."""
    if not credentials:
        return None
    try:
        payload = TokenManager.decode_access_token(credentials.credentials)
        return CurrentUser(
            id=payload["sub"],
            email=payload["email"],
            plan=payload.get("plan", "free"),
        )
    except HTTPException:
        return None


def get_client_ip(request: Request) -> str:
    """Extrae IP real del request (soporta proxies)."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
