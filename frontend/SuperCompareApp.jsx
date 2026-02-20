import { useState, useEffect, useRef } from "react";

/* =============================================
   ZONE & SUPERMARKET CONFIG
============================================= */
const SUPERMARKETS = {
  carrefour: { name: "Carrefour", color: "#004E9A", light: "#E8F0FE", url: "carrefour.com.ar", logo: "🔵" },
  coto: { name: "Coto", color: "#E31837", light: "#FDE8EC", url: "cotodigital3.com.ar", logo: "🔴" },
  dia: { name: "Día", color: "#E67E22", light: "#FFF3E0", url: "supermercadosdia.com.ar", logo: "🟠" },
  jumbo: { name: "Jumbo", color: "#00A859", light: "#E6F9F0", url: "jumbo.com.ar", logo: "🟢" },
};

const ZONES = [
  { code: "caba", name: "Capital Federal (CABA)", province: "Buenos Aires", supers: ["carrefour", "coto", "dia", "jumbo"] },
  { code: "gba_norte", name: "GBA Norte (Vte. López, San Isidro, Tigre)", province: "Buenos Aires", supers: ["carrefour", "coto", "dia", "jumbo"] },
  { code: "gba_sur", name: "GBA Sur (Avellaneda, Lanús, Quilmes)", province: "Buenos Aires", supers: ["carrefour", "coto", "dia"] },
  { code: "gba_oeste", name: "GBA Oeste (Morón, Merlo, La Matanza)", province: "Buenos Aires", supers: ["carrefour", "coto", "dia"] },
  { code: "la_plata", name: "La Plata y alrededores", province: "Buenos Aires", supers: ["carrefour", "coto", "dia"] },
  { code: "mar_del_plata", name: "Mar del Plata", province: "Buenos Aires", supers: ["carrefour", "dia"] },
  { code: "cordoba", name: "Córdoba Capital", province: "Córdoba", supers: ["carrefour", "dia"] },
  { code: "rosario", name: "Rosario", province: "Santa Fe", supers: ["carrefour", "coto"] },
  { code: "mendoza", name: "Mendoza Capital", province: "Mendoza", supers: ["carrefour"] },
  { code: "tucuman", name: "San Miguel de Tucumán", province: "Tucumán", supers: ["carrefour", "dia"] },
];

