"""
SuperCompare - Scrapers VTEX Argentina (v4)
============================================
Todos los endpoints confirmados en vivo. Sin Playwright.

STATUS:
  ✅ Vea          → VTEX Intelligent Search API
  ✅ MasOnline    → VTEX Intelligent Search API
  ✅ Jumbo        → VTEX Intelligent Search API
  ✅ Disco        → VTEX Intelligent Search API
  ✅ Hiperlibertad→ VTEX Intelligent Search API
  ✅ ModoMarket   → VTEX Catalog System (status 206 = OK)

Requisitos:
    pip install httpx
"""

import asyncio
import json
import re
from typing import Optional
from datetime import datetime, timezone
from dataclasses import dataclass, field

import httpx


# ============================================
# Data model
# ============================================
@dataclass
class ScrapedProduct:
    store: str
    external_id: str
    raw_name: str
    brand: str
    price: float
    price_per_unit: Optional[float] = None
    unit: Optional[str] = None
    quantity: Optional[float] = None
    image_url: Optional[str] = None
    product_url: Optional[str] = None
    category_path: Optional[str] = None
    in_stock: bool = True
    promo_price: Optional[float] = None
    promo_description: Optional[str] = None
    scraped_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def effective_price(self) -> float:
        return self.promo_price if self.promo_price else self.price

    def discount_pct(self) -> Optional[int]:
        if self.promo_price and self.price > self.promo_price:
            return round((1 - self.promo_price / self.price) * 100)
        return None

    def __str__(self) -> str:
        p = f"${self.effective_price():,.0f}"
        d = self.discount_pct()
        if d:
            p += f" ({d}% OFF, antes ${self.price:,.0f})"
        return f"[{self.store}] {self.raw_name} — {self.brand} — {p}"


# ============================================
# Shared utilities
# ============================================
def extract_quantity(name: str) -> tuple[Optional[float], Optional[str]]:
    """Extrae cantidad y unidad del nombre del producto."""
    patterns = [
        r'(\d+(?:[.,]\d+)?)\s*(lt|lts|ltr|ltrs|litro|litros|l)\b',
        r'(\d+(?:[.,]\d+)?)\s*(kg|kgs|kilo|kilos)\b',
        r'(\d+(?:[.,]\d+)?)\s*(gr|grs|g)\b',
        r'(\d+(?:[.,]\d+)?)\s*(ml|cc)\b',
        r'(\d+(?:[.,]\d+)?)\s*(un|u|unidades)\b',
        r'x\s*(\d+(?:[.,]\d+)?)\s*(lt|ltr|l|kg|gr|g|ml|cc|un|u)',
    ]
    unit_map = {
        "lt": "lt", "lts": "lt", "ltr": "lt", "ltrs": "lt",
        "litro": "lt", "litros": "lt", "l": "lt",
        "kg": "kg", "kgs": "kg", "kilo": "kg", "kilos": "kg",
        "gr": "gr", "grs": "gr", "g": "gr",
        "ml": "ml", "cc": "ml",
        "un": "un", "u": "un", "unidades": "un",
    }
    for pattern in patterns:
        match = re.search(pattern, name.lower())
        if match:
            qty = float(match.group(1).replace(",", "."))
            unit = unit_map.get(match.group(2), match.group(2))
            return qty, unit
    return None, None


def calc_price_per_unit(price: float, quantity: Optional[float], unit: Optional[str]) -> tuple[Optional[float], Optional[str]]:
    """
    Calcula precio por unidad normalizado.
    Siempre devuelve $/lt o $/kg (nunca $/ml o $/gr).
    Returns: (price_per_unit, display_unit)
    """
    if not quantity or quantity <= 0:
        return None, unit
    if unit in ("lt", "kg"):
        return price / quantity, unit
    elif unit == "ml":
        return (price / quantity) * 1000, "lt"   # normalizar a $/lt
    elif unit == "gr":
        return (price / quantity) * 1000, "kg"   # normalizar a $/kg
    return None, unit


COMMON_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
}


