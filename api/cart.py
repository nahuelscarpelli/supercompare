"""
SuperCompare — Cart Builder
POST /api/cart/build

Recibe los items seleccionados por el usuario (con external_id y store),
crea los carritos en cada supermercado VTEX y devuelve las URLs de checkout.

Incluye marketingData (utmSource/utmCampaign) para tracking de referidos
y futura monetización por comisiones.
"""
import asyncio
import httpx
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/cart", tags=["cart"])

# ─── Configuración de cada tienda VTEX ───────────────────────────────────────
VTEX_STORES = {
    "vea": {
        "name": "Vea",
        "base_url": "https://www.vea.com.ar",
        "checkout_url": "https://www.vea.com.ar/checkout#/cart",
    },
    "masonline": {
        "name": "MasOnline",
        "base_url": "https://www.masonline.com.ar",
        "checkout_url": "https://www.masonline.com.ar/checkout#/cart",
    },
    "jumbo": {
        "name": "Jumbo",
        "base_url": "https://www.jumbo.com.ar",
        "checkout_url": "https://www.jumbo.com.ar/checkout#/cart",
    },
    "disco": {
        "name": "Disco",
        "base_url": "https://www.disco.com.ar",
        "checkout_url": "https://www.disco.com.ar/checkout#/cart",
    },
    "hiperlibertad": {
        "name": "Hiperlibertad",
        "base_url": "https://www.hiperlibertad.com.ar",
        "checkout_url": "https://www.hiperlibertad.com.ar/checkout#/cart",
    },
    "modomarket": {
        "name": "ModoMarket",
        "base_url": "https://www.modomarket.com",
        "checkout_url": "https://www.modomarket.com/checkout#/cart",
    },
}

# ─── Marketing/Referido config ───────────────────────────────────────────────
MARKETING_DATA = {
    "utmSource": "supercompare",
    "utmMedium": "price-comparison",
    "utmCampaign": "cart-builder",
    "marketingTags": ["supercompare", "price-comparison"],
    "utmiPage": "",
    "utmiPart": "supercompare",
    "utmiCampaign": "",
    "coupon": "",
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
    "Content-Type": "application/json",
}


# ─── Modelos ──────────────────────────────────────────────────────────────────
class CartItem(BaseModel):
    store: str        # "vea" | "masonline" | "jumbo" | "disco" | "hiperlibertad" | "modomarket"
    external_id: str  # SKU ID del producto (viene del search)
    quantity: int = 1
    name: str = ""    # para mostrar en la respuesta


class CartRequest(BaseModel):
    items: list[CartItem]


class StoreCart(BaseModel):
    store: str
    store_name: str
    checkout_url: str        # URL directa al carrito lleno
    items_added: int
    items_failed: list[str]  # nombres de productos que fallaron
    success: bool


class CartResponse(BaseModel):
    carts: list[StoreCart]
    total_stores: int