/* =============================================
   MOCK PRODUCTS (filtered by user's supermarkets)
============================================= */
const ALL_PRODUCTS = [
  { canonical:"Leche Entera 1L", cat:"Lácteos", emoji:"🥛", variants:[
    { store:"carrefour", brand:"La Serenísima", price:1250, promo:null },
    { store:"carrefour", brand:"SanCor", price:1190, promo:1090 },
    { store:"coto", brand:"La Serenísima", price:1180, promo:null },
    { store:"coto", brand:"Tregar", price:1050, promo:null },
    { store:"dia", brand:"Día", price:890, promo:null },
    { store:"jumbo", brand:"La Serenísima", price:1290, promo:null },
  ]},
  { canonical:"Aceite Girasol 1.5L", cat:"Almacén", emoji:"🫒", variants:[
    { store:"carrefour", brand:"Cocinero", price:3890, promo:3490 },
    { store:"coto", brand:"Cañuelas", price:3690, promo:null },
    { store:"dia", brand:"Día", price:3250, promo:null },
    { store:"jumbo", brand:"Natura", price:4250, promo:null },
  ]},
  { canonical:"Arroz Largo Fino 1Kg", cat:"Almacén", emoji:"🍚", variants:[
    { store:"carrefour", brand:"Gallo", price:1690, promo:null },
    { store:"coto", brand:"Molinos", price:1390, promo:null },
    { store:"dia", brand:"Día", price:1290, promo:null },
    { store:"jumbo", brand:"Gallo", price:1750, promo:null },
  ]},
  { canonical:"Fideos Spaghetti 500g", cat:"Almacén", emoji:"🍝", variants:[
    { store:"carrefour", brand:"Matarazzo", price:980, promo:null },
    { store:"coto", brand:"Don Vicente", price:790, promo:null },
    { store:"dia", brand:"Día", price:690, promo:null },
    { store:"jumbo", brand:"Matarazzo", price:1020, promo:null },
  ]},
  { canonical:"Yerba Mate 1Kg", cat:"Almacén", emoji:"🧉", variants:[
    { store:"carrefour", brand:"Taragüí", price:4250, promo:3890 },
    { store:"coto", brand:"Amanda", price:4150, promo:null },
    { store:"dia", brand:"Nobleza Gaucha", price:3490, promo:null },
    { store:"jumbo", brand:"Playadito", price:4690, promo:null },
  ]},
  { canonical:"Harina 000 1Kg", cat:"Almacén", emoji:"🌾", variants:[
    { store:"carrefour", brand:"Cañuelas", price:790, promo:null },
    { store:"coto", brand:"Pureza", price:950, promo:null },
    { store:"dia", brand:"Día", price:690, promo:null },
  ]},
  { canonical:"Carne Picada 1Kg", cat:"Carnes", emoji:"🥩", variants:[
    { store:"carrefour", brand:"—", price:5890, promo:null },
    { store:"coto", brand:"—", price:6250, promo:null },
    { store:"dia", brand:"—", price:5490, promo:null },
    { store:"jumbo", brand:"—", price:6490, promo:null },
  ]},
  { canonical:"Huevos x12", cat:"Frescos", emoji:"🥚", variants:[
    { store:"carrefour", brand:"Granja", price:2890, promo:null },
    { store:"coto", brand:"Granja", price:2750, promo:null },
    { store:"dia", brand:"Granja", price:2490, promo:null },
    { store:"jumbo", brand:"Campo", price:3150, promo:null },
  ]},
  { canonical:"Detergente 750ml", cat:"Limpieza", emoji:"🧴", variants:[
    { store:"carrefour", brand:"Magistral", price:2450, promo:null },
    { store:"coto", brand:"Magistral", price:2590, promo:null },
    { store:"dia", brand:"Día", price:1890, promo:null },
  ]},
  { canonical:"Pan Lactal 500g", cat:"Panadería", emoji:"🍞", variants:[
    { store:"carrefour", brand:"Bimbo", price:2100, promo:null },
    { store:"coto", brand:"Bimbo", price:1950, promo:null },
    { store:"dia", brand:"Día", price:1490, promo:null },
    { store:"jumbo", brand:"Fargo", price:2050, promo:null },
  ]},
];

function getFilteredProducts(userSupermarkets) {
  return ALL_PRODUCTS.map(p => ({
    ...p,
    variants: p.variants.filter(v => userSupermarkets.includes(v.store)),
  })).filter(p => p.variants.length > 0);
}

const ep = v => v?.promo || v?.price || 0;
const fmt = n => n?.toLocaleString("es-AR") || "—";
const bestOf = p => p?.variants.reduce((b,v) => !b||ep(v)<ep(b)?v:b, null);

/* =============================================
   PASSWORD VALIDATION (mirrors backend)
============================================= */
function validatePassword(pw) {
  const checks = [
    { ok: pw.length >= 8, label: "8+ caracteres" },
    { ok: /[A-Z]/.test(pw), label: "Una mayúscula" },
    { ok: /[a-z]/.test(pw), label: "Una minúscula" },
    { ok: /[0-9]/.test(pw), label: "Un número" },
  ];
  return { checks, valid: checks.every(c => c.ok) };
}

/* =============================================
   SHARED STYLES
============================================= */
const S = {
  bg: "#F6F5F0", surface: "#fff", text: "#1A1A18", text2: "#6B6960",
  accent: "#2D6A4F", accent2: "#40916C", accentLight: "#D8F3DC",
  danger: "#D62828", purple: "#7C3AED",
  radius: 14, radiusSm: 8,
  shadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)",
  input: { fontFamily:"inherit", fontSize:14, padding:"12px 16px", border:"1.5px solid rgba(0,0,0,0.12)", borderRadius:12, outline:"none", background:"#F6F5F0", width:"100%" },
  btn: { fontFamily:"inherit", fontSize:14, fontWeight:600, padding:"12px 20px", border:"none", borderRadius:12, cursor:"pointer" },
};

