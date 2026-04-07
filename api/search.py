"""
SuperCompare — Search API Router
=================================
Real-time multi-store search. Hits all supermarket APIs concurrently
and returns unified, sorted results. Like Ratoneando but better.

Endpoints:
    GET /api/search?q=leche+entera&stores=vea,masonline,coto,modomarket&limit=20
    GET /api/search/suggestions?q=lec&store=vea
    GET /api/stores?zone=mendoza
"""

import asyncio
import time
import logging
from typing import Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Query, HTTPException, Depends
from pydantic import BaseModel

from scrapers.mendoza import (
    VTEXIntelligentSearchScraper,
    VTEXCatalogScraper,
    ScrapedProduct,
    search_vtex,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["search"])


# ============================================
# Response Models
# ============================================

class ProductResult(BaseModel):
    store: str
    store_name: str
    external_id: str
    name: str
    brand: str
    price: float
    effective_price: float
    price_per_unit: Optional[float] = None
    unit: Optional[str] = None
    quantity: Optional[float] = None
    image_url: Optional[str] = None
    product_url: Optional[str] = None
    category: Optional[str] = None
    in_stock: bool = True
    promo_price: Optional[float] = None
    promo_description: Optional[str] = None
    discount_pct: Optional[int] = None


class SearchResponse(BaseModel):
    query: str
    total_results: int
    stores_searched: list[str]
    stores_failed: list[str]
    elapsed_ms: int
    results: list[ProductResult]
    cheapest: Optional[ProductResult] = None


class StoreInfo(BaseModel):
    code: str
    name: str
    color: str
    platform: str


class SuggestionItem(BaseModel):
    term: str
    attributes: Optional[dict] = None


# ============================================
# Store Registry
# ============================================

STORE_REGISTRY = {
    "vea": {
        "name": "Vea",
        "color": "#D4213D",
        "platform": "VTEX Intelligent Search",
        "zone": "nacional",
    },
    "masonline": {
        "name": "MasOnline",
        "color": "#00529B",
        "platform": "VTEX Intelligent Search",
        "zone": "nacional",
    },
    "jumbo": {
        "name": "Jumbo",
        "color": "#E3051B",
        "platform": "VTEX Intelligent Search",
        "zone": "nacional",
    },
    "disco": {
        "name": "Disco",
        "color": "#008C45",
        "platform": "VTEX Intelligent Search",
        "zone": "nacional",
    },
    "hiperlibertad": {
        "name": "Hiperlibertad",
        "color": "#FFC107",
        "platform": "VTEX Intelligent Search",
        "zone": "interior",
    },
    "modomarket": {
        "name": "ModoMarket",
        "color": "#FF6B00",
        "platform": "VTEX Catalog System",
        "zone": "mendoza",
    },
}


def _to_result(p: ScrapedProduct) -> ProductResult:
    """Convert ScrapedProduct to API response model."""
    store_info = STORE_REGISTRY.get(p.store, {})
    return ProductResult(
        store=p.store,
        store_name=store_info.get("name", p.store),
        external_id=p.external_id,
        name=p.raw_name,
        brand=p.brand,
        price=p.price,
        effective_price=p.effective_price(),
        price_per_unit=p.price_per_unit,
        unit=p.unit,
        quantity=p.quantity,
        image_url=p.image_url,
        product_url=p.product_url,
        category=p.category_path,
        in_stock=p.in_stock,
        promo_price=p.promo_price,
        promo_description=p.promo_description,
        discount_pct=p.discount_pct(),
    )


# ============================================
# Endpoints
# ============================================

