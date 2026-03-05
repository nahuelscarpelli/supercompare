"""
SuperCompare — Cart Builder
POST /api/cart/build

Recibe los items seleccionados por el usuario (con external_id y store),
crea los carritos en cada supermercado VTEX y devuelve las URLs de checkout.

Coto queda pendiente (Oracle ATG, requiere session diferente).
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
    "modomarket": {
        "name": "ModoMarket",
        "base_url": "https://www.modomarket.com",
        "checkout_url": "https://www.modomarket.com/checkout#/cart",
    },
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
    "Content-Type": "application/json",
}


# ─── Modelos ──────────────────────────────────────────────────────────────────
class CartItem(BaseModel):
    store: str        # "vea" | "masonline" | "modomarket" | "coto"
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
    coto_items: list[CartItem]  # items de Coto para manejar por separado


# ─── VTEX Cart API ────────────────────────────────────────────────────────────
async def create_vtex_orderform(client: httpx.AsyncClient, base_url: str) -> str | None:
    """
    Crea un nuevo orderForm (sesión de carrito) en VTEX.
    Devuelve el orderFormId o None si falla.
    """
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
) -> tuple[int, list[str]]:
    """
    Agrega items al carrito VTEX.
    Devuelve (cantidad_agregada, lista_de_fallos).
    """
    added = 0
    failed = []

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
            # Detectar items que no se agregaron
            added_ids = {str(i.get("id")) for i in cart_items}
            for item in items:
                if item.external_id not in added_ids:
                    failed.append(item.name or item.external_id)
        else:
            failed = [item.name or item.external_id for item in items]
    except Exception as e:
        print(f"[cart] Error agregando items a {base_url}: {e}")
        failed = [item.name or item.external_id for item in items]

    return added, failed


async def build_vtex_cart(store_key: str, items: list[CartItem]) -> StoreCart:
    """
    Crea un carrito completo para una tienda VTEX.
    """
    config = VTEX_STORES[store_key]
    base_url = config["base_url"]

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

        # 2. Agregar items
        added, failed = await add_items_to_vtex_cart(client, base_url, order_form_id, items)

        # 3. URL de checkout con el orderForm activo
        checkout_url = f"{base_url}/checkout?orderFormId={order_form_id}#/cart"

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

    Ejemplo de request:
    {
        "items": [
            {"store": "vea",       "external_id": "331927", "quantity": 1, "name": "Leche Serenísima"},
            {"store": "masonline", "external_id": "160510", "quantity": 1, "name": "Leche Serenísima"},
            {"store": "coto",      "external_id": "prod00015929", "quantity": 1, "name": "Leche Serenísima"}
        ]
    }
    """
    # Separar items por tienda
    by_store: dict[str, list[CartItem]] = {}
    coto_items = []

    for item in request.items:
        if item.store == "coto":
            coto_items.append(item)  # Coto por separado (Oracle ATG)
        elif item.store in VTEX_STORES:
            by_store.setdefault(item.store, []).append(item)

    # Crear carritos VTEX en paralelo
    vtex_tasks = [
        build_vtex_cart(store_key, items)
        for store_key, items in by_store.items()
    ]
    carts = list(await asyncio.gather(*vtex_tasks))

    # Si hay items de Coto, agregar una entrada con URL directa (sin carrito automático por ahora)
    if coto_items:
        carts.append(StoreCart(
            store="coto",
            store_name="Coto Digital",
            checkout_url="https://www.cotodigital3.com.ar/sitios/cdigi/browse",
            items_added=0,
            items_failed=[item.name for item in coto_items],
            success=False,
        ))

    return CartResponse(
        carts=carts,
        total_stores=len(carts),
        coto_items=coto_items,
    )