/* =============================================
   AUTH: LOGIN FORM
============================================= */
function LoginForm({ onLogin, onSwitchToRegister }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!email || !password) { setError("Completá todos los campos"); return; }
    setLoading(true); setError("");
    // Simulate API call
    setTimeout(() => {
      setLoading(false);
      // For POC: accept any valid-looking credentials
      if (email.includes("@") && password.length >= 8) {
        onLogin({ email, name: email.split("@")[0] });
      } else {
        setError("Email o contraseña incorrectos");
      }
    }, 800);
  };

  return (
    <div style={{ maxWidth:420, width:"100%", animation:"fadeUp .4s ease" }}>
      <h2 style={{ fontSize:22, fontWeight:700, marginBottom:6 }}>Iniciar sesión</h2>
      <p style={{ fontSize:14, color:S.text2, marginBottom:24 }}>Ingresá a tu cuenta para comparar precios</p>
      
      {error && <div style={{ background:"#FDE8EA", color:S.danger, padding:"10px 14px", borderRadius:10, fontSize:13, marginBottom:16 }}>⚠️ {error}</div>}
      
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        <div>
          <label style={{ fontSize:12, fontWeight:600, color:S.text2, display:"block", marginBottom:4 }}>Email</label>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@email.com" style={S.input} onKeyDown={e=>e.key==="Enter"&&handleSubmit()} />
        </div>
        <div>
          <label style={{ fontSize:12, fontWeight:600, color:S.text2, display:"block", marginBottom:4 }}>Contraseña</label>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" style={S.input} onKeyDown={e=>e.key==="Enter"&&handleSubmit()} />
        </div>
        <button onClick={handleSubmit} disabled={loading} style={{ ...S.btn, background:S.accent, color:"#fff", opacity:loading?.6:1, marginTop:4 }}>
          {loading ? "Ingresando..." : "Ingresar"}
        </button>
      </div>
      
      <p style={{ textAlign:"center", fontSize:13, color:S.text2, marginTop:20 }}>
        ¿No tenés cuenta?{" "}
        <button onClick={onSwitchToRegister} style={{ fontFamily:"inherit", fontSize:13, fontWeight:600, color:S.accent, background:"none", border:"none", cursor:"pointer", textDecoration:"underline" }}>Registrate</button>
      </p>
    </div>
  );
}