# ─── VTEX Cart API ────────────────────────────────────────────────────────────
async def create_vtex_orderform(client: httpx.AsyncClient, base_url: str) -> str | None:
    """Crea un nuevo orderForm (sesión de carrito) en VTEX."""
    try:
        resp = await client.get(
            f"{base_url}/api/checkout/pub/orderForm",
            headers={**HEADERS, "Referer": base_url},
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            return data.get("orderFormId")
    except Exception as e:
        print(f"[cart] Error creando orderForm en {base_url}: {e}")
    return None


async def add_items_to_vtex_cart(
    client: httpx.AsyncClient,
    base_url: str,
    order_form_id: str,
    items: list[CartItem],
) -> tuple[int, list[str], bool]:
    """
    Agrega items al carrito VTEX.
    Devuelve (cantidad_agregada, lista_de_fallos, requiere_sucursal).
    requiere_sucursal=True cuando el store necesita que el usuario elija sucursal primero (ORD027).
    """
    added = 0
    failed = []
    needs_branch = False

    vtex_items = [
        {"id": item.external_id, "quantity": item.quantity, "seller": "1"}
        for item in items
    ]

    try:
        resp = await client.post(
            f"{base_url}/api/checkout/pub/orderForm/{order_form_id}/items",
            headers={**HEADERS, "Referer": base_url},
            json={"orderItems": vtex_items},
            timeout=15,
        )
        if resp.status_code == 200:
            data = resp.json()
            cart_items = data.get("items", [])
            added = len(cart_items)
            messages = data.get("messages", [])
            # ORD027 = el store requiere sucursal seleccionada (Cencosud: Vea, Jumbo, Disco)
            needs_branch = any(m.get("code") == "ORD027" for m in messages)
            if needs_branch:
                failed = [item.name or item.external_id for item in items]
            else:
                added_ids = {str(i.get("id")) for i in cart_items}
                for item in items:
                    if item.external_id not in added_ids:
                        failed.append(item.name or item.external_id)
        else:
            failed = [item.name or item.external_id for item in items]
    except Exception as e:
        print(f"[cart] Error agregando items a {base_url}: {e}")
        failed = [item.name or item.external_id for item in items]

    return added, failed, needs_branch


async def attach_marketing_data(
    client: httpx.AsyncClient,
    base_url: str,
    order_form_id: str,
) -> bool:
    """
    Adjunta datos de marketing/referido al carrito VTEX.
    Esto permite que el supermercado vea que la venta vino de SuperCompare
    y es la base para negociar comisiones por referido.
    """
    try:
        resp = await client.post(
            f"{base_url}/api/checkout/pub/orderForm/{order_form_id}/attachments/marketingData",
            headers={**HEADERS, "Referer": base_url},
            json=MARKETING_DATA,
            timeout=10,
        )
        return resp.status_code in (200, 201)
    except Exception as e:
        print(f"[cart] Error adjuntando marketingData en {base_url}: {e}")
        return False


# Cencosud stores require branch selection before items can be added via API (ORD027).
# Instead, we build a direct /checkout/cart/add URL which lets the browser session
# handle the branch selection naturally at checkout time.
CENCOSUD_STORES = {"vea", "jumbo", "disco"}


def build_cencosud_cart_url(base_url: str, items: list[CartItem]) -> str:
    """
    Construye una URL directa de 'agregar al carrito' para stores Cencosud.
    El formato VTEX permite pasar múltiples SKUs via query params repetidos.
    El usuario selecciona su sucursal al llegar al checkout y los items ya están listos.
    """
    params = []
    for item in items:
        params.append(f"sku={item.external_id}&qty={item.quantity}&seller=1")
    items_qs = "&".join(params)
    utm = "utm_source=ahorrAR&utm_medium=price-comparison&utm_campaign=cart-builder"
    return f"{base_url}/checkout/cart/add?{items_qs}&{utm}"


async def build_vtex_cart(store_key: str, items: list[CartItem]) -> StoreCart:
    """Crea un carrito completo para una tienda VTEX con tracking de referido."""
    config = VTEX_STORES[store_key]
    base_url = config["base_url"]

    # ── Cencosud (Vea, Jumbo, Disco): no pre-cargar ───────────────────────────
    # Estos stores requieren sucursal antes de agregar items.
    # Devolvemos el checkout URL limpio — el frontend muestra links por producto.
    if store_key in CENCOSUD_STORES:
        checkout_url = (
            f"{base_url}/checkout"
            f"?utm_source=ahorrAR&utm_medium=price-comparison&utm_campaign=cart-builder"
            f"#/cart"
        )
        return StoreCart(
            store=store_key,
            store_name=config["name"],
            checkout_url=checkout_url,
            items_added=0,
            items_failed=[item.name or item.external_id for item in items],
            success=True,
        )

    async with httpx.AsyncClient(follow_redirects=True) as client:
        # 1. Crear orderForm
        order_form_id = await create_vtex_orderform(client, base_url)

        if not order_form_id:
            return StoreCart(
                store=store_key,
                store_name=config["name"],
                checkout_url=config["checkout_url"],
                items_added=0,
                items_failed=[item.name or item.external_id for item in items],
                success=False,
            )

        # 2. Agregar items al carrito
        added, failed, needs_branch = await add_items_to_vtex_cart(client, base_url, order_form_id, items)

        # 3. Adjuntar datos de marketing/referido (no bloqueante si falla)
        await attach_marketing_data(client, base_url, order_form_id)

        # 4. URL de checkout con UTM params
        checkout_url = (
            f"{base_url}/checkout?orderFormId={order_form_id}"
            f"&utm_source=ahorrAR&utm_medium=price-comparison&utm_campaign=cart-builder"
            f"#/cart"
        )

        return StoreCart(
            store=store_key,
            store_name=config["name"],
            checkout_url=checkout_url,
            items_added=added,
            items_failed=failed,
            success=added > 0,
        )


# ─── Endpoint principal ───────────────────────────────────────────────────────
@router.post("/build", response_model=CartResponse)
async def build_carts(request: CartRequest):
    """
    Recibe la lista de items seleccionados (cada uno con su store y external_id),
    agrupa por tienda, crea los carritos en paralelo y devuelve las URLs.

    Cada carrito incluye:
    - Los productos cargados via VTEX Checkout API
    - marketingData con utmSource=supercompare para tracking de referidos
    - URL de checkout con UTM params
    """
    by_store: dict[str, list[CartItem]] = {}
    for item in request.items:
        if item.store in VTEX_STORES:
            by_store.setdefault(item.store, []).append(item)

    tasks = [build_vtex_cart(store_key, items) for store_key, items in by_store.items()]
    carts = list(await asyncio.gather(*tasks))

    return CartResponse(
        carts=carts,
        total_stores=len(carts),
    )