# ============================================
# 1. VTEX Intelligent Search Scraper
#    Para: Vea, MasOnline
# ============================================
class VTEXIntelligentSearchScraper:
    """
    VTEX Intelligent Search API — confirmado Vea + MasOnline.
    
    Endpoint:
        GET {base_url}/api/io/_v/api/intelligent-search/product_search/
            ?query={term}&count={n}&page={p}&locale=es-AR
    
    Precio: priceRange.sellingPrice.lowPrice (confiable)
    Promo:  listPrice.lowPrice > sellingPrice.lowPrice (solo si ratio < 2x)
    """

    STORES = {
        "vea": {
            "name": "Vea",
            "base_url": "https://www.vea.com.ar",
            "color": "#D4213D",
        },
        "masonline": {
            "name": "MasOnline",
            "base_url": "https://www.masonline.com.ar",
            "color": "#00529B",
        },
        "jumbo": {
            "name": "Jumbo",
            "base_url": "https://www.jumbo.com.ar",
            "color": "#E3051B",
        },
        "disco": {
            "name": "Disco",
            "base_url": "https://www.disco.com.ar",
            "color": "#008C45",
        },
        "hiperlibertad": {
            "name": "Hiperlibertad",
            "base_url": "https://www.hiperlibertad.com.ar",
            "color": "#FFC107",
        },
    }

    def __init__(self, store_code: str, delay: float = 2.0):
        assert store_code in self.STORES, f"Store '{store_code}' no soportado"
        self.store_code = store_code
        self.config = self.STORES[store_code]
        self.delay = delay
        self.client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self):
        self.client = httpx.AsyncClient(
            headers={**COMMON_HEADERS, "Referer": self.config["base_url"]},
            timeout=30.0, follow_redirects=True,
        )
        return self

    async def __aexit__(self, *args):
        if self.client:
            await self.client.aclose()

    async def search(self, query: str, max_results: int = 50) -> list[ScrapedProduct]:
        products = []
        page = 1

        while len(products) < max_results:
            url = f"{self.config['base_url']}/api/io/_v/api/intelligent-search/product_search/"
            params = {"query": query, "count": min(max_results, 50), "page": page, "locale": "es-AR"}

            try:
                resp = await self.client.get(url, params=params)
                if resp.status_code != 200:
                    break
                data = resp.json()
                items = data.get("products", [])
                if not items:
                    break
                for item in items:
                    p = self._parse(item)
                    if p:
                        products.append(p)
                if len(products) >= data.get("recordsFiltered", 0):
                    break
                page += 1
                await asyncio.sleep(self.delay)
            except Exception as e:
                print(f"[{self.store_code}] Error: {e}")
                break

        return products[:max_results]

    async def get_suggestions(self, query: str) -> list[dict]:
        url = f"{self.config['base_url']}/api/io/_v/api/intelligent-search/search_suggestions"
        try:
            resp = await self.client.get(url, params={"query": query, "locale": "es-AR"})
            if resp.status_code == 200:
                return resp.json().get("searches", [])
        except Exception:
            pass
        return []

    async def get_categories(self) -> list[dict]:
        try:
            resp = await self.client.get(f"{self.config['base_url']}/api/catalog_system/pub/category/tree/3")
            if resp.status_code == 200:
                return resp.json()
        except Exception:
            pass
        return []

    def _parse(self, item: dict) -> Optional[ScrapedProduct]:
        name = item.get("productName", "") or item.get("name", "")
        if not name:
            return None

        brand = item.get("brand", "")
        # Usar SKU itemId (necesario para agregar al carrito VTEX)
        items_list = item.get("items", [])
        sku_id = str(items_list[0].get("itemId", "")) if items_list else ""
        product_id = sku_id or str(item.get("productId", ""))

        # Precio via priceRange (más confiable)
        price, promo_price, promo_desc = None, None, None
        pr = item.get("priceRange", {})
        selling_low = pr.get("sellingPrice", {}).get("lowPrice", 0)
        listing_low = pr.get("listPrice", {}).get("lowPrice", 0)

        if selling_low and selling_low > 0:
            price = selling_low
            if listing_low and listing_low > selling_low and (listing_low / selling_low) < 2.0:
                promo_price = selling_low
                price = listing_low
                promo_desc = f"{round((1 - promo_price / price) * 100)}% OFF"

        # Fallback: sellers
        if price is None:
            for sku in item.get("items", []):
                for seller in sku.get("sellers", []):
                    offer = seller.get("commertialOffer", {})
                    p = offer.get("Price", 0)
                    if p and p > 0:
                        price = p
                        break
                if price:
                    break

        if not price or price <= 0:
            return None

        # Link
        link = item.get("link", "") or item.get("linkText", "")
        product_url = f"{self.config['base_url']}{link}" if link and link.startswith("/") else (
            f"{self.config['base_url']}/{link}" if link and not link.startswith("http") else link
        )

        # Image
        image_url = ""
        items_list = item.get("items", [])
        if items_list:
            imgs = items_list[0].get("images", [])
            if imgs:
                image_url = imgs[0].get("imageUrl", "")

        # Stock
        in_stock = True
        if items_list:
            for seller in items_list[0].get("sellers", []):
                avail = seller.get("commertialOffer", {}).get("AvailableQuantity", 1)
                in_stock = avail > 0
                break

        quantity, unit = extract_quantity(name)
        effective = promo_price or price
        price_per_unit, display_unit = calc_price_per_unit(effective, quantity, unit)

        categories = item.get("categories", [])
        cat_path = categories[0].strip("/").replace("/", " > ") if categories else ""

        return ScrapedProduct(
            store=self.store_code, external_id=product_id,
            raw_name=name, brand=brand, price=price,
            price_per_unit=price_per_unit, unit=display_unit, quantity=quantity,
            image_url=image_url, product_url=product_url,
            category_path=cat_path, in_stock=in_stock,
            promo_price=promo_price, promo_description=promo_desc,
        )