/* =============================================
   AUTH: MULTI-STEP REGISTRATION
============================================= */
function RegisterForm({ onRegister, onSwitchToLogin }) {
  const [step, setStep] = useState(1); // 1: datos, 2: zona, 3: supermercados
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [zone, setZone] = useState(null);
  const [selectedSupers, setSelectedSupers] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const pwCheck = validatePassword(password);
  const zoneData = zone ? ZONES.find(z => z.code === zone) : null;
  const availableSupers = zoneData?.supers || [];

  const goStep2 = () => {
    if (!name.trim()) { setError("Ingresá tu nombre"); return; }
    if (!email.includes("@")) { setError("Email inválido"); return; }
    if (!pwCheck.valid) { setError("La contraseña no cumple los requisitos"); return; }
    setError(""); setStep(2);
  };

  const goStep3 = () => {
    if (!zone) { setError("Seleccioná tu zona"); return; }
    setError("");
    setSelectedSupers(availableSupers); // Pre-select all available
    setStep(3);
  };

  const toggleSuper = (code) => {
    setSelectedSupers(prev => prev.includes(code) ? prev.filter(s => s !== code) : [...prev, code]);
  };

  const finish = () => {
    if (selectedSupers.length === 0) { setError("Seleccioná al menos un supermercado"); return; }
    setLoading(true); setError("");
    setTimeout(() => {
      setLoading(false);
      onRegister({ name, email, zone, supermarkets: selectedSupers });
    }, 800);
  };

  return (
    <div style={{ maxWidth:480, width:"100%", animation:"fadeUp .4s ease" }}>
      {/* Progress */}
      <div style={{ display:"flex", gap:8, marginBottom:24 }}>
        {[1,2,3].map(s => (
          <div key={s} style={{ flex:1, height:4, borderRadius:2, background: s <= step ? S.accent : "#eee", transition:"all .3s" }} />
        ))}
      </div>

      {error && <div style={{ background:"#FDE8EA", color:S.danger, padding:"10px 14px", borderRadius:10, fontSize:13, marginBottom:16 }}>⚠️ {error}</div>}

      {/* Step 1: Account info */}
      {step === 1 && (
        <div>
          <h2 style={{ fontSize:22, fontWeight:700, marginBottom:4 }}>Crear cuenta</h2>
          <p style={{ fontSize:14, color:S.text2, marginBottom:20 }}>Empezá a ahorrar en el súper</p>
          
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:S.text2, display:"block", marginBottom:4 }}>Nombre completo</label>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="Juan Pérez" style={S.input} />
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:S.text2, display:"block", marginBottom:4 }}>Email</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@email.com" style={S.input} />
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:S.text2, display:"block", marginBottom:4 }}>Contraseña</label>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" style={S.input} />
              <div style={{ display:"flex", gap:8, marginTop:8, flexWrap:"wrap" }}>
                {pwCheck.checks.map((c,i) => (
                  <span key={i} style={{ fontSize:11, padding:"2px 8px", borderRadius:10, background: c.ok ? S.accentLight : "#f0f0ec", color: c.ok ? S.accent : S.text2, fontWeight:500 }}>
                    {c.ok ? "✓" : "○"} {c.label}
                  </span>
                ))}
              </div>
            </div>
            <button onClick={goStep2} style={{ ...S.btn, background:S.accent, color:"#fff", marginTop:4 }}>Siguiente →</button>
          </div>

          <p style={{ textAlign:"center", fontSize:13, color:S.text2, marginTop:20 }}>
            ¿Ya tenés cuenta?{" "}
            <button onClick={onSwitchToLogin} style={{ fontFamily:"inherit", fontSize:13, fontWeight:600, color:S.accent, background:"none", border:"none", cursor:"pointer", textDecoration:"underline" }}>Iniciá sesión</button>
          </p>
        </div>
      )}

      {/* Step 2: Zone selection */}
      {step === 2 && (
        <div>
          <button onClick={() => setStep(1)} style={{ fontFamily:"inherit", fontSize:13, color:S.text2, background:"none", border:"none", cursor:"pointer", marginBottom:12 }}>← Volver</button>
          <h2 style={{ fontSize:22, fontWeight:700, marginBottom:4 }}>¿Dónde vivís?</h2>
          <p style={{ fontSize:14, color:S.text2, marginBottom:20 }}>Te mostramos solo los supermercados que operan en tu zona</p>
          
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {ZONES.map(z => (
              <button key={z.code} onClick={() => setZone(z.code)} style={{
                display:"flex", alignItems:"center", justifyContent:"space-between",
                padding:"14px 18px", borderRadius:12, cursor:"pointer", textAlign:"left",
                border: zone === z.code ? `2px solid ${S.accent}` : "1.5px solid rgba(0,0,0,0.08)",
                background: zone === z.code ? S.accentLight : "#fff",
                fontFamily:"inherit", transition:"all .15s",
              }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:600, color: zone === z.code ? S.accent : S.text }}>{z.name}</div>
                  <div style={{ fontSize:12, color:S.text2, marginTop:2 }}>
                    {z.supers.length} supermercado{z.supers.length > 1 ? "s" : ""}: {z.supers.map(s => SUPERMARKETS[s].name).join(", ")}
                  </div>
                </div>
                {zone === z.code && <span style={{ fontSize:18, color:S.accent }}>✓</span>}
              </button>
            ))}
          </div>
          
          <button onClick={goStep3} disabled={!zone} style={{ ...S.btn, background: zone ? S.accent : "#ddd", color:"#fff", width:"100%", marginTop:16 }}>
            Siguiente →
          </button>
        </div>
      )}

      {/* Step 3: Supermarket selection */}
      {step === 3 && (
        <div>
          <button onClick={() => setStep(2)} style={{ fontFamily:"inherit", fontSize:13, color:S.text2, background:"none", border:"none", cursor:"pointer", marginBottom:12 }}>← Volver</button>
          <h2 style={{ fontSize:22, fontWeight:700, marginBottom:4 }}>¿En cuáles comprás?</h2>
          <p style={{ fontSize:14, color:S.text2, marginBottom:8 }}>
            Seleccioná los supermercados donde tenés cuenta online o donde comprás habitualmente.
            Solo te mostramos precios de los que selecciones.
          </p>
          <p style={{ fontSize:12, color:S.accent, background:S.accentLight, padding:"8px 12px", borderRadius:8, marginBottom:16 }}>
            🔒 No necesitamos tus credenciales. Solo queremos saber cuáles usás para personalizar tu experiencia.
          </p>
          
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {availableSupers.map(code => {
              const s = SUPERMARKETS[code];
              const isSelected = selectedSupers.includes(code);
              return (
                <button key={code} onClick={() => toggleSuper(code)} style={{
                  display:"flex", alignItems:"center", gap:14, padding:"16px 20px",
                  borderRadius:14, cursor:"pointer", textAlign:"left",
                  border: isSelected ? `2px solid ${s.color}` : "1.5px solid rgba(0,0,0,0.08)",
                  background: isSelected ? s.light : "#fff",
                  fontFamily:"inherit", transition:"all .15s",
                }}>
                  <span style={{ fontSize:28 }}>{s.logo}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:15, fontWeight:600, color: isSelected ? s.color : S.text }}>{s.name}</div>
                    <div style={{ fontSize:12, color:S.text2 }}>{s.url}</div>
                  </div>
                  <div style={{
                    width:28, height:28, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center",
                    background: isSelected ? s.color : "#eee",
                    color: isSelected ? "#fff" : "#ccc", fontSize:14, fontWeight:700,
                    transition:"all .15s",
                  }}>
                    {isSelected ? "✓" : ""}
                  </div>
                </button>
              );
            })}
          </div>
          
          <div style={{ fontSize:12, color:S.text2, marginTop:12, textAlign:"center" }}>
            {selectedSupers.length === 0
              ? "Seleccioná al menos uno"
              : `${selectedSupers.length} seleccionado${selectedSupers.length > 1 ? "s" : ""} — podés cambiar después en tu perfil`
            }
          </div>
          
          <button onClick={finish} disabled={loading || selectedSupers.length === 0} style={{
            ...S.btn, background: selectedSupers.length > 0 ? S.accent : "#ddd",
            color:"#fff", width:"100%", marginTop:16, opacity: loading ? .6 : 1,
          }}>
            {loading ? "Creando cuenta..." : `Crear cuenta con ${selectedSupers.length} súper${selectedSupers.length > 1 ? "s" : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}

/* =============================================
   AUTH SCREEN (wrapper)
============================================= */
function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login"); // login | register

  return (
    <div style={{
      minHeight:"100vh", background:`linear-gradient(135deg, ${S.bg} 0%, #E8F0E6 100%)`,
      display:"flex", alignItems:"center", justifyContent:"center", padding:24,
    }}>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", width:"100%" }}>
        {/* Logo */}
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:32 }}>
          <div style={{ width:48, height:48, background:S.accent, borderRadius:14, display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, color:"#fff" }}>🛒</div>
          <div>
            <div style={{ fontWeight:700, fontSize:22, letterSpacing:-.5 }}>SuperCompare</div>
            <div style={{ fontSize:12, color:S.text2 }}>Compará precios, ahorrá en serio</div>
          </div>
        </div>

        {/* Card */}
        <div style={{
          background:"#fff", borderRadius:20, padding:"32px 28px",
          boxShadow:"0 4px 24px rgba(0,0,0,0.08)", width:"100%", maxWidth:520,
        }}>
          {mode === "login"
            ? <LoginForm onLogin={(user) => onAuth({ ...user, supermarkets:["carrefour","coto","dia"], zone:"caba" })} onSwitchToRegister={() => setMode("register")} />
            : <RegisterForm onRegister={onAuth} onSwitchToLogin={() => setMode("login")} />
          }
        </div>

        <p style={{ fontSize:11, color:"#aaa", marginTop:20, textAlign:"center" }}>
          POC — Datos de prueba · Contraseña: 8+ chars, 1 mayúscula, 1 minúscula, 1 número
        </p>
      </div>
    </div>
  );
}