@router.get("/search", response_model=SearchResponse)
async def search_products(
    q: str = Query(..., min_length=2, max_length=100, description="Search query"),
    stores: Optional[str] = Query(None, description="Comma-separated store codes (default: all)"),
    limit: int = Query(20, ge=1, le=100, description="Max results per store"),
    sort: str = Query("price", description="Sort by: price, unit_price, store, name"),
):
    """
    Real-time multi-store search.
    
    Hits all supermarket APIs concurrently and returns unified results.
    Each search takes ~2-4 seconds (network latency to 4 APIs).
    
    Examples:
        /api/search?q=leche+entera
        /api/search?q=arroz&stores=vea,coto&limit=10
        /api/search?q=yerba&sort=unit_price
    """
    start = time.monotonic()

    # Parse store list
    store_list = None
    if stores:
        store_list = [s.strip().lower() for s in stores.split(",")]
        invalid = [s for s in store_list if s not in STORE_REGISTRY]
        if invalid:
            raise HTTPException(
                400,
                f"Unknown stores: {invalid}. Available: {list(STORE_REGISTRY.keys())}"
            )

    # Execute concurrent search
    try:
        raw_results = await search_vtex(
            query=q,
            stores=store_list,
            max_per_store=limit,
        )
    except Exception as e:
        logger.error(f"Search error: {e}")
        raise HTTPException(500, f"Search failed: {str(e)}")

    # Collect results
    all_products: list[ProductResult] = []
    stores_searched = []
    stores_failed = []

    for store_code, products in raw_results.items():
        if products:
            stores_searched.append(store_code)
            for p in products:
                all_products.append(_to_result(p))
        else:
            stores_failed.append(store_code)

    # Sort
    if sort == "price":
        all_products.sort(key=lambda p: p.effective_price)
    elif sort == "unit_price":
        all_products.sort(key=lambda p: p.price_per_unit or float("inf"))
    elif sort == "store":
        all_products.sort(key=lambda p: (p.store, p.effective_price))
    elif sort == "name":
        all_products.sort(key=lambda p: p.name.lower())

    # Find cheapest
    cheapest = None
    if all_products:
        cheapest = min(all_products, key=lambda p: p.effective_price)

    elapsed = int((time.monotonic() - start) * 1000)

    return SearchResponse(
        query=q,
        total_results=len(all_products),
        stores_searched=stores_searched,
        stores_failed=stores_failed,
        elapsed_ms=elapsed,
        results=all_products,
        cheapest=cheapest,
    )


@router.get("/search/suggestions", response_model=list[SuggestionItem])
async def get_suggestions(
    q: str = Query(..., min_length=2, max_length=50),
    store: str = Query("vea", description="Store for suggestions"),
):
    """Get autocomplete suggestions from a VTEX store."""
    if store not in VTEXIntelligentSearchScraper.STORES:
        raise HTTPException(400, f"Suggestions only available for: {list(VTEXIntelligentSearchScraper.STORES.keys())}")

    try:
        async with VTEXIntelligentSearchScraper(store) as scraper:
            suggestions = await scraper.get_suggestions(q)
            return [
                SuggestionItem(term=s.get("term", ""), attributes=s.get("attributes"))
                for s in suggestions[:10]
            ]
    except Exception as e:
        logger.error(f"Suggestions error: {e}")
        return []


@router.get("/stores", response_model=list[StoreInfo])
async def get_stores(
    zone: Optional[str] = Query(None, description="Filter by zone code"),
):
    """List available stores, optionally filtered by zone."""
    results = []
    for code, info in STORE_REGISTRY.items():
        if zone and info.get("zone") != zone:
            continue
        results.append(StoreInfo(
            code=code,
            name=info["name"],
            color=info["color"],
            platform=info["platform"],
        ))
    return results


@router.get("/compare/{product_name}")
async def compare_product(
    product_name: str,
    stores: Optional[str] = Query(None),
    limit: int = Query(5, ge=1, le=20),
):
    """
    Compare a product across all stores.
    Returns the best match per store with price comparison.
    """
    product_name = product_name.replace("+", " ")

    store_list = None
    if stores:
        store_list = [s.strip().lower() for s in stores.split(",")]

    raw_results = await search_vtex(
        query=product_name,
        stores=store_list,
        max_per_store=limit,
    )

    comparison = {}
    for store_code, products in raw_results.items():
        if products:
            # Take the first (most relevant) result
            best = products[0]
            comparison[store_code] = {
                "name": best.raw_name,
                "brand": best.brand,
                "price": best.effective_price(),
                "original_price": best.price,
                "has_promo": best.promo_price is not None,
                "discount_pct": best.discount_pct(),
                "image_url": best.image_url,
                "product_url": best.product_url,
                "price_per_unit": best.price_per_unit,
                "unit": best.unit,
            }

    if not comparison:
        raise HTTPException(404, f"No results for '{product_name}'")

    prices = {k: v["price"] for k, v in comparison.items()}
    best_store = min(prices, key=prices.get)
    worst_store = max(prices, key=prices.get)
    max_price = prices[worst_store]
    min_price = prices[best_store]

    return {
        "product": product_name,
        "stores": comparison,
        "best_store": best_store,
        "best_price": min_price,
        "worst_store": worst_store,
        "worst_price": max_price,
        "savings": round(max_price - min_price, 2),
        "savings_pct": round(((max_price - min_price) / max_price * 100), 1) if max_price > 0 else 0,
    }