# ============================================
# 2. VTEX Catalog System Scraper
#    Para: ModoMarket
# ============================================
class VTEXCatalogScraper:
    """
    VTEX Catalog System (legacy) — confirmado ModoMarket.
    
    Endpoint:
        GET {base_url}/api/catalog_system/pub/products/search/?ft={query}&_from=0&_to=49
    
    IMPORTANTE: ModoMarket devuelve status 206 (Partial Content) = OK.
    Header 'resources': '0-4/98' indica paginación.
    """

    STORES = {
        "modomarket": {
            "name": "ModoMarket",
            "base_url": "https://www.modomarket.com",
            "color": "#FF6B00",
        },
    }

    def __init__(self, store_code: str, delay: float = 2.0):
        assert store_code in self.STORES, f"Store '{store_code}' no soportado"
        self.store_code = store_code
        self.config = self.STORES[store_code]
        self.delay = delay
        self.client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self):
        self.client = httpx.AsyncClient(
            headers={**COMMON_HEADERS, "Referer": self.config["base_url"]},
            timeout=30.0, follow_redirects=True,
        )
        return self

    async def __aexit__(self, *args):
        if self.client:
            await self.client.aclose()

    async def search(self, query: str, max_results: int = 50) -> list[ScrapedProduct]:
        products = []
        _from = 0
        page_size = min(max_results, 50)

        while len(products) < max_results:
            _to = _from + page_size - 1
            # Build URL with proper URL encoding
            # VTEX Catalog accepts ft= for free-text search
            from urllib.parse import quote
            base = f"{self.config['base_url']}/api/catalog_system/pub/products/search/"
            encoded_q = quote(query)
            url = f"{base}?ft={encoded_q}&_from={_from}&_to={_to}"

            try:
                resp = await self.client.get(url)
                # ModoMarket devuelve 206 = OK (partial content)
                if resp.status_code not in (200, 206):
                    print(f"[{self.store_code}] Status {resp.status_code} for '{query}'")
                    break

                try:
                    data = resp.json()
                except Exception:
                    break

                if not isinstance(data, list) or not data:
                    break
                for item in data:
                    p = self._parse(item)
                    if p:
                        products.append(p)

                # Check pagination via resources header: "0-4/98"
                resources = resp.headers.get("resources", "")
                if resources:
                    parts = resources.split("/")
                    if len(parts) == 2:
                        total = int(parts[1])
                        if _from + page_size >= total:
                            break

                _from += page_size
                await asyncio.sleep(self.delay)
            except Exception as e:
                print(f"[{self.store_code}] Error: {e}")
                break

        return products[:max_results]

    async def get_categories(self) -> list[dict]:
        try:
            resp = await self.client.get(f"{self.config['base_url']}/api/catalog_system/pub/category/tree/3")
            if resp.status_code == 200:
                return resp.json()
        except Exception:
            pass
        return []

    def _parse(self, item: dict) -> Optional[ScrapedProduct]:
        name = item.get("productName", "")
        if not name:
            return None

        brand = item.get("brand", "")
        items_list = item.get("items", [])
        # Usar SKU itemId (necesario para agregar al carrito VTEX)
        sku_id = str(items_list[0].get("itemId", "")) if items_list else ""
        product_id = sku_id or str(item.get("productId", ""))
        link_text = item.get("linkText", "")
        product_url = f"{self.config['base_url']}/{link_text}/p" if link_text else ""

        price, promo_price, promo_desc = 0, None, None
        image_url = ""
        in_stock = True
        if items_list:
            sku = items_list[0]
            imgs = sku.get("images", [])
            if imgs:
                image_url = imgs[0].get("imageUrl", "")

            for seller in sku.get("sellers", []):
                offer = seller.get("commertialOffer", {})
                p = offer.get("Price", 0)
                lp = offer.get("ListPrice", 0)
                in_stock = offer.get("AvailableQuantity", 0) > 0

                if p and p > 0:
                    price = p
                    if lp and lp > p and (lp / p) < 2.0:
                        promo_price = p
                        price = lp
                        promo_desc = f"{round((1 - promo_price / price) * 100)}% OFF"
                    break

        if not price:
            return None

        categories = item.get("categories", [])
        cat_path = categories[0].strip("/").replace("/", " > ") if categories else ""
        quantity, unit = extract_quantity(name)
        effective = promo_price or price
        price_per_unit, display_unit = calc_price_per_unit(effective, quantity, unit)

        return ScrapedProduct(
            store=self.store_code, external_id=product_id,
            raw_name=name, brand=brand, price=price,
            price_per_unit=price_per_unit, unit=display_unit, quantity=quantity,
            image_url=image_url, product_url=product_url,
            category_path=cat_path, in_stock=in_stock,
            promo_price=promo_price, promo_description=promo_desc,
        )