/* =============================================
   MAIN APP (post-login)
============================================= */
const Badge = ({store}) => { const s=SUPERMARKETS[store]; if(!s) return null; return <span style={{display:"inline-flex",fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:6,background:s.light,color:s.color,whiteSpace:"nowrap"}}>{s.name}</span>; };

function BrandTable({ product, selected, onSelect }) {
  const all = product.variants;
  const cheapest = Math.min(...all.map(ep));
  const brands = [...new Set(all.map(v => v.brand))];
  const stores = [...new Set(all.map(v => v.store))];
  return (
    <div style={{ overflowX:"auto", margin:"8px 0" }}>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
        <thead><tr style={{ borderBottom:"2px solid #eee" }}>
          <th style={{ textAlign:"left", padding:"8px 10px", fontWeight:600, color:S.text2, fontSize:12 }}>Marca</th>
          {stores.map(s => <th key={s} style={{ textAlign:"center", padding:"8px 4px" }}><Badge store={s}/></th>)}
        </tr></thead>
        <tbody>{brands.map(brand => (
          <tr key={brand} style={{ borderBottom:"1px solid #f0f0ec" }}>
            <td style={{ padding:"8px 10px", fontWeight:500 }}>{brand}</td>
            {stores.map(store => {
              const v = all.find(x => x.brand===brand && x.store===store);
              if (!v) return <td key={store} style={{ textAlign:"center",color:"#ddd" }}>—</td>;
              const isBest = ep(v)===cheapest;
              const isSel = selected?.brand===v.brand && selected?.store===v.store;
              return <td key={store} style={{ textAlign:"center", padding:4 }}>
                <button onClick={() => onSelect(v)} style={{
                  fontFamily:"'Space Mono',monospace", fontSize:12, fontWeight:600, padding:"7px 10px",
                  borderRadius:8, cursor:"pointer", width:"100%",
                  border: isSel?"2px solid #2D6A4F":"1.5px solid transparent",
                  background: isSel?S.accentLight:isBest?"#f0fdf4":"#fafaf7",
                  color: isBest?S.accent:S.text,
                }}>
                  {v.promo&&<span style={{fontSize:8,fontWeight:700,color:"#fff",background:S.danger,padding:"0 4px",borderRadius:3,marginRight:4}}>OFF</span>}
                  ${fmt(ep(v))}
                  {isBest&&<span style={{display:"block",fontSize:8,fontWeight:700,color:S.accent,marginTop:2}}>MEJOR</span>}
                </button>
              </td>;
            })}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function MainApp({ user, onLogout }) {
  const [products] = useState(() => getFilteredProducts(user.supermarkets));
  const [cart, setCart] = useState([]);
  const [sels, setSels] = useState({});
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [showSettings, setShowSettings] = useState(false);

  const doSearch = t => { setSearch(t); setResults(t.length<2?[]:products.filter(p=>p.canonical.toLowerCase().includes(t.toLowerCase())||p.cat.toLowerCase().includes(t.toLowerCase()))); };
  const add = c => { if(!cart.includes(c)){setCart(p=>[...p,c]);setSearch("");setResults([]);} };
  const remove = c => { setCart(p=>p.filter(x=>x!==c)); setSels(p=>{const n={...p};delete n[c];return n;}); };
  const totalSel = Object.values(sels).reduce((s,v)=>s+ep(v),0);
  const allDone = cart.length>0 && cart.every(c=>sels[c]);

  return (
    <div>
      {/* Header */}
      <header style={{ background:"#fff", borderBottom:"1px solid rgba(0,0,0,0.06)", padding:"0 24px", position:"sticky", top:0, zIndex:100 }}>
        <div style={{ maxWidth:1100, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", height:58 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:34, height:34, background:S.accent, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, color:"#fff" }}>🛒</div>
            <span style={{ fontWeight:700, fontSize:17, letterSpacing:-.5 }}>SuperCompare</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ display:"flex", gap:4 }}>
              {user.supermarkets.map(s => <Badge key={s} store={s} />)}
            </div>
            <button onClick={() => setShowSettings(!showSettings)} style={{ fontFamily:"inherit", fontSize:12, padding:"6px 12px", border:"1px solid rgba(0,0,0,0.1)", borderRadius:8, background:"#fff", cursor:"pointer", color:S.text2 }}>
              👤 {user.name}
            </button>
          </div>
        </div>
      </header>

      {/* Settings dropdown */}
      {showSettings && (
        <div style={{ position:"fixed", top:58, right:24, background:"#fff", borderRadius:14, padding:16, boxShadow:"0 4px 24px rgba(0,0,0,0.12)", zIndex:200, width:260 }}>
          <div style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>{user.name}</div>
          <div style={{ fontSize:12, color:S.text2, marginBottom:12 }}>{user.email}</div>
          <div style={{ fontSize:12, color:S.text2, marginBottom:8 }}>
            <strong>Zona:</strong> {ZONES.find(z=>z.code===user.zone)?.name || user.zone}
          </div>
          <div style={{ fontSize:12, color:S.text2, marginBottom:12 }}>
            <strong>Súpers:</strong> {user.supermarkets.map(s=>SUPERMARKETS[s].name).join(", ")}
          </div>
          <button onClick={onLogout} style={{ ...S.btn, fontSize:12, padding:"8px 14px", background:"#fde8ea", color:S.danger, width:"100%" }}>
            Cerrar sesión
          </button>
        </div>
      )}

      {/* Zone info bar */}
      <div style={{ padding:"8px 24px", background:"#fff", borderBottom:"1px solid rgba(0,0,0,0.04)", display:"flex", justifyContent:"center", gap:16, fontSize:12, color:S.text2 }}>
        <span>📍 {ZONES.find(z=>z.code===user.zone)?.name}</span>
        <span>🏪 {user.supermarkets.length} súper{user.supermarkets.length>1?"s":""} habilitados</span>
        <span>📦 {products.length} productos disponibles</span>
      </div>

      {/* Main */}
      <main style={{ maxWidth:900, margin:"0 auto", padding:"20px 24px" }}>
        {/* Search */}
        <div style={{ background:"#fff", borderRadius:14, padding:16, boxShadow:S.shadow, marginBottom:16 }}>
          <div style={{ position:"relative" }}>
            <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", fontSize:18, color:"#aaa" }}>⌕</span>
            <input value={search} onChange={e=>doSearch(e.target.value)} placeholder="Buscar producto..." style={{ ...S.input, paddingLeft:42 }} />
          </div>
          {results.length>0 && <div style={{ marginTop:8, borderRadius:10, border:"1px solid #eee", maxHeight:250, overflowY:"auto" }}>
            {results.map(p => { const added=cart.includes(p.canonical); const b=bestOf(p); return (
              <div key={p.canonical} onClick={()=>!added&&add(p.canonical)} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", cursor:added?"default":"pointer", borderBottom:"1px solid #f5f5f0", opacity:added?.4:1 }}>
                <span style={{ fontSize:20 }}>{p.emoji}</span>
                <div style={{ flex:1 }}><div style={{ fontWeight:500, fontSize:13 }}>{p.canonical}</div><div style={{ fontSize:11, color:S.text2 }}>{p.cat} · {p.variants.length} opciones en tus súpers</div></div>
                <span style={{ fontFamily:"'Space Mono',monospace", fontSize:12, color:S.accent }}>desde ${fmt(ep(b))}</span>
                {!added&&<span style={{ color:S.accent, fontWeight:700, fontSize:18 }}>+</span>}
              </div>); })}
          </div>}
          <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginTop:10 }}>
            {[...new Set(products.map(p=>p.cat))].map(c => <button key={c} onClick={()=>doSearch(c)} style={{ fontFamily:"inherit", fontSize:11, padding:"3px 10px", border:"1px solid rgba(0,0,0,0.08)", borderRadius:16, background:"transparent", color:S.text2, cursor:"pointer" }}>{c}</button>)}
          </div>
        </div>

        {/* Cart items */}
        {cart.length > 0 ? (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <h3 style={{ fontSize:15, fontWeight:600, padding:"0 2px" }}>🛒 Tu lista · {cart.length}</h3>
            {cart.map(c => {
              const p = products.find(x=>x.canonical===c);
              if (!p) return null;
              const sel = sels[c];
              const best = bestOf(p);
              const [open, setOpen] = useState(false);
              return (
                <div key={c} style={{ background:"#fff", borderRadius:14, boxShadow:"0 1px 3px rgba(0,0,0,0.05)", overflow:"hidden" }}>
                  <div onClick={()=>setOpen(!open)} style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 16px", cursor:"pointer", userSelect:"none" }}>
                    <span style={{ fontSize:26 }}>{p.emoji}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:600, fontSize:14 }}>{p.canonical}</div>
                      <div style={{ fontSize:12, color:S.text2, display:"flex", alignItems:"center", gap:4, marginTop:2 }}>
                        {sel ? <><Badge store={sel.store}/> {sel.brand}</> : <span style={{ opacity:.5 }}>Tocá para comparar</span>}
                      </div>
                    </div>
                    <span style={{ fontFamily:"'Space Mono',monospace", fontWeight:700, fontSize:13 }}>
                      {sel ? `$${fmt(ep(sel))}` : <span style={{ color:"#aaa" }}>desde ${fmt(ep(best))}</span>}
                    </span>
                    <span style={{ fontSize:11, color:"#bbb", transition:"transform .2s", transform:open?"rotate(180deg)":"none" }}>▼</span>
                    <button onClick={e=>{e.stopPropagation();remove(c);}} style={{ width:28, height:28, borderRadius:8, border:"none", background:"#fde8ea", color:S.danger, cursor:"pointer", fontSize:13, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
                  </div>
                  {open && <div style={{ padding:"0 16px 14px", borderTop:"1px solid #f0f0ec" }}>
                    <div style={{ fontSize:11, color:S.text2, fontWeight:600, margin:"10px 0 4px" }}>
                      COMPARACIÓN EN TUS {user.supermarkets.length} SUPERMERCADOS
                    </div>
                    <BrandTable product={p} selected={sel} onSelect={v=>setSels(pr=>({...pr,[c]:v}))} />
                  </div>}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ background:"#fff", borderRadius:14, padding:40, textAlign:"center", boxShadow:S.shadow, color:S.text2 }}>
            <div style={{ fontSize:48, marginBottom:12 }}>📝</div>
            <p style={{ fontWeight:600, color:S.text, marginBottom:4 }}>Tu lista está vacía</p>
            <p style={{ fontSize:13 }}>Buscá productos arriba para empezar. Solo te mostramos precios de <strong>{user.supermarkets.map(s=>SUPERMARKETS[s].name).join(", ")}</strong>.</p>
          </div>
        )}

        {/* Summary */}
        {cart.length > 0 && (
          <div style={{
            background:"#fff", borderRadius:14, padding:16, marginTop:12,
            boxShadow:"0 2px 8px rgba(0,0,0,0.06)", display:"flex", alignItems:"center",
            justifyContent:"space-between", flexWrap:"wrap", gap:12,
            position:"sticky", bottom:8,
            border: allDone ? `2px solid ${S.accent}` : "1px solid #eee",
          }}>
            <div>
              <div style={{ fontSize:11, color:S.text2, fontWeight:600, textTransform:"uppercase" }}>Total</div>
              <div style={{ fontFamily:"'Space Mono',monospace", fontSize:22, fontWeight:700, color: allDone ? S.accent : "#bbb" }}>
                {allDone ? `$${fmt(totalSel)}` : `${Object.keys(sels).length}/${cart.length} seleccionados`}
              </div>
              {allDone && <div style={{ display:"flex", gap:4, marginTop:4 }}>{[...new Set(Object.values(sels).map(v=>v.store))].map(s=><Badge key={s} store={s}/>)}</div>}
            </div>
            <button disabled={!allDone} style={{ ...S.btn, background: allDone ? S.accent : "#ddd", color:"#fff" }}>
              {allDone ? "Ir a pagar →" : "Seleccioná todo"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

/* =============================================
   ROOT APP
============================================= */
export default function App() {
  const [user, setUser] = useState(null);

  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", background:S.bg, color:S.text, minHeight:"100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=Space+Mono:wght@400;700&display=swap');
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        *{margin:0;padding:0;box-sizing:border-box}
        input:focus{border-color:#2D6A4F!important}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#ccc;border-radius:2px}
      `}</style>

      {user
        ? <MainApp user={user} onLogout={() => setUser(null)} />
        : <AuthScreen onAuth={(u) => setUser(u)} />
      }
    </div>
  );
}
