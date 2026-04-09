import { useState, useEffect } from "react";

// ─── FONTS ───────────────────────────────────────────────────────────────────
const FONT_LINK = "https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=DM+Sans:wght@400;500;600&display=swap";

// ─── API CONFIG ───────────────────────────────────────────────────────────────
const API_BASE = "http://localhost:8000";  // cambiar a dominio en prod

// Token management
const getToken = () => localStorage.getItem("sc_token");
const setToken = (t) => localStorage.setItem("sc_token", t);

async function apiCall(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Error ${res.status}`);
  }
  return res.json();
}

// ─── API HELPERS ──────────────────────────────────────────────────────────────

// Busca en cada súper por separado para garantizar cobertura de todos
async function searchProducts(query, storeKeys) {
  const grouped = {};
  storeKeys.forEach(k => grouped[k] = []);
  const allItems = [];

  // Buscar en todos los súpers en paralelo, cada uno con su propio límite
  await Promise.allSettled(
    storeKeys.map(async (frontKey) => {
      const backKey = STORES[frontKey].backKey;
      try {
        const data = await apiCall(
          `/api/search?q=${encodeURIComponent(query)}&stores=${backKey}&limit=20&sort=price`
        );
        const items = Array.isArray(data.results) ? data.results :
                      Array.isArray(data) ? data : [];
        grouped[frontKey] = items;
        allItems.push(...items);
      } catch {
        // si un súper falla, el resto sigue
      }
    })
  );

  return { grouped, allItems };
}

// Agrupa subcategorías similares nombradas distinto por cada súper
const SUBCAT_GROUPS = [
  // Fideos / Pastas
  { label: "Fideos largos",   matches: ["fideos largos", "pastas largas", "spaghetti", "espagueti", "tallarines"] },
  { label: "Fideos cortos",   matches: ["fideos cortos", "pastas cortas", "mostacholes", "penne", "rigatoni", "tirabuzón"] },
  { label: "Fideos para sopa",matches: ["fideos para sopa", "sopa", "cabello de angel", "letras", "estrellitas", "coditos"] },
  { label: "Fideos al huevo", matches: ["fideos al huevo", "pastas al huevo", "fideo al huevo"] },
  // Leche
  { label: "Leche entera",       matches: ["leche entera", "leches enteras"] },
  { label: "Leche descremada",   matches: ["leche descremada", "leche parcialmente descremada", "leche liviana", "leches descremadas"] },
  { label: "Leche sin lactosa",  matches: ["leche sin lactosa", "leche deslactosada", "leche zero lactosa", "leches sin lactosa"] },
  { label: "Leche saborizada",   matches: ["leche saborizada", "leches saborizadas", "chocolatada"] },
  { label: "Leche en polvo",     matches: ["leche en polvo", "leches en polvo"] },
  // Jabón
  { label: "Jabón de tocador",   matches: ["jabón de tocador", "jabon de tocador", "jabones de tocador", "jabón tocador"] },
  { label: "Jabón en barra",     matches: ["jabón en barra", "jabon en barra", "jabón blanco", "jabon blanco"] },
  { label: "Jabón líquido",      matches: ["jabón líquido", "jabon liquido", "jabón en gel"] },
  { label: "Jabón de ropa",      matches: ["jabón de ropa", "jabon de ropa", "ropa"] },
  // Arroz
  { label: "Arroz largo fino",   matches: ["arroz largo fino", "arroz largo", "arroz doble carolina"] },
  { label: "Arroz integral",     matches: ["arroz integral"] },
  { label: "Arroz parboil",      matches: ["arroz parboil", "arroz parbolizado"] },
  // Aceite
  { label: "Aceite de girasol",  matches: ["aceite de girasol", "girasol"] },
  { label: "Aceite de oliva",    matches: ["aceite de oliva", "oliva"] },
  { label: "Aceite de maíz",     matches: ["aceite de maíz", "aceite de maiz", "maíz", "maiz"] },
  // Queso
  { label: "Queso cremoso",      matches: ["queso cremoso"] },
  { label: "Queso en barra",     matches: ["queso en barra", "quesos en barra"] },
  { label: "Queso rallado",      matches: ["queso rallado", "quesos rallados"] },
  { label: "Queso untable",      matches: ["queso untable", "quesos untables"] },
  // Papel
  { label: "Papel higiénico",    matches: ["papel higiénico", "papel higienico"] },
  { label: "Papel de cocina",    matches: ["papel de cocina", "rollo de cocina"] },
  // Yerba
  { label: "Yerba con palo",     matches: ["yerba con palo", "yerbas con palo"] },
  { label: "Yerba sin palo",     matches: ["yerba sin palo", "yerbas sin palo"] },
  { label: "Yerba compuesta",    matches: ["yerba compuesta", "yerbas compuestas"] },
];

function normalizeSubcat(raw) {
  const lower = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const group = SUBCAT_GROUPS.find(g =>
    g.matches.some(m => lower.includes(m) || m.includes(lower))
  );
  return group ? group.label : raw; // si no matchea, usar el original
}

// Extrae subcategorías únicas y normalizadas
function extractSubcategories(allItems, searchTerm) {
  const lq = searchTerm.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const counts = {};

  allItems.forEach(item => {
    if (!item.category) return;
    const name = (item.name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (!name.includes(lq) && !lq.split(" ").some(w => w.length > 3 && name.includes(w))) return;

    const parts = item.category.split(">").map(s => s.trim());
    const rawSubcat = parts[parts.length - 1];
    if (!rawSubcat) return;

    const normalized = normalizeSubcat(rawSubcat);
    counts[normalized] = (counts[normalized] || 0) + 1;
  });

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
}

// Agrupa resultados del API en estructura marca×súper para la UI
// Normaliza marca para agrupar: "LA SERENISIMA" / "La Serenísima" → misma key
function normalizeBrand(brand) {
  return (brand || "sin marca")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim().replace(/\s+/g, " ");
}

function titleCase(str) {
  const lower = ["de", "del", "la", "las", "los", "el", "y", "con", "sin"];
  return str.split(" ").map((w, i) =>
    i === 0 || !lower.includes(w.toLowerCase())
      ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
      : w.toLowerCase()
  ).join(" ");
}

function buildProductFromResults(searchTerm, apiResults, storeKeys, id, subcatFilter = null) {
  const brandMap = {};
  const lqRaw = searchTerm.toLowerCase();
  const lq = lqRaw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  storeKeys.forEach(frontKey => {
    const products = apiResults[frontKey] || [];

    const relevant = products.filter(p => {
      const name = (p.name || "").toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const matchesSearch = name.includes(lq) || lq.split(" ").some(w => w.length > 3 && name.includes(w));
      if (!matchesSearch) return false;

      // Filtro por subcategoría normalizada si está activo
      if (subcatFilter) {
        const parts = (p.category || "").split(">").map(s => s.trim());
        const rawSubcat = parts[parts.length - 1];
        return normalizeSubcat(rawSubcat) === subcatFilter;
      }
      return true;
    });

    relevant.slice(0, 6).forEach(p => {
      const rawBrand   = p.brand || "Sin marca";
      const normKey    = normalizeBrand(rawBrand);
      const displayName = titleCase(rawBrand);
      // Unidad separada de cantidad: "1lt", "500g", etc.
      const qty   = p.quantity ? parseFloat(p.quantity) : 1;
      const unit  = (p.unit || "u").toLowerCase();
      const unitLabel = qty >= 1000
        ? `${(qty/1000).toFixed(qty % 1000 === 0 ? 0 : 1)}${unit === "g" ? "kg" : unit === "ml" ? "l" : unit}`
        : `${qty % 1 === 0 ? qty : qty}${unit}`;

      const price = p.effective_price || p.promo_price || p.price || 0;
      const url   = p.product_url || STORES[frontKey].url;

      if (!brandMap[normKey]) {
        brandMap[normKey] = { displayName, unit: unitLabel, prices: {}, urls: {}, externalIds: {} };
      }
      if (!brandMap[normKey].prices[frontKey] || price < brandMap[normKey].prices[frontKey]) {
        brandMap[normKey].prices[frontKey] = price;
        brandMap[normKey].urls[frontKey]   = url;
        brandMap[normKey].externalIds[frontKey] = p.external_id || "";
      }
    });
  });

  const brands = Object.values(brandMap).map(data => ({
    brand:  data.displayName,
    unit:   data.unit,
    prices: Object.fromEntries(storeKeys.map(s => [s, data.prices[s] ?? null])),
    urls:   data.urls,
    externalIds: data.externalIds,
  }));

  // Marcas presentes en más súpers primero
  brands.sort((a, b) =>
    Object.values(b.prices).filter(Boolean).length -
    Object.values(a.prices).filter(Boolean).length
  );

  if (brands.length === 0) return null;

  const EMOJIS = {
    leche: "🥛", aceite: "🫙", arroz: "🍚", fideo: "🍝", pasta: "🍝",
    yerba: "🧉", harina: "🌾", azucar: "🍬", huevo: "🥚", cerveza: "🍺",
    pan: "🍞", queso: "🧀", detergente: "🧴", papel: "🧻", tomate: "🍅",
    atun: "🐟", cafe: "☕", galletita: "🍪", yogur: "🥛", manteca: "🧈",
    desodorante: "🪥", chocolate: "🍫", jabon: "🧼",
    agua: "💧", vino: "🍷", aceitunas: "🫒", mermelada: "🍓",
  };
  const emoji = Object.entries(EMOJIS).find(([k]) => lq.includes(k))?.[1] || "🛒";
  const name  = searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1).toLowerCase();

  return { id, name, emoji, brands, keyword: [lqRaw] };
}


// Auth
async function register(name, email, password, zone, supermarkets) {
  const data = await apiCall("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password, zone, supermarkets }),
  });
  if (data.access_token) setToken(data.access_token);
  return data;
}

async function login(email, password) {
  const data = await apiCall("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (data.access_token) setToken(data.access_token);
  return data;
}

// Zonas (con fallback a lista hardcodeada si el back no responde)

// ─── STORES CONFIG ────────────────────────────────────────────────────────────
const STORES = {
  vea:      { name: "Vea",           color: "#D4213D", bg: "#FFF0F2", logo: "🔴", url: "https://www.vea.com.ar",           backKey: "vea"            },
  mas:      { name: "MasOnline",     color: "#00529B", bg: "#EEF6FF", logo: "🔵", url: "https://www.masonline.com.ar",     backKey: "masonline"      },
  jumbo:    { name: "Jumbo",         color: "#E3051B", bg: "#FFF0F0", logo: "🟥", url: "https://www.jumbo.com.ar",         backKey: "jumbo"          },
  disco:    { name: "Disco",         color: "#008C45", bg: "#EEFFF4", logo: "🟢", url: "https://www.disco.com.ar",         backKey: "disco"          },
  hiper:    { name: "Hiperlibertad", color: "#FFC107", bg: "#FFF9E6", logo: "🟡", url: "https://www.hiperlibertad.com.ar", backKey: "hiperlibertad"   },
  modo:     { name: "ModoMarket",    color: "#6B3FA0", bg: "#F5EEFF", logo: "🟣", url: "https://www.modomarket.com",       backKey: "modomarket"     },
};

// Mapeo inverso: backKey → frontKey
const BACK_TO_FRONT = Object.fromEntries(
  Object.entries(STORES).map(([fk, s]) => [s.backKey, fk])
);

// ─── FALLBACK MOCK (solo si el back no responde) ──────────────────────────────
const MOCK_CATALOG = [
  { id: 1, name: "Leche entera", emoji: "🥛", keyword: ["leche"],
    brands: [
      { brand: "La Serenísima", unit: "1L",   prices: { vea: 1290, mas: 1250, jumbo: 1310, modo: 1275 } },
      { brand: "Sancor",        unit: "1L",   prices: { vea: 1180, mas: 1150, jumbo: 1200, modo: null  } },
      { brand: "Atalact",       unit: "1L",   prices: { vea: null, mas:  980, jumbo: 1020, modo:  960  } },
    ]},
  { id: 2, name: "Aceite girasol", emoji: "🫙", keyword: ["aceite"],
    brands: [
      { brand: "Cocinero",  unit: "1.5L", prices: { vea: 3890, mas: 3750, jumbo: 3920, modo: 3800 } },
      { brand: "Natura",    unit: "1.5L", prices: { vea: 3650, mas: 3580, jumbo: null,  modo: 3620 } },
    ]},
  { id: 3, name: "Arroz", emoji: "🍚", keyword: ["arroz"],
    brands: [
      { brand: "Gallo",    unit: "1kg", prices: { vea: 1690, mas: 1590, jumbo: 1750, modo: 1620 } },
      { brand: "Lucchetti",unit: "1kg", prices: { vea: 1520, mas: 1480, jumbo: 1580, modo: null  } },
    ]},
  { id: 4, name: "Fideos", emoji: "🍝", keyword: ["fideo", "pasta"],
    brands: [
      { brand: "Matarazzo", unit: "500g", prices: { vea:  980, mas:  890, jumbo: 1020, modo:  950 } },
      { brand: "Lucchetti", unit: "500g", prices: { vea:  920, mas:  870, jumbo:  960, modo:  880 } },
    ]},
  { id: 5, name: "Yerba mate", emoji: "🧉", keyword: ["yerba"],
    brands: [
      { brand: "Taragüí",   unit: "1kg", prices: { vea: 4250, mas: 4100, jumbo: 4380, modo: 4200 } },
      { brand: "Amanda",    unit: "1kg", prices: { vea: 3980, mas: 3850, jumbo: 4100, modo: 3900 } },
    ]},
  { id: 6, name: "Harina", emoji: "🌾", keyword: ["harina"],
    brands: [
      { brand: "Pureza",   unit: "1kg", prices: { vea:  890, mas:  850, jumbo:  910, modo:  870 } },
      { brand: "Cañuelas", unit: "1kg", prices: { vea:  820, mas:  790, jumbo:  840, modo: null  } },
    ]},
  { id: 7, name: "Azúcar", emoji: "🍬", keyword: ["azucar", "azúcar"],
    brands: [
      { brand: "Ledesma",  unit: "1kg", prices: { vea: 1150, mas: 1080, jumbo: 1190, modo: 1120 } },
      { brand: "Chango",   unit: "1kg", prices: { vea: 1050, mas:  990, jumbo: 1100, modo: 1020 } },
    ]},
  { id: 8, name: "Huevos", emoji: "🥚", keyword: ["huevo", "huevos"],
    brands: [
      { brand: "Granja del Sol", unit: "x12", prices: { vea: 2890, mas: 2750, jumbo: 2950, modo: 2800 } },
      { brand: "La Campagnola",  unit: "x12", prices: { vea: 2650, mas: 2580, jumbo: null,  modo: 2620 } },
    ]},
  { id: 9, name: "Cerveza", emoji: "🍺", keyword: ["cerveza"],
    brands: [
      { brand: "Quilmes",  unit: "1L",   prices: { vea: 2100, mas: 1980, jumbo: 2200, modo: 2050 } },
      { brand: "Brahma",   unit: "1L",   prices: { vea: 1850, mas: 1790, jumbo: 1920, modo: 1830 } },
    ]},
  { id: 10, name: "Pan lactal", emoji: "🍞", keyword: ["pan", "lactal"],
    brands: [
      { brand: "Bimbo", unit: "500g", prices: { vea: 1450, mas: 1380, jumbo: 1500, modo: 1420 } },
      { brand: "Fargo", unit: "500g", prices: { vea: 1320, mas: 1280, jumbo: 1380, modo: null  } },
    ]},
  { id: 11, name: "Queso cremoso", emoji: "🧀", keyword: ["queso"],
    brands: [
      { brand: "La Serenísima", unit: "400g", prices: { vea: 3200, mas: 3050, jumbo: 3350, modo: 3100 } },
      { brand: "Tregar",        unit: "400g", prices: { vea: 2750, mas: null,  jumbo: 2900, modo: 2800 } },
    ]},
  { id: 12, name: "Detergente", emoji: "🧴", keyword: ["detergente"],
    brands: [
      { brand: "Magistral", unit: "750ml", prices: { vea: 1890, mas: 1750, jumbo: 1950, modo: 1810 } },
      { brand: "Ala",       unit: "750ml", prices: { vea: 1650, mas: 1580, jumbo: 1720, modo: null  } },
    ]},
  { id: 13, name: "Papel higiénico", emoji: "🧻", keyword: ["papel", "higienico"],
    brands: [
      { brand: "Higienol", unit: "x4", prices: { vea: 1650, mas: 1580, jumbo: 1700, modo: 1620 } },
      { brand: "Elite",    unit: "x4", prices: { vea: 1450, mas: 1390, jumbo: 1500, modo: null  } },
    ]},
  { id: 14, name: "Tomate triturado", emoji: "🍅", keyword: ["tomate"],
    brands: [
      { brand: "Arcor",         unit: "400g", prices: { vea:  780, mas:  720, jumbo:  800, modo:  750 } },
      { brand: "La Campagnola", unit: "400g", prices: { vea:  720, mas:  680, jumbo:  740, modo: null  } },
    ]},
  { id: 15, name: "Atún", emoji: "🐟", keyword: ["atun", "atún"],
    brands: [
      { brand: "La Campagnola", unit: "170g", prices: { vea: 1100, mas: 1020, jumbo: 1150, modo: 1060 } },
      { brand: "Alka",          unit: "170g", prices: { vea:  980, mas:  920, jumbo: 1010, modo: null  } },
    ]},
];


const CATALOG = [
  { id: 1, name: "Leche entera", emoji: "🥛", keyword: ["leche"],
    brands: [
      { brand: "La Serenísima", unit: "1L",   prices: { vea: 1290, mas: 1250, jumbo: 1310, modo: 1275 } },
      { brand: "Sancor",        unit: "1L",   prices: { vea: 1180, mas: 1150, jumbo: 1200, modo: null  } },
      { brand: "Atalact",       unit: "1L",   prices: { vea: null, mas:  980, jumbo: 1020, modo:  960  } },
    ]},
  { id: 2, name: "Aceite girasol", emoji: "🫙", keyword: ["aceite"],
    brands: [
      { brand: "Cocinero",  unit: "1.5L", prices: { vea: 3890, mas: 3750, jumbo: 3920, modo: 3800 } },
      { brand: "Natura",    unit: "1.5L", prices: { vea: 3650, mas: 3580, jumbo: null,  modo: 3620 } },
      { brand: "Ideal",     unit: "1L",   prices: { vea: 2490, mas: 2390, jumbo: 2550, modo: null  } },
    ]},
  { id: 3, name: "Arroz", emoji: "🍚", keyword: ["arroz"],
    brands: [
      { brand: "Gallo",    unit: "1kg", prices: { vea: 1690, mas: 1590, jumbo: 1750, modo: 1620 } },
      { brand: "Lucchetti",unit: "1kg", prices: { vea: 1520, mas: 1480, jumbo: 1580, modo: null  } },
      { brand: "Dos Anclas",unit:"1kg", prices: { vea: null, mas: 1350, jumbo: 1420, modo: 1380 } },
    ]},
  { id: 4, name: "Fideos", emoji: "🍝", keyword: ["fideo", "pasta", "spaghetti"],
    brands: [
      { brand: "Matarazzo", unit: "500g", prices: { vea:  980, mas:  890, jumbo: 1020, modo:  950 } },
      { brand: "Lucchetti", unit: "500g", prices: { vea:  920, mas:  870, jumbo:  960, modo:  880 } },
      { brand: "Don Felipe", unit:"500g", prices: { vea: null, mas:  780, jumbo:  820, modo:  800 } },
    ]},
  { id: 5, name: "Yerba mate", emoji: "🧉", keyword: ["yerba"],
    brands: [
      { brand: "Taragüí",   unit: "1kg", prices: { vea: 4250, mas: 4100, jumbo: 4380, modo: 4200 } },
      { brand: "Amanda",    unit: "1kg", prices: { vea: 3980, mas: 3850, jumbo: 4100, modo: 3900 } },
      { brand: "Rosamonte", unit: "1kg", prices: { vea: 3750, mas: null,  jumbo: 3900, modo: 3780 } },
    ]},
  { id: 6, name: "Harina", emoji: "🌾", keyword: ["harina"],
    brands: [
      { brand: "Pureza",   unit: "1kg", prices: { vea:  890, mas:  850, jumbo:  910, modo:  870 } },
      { brand: "Cañuelas", unit: "1kg", prices: { vea:  820, mas:  790, jumbo:  840, modo: null  } },
      { brand: "Morixe",   unit: "1kg", prices: { vea: null, mas:  760, jumbo:  800, modo:  780 } },
    ]},
  { id: 7, name: "Azúcar", emoji: "🍬", keyword: ["azucar", "azúcar"],
    brands: [
      { brand: "Ledesma",  unit: "1kg", prices: { vea: 1150, mas: 1080, jumbo: 1190, modo: 1120 } },
      { brand: "Chango",   unit: "1kg", prices: { vea: 1050, mas:  990, jumbo: 1100, modo: 1020 } },
    ]},
  { id: 8, name: "Huevos", emoji: "🥚", keyword: ["huevo", "huevos"],
    brands: [
      { brand: "Granja del Sol", unit: "x12", prices: { vea: 2890, mas: 2750, jumbo: 2950, modo: 2800 } },
      { brand: "La Campagnola",  unit: "x12", prices: { vea: 2650, mas: 2580, jumbo: null,  modo: 2620 } },
      { brand: "Marca blanca",   unit: "x12", prices: { vea: null, mas: 2400, jumbo: 2490, modo: null  } },
    ]},
  { id: 9, name: "Cerveza", emoji: "🍺", keyword: ["cerveza"],
    brands: [
      { brand: "Quilmes",  unit: "1L",   prices: { vea: 2100, mas: 1980, jumbo: 2200, modo: 2050 } },
      { brand: "Schneider",unit: "1L",   prices: { vea: 1950, mas: 1870, jumbo: 2020, modo: null  } },
      { brand: "Brahma",   unit: "1L",   prices: { vea: 1850, mas: 1790, jumbo: 1920, modo: 1830 } },
    ]},
  { id: 10, name: "Pan lactal", emoji: "🍞", keyword: ["pan", "lactal"],
    brands: [
      { brand: "Bimbo",     unit: "500g", prices: { vea: 1450, mas: 1380, jumbo: 1500, modo: 1420 } },
      { brand: "Fargo",     unit: "500g", prices: { vea: 1320, mas: 1280, jumbo: 1380, modo: null  } },
      { brand: "Silueta",   unit: "400g", prices: { vea: null, mas: 1150, jumbo: 1200, modo: 1160 } },
    ]},
  { id: 11, name: "Queso cremoso", emoji: "🧀", keyword: ["queso"],
    brands: [
      { brand: "La Serenísima", unit: "400g", prices: { vea: 3200, mas: 3050, jumbo: 3350, modo: 3100 } },
      { brand: "Sancor",        unit: "400g", prices: { vea: 2950, mas: 2880, jumbo: 3100, modo: null  } },
      { brand: "Tregar",        unit: "400g", prices: { vea: 2750, mas: null,  jumbo: 2900, modo: 2800 } },
    ]},
  { id: 12, name: "Detergente", emoji: "🧴", keyword: ["detergente"],
    brands: [
      { brand: "Magistral", unit: "750ml", prices: { vea: 1890, mas: 1750, jumbo: 1950, modo: 1810 } },
      { brand: "Ala",       unit: "750ml", prices: { vea: 1650, mas: 1580, jumbo: 1720, modo: null  } },
      { brand: "Prima",     unit: "500ml", prices: { vea: null, mas: 1320, jumbo: 1390, modo: 1340 } },
    ]},
  { id: 13, name: "Papel higiénico", emoji: "🧻", keyword: ["papel", "higienico", "higiénico"],
    brands: [
      { brand: "Higienol",  unit: "x4", prices: { vea: 1650, mas: 1580, jumbo: 1700, modo: 1620 } },
      { brand: "Elite",     unit: "x4", prices: { vea: 1450, mas: 1390, jumbo: 1500, modo: null  } },
      { brand: "Familia",   unit: "x4", prices: { vea: null, mas: 1280, jumbo: 1340, modo: 1300 } },
    ]},
  { id: 14, name: "Tomate triturado", emoji: "🍅", keyword: ["tomate"],
    brands: [
      { brand: "Arcor",         unit: "400g", prices: { vea:  780, mas:  720, jumbo:  800, modo:  750 } },
      { brand: "La Campagnola", unit: "400g", prices: { vea:  720, mas:  680, jumbo:  740, modo: null  } },
      { brand: "Cica",          unit: "400g", prices: { vea: null, mas:  650, jumbo:  680, modo:  660 } },
    ]},
  { id: 15, name: "Atún", emoji: "🐟", keyword: ["atun", "atún"],
    brands: [
      { brand: "La Campagnola", unit: "170g", prices: { vea: 1100, mas: 1020, jumbo: 1150, modo: 1060 } },
      { brand: "Alka",          unit: "170g", prices: { vea:  980, mas:  920, jumbo: 1010, modo: null  } },
      { brand: "Cormoran",      unit: "170g", prices: { vea: null, mas:  870, jumbo:  910, modo:  890 } },
    ]},
];

const TRENDING = ["Leche", "Arroz", "Fideos", "Huevos", "Yerba", "Pan", "Queso", "Aceite"];

const PROVINCES = [
  "Buenos Aires", "CABA", "Catamarca", "Chaco", "Chubut", "Córdoba",
  "Corrientes", "Entre Ríos", "Formosa", "Jujuy", "La Pampa", "La Rioja",
  "Mendoza", "Misiones", "Neuquén", "Río Negro", "Salta", "San Juan",
  "San Luis", "Santa Cruz", "Santa Fe", "Santiago del Estero",
  "Tierra del Fuego", "Tucumán",
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function parseList(text) {
  return text
    .split("\n")
    .map(l => l.trim().replace(/^[-•*\d.]\s*/, ""))
    .filter(Boolean);
}

// Fallback: match contra MOCK_CATALOG si el back no responde
function matchProductsMock(lines) {
  const matched = [];
  const unmatched = [];
  lines.forEach(line => {
    const lline = line.toLowerCase();
    const found = MOCK_CATALOG.find(p =>
      p.keyword.some(k => lline.includes(k)) || lline.includes(p.name.toLowerCase())
    );
    if (found && !matched.find(m => m.id === found.id)) matched.push(found);
    else if (!found) unmatched.push(line);
  });
  return { matched, unmatched };
}

function fmt(n) {
  return "$" + n.toLocaleString("es-AR");
}

// Get the global minimum price across all brands and stores for a product

// Get the global maximum price across all brands and stores
function globalMaxPrice(product) {
  let max = -Infinity;
  product.brands.forEach(b => Object.values(b.prices).forEach(p => { if (p && p > max) max = p; }));
  return max;
}

// cartItems: array of { product, brandIdx, store, price }
function computeOptimization(cartItems) {
  const byStore = {};
  Object.keys(STORES).forEach(s => byStore[s] = 0);

  cartItems.forEach(item => {
    byStore[item.store] = (byStore[item.store] || 0) + item.price;
  });

  const totalOptimized = cartItems.reduce((s, i) => s + i.price, 0);

  // Worst case: most expensive brand+store combo per product
  const totalWorst = cartItems.reduce((sum, item) => sum + globalMaxPrice(item.product), 0);
  const savings = totalWorst - totalOptimized;

  const storeBreakdown = Object.entries(byStore)
    .filter(([, v]) => v > 0)
    .map(([store, total]) => ({
      store,
      total,
      items: cartItems.filter(i => i.store === store),
    }));

  return { totalOptimized, totalWorst, savings, byStore, storeBreakdown };
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const css = `
  @import url('${FONT_LINK}');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #F5F3EE;
    --surface: #FFFFFF;
    --primary: #1A3A2A;
    --accent: #4AE078;
    --accent2: #FF6240;
    --text: #1A1A18;
    --text2: #6B6960;
    --border: rgba(0,0,0,0.09);
    --shadow: 0 2px 12px rgba(0,0,0,0.07);
    --shadow-lg: 0 8px 40px rgba(0,0,0,0.12);
    --radius: 16px;
    --radius-sm: 10px;
  }

  body { font-family: 'DM Sans', sans-serif; background: var(--bg); color: var(--text); }

  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0 16px 80px;
  }

  .topbar {
    width: 100%;
    max-width: 540px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 0 8px;
    margin-bottom: 8px;
  }

  .logo {
    font-family: 'Sora', sans-serif;
    font-weight: 800;
    font-size: 22px;
    color: var(--primary);
    letter-spacing: -0.5px;
  }
  .logo span { color: var(--accent2); }

  .step-dots {
    display: flex;
    gap: 5px;
  }
  .dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--border);
    transition: all .3s;
  }
  .dot.active { background: var(--primary); width: 18px; border-radius: 3px; }
  .dot.done { background: var(--accent); }

  .screen {
    width: 100%;
    max-width: 540px;
    animation: fadeUp .35s ease;
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .screen-title {
    font-family: 'Sora', sans-serif;
    font-size: 28px;
    font-weight: 800;
    line-height: 1.15;
    color: var(--primary);
    margin-bottom: 6px;
    letter-spacing: -0.5px;
  }

  .screen-sub {
    font-size: 15px;
    color: var(--text2);
    margin-bottom: 28px;
    line-height: 1.5;
  }

  .card {
    background: var(--surface);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 20px;
  }

  /* ── ZONA ── */
  .province-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    max-height: 360px;
    overflow-y: auto;
    padding-right: 4px;
  }
  .province-btn {
    font-family: 'DM Sans', sans-serif;
    font-size: 14px;
    font-weight: 500;
    padding: 12px 14px;
    border-radius: var(--radius-sm);
    border: 1.5px solid var(--border);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    text-align: left;
    transition: all .15s;
  }
  .province-btn:hover { border-color: var(--primary); background: #F0F8F3; }
  .province-btn.selected {
    border-color: var(--primary);
    background: var(--primary);
    color: white;
  }

  /* ── LISTA ── */
  .list-textarea {
    font-family: 'DM Sans', sans-serif;
    font-size: 17px;
    line-height: 1.8;
    width: 100%;
    min-height: 180px;
    padding: 16px;
    border: 1.5px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    resize: none;
    outline: none;
    transition: border-color .2s;
  }
  .list-textarea:focus { border-color: var(--primary); }
  .list-textarea::placeholder { color: #BCBAB4; }

  .char-count {
    font-size: 12px;
    color: var(--text2);
    text-align: right;
    margin-top: 6px;
  }

  .trend-section { margin-top: 24px; }
  .trend-title {
    font-family: 'Sora', sans-serif;
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 10px;
  }
  .trend-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .chip {
    font-family: 'DM Sans', sans-serif;
    font-size: 14px;
    font-weight: 500;
    padding: 8px 16px;
    border-radius: 20px;
    border: 1.5px solid var(--border);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    transition: all .15s;
    white-space: nowrap;
  }
  .chip:hover { border-color: var(--primary); background: #F0F8F3; }
  .chip.added { border-color: var(--accent); background: #EDFFF4; color: var(--primary); }

  /* ── RESULTADOS ── */
  .product-card {
    background: var(--surface);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 16px;
    margin-bottom: 12px;
    border: 1.5px solid transparent;
    transition: border-color .2s;
  }
  .product-card.in-cart { border-color: var(--accent); }

  .product-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }
  .product-header-left { display: flex; align-items: center; gap: 10px; }
  .product-emoji { font-size: 26px; }
  .product-name {
    font-family: 'Sora', sans-serif;
    font-size: 15px;
    font-weight: 700;
    color: var(--text);
  }

  /* Brand × Store table */
  .brand-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    margin-bottom: 12px;
    font-size: 12px;
  }
  .brand-table th {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .4px;
    color: var(--text2);
    padding: 0 6px 8px;
    text-align: center;
  }
  .brand-table th.brand-col { text-align: left; padding-left: 0; }
  .brand-table td { padding: 3px; }
  .brand-table td.brand-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text);
    padding: 3px 8px 3px 0;
    max-width: 120px;
    vertical-align: middle;
  }
  .brand-name-text {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .brand-unit-badge {
    display: inline-block;
    font-size: 9px;
    font-weight: 600;
    color: var(--text2);
    background: #F0EEE8;
    border-radius: 4px;
    padding: 1px 5px;
    margin-top: 2px;
  }

  .price-cell {
    text-align: center;
    padding: 8px 4px;
    border-radius: 8px;
    border: 1.5px solid var(--border);
    cursor: pointer;
    transition: all .15s;
    position: relative;
    min-width: 62px;
    white-space: nowrap;
  }
  .price-cell:hover:not(.unavailable) { border-color: var(--text2); background: #F5F3EE; }
  .price-cell.cheapest-all { border-color: #4AE078; background: #EDFFF4; }
  .price-cell.selected-cell {
    border-color: var(--primary);
    background: var(--primary);
  }
  .price-cell.selected-cell .cell-price { color: white; }
  .price-cell.unavailable { background: #F8F8F6; cursor: default; }
  .cell-price { font-size: 13px; font-weight: 700; color: var(--text); }
  .cell-price.muted { font-size: 11px; color: #CCC; font-weight: 400; }

  .cheapest-badge {
    position: absolute;
    top: -8px; left: 50%; transform: translateX(-50%);
    font-size: 9px; font-weight: 700;
    background: #4AE078; color: #1A3A2A;
    padding: 2px 6px; border-radius: 10px;
    white-space: nowrap;
    pointer-events: none;
  }

  .selected-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #F0F8F3;
    border: 1.5px solid var(--accent);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    margin-bottom: 10px;
    font-size: 13px;
  }
  .selected-summary strong { font-weight: 700; color: var(--primary); }

  .remove-btn {
    font-family: 'DM Sans', sans-serif;
    font-size: 11px;
    font-weight: 600;
    padding: 5px 10px;
    border-radius: 6px;
    border: 1px solid rgba(0,0,0,0.12);
    background: white;
    color: var(--text2);
    cursor: pointer;
  }
  .remove-btn:hover { background: #FFE8E0; border-color: var(--accent2); color: var(--accent2); }

  /* ── SUBCATEGORY FILTERS ── */
  .subcat-section {
    margin-bottom: 16px;
  }
  .subcat-label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .5px;
    color: var(--text2);
    margin-bottom: 8px;
  }
  .subcat-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .subcat-chip {
    font-family: 'DM Sans', sans-serif;
    font-size: 12px;
    font-weight: 600;
    padding: 5px 12px;
    border-radius: 20px;
    border: 1.5px solid var(--border);
    background: white;
    color: var(--text2);
    cursor: pointer;
    transition: all .15s;
    white-space: nowrap;
  }
  .subcat-chip:hover { border-color: var(--primary); color: var(--primary); }
  .subcat-chip.active {
    background: var(--primary);
    border-color: var(--primary);
    color: white;
  }

  .unmatched-box {
    background: #FFF8F0;
    border: 1.5px solid #FFD0B0;
    border-radius: var(--radius);
    padding: 14px 16px;
    margin-bottom: 16px;
    font-size: 13px;
    color: var(--text2);
  }
  .unmatched-box strong { color: var(--accent2); }

  /* ── FLOATING CART ── */
  .floating-cart {
    position: fixed;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    width: calc(100% - 32px);
    max-width: 508px;
    background: var(--primary);
    border-radius: 16px;
    padding: 14px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-shadow: 0 8px 32px rgba(26,58,42,0.35);
    cursor: pointer;
    transition: transform .2s;
    z-index: 100;
  }
  .floating-cart:hover { transform: translateX(-50%) translateY(-2px); }
  .cart-left { display: flex; align-items: center; gap: 10px; }
  .cart-badge {
    width: 28px; height: 28px;
    background: var(--accent);
    border-radius: 8px;
    font-family: 'Sora', sans-serif;
    font-size: 14px;
    font-weight: 800;
    color: var(--primary);
    display: flex; align-items: center; justify-content: center;
  }
  .cart-label { font-size: 14px; font-weight: 600; color: white; }
  .cart-total { font-family: 'Sora', sans-serif; font-size: 18px; font-weight: 800; color: var(--accent); }

  /* ── RESUMEN ── */
  .savings-hero {
    background: var(--primary);
    border-radius: var(--radius);
    padding: 28px 24px;
    text-align: center;
    margin-bottom: 16px;
  }
  .savings-label {
    font-size: 13px;
    font-weight: 600;
    color: rgba(255,255,255,0.6);
    text-transform: uppercase;
    letter-spacing: .8px;
    margin-bottom: 6px;
  }
  .savings-amount {
    font-family: 'Sora', sans-serif;
    font-size: 48px;
    font-weight: 800;
    color: var(--accent);
    line-height: 1;
    margin-bottom: 6px;
  }
  .savings-sub { font-size: 14px; color: rgba(255,255,255,0.7); }

  .store-breakdown {
    background: var(--surface);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    overflow: hidden;
    margin-bottom: 16px;
  }
  .breakdown-header {
    padding: 14px 18px;
    font-family: 'Sora', sans-serif;
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .5px;
    color: var(--text2);
    border-bottom: 1px solid var(--border);
  }
  .breakdown-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid var(--border);
  }
  .breakdown-row:last-child { border-bottom: none; }
  .breakdown-store {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .store-dot { width: 10px; height: 10px; border-radius: 50%; }
  .breakdown-store-name { font-size: 15px; font-weight: 600; color: var(--text); }
  .breakdown-items { font-size: 12px; color: var(--text2); }
  .breakdown-total { font-family: 'Sora', sans-serif; font-size: 16px; font-weight: 700; color: var(--text); }

  .vs-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 16px;
  }
  .vs-card {
    background: var(--surface);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 16px;
    text-align: center;
  }
  .vs-label { font-size: 11px; font-weight: 600; color: var(--text2); text-transform: uppercase; letter-spacing: .5px; margin-bottom: 6px; }
  .vs-amount { font-family: 'Sora', sans-serif; font-size: 22px; font-weight: 800; }
  .vs-amount.bad { color: #FF6240; text-decoration: line-through; opacity: .6; }
  .vs-amount.good { color: var(--primary); }

  /* ── AUTH ── */
  .auth-card {
    background: var(--surface);
    border-radius: var(--radius);
    box-shadow: var(--shadow-lg);
    padding: 28px 24px;
    margin-bottom: 16px;
  }
  .input-field {
    font-family: 'DM Sans', sans-serif;
    font-size: 15px;
    width: 100%;
    padding: 14px 16px;
    border-radius: var(--radius-sm);
    border: 1.5px solid var(--border);
    background: #FAFAF8;
    color: var(--text);
    outline: none;
    transition: border-color .2s;
    margin-bottom: 10px;
  }
  .input-field:focus { border-color: var(--primary); background: white; }

  .tab-switch {
    display: flex;
    background: #F0EEE8;
    border-radius: 10px;
    padding: 4px;
    margin-bottom: 20px;
  }
  .tab-btn {
    flex: 1;
    font-family: 'DM Sans', sans-serif;
    font-size: 14px;
    font-weight: 600;
    padding: 9px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--text2);
    cursor: pointer;
    transition: all .15s;
  }
  .tab-btn.active { background: white; color: var(--primary); box-shadow: 0 1px 4px rgba(0,0,0,0.1); }

  /* ── DONACIÓN ── */
  .tip-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-bottom: 14px;
  }
  .tip-btn {
    font-family: 'Sora', sans-serif;
    font-size: 16px;
    font-weight: 700;
    padding: 16px 8px;
    border-radius: var(--radius-sm);
    border: 2px solid var(--border);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    text-align: center;
    transition: all .15s;
  }
  .tip-btn:hover { border-color: var(--primary); }
  .tip-btn.selected { border-color: var(--primary); background: var(--primary); color: white; }
  .tip-sub { font-size: 10px; font-weight: 500; margin-top: 2px; opacity: .7; }

  /* ── REDIRECT ── */
  .redirect-card {
    background: var(--surface);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 18px;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    text-decoration: none;
    transition: box-shadow .15s;
  }
  .redirect-card:hover { box-shadow: var(--shadow-lg); }
  .redirect-left { display: flex; align-items: center; gap: 12px; }
  .redirect-logo-box {
    width: 44px; height: 44px;
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-size: 22px;
  }
  .redirect-name { font-family: 'Sora', sans-serif; font-size: 16px; font-weight: 700; color: var(--text); }
  .redirect-items { font-size: 13px; color: var(--text2); }
  .redirect-total { font-family: 'Sora', sans-serif; font-size: 18px; font-weight: 800; color: var(--primary); }
  .redirect-arrow { font-size: 18px; color: var(--text2); margin-left: 8px; }

  /* ── PRIMARY BTN ── */
  .btn-primary {
    font-family: 'Sora', sans-serif;
    font-size: 16px;
    font-weight: 700;
    width: 100%;
    padding: 18px;
    border-radius: 14px;
    border: none;
    background: var(--accent2);
    color: white;
    cursor: pointer;
    transition: opacity .15s, transform .1s;
    margin-top: 8px;
    letter-spacing: -.2px;
  }
  .btn-primary:hover { opacity: .92; transform: translateY(-1px); }
  .btn-primary:active { transform: translateY(0); }
  .btn-primary:disabled { opacity: .4; cursor: not-allowed; transform: none; }

  .btn-secondary {
    font-family: 'DM Sans', sans-serif;
    font-size: 14px;
    font-weight: 600;
    width: 100%;
    padding: 14px;
    border-radius: 12px;
    border: 1.5px solid var(--border);
    background: transparent;
    color: var(--text2);
    cursor: pointer;
    transition: all .15s;
    margin-top: 8px;
  }
  .btn-secondary:hover { border-color: var(--text2); color: var(--text); }

  .back-btn {
    font-family: 'DM Sans', sans-serif;
    font-size: 14px;
    font-weight: 500;
    background: none;
    border: none;
    color: var(--text2);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0;
    margin-bottom: 20px;
  }
  .back-btn:hover { color: var(--text); }

  .divider {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 14px 0;
  }
  .divider::before, .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }
  .divider span { font-size: 12px; color: var(--text2); }

  .pw-hint { font-size: 11px; color: var(--text2); margin-bottom: 10px; line-height: 1.5; }

  /* ── CONFETTI EMOJI ── */
  .confetti { font-size: 40px; text-align: center; margin-bottom: 12px; animation: pop .4s ease; }
  @keyframes pop { 0% { transform: scale(0); } 70% { transform: scale(1.2); } 100% { transform: scale(1); } }

  .tag {
    display: inline-block;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 6px;
    background: #EDFFF4;
    color: #1A6B3A;
    margin-left: 6px;
    vertical-align: middle;
  }
`;

// ─── COMPONENTS ───────────────────────────────────────────────────────────────

function TopBar({ step }) {
  const total = 6;
  return (
    <div className="topbar">
      <div className="logo">Super<span>Compare</span></div>
      <div className="step-dots">
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} className={`dot ${i < step - 1 ? "done" : i === step - 1 ? "active" : ""}`} />
        ))}
      </div>
    </div>
  );
}

// ── Step 1: Zona ──────────────────────────────────────────────────────────────
function ZonaStep({ onNext }) {
  const [selected, setSelected] = useState(null);
  return (
    <div className="screen">
      <h1 className="screen-title">¿Desde dónde comprás?</h1>
      <p className="screen-sub">Seleccioná tu provincia para ver los supermercados disponibles en tu zona.</p>
      <div className="province-grid" style={{ marginBottom: 24 }}>
        {PROVINCES.map(p => (
          <button
            key={p}
            className={`province-btn ${selected === p ? "selected" : ""}`}
            onClick={() => setSelected(p)}
          >
            {selected === p ? "✓ " : ""}{p}
          </button>
        ))}
      </div>
      <button className="btn-primary" disabled={!selected} onClick={() => onNext(selected)}>
        {selected ? `Continuar con ${selected} →` : "Seleccioná tu provincia"}
      </button>
    </div>
  );
}

// ── Step 2: Lista ─────────────────────────────────────────────────────────────
function ListaStep({ onNext, onBack }) {
  const [text, setText] = useState("");
  const [addedChips, setAddedChips] = useState([]);
  const MAX = 2500;

  const addChip = (chip) => {
    const lower = chip.toLowerCase();
    if (addedChips.includes(lower)) return;
    setAddedChips(prev => [...prev, lower]);
    setText(prev => (prev ? prev + "\n" + chip : chip));
  };

  const canSearch = text.trim().length > 0;

  return (
    <div className="screen">
      <button className="back-btn" onClick={onBack}>← Volver</button>
      <h1 className="screen-title">Tu compra más rápido</h1>
      <p className="screen-sub">Escribí tu lista o copiá y pegá. Un producto por línea.</p>

      <textarea
        className="list-textarea"
        placeholder={"Leche\nArroz\nFideos\nCerveza\n..."}
        value={text}
        onChange={e => e.target.value.length <= MAX && setText(e.target.value)}
        autoFocus
      />
      <div className="char-count">{text.length}/{MAX}</div>

      <div className="trend-section">
        <div className="trend-title">Productos que son tendencia</div>
        <div className="trend-chips">
          {TRENDING.map(t => (
            <button
              key={t}
              className={`chip ${addedChips.includes(t.toLowerCase()) ? "added" : ""}`}
              onClick={() => addChip(t)}
            >
              {addedChips.includes(t.toLowerCase()) ? "✓ " : ""}{t}
            </button>
          ))}
        </div>
      </div>

      <button className="btn-primary" style={{ marginTop: 28 }} disabled={!canSearch} onClick={() => onNext(text)}>
        Buscar productos →
      </button>
      <button className="btn-secondary" onClick={() => setText("")}>Borrar lista</button>
    </div>
  );
}

// ── ProductCard: brand × store grid ──────────────────────────────────────────
function ProductCard({ product, selection, onSelect, onRemove }) {
  // selection: { brandIdx, store, price } | null
  const storeKeys = Object.keys(STORES);

  // Find global cheapest cell
  let globalMin = Infinity;
  product.brands.forEach(b => storeKeys.forEach(s => {
    if (b.prices[s] && b.prices[s] < globalMin) globalMin = b.prices[s];
  }));

  return (
    <div className={`product-card ${selection ? "in-cart" : ""}`}>
      <div className="product-header">
        <div className="product-header-left">
          <span className="product-emoji">{product.emoji}</span>
          <div className="product-name">{product.name}</div>
        </div>
        {selection && (
          <button className="remove-btn" onClick={onRemove}>✕ Quitar</button>
        )}
      </div>

      {selection && (
        <div className="selected-summary">
          <span>
            <strong>{product.brands[selection.brandIdx].brand}</strong>
            {" · "}{product.brands[selection.brandIdx].unit}
            {" · "}{STORES[selection.store].name}
          </span>
          <strong>{fmt(selection.price)}</strong>
        </div>
      )}

      <table className="brand-table">
        <thead>
          <tr>
            <th className="brand-col">Marca</th>
            {storeKeys.map(s => (
              <th key={s}>{STORES[s].name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {product.brands.map((brand, bi) => (
            <tr key={bi}>
              <td className="brand-label">
                <span className="brand-name-text">{brand.brand}</span>
                <span className="brand-unit-badge">{brand.unit}</span>
              </td>
              {storeKeys.map(s => {
                const price = brand.prices[s];
                const isGlobalMin = price === globalMin;
                const isSelected = selection?.brandIdx === bi && selection?.store === s;
                return (
                  <td key={s}>
                    {price ? (
                      <div
                        className={`price-cell ${isGlobalMin ? "cheapest-all" : ""} ${isSelected ? "selected-cell" : ""}`}
                        onClick={() => onSelect(bi, s, price, brand.externalIds?.[s])}
                      >
                        {isGlobalMin && !isSelected && <div className="cheapest-badge">★ mejor</div>}
                        <div className="cell-price">{fmt(price)}</div>
                      </div>
                    ) : (
                      <div className="price-cell unavailable">
                        <div className="cell-price muted">—</div>
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Step 3: Resultados + Carrito ──────────────────────────────────────────────
function ResultadosStep({ listText, storeKeys, onNext, onBack }) {
  const lines = parseList(listText);
  // rawResults: { line → { grouped, allItems } }
  const [rawResults, setRawResults] = useState({});
  const [unmatched, setUnmatched]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [usingMock, setUsingMock]   = useState(false);
  // subcatFilter: { lineIndex → selectedSubcat | null }
  const [subcatFilter, setSubcatFilter] = useState({});
  const [cart, setCart]             = useState({});

  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      setLoading(true);
      const raw = {};
      const notFound = [];
      try {
        await apiCall("/");
        const results = await Promise.allSettled(
          lines.map(async (line, i) => {
            try {
              const { grouped, allItems } = await searchProducts(line, storeKeys);
              return { line, i, grouped, allItems };
            } catch {
              return { line, i, grouped: null, allItems: [] };
            }
          })
        );
        results.forEach(r => {
          if (r.status === "fulfilled") {
            const { line, i, grouped, allItems } = r.value;
            if (grouped) raw[i] = { line, grouped, allItems };
            else notFound.push(line);
          }
        });
        if (!cancelled) {
          setRawResults(raw);
          setUnmatched(notFound);
          setUsingMock(false);
        }
      } catch {
        // fallback mock — wrap in same shape
        const { matched, unmatched: um } = matchProductsMock(lines);
        const mockRaw = {};
        matched.forEach((p, i) => {
          // Reconvert mock product to grouped shape
          const grouped = {};
          storeKeys.forEach(sk => {
            grouped[sk] = p.brands.map(b => ({
              name: `${p.name} ${b.brand}`, brand: b.brand,
              price: b.prices[sk] || 0, effective_price: b.prices[sk] || 0,
              unit: b.unit, store: sk, category: null,
            })).filter(x => x.price > 0);
          });
          mockRaw[i] = { line: p.name, grouped, allItems: [] };
        });
        if (!cancelled) {
          setRawResults(mockRaw);
          setUnmatched(um);
          setUsingMock(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchAll();
    return () => { cancelled = true; };
  }, [listText, storeKeys]);

  // Construir productos aplicando filtro de subcategoría
  const products = Object.entries(rawResults).map(([idx, { line, grouped }]) => {
    const i = parseInt(idx);
    const subcat = subcatFilter[i] || null;
    return buildProductFromResults(line, grouped, storeKeys, i + 1, subcat);
  }).filter(Boolean);

  // Subcategorías disponibles por línea
  const subcatsByLine = Object.fromEntries(
    Object.entries(rawResults).map(([idx, { line, allItems }]) => [
      idx, extractSubcategories(allItems, line)
    ])
  );

  const select = (productId, brandIdx, store, price, externalId) => {
    setCart(prev => {
      const cur = prev[productId];
      if (cur?.brandIdx === brandIdx && cur?.store === store) {
        const n = { ...prev }; delete n[productId]; return n;
      }
      return { ...prev, [productId]: { brandIdx, store, price, externalId } };
    });
  };
  const remove = (productId) => {
    setCart(prev => { const n = { ...prev }; delete n[productId]; return n; });
  };

  const cartCount = Object.keys(cart).length;
  const cartTotal = Object.values(cart).reduce((s, i) => s + i.price, 0);
  const cartItems = products.filter(p => cart[p.id]).map(p => ({ product: p, ...cart[p.id] }));

  if (loading) {
    return (
      <div className="screen" style={{ textAlign: "center", paddingTop: 60 }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
        <h2 style={{ fontFamily: "'Sora', sans-serif", fontSize: 20, fontWeight: 700, color: "var(--primary)", marginBottom: 8 }}>
          Buscando en {storeKeys.length} súpers...
        </h2>
        <p style={{ color: "var(--text2)", fontSize: 14 }}>Comparando {lines.length} producto{lines.length !== 1 ? "s" : ""} en tiempo real</p>
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 24, flexWrap: "wrap" }}>
          {Object.entries(STORES).map(([k, s]) => (
            <div key={k} style={{ padding: "6px 12px", borderRadius: 20, background: s.bg, fontSize: 13, fontWeight: 600, color: s.color }}>
              {s.logo} {s.name}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="screen" style={{ paddingBottom: cartCount > 0 ? 90 : 0 }}>
      <button className="back-btn" onClick={onBack}>← Editar lista</button>
      <h1 className="screen-title">Resultados</h1>
      <p className="screen-sub">
        {products.length} producto{products.length !== 1 ? "s" : ""} encontrados.
        Elegí marca y súper para cada uno.
      </p>

      {usingMock && (
        <div style={{ background: "#FFF8E0", border: "1.5px solid #FFD060", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#7A6000" }}>
          ⚠️ Back no disponible — mostrando datos de demostración
        </div>
      )}

      {unmatched.length > 0 && (
        <div className="unmatched-box">
          <strong>No encontramos:</strong> {unmatched.join(", ")}
        </div>
      )}

      {Object.entries(rawResults).map(([idx]) => {
        const i = parseInt(idx);
        const product = products.find(p => p.id === i + 1);
        const subcats = subcatsByLine[idx] || [];
        const activeSubcat = subcatFilter[i] || null;

        return (
          <div key={i}>
            {subcats.length > 1 && (
              <div className="subcat-section">
                <div className="subcat-label">¿Qué tipo de {rawResults[idx].line.toLowerCase()}?</div>
                <div className="subcat-chips">
                  <button
                    className={`subcat-chip ${!activeSubcat ? "active" : ""}`}
                    onClick={() => setSubcatFilter(prev => ({ ...prev, [i]: null }))}
                  >
                    Todos
                  </button>
                  {subcats.map(s => (
                    <button
                      key={s}
                      className={`subcat-chip ${activeSubcat === s ? "active" : ""}`}
                      onClick={() => setSubcatFilter(prev => ({ ...prev, [i]: s }))}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {product ? (
              <ProductCard
                product={product}
                storeKeys={storeKeys}
                selection={cart[product.id] || null}
                onSelect={(bi, s, price, externalId) => select(product.id, bi, s, price, externalId)}
                onRemove={() => remove(product.id)}
              />
            ) : (
              <div className="unmatched-box" style={{ marginBottom: 12 }}>
                Sin resultados para <strong>{rawResults[idx].line}</strong> en esta categoría.
              </div>
            )}
          </div>
        );
      })}

      {cartCount > 0 && (
        <div className="floating-cart" onClick={() => onNext(cartItems)}>
          <div className="cart-left">
            <div className="cart-badge">{cartCount}</div>
            <div className="cart-label">Ver resumen y ahorro</div>
          </div>
          <div className="cart-total">{fmt(cartTotal)}</div>
        </div>
      )}
    </div>
  );
}

// ── Step 4: Resumen ───────────────────────────────────────────────────────────
function ResumenStep({ cartItems, onNext, onBack }) {
  const { totalOptimized, totalWorst, savings, storeBreakdown } = computeOptimization(cartItems);
  const pct = Math.round((savings / totalWorst) * 100);

  return (
    <div className="screen">
      <button className="back-btn" onClick={onBack}>← Editar carrito</button>
      <h1 className="screen-title">Tu ahorro</h1>
      <p className="screen-sub">Comprando en el súper más barato para cada marca elegida.</p>

      <div className="savings-hero">
        <div className="savings-label">Ahorrás</div>
        <div className="savings-amount">{fmt(savings)}</div>
        <div className="savings-sub">un {pct}% menos que si compraras todo en el más caro</div>
      </div>

      <div className="vs-row">
        <div className="vs-card">
          <div className="vs-label">Sin optimizar</div>
          <div className="vs-amount bad">{fmt(totalWorst)}</div>
        </div>
        <div className="vs-card">
          <div className="vs-label">Con SuperCompare</div>
          <div className="vs-amount good">{fmt(totalOptimized)}</div>
        </div>
      </div>

      <div className="store-breakdown">
        <div className="breakdown-header">Desglose por súper</div>
        {storeBreakdown.map(({ store, total, items }) => (
          <div key={store} className="breakdown-row">
            <div className="breakdown-store">
              <div className="store-dot" style={{ background: STORES[store].color }} />
              <div>
                <div className="breakdown-store-name">{STORES[store].name}</div>
                <div className="breakdown-items">
                  {items.map(i => `${i.product.emoji} ${i.product.brands[i.brandIdx].brand}`).join(" · ")}
                </div>
              </div>
            </div>
            <div className="breakdown-total">{fmt(total)}</div>
          </div>
        ))}
      </div>

      <button className="btn-primary" onClick={onNext}>
        🛒 Armar carritos e ir a comprar
      </button>
      <p style={{ textAlign: "center", fontSize: 12, color: "var(--text2)", marginTop: 10 }}>
        Armamos el carrito en cada súper automáticamente.
      </p>
    </div>
  );
}

// ── Step 5: Auth ──────────────────────────────────────────────────────────────
function AuthStep({ onNext, onBack }) {
  const [mode, setMode] = useState("register"); // "login" | "register"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");
  const pwOk = password.length >= 8;
  const canSubmit = email.includes("@") && pwOk && (mode === "login" || name.trim().length > 0);

  const handle = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    try {
      if (mode === "register") {
        await register(name, email, password, "mendoza", Object.keys(STORES));
      } else {
        await login(email, password);
      }
      onNext({ name, email });
    } catch (err) {
      setError(err.message || "Error al autenticar. Verificá tus datos.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen">
      <button className="back-btn" onClick={onBack}>← Volver al resumen</button>
      <div className="confetti">🎉</div>
      <h1 className="screen-title" style={{ textAlign: "center" }}>
        ¡Ahorrás {""}<span style={{ color: "var(--accent2)" }}>mucho</span>!
      </h1>
      <p className="screen-sub" style={{ textAlign: "center", marginBottom: 20 }}>
        Creá tu cuenta gratis para ir a comprar y guardar tus listas.
      </p>

      <div className="auth-card">
        <div className="tab-switch">
          <button className={`tab-btn ${mode === "register" ? "active" : ""}`} onClick={() => setMode("register")}>Crear cuenta</button>
          <button className={`tab-btn ${mode === "login" ? "active" : ""}`} onClick={() => setMode("login")}>Ya tengo cuenta</button>
        </div>

        {mode === "register" && (
          <input className="input-field" placeholder="Tu nombre" value={name} onChange={e => setName(e.target.value)} />
        )}
        <input className="input-field" placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
        <input className="input-field" placeholder="Contraseña" type="password" value={password} onChange={e => setPassword(e.target.value)} />
        {mode === "register" && !pwOk && password.length > 0 && (
          <p className="pw-hint">La contraseña debe tener al menos 8 caracteres.</p>
        )}

        <button className="btn-primary" disabled={!canSubmit || loading} onClick={handle} style={{ marginTop: 12 }}>
          {loading ? "Entrando..." : mode === "register" ? "Crear cuenta gratis →" : "Ingresar →"}
        </button>
        {error && (
          <p style={{ fontSize: 13, color: "var(--accent2)", textAlign: "center", marginTop: 8 }}>⚠️ {error}</p>
        )}
      </div>

      <p style={{ fontSize: 11, color: "var(--text2)", textAlign: "center", marginTop: 8 }}>
        Al continuar aceptás los términos de uso. No te vamos a mandar spam.
      </p>
    </div>
  );
}

// ── Step 6: Donación ──────────────────────────────────────────────────────────
function DonacionStep({ savings, onNext }) {
  const [selected, setSelected] = useState(null);
  const tips = [
    { pct: 5,  label: "5%" },
    { pct: 10, label: "10%" },
    { pct: 15, label: "15%" },
    { pct: 20, label: "20%" },
  ];

  return (
    <div className="screen">
      <div className="confetti">🙌</div>
      <h1 className="screen-title" style={{ textAlign: "center" }}>¿Te sirvió?</h1>
      <p className="screen-sub" style={{ textAlign: "center" }}>
        Dejanos una propina voluntaria para seguir mejorando la app.
        Vos ahorrás, nosotros crecemos.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 4 }}>Ahorraste</div>
          <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 36, fontWeight: 800, color: "var(--primary)" }}>
            {fmt(savings)}
          </div>
        </div>

        <div className="tip-grid">
          {tips.map(t => {
            const amount = Math.round(savings * t.pct / 100);
            return (
              <button
                key={t.pct}
                className={`tip-btn ${selected === t.pct ? "selected" : ""}`}
                onClick={() => setSelected(selected === t.pct ? null : t.pct)}
              >
                {t.label}
                <div className="tip-sub">{fmt(amount)}</div>
              </button>
            );
          })}
        </div>

        {selected && (
          <button className="btn-primary" onClick={() => onNext(selected)}>
            Dejar propina de {fmt(Math.round(savings * selected / 100))} →
          </button>
        )}
      </div>

      <button className="btn-secondary" onClick={() => onNext(null)}>
        Continuar sin propina
      </button>
    </div>
  );
}

// ── Step 7: Redirect (con carrito VTEX real) ─────────────────────────────────
function RedirectStep({ storeBreakdown }) {
  const [cartStatus, setCartStatus] = useState({});   // store → { loading, url, error, items_added }
  const [building, setBuilding] = useState(false);

  // Construir los carritos automáticamente al montar
  useEffect(() => {
    buildCarts();
  }, []);

  async function buildCarts() {
    setBuilding(true);

    // Preparar items para el backend: necesitamos external_id por producto+store
    const cartItems = [];
    storeBreakdown.forEach(({ store, items }) => {
      items.forEach(item => {
        const brand = item.product.brands[item.brandIdx];
        const backKey = STORES[store].backKey;
        // Usamos la URL del producto para extraer el external_id,
        // o mandamos el que tengamos del search result
        const url = brand.urls?.[store] || "";
        const externalId = item.externalId || brand.externalIds?.[store] || "";
        if (externalId) {
          cartItems.push({
            store: backKey,
            external_id: externalId,
            quantity: 1,
            name: `${brand.brand} ${brand.unit}`,
          });
        }
      });
    });

    if (cartItems.length > 0) {
      try {
        const data = await apiCall("/api/cart/build", {
          method: "POST",
          body: JSON.stringify({ items: cartItems }),
        });

        const newStatus = {};
        data.carts.forEach(cart => {
          // Mapear backKey a frontKey
          const frontKey = BACK_TO_FRONT[cart.store] || cart.store;
          newStatus[frontKey] = {
            loading: false,
            url: cart.success ? cart.checkout_url : STORES[frontKey]?.url,
            items_added: cart.items_added,
            error: !cart.success,
          };
        });
        setCartStatus(newStatus);
      } catch {
        // Si falla el cart builder, usar URLs directas
        storeBreakdown.forEach(({ store }) => {
          setCartStatus(prev => ({
            ...prev,
            [store]: { loading: false, url: STORES[store].url, error: true, items_added: 0 },
          }));
        });
      }
    }

    // Stores sin external_id → URL directa
    storeBreakdown.forEach(({ store }) => {
      setCartStatus(prev => {
        if (prev[store]) return prev;
        return { ...prev, [store]: { loading: false, url: STORES[store].url, error: false, items_added: 0 } };
      });
    });

    setBuilding(false);
  }

  return (
    <div className="screen">
      <div className="confetti">🛒</div>
      <h1 className="screen-title" style={{ textAlign: "center" }}>
        {building ? "Armando tus carritos..." : "Carritos listos"}
      </h1>
      <p className="screen-sub" style={{ textAlign: "center" }}>
        {building
          ? "Estamos cargando los productos en cada súper. Un momento..."
          : "Tocá cada súper para ir directo al checkout con tus productos cargados."}
      </p>

      {storeBreakdown.map(({ store, total, items }) => {
        const status = cartStatus[store] || { loading: true };
        const href = status.url || STORES[store].url;
        const ready = !status.loading && !building;

        return (
          <a
            key={store}
            className={`redirect-card ${ready ? "" : "loading"}`}
            href={ready ? href : undefined}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => { if (!ready) e.preventDefault(); }}
            style={{ display: "flex", textDecoration: "none", opacity: ready ? 1 : 0.6 }}
          >
            <div className="redirect-left">
              <div className="redirect-logo-box" style={{ background: STORES[store].bg }}>
                {STORES[store].logo}
              </div>
              <div>
                <div className="redirect-name">{STORES[store].name}</div>
                <div className="redirect-items">
                  {items.map(i => i.product.brands[i.brandIdx].brand).join(", ")}
                </div>
                {ready && status.items_added > 0 && (
                  <div style={{ fontSize: 11, color: "var(--primary)", marginTop: 2 }}>
                    ✓ {status.items_added} producto(s) cargados en el carrito
                  </div>
                )}
                {ready && status.items_added === 0 && !status.error && (
                  <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 2 }}>
                    Elegí tu sucursal y los productos se agregarán
                  </div>
                )}
                {ready && status.error && (
                  <div style={{ fontSize: 11, color: "var(--accent2)", marginTop: 2 }}>
                    Buscalos manualmente en el sitio
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center" }}>
              <div className="redirect-total">{fmt(total)}</div>
              <div className="redirect-arrow">{ready ? "→" : "..."}</div>
            </div>
          </a>
        );
      })}

      <div style={{ textAlign: "center", marginTop: 24, fontSize: 13, color: "var(--text2)" }}>
        Los carritos se crean directamente en cada supermercado via VTEX.
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function SuperCompare() {
  const [step, setStep] = useState(1);
  const [storeKeys, setStoreKeys] = useState(Object.keys(STORES));
  const [listText, setListText] = useState("");
  const [cartItems, setCartItems] = useState([]);

  const opt = cartItems.length > 0 ? computeOptimization(cartItems) : null;

  return (
    <>
      <style>{css}</style>
      <div className="app">
        <TopBar step={step} />

        {step === 1 && (
          <ZonaStep onNext={(z, keys) => { if (keys) setStoreKeys(keys); setStep(2); }} />
        )}
        {step === 2 && (
          <ListaStep
            onBack={() => setStep(1)}
            onNext={(text) => { setListText(text); setStep(3); }}
          />
        )}
        {step === 3 && (
          <ResultadosStep
            listText={listText}
            storeKeys={storeKeys}
            onBack={() => setStep(2)}
            onNext={(items) => { setCartItems(items); setStep(4); }}
          />
        )}
        {step === 4 && (
          <ResumenStep
            cartItems={cartItems}
            onBack={() => setStep(3)}
            onNext={() => setStep(7)}
          />
        )}
        {step === 7 && opt && (
          <RedirectStep storeBreakdown={opt.storeBreakdown} />
        )}
      </div>
    </>
  );
}