# ============================================
# Multi-store search
# ============================================
ALL_STORES = list(VTEXIntelligentSearchScraper.STORES.keys()) + ["modomarket"]


async def search_vtex(
    query: str,
    stores: Optional[list[str]] = None,
    max_per_store: int = 20,
) -> dict[str, list[ScrapedProduct]]:
    """
    Busca en supermercados VTEX de Argentina. HTTP puro, sin Playwright.

    Args:
        query: Término de búsqueda (ej: "leche entera")
        stores: Lista de tiendas. Default: todas.
                Opciones: ["vea", "masonline", "jumbo", "disco", "hiperlibertad", "modomarket"]
        max_per_store: Máximo resultados por tienda

    Returns:
        Dict {store_code: [ScrapedProduct, ...]}
    """
    if stores is None:
        stores = ALL_STORES

    results = {}

    # ── VTEX Intelligent Search: Vea, MasOnline, Jumbo, Disco, Hiperlibertad ──
    is_stores = [s for s in stores if s in VTEXIntelligentSearchScraper.STORES]

    async def _search_is(code):
        async with VTEXIntelligentSearchScraper(code) as scraper:
            return code, await scraper.search(query, max_per_store)

    # ── VTEX Catalog: ModoMarket ──
    async def _search_catalog(code):
        async with VTEXCatalogScraper(code) as scraper:
            return code, await scraper.search(query, max_per_store)

    tasks = [_search_is(s) for s in is_stores]
    if "modomarket" in stores:
        tasks.append(_search_catalog("modomarket"))

    task_results = await asyncio.gather(*tasks, return_exceptions=True)

    for r in task_results:
        if isinstance(r, Exception):
            print(f"Error: {r}")
        else:
            code, products = r
            results[code] = products

    return results


# Alias para compatibilidad
search_mendoza = search_vtex


# ============================================
# Demo
# ============================================
async def demo():
    print("=" * 60)
    print("SuperCompare — Demo Scrapers Mendoza v3")
    print("Todo HTTP puro, sin Playwright 🚀")
    print("=" * 60)

    query = "leche entera"
    print(f"\n🔍 Buscando '{query}' en los 4 supermercados...\n")

    results = await search_mendoza(query, max_per_store=5)

    for store, products in results.items():
        print(f"\n{'─'*50}")
        print(f"🏪 {store.upper()} ({len(products)} resultados)")
        print(f"{'─'*50}")
        for p in products:
            ppu = f" | ${p.price_per_unit:,.0f}/{p.unit}" if p.price_per_unit and p.unit else ""
            print(f"  {p}{ppu}")

    # Summary
    print(f"\n{'='*60}")
    print("📊 RESUMEN")
    total = sum(len(p) for p in results.values())
    print(f"   Total: {total} productos de {len(results)} tiendas")
    for store, products in results.items():
        print(f"   {store}: {len(products)} productos")


if __name__ == "__main__":
    asyncio.run(demo())
