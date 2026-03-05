"""
SuperCompare API — v2 with Mendoza Integration
================================================
Real-time multi-store price comparison for Argentine supermarkets.

Run:
    uvicorn api.main:app --reload --port 8000

Endpoints:
    GET  /                          → Health check
    GET  /api/search?q=leche        → Real-time multi-store search
    GET  /api/search/suggestions    → Autocomplete suggestions
    GET  /api/compare/leche+entera  → Compare across stores
    GET  /api/stores                → List available stores
    GET  /api/stats                 → System stats

Auth (from auth module):
    POST /auth/register
    POST /auth/login
    POST /auth/refresh
"""

import logging
import time
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.search import router as search_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ============================================
# App
# ============================================

app = FastAPI(
    title="SuperCompare API",
    description="Comparador de precios de supermercados argentinos en tiempo real",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",     # React dev
        "http://localhost:5173",     # Vite dev
        "http://localhost:5174",     # Vite dev
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================
# Middleware: Request logging
# ============================================

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.monotonic()
    response = await call_next(request)
    elapsed = (time.monotonic() - start) * 1000

    if request.url.path not in ("/", "/health", "/favicon.ico"):
        logger.info(
            f"{request.method} {request.url.path} → {response.status_code} ({elapsed:.0f}ms)"
        )
    return response


# ============================================
# Exception handler
# ============================================

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


# ============================================
# Routers
# ============================================

# Search & comparison
app.include_router(search_router)

# Auth (import conditionally — may not be set up yet)
try:
    from auth.routes import router as auth_router
    # Auth routes already have prefix="/auth" in their router definition
    app.include_router(auth_router, tags=["auth"])
    logger.info("Auth router loaded")
except ImportError:
    logger.warning("Auth module not found — running without auth")

# Cart
try:
    from api.cart import router as cart_router
    app.include_router(cart_router, tags=["cart"])
    logger.info("Cart router loaded")
except ImportError as e:
    logger.warning(f"Cart module not found — {e}")
    
# ============================================
# Health / Root
# ============================================

_start_time = datetime.now(timezone.utc)


@app.get("/")
async def root():
    return {
        "name": "SuperCompare API",
        "version": "2.0.0",
        "status": "running",
        "uptime_seconds": int((datetime.now(timezone.utc) - _start_time).total_seconds()),
        "stores": ["vea", "masonline", "modomarket", "coto"],
        "endpoints": {
            "search": "/api/search?q=leche+entera",
            "compare": "/api/compare/leche+entera",
            "suggestions": "/api/search/suggestions?q=lec",
            "stores": "/api/stores",
            "docs": "/docs",
        },
    }


@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


# ============================================
# Startup
# ============================================

@app.on_event("startup")
async def startup():
    logger.info("=" * 50)
    logger.info("SuperCompare API v2.0.0 starting...")
    logger.info("Stores: Vea, MasOnline, ModoMarket, Coto Digital")
    logger.info("Mode: Real-time search (no cache)")
    logger.info("=" * 50)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
