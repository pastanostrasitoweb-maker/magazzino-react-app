// hotfix assegnazione prodotti senza lotto su ID disponibilità reale
import React, { useEffect, useMemo, useState } from "react";
import { callSheetsApi } from "./src/supabase-adapter.js";
import {
  Package,
  ClipboardList,
  Search,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Boxes,
  Trash2,
  Lock,
  Pencil,
  RefreshCw,
  Clock,
  Archive,
  RotateCcw,
} from "lucide-react";

// Storico: backend Apps Script (JSONP) usato fino al 2026-06-09, ora sostituito
// da Supabase via ./src/supabase-adapter.js. URL mantenuto come riferimento
// per il commit history e per eventuale rollback.
// const SHEETS_API_URL =
//   "https://script.google.com/macros/s/AKfycbxNom4UmYHZhcUNKBJt5BOtDEWzRiCKdiiXl-_3Na3qAONmzLqTRpxyU0gOaLLuffQE/exec";
const ADMIN_PIN = "1234";

const fallbackProducts = [
  { id: "1", code: "NFARMA 013", name: "Pici 250", uom: "pz", category: "", subcategory: "" },
  { id: "2", code: "NFARMA 007", name: "Tonnarelli 250", uom: "pz", category: "", subcategory: "" },
];

const fallbackLots = [
  { id: "1", productId: "1", lot: "2604104", expiry: "2026-05-06", loadedQty: 34 },
  { id: "2", productId: "2", lot: "2604108", expiry: "2026-05-08", loadedQty: 18 },
];

// callSheetsApi è ora importato da ./src/supabase-adapter.js (vedi top file).
// Mantiene la firma originale: chiamata senza args = bulk load, con
// { action, ...payload } = singola azione. Il body interno è cambiato (Supabase
// invece di JSONP→Apps Script) ma lo shape di risposta è identico, quindi i
// 27 call sites non richiedono modifiche.

function getField(row, keys) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== "") return row[key];
  }
  return "";
}

function fmtDate(date) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return String(date);
  return d.toLocaleDateString("it-IT");
}

function cardStyle(extra = {}) {
  return {
    background: "rgba(255,255,255,0.96)",
    border: "1px solid #dce4f0",
    borderRadius: 26,
    boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
    minWidth: 0,
    boxSizing: "border-box",
    ...extra,
  };
}

function btnStyle(variant = "primary", disabled = false) {
  const base = {
    height: 50,
    borderRadius: 16,
    border: "1px solid transparent",
    padding: "0 18px",
    fontSize: 15,
    fontWeight: 850,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    whiteSpace: "nowrap",
    boxSizing: "border-box",
    transition: "transform 120ms ease, box-shadow 120ms ease, background 120ms ease",
  };

  if (variant === "outline") {
    return {
      ...base,
      background: "#fff",
      color: "#0b1638",
      border: "1px solid #cfd8e6",
      boxShadow: "0 4px 12px rgba(15,23,42,0.04)",
    };
  }

  if (variant === "soft") {
    return {
      ...base,
      background: "#edf2f8",
      color: "#1d2a44",
    };
  }

  if (variant === "success") {
    return {
      ...base,
      background: "linear-gradient(135deg, #16813d, #0f6b32)",
      color: "#fff",
      boxShadow: "0 10px 22px rgba(22,129,61,0.22)",
    };
  }

  if (variant === "danger") {
    return {
      ...base,
      background: "#fff",
      color: "#991b1b",
      border: "1px solid #fecaca",
    };
  }

  return {
    ...base,
    background: "linear-gradient(135deg, #07153a, #0d225d)",
    color: "#fff",
    boxShadow: "0 8px 18px rgba(7,21,58,0.16)",
  };
}


function compactBtnStyle(variant = "primary", disabled = false) {
  const base = btnStyle(variant, disabled);

  return {
    ...base,
    height: 40,
    borderRadius: 14,
    padding: "0 12px",
    fontSize: 13,
    fontWeight: 800,
  };
}

function inputStyle() {
  return {
    width: "100%",
    height: 50,
    borderRadius: 16,
    border: "1px solid #cfd8e6",
    padding: "0 14px",
    fontSize: 15,
    outline: "none",
    background: "#fff",
    boxSizing: "border-box",
  };
}


function compactInputStyle() {
  return {
    ...inputStyle(),
    height: 42,
    borderRadius: 14,
    fontSize: 14,
    padding: "0 10px",
  };
}

function labelStyle() {
  return {
    display: "block",
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 8,
    color: "#1f2937",
  };
}

function badgeStyle(kind = "outline") {
  const variants = {
    outline: { border: "1px solid #d8dee8", background: "#fff", color: "#243043" },
    success: { border: "1px solid #bfe7c8", background: "#eefbf2", color: "#166534" },
    warning: { border: "1px solid #fed7aa", background: "#fff7ed", color: "#b45309" },
    dark: { border: "1px solid #07153a", background: "#07153a", color: "#fff" },
    danger: { border: "1px solid #fecaca", background: "#fff1f2", color: "#991b1b" },
  };

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 850,
    lineHeight: 1,
    ...(variants[kind] || variants.outline),
  };
}


function productCategoryLabel(product) {
  return [product?.category, product?.subcategory].filter(Boolean).join(" › ");
}

function productOptionLabel(product) {
  const categoryLabel = productCategoryLabel(product);
  const baseLabel = [product?.code, product?.name].filter(Boolean).join(" · ");

  return categoryLabel ? `${categoryLabel} · ${baseLabel}` : baseLabel;
}


function productManagesLots(product) {
  return product?.managesLots !== false;
}

function productStockModeLabel(product) {
  return productManagesLots(product) ? "Gestione lotti" : "Disponibilità generica";
}

const OUTSIDE_STOCK_PRODUCT_ID = "FUORI_MAGAZZINO";

function isOutsideStockLine(line) {
  return (
    line?.isOutsideStock ||
    String(line?.productId || "").startsWith(OUTSIDE_STOCK_PRODUCT_ID)
  );
}

function miniStatStyle(tone = "neutral") {
  const variants = {
    neutral: { background: "#f3f6fb", color: "#0f172a", border: "1px solid #dce4f0" },
    success: { background: "#eefbf2", color: "#166534", border: "1px solid #bfe7c8" },
    warning: { background: "#fff7ed", color: "#b45309", border: "1px solid #fed7aa" },
  };

  return {
    borderRadius: 16,
    padding: "9px 7px",
    textAlign: "center",
    minWidth: 54,
    boxShadow: "inset 0 -1px 0 rgba(15,23,42,0.04)",
    ...(variants[tone] || variants.neutral),
  };
}

function normalizeProducts(rows) {
  return rows
    .map((row, index) => ({
      id: String(
        getField(row, [
          "ID_Prodotto",
          "Id_Prodotto",
          "id",
          "Codice_Prodotto",
          "Codice prodotto",
        ]) || `PROD-${index + 1}`
      ),
      code: String(getField(row, ["Codice_Prodotto", "Codice prodotto", "Codice", "code"])).trim(),
      name: String(
        getField(row, ["Descrizione_Prodotto", "Descrizione prodotto", "Descrizione", "name"])
      ).trim(),
      uom: String(
        getField(row, ["UM", "U_M", "Unità_Misura", "Unità di misura", "uom"]) || "pz"
      ).trim(),
      category: String(
        getField(row, ["Categoria", "category", "Categoria_Prodotto", "Categoria prodotto"])
      ).trim(),
      subcategory: String(
        getField(row, [
          "Sottocategoria",
          "Sotto_Categoria",
          "Sotto categoria",
          "Subcategoria",
          "subcategory",
          "Sottocategoria_Prodotto",
        ])
      ).trim(),
      managesLots: !["no", "n", "false", "falso", "0", "generica", "solo disponibilita", "solo disponibilità"].includes(
        String(getField(row, ["Gestione_Lotti", "Gestione lotti", "Lotti"]) || "SI")
          .trim()
          .toLowerCase()
      ),
    }))
    .filter((product) => product.code || product.name);
}

function normalizeLots(rows, products) {
  const productByCode = Object.fromEntries(products.map((p) => [String(p.code), p.id]));
  const productById = Object.fromEntries(products.map((p) => [String(p.id), p.id]));

  return rows
    .map((row, index) => {
      const productCode = String(
        getField(row, ["Codice_Prodotto", "Codice prodotto", "Codice", "Prodotto"])
      ).trim();

      const productIdRaw = String(
        getField(row, ["ID_Prodotto", "Id_Prodotto", "ProductId"])
      ).trim();

      return {
        id: String(
          getField(row, ["ID_Lotto", "Id_Lotto", "id"]) || `LOT-MISSING-${index + 1}`
        ),
        productId: productByCode[productCode] || productById[productIdRaw] || productIdRaw,
        lot: String(getField(row, ["Codice_Lotto", "Codice lotto", "Lotto"])).trim(),
        expiry: getField(row, ["Scadenza", "Data_Scadenza", "Data scadenza"]),
        archived: ["si", "sì", "yes", "true"].includes(
          String(getField(row, ["Lotto_Archiviato", "Archiviato_Lotto", "Archived_Lot", "Archiviato"])).trim().toLowerCase()
        ),
        loadedQty: Number(
          getField(row, [
            "Quantità_Caricata",
            "Quantita_Caricata",
            "Quantità caricata",
            "Quantita caricata",
            "Qta",
          ]) || 0
        ),
      };
    })
    .filter((lot) => lot.lot && lot.productId);
}

function normalizeOrders(rows) {
  return rows
    .map((row, index) => ({
      id: String(getField(row, ["ID_Ordine", "Id_Ordine", "Ordine", "id"]) || `ORD-${index + 1}`),
      customer: String(getField(row, ["Cliente", "Customer", "cliente"])).trim(),
      notes: String(getField(row, ["Note", "Note_Ordine", "Descrizione", "notes"])).trim(),
      dataPrepared: getField(row, ["Data_Preparato", "Data preparato", "Prepared_At"]),
      archived: ["si", "sì", "yes", "true"].includes(
        String(getField(row, ["Archiviato", "Archivio", "Archived"])).trim().toLowerCase()
      ),
      status: String(getField(row, ["Stato", "status"]) || "Da preparare"),
      workStatus: String(
        getField(row, ["Stato_Lavorazione", "Stato lavorazione", "WorkStatus"]) || "In lavorazione"
      ),
      date: getField(row, ["Data_Ordine", "Data ordine", "Data", "date"]),
      colliManual: (() => {
        const raw = getField(row, ["Colli", "Numero_Colli", "Colli_Ordine"]);
        if (raw === undefined || raw === null || String(raw).trim() === "") return null;
        const n = Number(raw);
        return Number.isFinite(n) && n >= 0 ? n : null;
      })(),
      lines: [],
    }))
    .filter((order) => order.id);
}

function normalizeOrderLines(rows, products) {
  const productByCode = Object.fromEntries(products.map((p) => [String(p.code), p.id]));
  const productById = Object.fromEntries(products.map((p) => [String(p.id), p.id]));

  return rows
    .map((row, index) => {
      const productCode = String(
        getField(row, ["Codice_Prodotto", "Codice prodotto", "Codice", "Prodotto"])
      ).trim();

      const productIdRaw = String(
        getField(row, ["ID_Prodotto", "Id_Prodotto", "ProductId"])
      ).trim();

      const productName = String(
        getField(row, ["Descrizione_Prodotto", "Descrizione prodotto", "Descrizione", "productName"])
      ).trim();

      const resolvedProductId = productByCode[productCode] || productById[productIdRaw] || productIdRaw;

      return {
        lineId: String(getField(row, ["ID_Riga", "Id_Riga", "id"]) || `RIGA-${index + 1}`),
        orderId: String(getField(row, ["ID_Ordine", "Id_Ordine", "Ordine"])).trim(),
        productId: resolvedProductId,
        productName,
        rowOrder: Number(getField(row, ["Ordine_Riga", "Ordine riga", "Row_Order"]) || index + 1),
        isOutsideStock: String(resolvedProductId).startsWith(OUTSIDE_STOCK_PRODUCT_ID),
        qtyOrdered: Number(
          getField(row, [
            "Quantità_Ordinata",
            "Quantita_Ordinata",
            "Quantità ordinata",
            "Quantita ordinata",
          ]) || 0
        ),
        qtyAssignedFromSheet: Number(
          getField(row, [
            "Quantita_Assegnata",
            "Quantità_Assegnata",
            "Quantita assegnata",
            "Quantità assegnata",
          ]) || 0
        ),
      };
    })
    .filter((line) => line.lineId && line.orderId && line.productId);
}

function normalizeAssignments(rows, lines, lots) {
  const lineIds = new Set(lines.map((line) => String(line.lineId)));
  const lineById = Object.fromEntries(lines.map((line) => [String(line.lineId), line]));
  const lotById = Object.fromEntries(lots.map((lot) => [String(lot.id), lot]));
  const lotsByCode = {};

  lots.forEach((lot) => {
    const code = String(lot.lot || "");

    if (!lotsByCode[code]) lotsByCode[code] = [];
    lotsByCode[code].push(lot);
  });

  const grouped = {};

  rows.forEach((row, index) => {
    const lineId = String(getField(row, ["ID_Riga", "Id_Riga", "Riga"])).trim();
    if (!lineIds.has(lineId)) return;

    const line = lineById[lineId];

    const lotIdRaw = String(getField(row, ["ID_Lotto", "Id_Lotto", "id"])).trim();
    const lotCode = String(
      getField(row, ["Codice_Lotto", "Codice lotto", "Lotto"])
    ).trim();

    let lot = lotById[lotIdRaw];

    if (!lot && lotCode) {
      const candidates = lotsByCode[lotCode] || [];
      lot =
        candidates.find((candidate) => String(candidate.productId) === String(line.productId)) ||
        (candidates.length === 1 ? candidates[0] : null);
    }

    const lotId = lot?.id || lotIdRaw || lotCode;
    if (!lotId) return;

    const item = {
      assignmentId: String(
        getField(row, ["ID_Assegnazione", "Id_Assegnazione", "id"]) || `ASS-${index + 1}`
      ),
      lotId,
      productId: String(line.productId),
      qty: Number(
        getField(row, [
          "Quantità_Assegnata",
          "Quantita_Assegnata",
          "Quantità assegnata",
          "Quantita assegnata",
          "Quantita_A",
        ]) || 0
      ),
    };

    if (!grouped[lineId]) grouped[lineId] = [];
    grouped[lineId].push(item);
  });

  return grouped;
}


function buildOrdersWithLines(orders, lines) {
  return orders.map((order) => ({
    ...order,
    lines: lines.filter((line) => String(line.orderId) === String(order.id)),
  }));
}


function ProductSearchSelect({
  products,
  value,
  onChange,
  search,
  onSearchChange,
  placeholder = "Cerca per codice o descrizione",
}) {
  const [open, setOpen] = useState(false);

  const selectedProduct = products.find((product) => String(product.id) === String(value));
  const query = String(search || "").trim().toLowerCase();

  const suggestions = products
    .filter((product) => {
      if (!query) return true;

      const haystack = [
        product.code,
        product.name,
        product.category,
        product.subcategory,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    })
    .slice(0, 12);

  return (
    <div style={{ position: "relative", minWidth: 0 }}>
      <input
        style={inputStyle()}
        value={search}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onSearchChange(event.target.value);
          setOpen(true);
        }}
        placeholder={selectedProduct ? productOptionLabel(selectedProduct) : placeholder}
      />

      {selectedProduct ? (
        <div style={{ marginTop: 7, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={badgeStyle("dark")}>{selectedProduct.code}</span>
          <span style={{ color: "#40516a", fontSize: 13, fontWeight: 750 }}>
            {selectedProduct.name}
          </span>
          <button
            type="button"
            style={{ ...compactBtnStyle("outline"), height: 30, padding: "0 10px" }}
            onClick={() => {
              onChange("");
              onSearchChange("");
              setOpen(true);
            }}
          >
            Cambia
          </button>
        </div>
      ) : null}

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            right: 0,
            zIndex: 1200,
            background: "#fff",
            border: "1px solid #dbe2ea",
            borderRadius: 18,
            boxShadow: "0 18px 44px rgba(15,23,42,0.16)",
            overflow: "hidden",
            maxHeight: 330,
            overflowY: "auto",
          }}
        >
          {suggestions.length === 0 ? (
            <div style={{ padding: 14, color: "#66758b", fontWeight: 750 }}>
              Nessun prodotto trovato
            </div>
          ) : (
            suggestions.map((product) => (
              <button
                key={product.id}
                type="button"
                style={{
                  width: "100%",
                  display: "block",
                  textAlign: "left",
                  padding: "12px 14px",
                  border: 0,
                  borderBottom: "1px solid #eef2f7",
                  background: String(product.id) === String(value) ? "#f8fafc" : "#fff",
                  cursor: "pointer",
                }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(String(product.id));
                  onSearchChange(productOptionLabel(product));
                  setOpen(false);
                }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 950, color: "#07153a" }}>{product.code}</span>
                  <span style={{ color: "#40516a", fontWeight: 750 }}>{product.name}</span>
                </div>

                {(product.category || product.subcategory) ? (
                  <div style={{ marginTop: 5, color: "#7a8699", fontSize: 12, fontWeight: 750 }}>
                    {[product.category, product.subcategory].filter(Boolean).join(" › ")}
                  </div>
                ) : null}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Modal({ open, title, children, onClose, maxWidth = 720 }) {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 1000,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          ...cardStyle(),
          width: "100%",
          maxWidth,
          padding: 24,
          maxHeight: "90vh",
          overflow: "auto",
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 18 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

function applyStockMovementsToLots(lots, movements = []) {
  if (!Array.isArray(movements) || movements.length === 0) return lots;

  const flattenedMovements = movements.flatMap((movement) =>
    Array.isArray(movement?.movements) ? movement.movements : [movement]
  );

  return lots.map((lot) => {
    const movement = flattenedMovements.find((item) => {
      if (item.genericStock) {
        return String(item.productId) === String(lot.productId);
      }

      if (item.lotId) {
        return String(item.lotId) === String(lot.id);
      }

      const sameLot = String(item.lot) === String(lot.lot) || String(item.lot) === String(lot.id);
      const sameProduct = !item.productId || String(item.productId) === String(lot.productId);

      return sameLot && sameProduct;
    });

    if (!movement || movement.newQty === undefined || movement.newQty === null) {
      return lot;
    }

    return {
      ...lot,
      loadedQty: Number(movement.newQty),
    };
  });
}

export default function App() {
  const [page, setPage] = useState("ordini");
  const [orders, setOrders] = useState([]);
  const [lots, setLots] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedLineId, setSelectedLineId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productCategoryFilter, setProductCategoryFilter] = useState("");
  const [productSubcategoryFilter, setProductSubcategoryFilter] = useState("");
  const [openProductSections, setOpenProductSections] = useState({});
  const [orderSearch, setOrderSearch] = useState("");
  const [magazzinoSearch, setMagazzinoSearch] = useState("");
  const [assignments, setAssignments] = useState({});
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [savingPreparedOrderId, setSavingPreparedOrderId] = useState("");
  const [expandedPreparedOrders, setExpandedPreparedOrders] = useState({});

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedLotId, setSelectedLotId] = useState("");
  const [assignQty, setAssignQty] = useState("");

  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [addLineDialogOpen, setAddLineDialogOpen] = useState(false);
  const [editLineDialogOpen, setEditLineDialogOpen] = useState(false);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [lotDialogOpen, setLotDialogOpen] = useState(false);
  const [editLotDialogOpen, setEditLotDialogOpen] = useState(false);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [editProductDialogOpen, setEditProductDialogOpen] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPinInput, setAdminPinInput] = useState("");
  const [adminError, setAdminError] = useState("");

  const [newOrderCustomer, setNewOrderCustomer] = useState("");
  const [newOrderNotes, setNewOrderNotes] = useState("");
  const [newOrderLines, setNewOrderLines] = useState([{ productId: "", productSearch: "", customName: "", isOutsideStock: false, qtyOrdered: "", lotId: "" }]);

  const [editOrderDialogOpen, setEditOrderDialogOpen] = useState(false);
  const [editOrderCustomer, setEditOrderCustomer] = useState("");
  const [editOrderNotes, setEditOrderNotes] = useState("");
  const [savingEditedOrder, setSavingEditedOrder] = useState(false);
  const [colliDrafts, setColliDrafts] = useState({});
  const [savingColliOrderId, setSavingColliOrderId] = useState("");

  const [newLineProductId, setNewLineProductId] = useState("");
  const [newLineProductSearch, setNewLineProductSearch] = useState("");
  const [newLineIsOutsideStock, setNewLineIsOutsideStock] = useState(false);
  const [newLineCustomName, setNewLineCustomName] = useState("");
  const [newLineQty, setNewLineQty] = useState("");
  const [savingNewLine, setSavingNewLine] = useState(false);

  const [editingLineId, setEditingLineId] = useState("");
  const [editingLineQty, setEditingLineQty] = useState("");
  const [savingEditedLine, setSavingEditedLine] = useState(false);

  const [newProductCode, setNewProductCode] = useState("");
  const [newProductName, setNewProductName] = useState("");
  const [newProductUom, setNewProductUom] = useState("pz");
  const [newProductManagesLots, setNewProductManagesLots] = useState(true);
  const [savingNewProduct, setSavingNewProduct] = useState(false);

  const [newLotProductId, setNewLotProductId] = useState("");
  const [newLotProductSearch, setNewLotProductSearch] = useState("");
  const [newLotCode, setNewLotCode] = useState("");
  const [newLotExpiry, setNewLotExpiry] = useState("");
  const [newLotQty, setNewLotQty] = useState("");
  const [savingNewLot, setSavingNewLot] = useState(false);

  const [editingLotId, setEditingLotId] = useState("");
  const [editingLotCode, setEditingLotCode] = useState("");
  const [editingLotExpiry, setEditingLotExpiry] = useState("");
  const [editingLotQty, setEditingLotQty] = useState("");
  const [savingEditedLot, setSavingEditedLot] = useState(false);

  const [editingProductId, setEditingProductId] = useState(null);
  const [editProductCode, setEditProductCode] = useState("");
  const [editProductName, setEditProductName] = useState("");
  const [editProductUom, setEditProductUom] = useState("pz");
  const [editProductManagesLots, setEditProductManagesLots] = useState(true);
  const [savingProduct, setSavingProduct] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState("");
  const [inlineAssignmentForms, setInlineAssignmentForms] = useState({});
  const [savingAssignmentLineId, setSavingAssignmentLineId] = useState("");
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1280
  );

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const isIPadLayout = windowWidth <= 1100;
  const isSmallLayout = windowWidth <= 760;

  const responsiveTwoColumns = isIPadLayout ? "1fr" : "360px minmax(0, 1fr)";
  const responsiveOrderDetailColumns = isIPadLayout ? "1fr" : "1.1fr 0.9fr";
  const responsiveProductColumns = isIPadLayout ? "1fr" : "repeat(2, minmax(0, 1fr))";
  const responsiveOrderLineColumns = isSmallLayout ? "1fr" : "1fr 140px 110px";

  const loadDataFromSheets = async () => {
    setLoadingData(true);
    setLoadError("");

    try {
      await callSheetsApi({ action: "archivePreparedOrders" }).catch(() => null);

      const raw = await callSheetsApi();

      const normalizedProducts = normalizeProducts(raw.prodotti || []);
      const safeProducts = normalizedProducts;
      const normalizedLots = normalizeLots(raw.lotti || [], safeProducts);
      const safeLots = normalizedLots;
      const normalizedOrders = normalizeOrders(raw.ordini || []);
      const normalizedLines = normalizeOrderLines(raw.righeOrdine || [], safeProducts);
      const mergedOrders = buildOrdersWithLines(normalizedOrders, normalizedLines);
      const normalizedAssignments = normalizeAssignments(
        raw.assegnazioniLotti || [],
        normalizedLines,
        safeLots
      );

      setProducts(safeProducts);
      setLots(safeLots);
      setOrders(mergedOrders);
      setAssignments(normalizedAssignments);
      setSelectedOrderId(mergedOrders[0]?.id ?? "");
      setSelectedLineId(mergedOrders[0]?.lines?.[0]?.lineId ?? "");
    } catch (error) {
      setLoadError(
        "Non sono riuscito a leggere i dati dal Google Sheet. Per ora vedi una demo locale."
      );
      setProducts(fallbackProducts);
      setLots(fallbackLots);
      setOrders([]);
      setAssignments({});
      setSelectedOrderId("");
      setSelectedLineId("");
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    loadDataFromSheets();
  }, []);

  useEffect(() => {
    if (!selectedOrderId || orders.length === 0) return;

    const selected = orders.find((order) => String(order.id) === String(selectedOrderId));

    if (String(selected?.workStatus || "").trim().toLowerCase() === "nuovo") {
      persistOrderViewed(selectedOrderId);
    }
  }, [selectedOrderId, orders]);

  useEffect(() => {
    setProductSubcategoryFilter("");
  }, [productCategoryFilter]);

  const productMap = useMemo(() => {
    const map = {};

    products.forEach((product) => {
      map[String(product.id)] = product;
      if (product.code) map[String(product.code)] = product;
    });

    return map;
  }, [products]);

  const categoryOptions = useMemo(() => {
    return Array.from(new Set(products.map((product) => product.category).filter(Boolean))).sort();
  }, [products]);

  const subcategoryOptions = useMemo(() => {
    return Array.from(
      new Set(
        products
          .filter(
            (product) =>
              !productCategoryFilter || String(product.category) === String(productCategoryFilter)
          )
          .map((product) => product.subcategory)
          .filter(Boolean)
      )
    ).sort();
  }, [products, productCategoryFilter]);

  const lotAssignedMap = useMemo(() => {
    const openLineIds = new Set();

    orders.forEach((order) => {
      if (String(order.status || "").trim().toLowerCase() === "preparato") return;

      (order.lines || []).forEach((line) => {
        openLineIds.add(String(line.lineId));
      });
    });

    const assignedByLot = {};

    Object.entries(assignments).forEach(([lineId, lineAssignments]) => {
      if (!openLineIds.has(String(lineId))) return;

      (lineAssignments || []).forEach((assignment) => {
        assignedByLot[String(assignment.lotId)] =
          (assignedByLot[String(assignment.lotId)] || 0) + Number(assignment.qty || 0);
      });
    });

    return Object.fromEntries(
      lots.map((lot) => {
        const total = Number(lot.loadedQty || 0);
        const assigned = Number(assignedByLot[String(lot.id)] || 0);
        const assignable = Math.max(0, total - assigned);

        return [
          String(lot.id),
          {
            total,
            assigned,
            assignable,
          },
        ];
      })
    );
  }, [lots, assignments, orders]);

  const productCommittedMap = useMemo(() => {
    const committedByProduct = {};

    orders.forEach((order) => {
      if (String(order.status || "").trim().toLowerCase() === "preparato") return;

      (order.lines || []).forEach((line) => {
        const productKey = String(line.productId);
        committedByProduct[productKey] =
          (committedByProduct[productKey] || 0) + Number(line.qtyOrdered || 0);
      });
    });

    return committedByProduct;
  }, [orders]);

  const activeLots = useMemo(() => lots.filter((lot) => !lot.archived), [lots]);


  const productStatsMap = useMemo(() => {
    return Object.fromEntries(
      products.map((product) => {
        const productLots = activeLots.filter((lot) => String(lot.productId) === String(product.id));
        const total = productLots.reduce((sum, lot) => sum + Number(lot.loadedQty || 0), 0);
        const committed = Number(productCommittedMap[String(product.id)] || 0);
        const available = Math.max(0, total - committed);

        return [
          String(product.id),
          {
            total,
            committed,
            available,
          },
        ];
      })
    );
  }, [products, activeLots, productCommittedMap]);

  const lotsAvailableMap = useMemo(() => {
    return Object.fromEntries(
      lots.map((lot) => [String(lot.id), lotAssignedMap[String(lot.id)]?.assignable || 0])
    );
  }, [lots, lotAssignedMap]);

  // Vista "magazzino a prima vista": una riga per lotto attivo con la referenza
  // e accanto la quantita' disponibile secondo il lotto (come il modulo cartaceo).
  // Lotti esauriti (giacenza=0 E impegnato=0, ovvero "tutto evaso") esclusi:
  // sono lotti morti, non servono in vista. Restano visibili quelli con
  // giacenza > 0 anche se completamente impegnati (utile sapere che ci sono).
  const magazzinoRows = useMemo(() => {
    return lots
      .filter((lot) => !lot.archived)
      .map((lot) => {
        const product = products.find(
          (item) => String(item.id) === String(lot.productId)
        );
        const info = lotAssignedMap[String(lot.id)] || {};
        return {
          lotId: String(lot.id),
          lotCode: String(lot.lot || ""),
          productId: String(lot.productId || ""),
          productName: product?.name || "(prodotto sconosciuto)",
          productCode: product?.code || "",
          category: product?.category || "",
          expiry: lot.expiry ? String(lot.expiry).slice(0, 10) : "",
          loaded: Number(info.total ?? lot.loadedQty ?? 0),
          committed: Number(info.assigned ?? 0),
          available: Number(info.assignable ?? 0),
        };
      })
      .filter((row) => row.loaded > 0 || row.committed > 0)
      .sort((a, b) => {
        const byName = a.productName.localeCompare(b.productName);
        if (byName !== 0) return byName;
        return String(a.expiry).localeCompare(String(b.expiry));
      });
  }, [lots, products, lotAssignedMap]);

  const filteredMagazzinoRows = useMemo(() => {
    const q = magazzinoSearch.trim().toLowerCase();
    if (!q) return magazzinoRows;
    return magazzinoRows.filter(
      (row) =>
        row.productName.toLowerCase().includes(q) ||
        row.productCode.toLowerCase().includes(q) ||
        row.lotCode.toLowerCase().includes(q) ||
        row.category.toLowerCase().includes(q)
    );
  }, [magazzinoRows, magazzinoSearch]);

  // Raggruppa per prodotto: 1 header con totali + righe lotto sotto.
  // I lotti orfani (productId che non aggancia nessun prodotto in catalogo)
  // restano in un gruppo a se' col loro productName originale.
  const magazzinoGrouped = useMemo(() => {
    const groups = new Map();
    for (const row of filteredMagazzinoRows) {
      const key = row.productId || row.productCode || row.productName;
      if (!groups.has(key)) {
        groups.set(key, {
          productId: row.productId,
          productName: row.productName,
          productCode: row.productCode,
          category: row.category,
          lots: [],
          totalLoaded: 0,
          totalCommitted: 0,
          totalAvailable: 0,
        });
      }
      const g = groups.get(key);
      g.lots.push(row);
      g.totalLoaded += Number(row.loaded || 0);
      g.totalCommitted += Number(row.committed || 0);
      g.totalAvailable += Number(row.available || 0);
    }
    return [...groups.values()].sort((a, b) => a.productName.localeCompare(b.productName));
  }, [filteredMagazzinoRows]);

  const ordersWithComputed = useMemo(() => {
    return orders.map((order) => {
      const lines = (order.lines || []).map((line) => {
        const product = products.find((item) => String(item.id) === String(line.productId));
        const outsideStock = isOutsideStockLine(line);
        const requiresLots = outsideStock ? false : productManagesLots(product);

        const assignedFromAssignments = (assignments[line.lineId] || []).reduce(
          (sum, assignment) => sum + assignment.qty,
          0
        );

        const assignedQty = assignedFromAssignments;

        const qtyToAssign = Math.max(0, line.qtyOrdered - assignedQty);

        return { ...line, assignedQty, qtyToAssign, requiresLots, isOutsideStock: outsideStock };
      });

      const totalToAssign = lines.reduce((sum, line) => sum + line.qtyToAssign, 0);
      const totalOrdered = lines.reduce((sum, line) => sum + line.qtyOrdered, 0);

      // Colli: suggerito = somma delle quantità di tutte le righe. Se l'utente ha
      // inserito un valore manuale (colliManual) quello prevale.
      const colliSuggested = lines.reduce(
        (sum, line) => sum + Number(line.qtyOrdered || 0),
        0
      );
      const colli =
        order.colliManual !== null && order.colliManual !== undefined
          ? Number(order.colliManual)
          : colliSuggested;

      const explicitStatus = String(order.status || "").trim();
      const explicitStatusLower = explicitStatus.toLowerCase();
      const computedStatus =
        explicitStatusLower === "fermo"
          ? "Fermo"
          : explicitStatusLower === "preparato"
            ? "Preparato"
            : totalToAssign === 0
              ? "Pronto"
              : totalToAssign < totalOrdered
                ? "Parziale"
                : "Da preparare";

      return {
        ...order,
        lines,
        totalToAssign,
        computedStatus,
        colliSuggested,
        colli,
        colliIsManual: order.colliManual !== null && order.colliManual !== undefined,
      };
    });
  }, [orders, assignments, products]);

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    const visibleOrders = ordersWithComputed
      .filter((order) => !order.archived)
      .filter((order) => String(order.computedStatus) !== "Fermo")
      .filter((order) => String(order.computedStatus) !== "Preparato")
      .sort((a, b) => {
        const rankOrder = (order) => {
          const work = String(order.workStatus || "").trim().toLowerCase();
          if (work === "nuovo") return 0;
          if (order.totalToAssign > 0) return 1;
          return 2;
        };

        const rankDiff = rankOrder(a) - rankOrder(b);
        if (rankDiff !== 0) return rankDiff;

        const aOpen = a.totalToAssign > 0 ? 0 : 1;
        const bOpen = b.totalToAssign > 0 ? 0 : 1;
        if (aOpen !== bOpen) return aOpen - bOpen;

        return String(b.date || "").localeCompare(String(a.date || ""));
      });

    if (!q) return visibleOrders;

    return visibleOrders.filter(
      (order) =>
        String(order.id).toLowerCase().includes(q) ||
        String(order.customer).toLowerCase().includes(q) ||
        String(order.computedStatus).toLowerCase().includes(q)
    );
  }, [ordersWithComputed, orderSearch]);

  const activeOrders = useMemo(
    () =>
      ordersWithComputed.filter(
        (order) =>
          !order.archived &&
          String(order.computedStatus) !== "Fermo" &&
          String(order.computedStatus) !== "Preparato"
      ),
    [ordersWithComputed]
  );

  const stoppedOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();

    const ordersToShow = ordersWithComputed
      .filter((order) => !order.archived && String(order.computedStatus) === "Fermo")
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

    if (!q) return ordersToShow;

    return ordersToShow.filter(
      (order) =>
        String(order.id).toLowerCase().includes(q) ||
        String(order.customer).toLowerCase().includes(q) ||
        String(order.notes).toLowerCase().includes(q)
    );
  }, [ordersWithComputed, orderSearch]);

  const preparedOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();

    const ordersToShow = ordersWithComputed
      .filter((order) => !order.archived && String(order.computedStatus) === "Preparato")
      .sort((a, b) => String(b.dataPrepared || b.date || "").localeCompare(String(a.dataPrepared || a.date || "")));

    if (!q) return ordersToShow;

    return ordersToShow.filter(
      (order) =>
        String(order.id).toLowerCase().includes(q) ||
        String(order.customer).toLowerCase().includes(q) ||
        String(order.notes).toLowerCase().includes(q)
    );
  }, [ordersWithComputed, orderSearch]);

  const selectedOrder =
    activeOrders.find((order) => String(order.id) === String(selectedOrderId)) ||
    activeOrders[0];

  const selectedLine =
    selectedOrder?.lines.find((line) => String(line.lineId) === String(selectedLineId)) ||
    selectedOrder?.lines[0];

  const selectedLotProduct = products.find(
    (product) => String(product.id) === String(newLotProductId)
  );

  const selectedOrderLines = useMemo(() => {
    if (!selectedOrder?.lines) return [];

    return [...selectedOrder.lines].sort((a, b) => {
      const aDone = a.qtyToAssign <= 0 ? 1 : 0;
      const bDone = b.qtyToAssign <= 0 ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;

      const aOrder = Number(a.rowOrder || 0);
      const bOrder = Number(b.rowOrder || 0);
      if (aOrder !== bOrder) return aOrder - bOrder;

      return String(a.lineId).localeCompare(String(b.lineId));
    });
  }, [selectedOrder]);

  const selectedOrderCompletedLines = selectedOrderLines.filter(
    (line) => line.qtyToAssign <= 0
  ).length;

  const availableLotsForSelectedLine = useMemo(() => {
    if (!selectedLine) return [];

    // Mostriamo tutti i lotti con giacenza fisica (total > 0), anche se la
    // disponibilita' e' a 0 perche' impegnata in altri ordini non ancora evasi.
    // L'operatore decide se assegnare comunque (la merce potrebbe essere presente).
    return activeLots
      .filter(
        (lot) =>
          String(lot.productId) === String(selectedLine.productId) &&
          (lotAssignedMap[String(lot.id)]?.total || 0) > 0
      )
      .sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
  }, [selectedLine, lots, lotAssignedMap]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();

    return products
      .map((product) => {
        const productLots = activeLots.filter((lot) => String(lot.productId) === String(product.id));
        const productStats = productStatsMap[String(product.id)] || {
          total: 0,
          committed: 0,
          available: 0,
        };

        return {
          ...product,
          productLots,
          totalLoaded: productStats.total,
          totalCommitted: productStats.committed,
          totalAvailable: productStats.available,
        };
      })
      .filter((product) => {
        const matchesSearch =
          !q ||
          String(product.code).toLowerCase().includes(q) ||
          String(product.name).toLowerCase().includes(q) ||
          String(product.category).toLowerCase().includes(q) ||
          String(product.subcategory).toLowerCase().includes(q);

        const matchesCategory =
          !productCategoryFilter || String(product.category) === String(productCategoryFilter);

        const matchesSubcategory =
          !productSubcategoryFilter ||
          String(product.subcategory) === String(productSubcategoryFilter);

        return matchesSearch && matchesCategory && matchesSubcategory;
      });
  }, [
    products,
    activeLots,
    lotsAvailableMap,
    productStatsMap,
    productSearch,
    productCategoryFilter,
    productSubcategoryFilter,
  ]);

  const groupedProducts = useMemo(() => {
    const groups = {};

    filteredProducts.forEach((product) => {
      const category = product.category || "Senza categoria";

      if (!groups[category]) {
        groups[category] = {
          category,
          products: [],
          totalLoaded: 0,
          totalCommitted: 0,
          totalAvailable: 0,
          totalLots: 0,
          subcategories: {},
        };
      }

      groups[category].products.push(product);
      groups[category].totalLoaded += Number(product.totalLoaded || 0);
      groups[category].totalCommitted += Number(product.totalCommitted || 0);
      groups[category].totalAvailable += Number(product.totalAvailable || 0);
      groups[category].totalLots += (product.productLots || []).length;

      const subcategory = product.subcategory || "Senza sottocategoria";

      if (!groups[category].subcategories[subcategory]) {
        groups[category].subcategories[subcategory] = [];
      }

      groups[category].subcategories[subcategory].push(product);
    });

    return Object.values(groups).sort((a, b) => a.category.localeCompare(b.category));
  }, [filteredProducts]);

  const toggleProductSection = (category) => {
    setOpenProductSections((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const openAssignDialog = (lineId) => {
    setSelectedLineId(lineId);
    setSelectedLotId("");
    setAssignQty("");
    setAssignDialogOpen(true);
  };

  const handleLotSelect = (lotId) => {
    setSelectedLotId(lotId);

    if (!selectedLine) return;

    const available = lotsAvailableMap[String(lotId)] || 0;
    const suggestedQty = Math.min(selectedLine.qtyToAssign, available);

    setAssignQty(String(suggestedQty));
  };

  const getInlineAssignmentForm = (lineId) => {
    return inlineAssignmentForms[String(lineId)] || { lotId: "", qty: "" };
  };

  const updateInlineAssignmentForm = (lineId, field, value) => {
    setInlineAssignmentForms((prev) => ({
      ...prev,
      [String(lineId)]: {
        ...(prev[String(lineId)] || { lotId: "", qty: "" }),
        [field]: value,
      },
    }));
  };

  const getAvailableLotsForLine = (line) => {
    if (!line) return [];

    // Stesso criterio della vista dettaglio: lotti con giacenza fisica > 0,
    // anche se la disponibilita' calcolata e' 0 (impegnata altrove).
    return activeLots
      .filter(
        (lot) =>
          String(lot.productId) === String(line.productId) &&
          (lotAssignedMap[String(lot.id)]?.total || 0) > 0
      )
      .sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
  };

  const handleInlineLotSelect = (line, lotId) => {
    if (!line) return;

    const available = lotsAvailableMap[String(lotId)] || 0;
    const suggestedQty = Math.min(line.qtyToAssign, available);

    setInlineAssignmentForms((prev) => ({
      ...prev,
      [String(line.lineId)]: {
        lotId: String(lotId || ""),
        qty: lotId ? String(suggestedQty) : "",
      },
    }));
  };

  const confirmInlineAssignment = async (line) => {
    if (!line) return;

    const form = getInlineAssignmentForm(line.lineId);
    const requiresLots = line.requiresLots !== false;

    if (requiresLots && !form.lotId) {
      alert("Seleziona lotto");
      return;
    }

    if (!form.qty) {
      alert("Inserisci la quantità");
      return;
    }

    const qty = Number(form.qty);

    if (!qty || qty <= 0) {
      alert("Inserisci una quantità valida");
      return;
    }

    let selectedLot = null;
    let lotId = "";
    let lotCode = "";

    if (requiresLots) {
      selectedLot = lots.find((lot) => String(lot.id) === String(form.lotId));

      if (!selectedLot) {
        alert("Lotto non trovato");
        return;
      }

      const lotInfo = lotAssignedMap[String(form.lotId)] || {};
      const available = Number(lotInfo.assignable ?? (lotsAvailableMap[String(form.lotId)] || 0));

      if (qty > available) {
        const giacenza = Number(lotInfo.total || 0);
        const impegnato = Number(lotInfo.assigned || 0);
        const ok = window.confirm(
          "Disponibili solo " + available + " pz di questo lotto (giacenza " + giacenza +
            ", gia' impegnati " + impegnato + " in altri ordini non ancora evasi).\n\n" +
            "La disponibilita' a 0 non vuol dire giacenza a 0: se la merce e' fisicamente presente " +
            "puoi assegnarne comunque " + qty + ". Gli altri ordini impegnati potrebbero non uscire prima di questo.\n\n" +
            "Assegnare comunque " + qty + " pz?"
        );
        if (!ok) return;
      }

      lotId = String(form.lotId);
      lotCode = selectedLot.lot;
    } else {
      if (isOutsideStockLine(line)) {
        lotId = "FUORI_MAGAZZINO";
        lotCode = "FUORI_MAGAZZINO";
      } else {
        const genericLots = activeLots
          .filter(
            (lot) =>
              String(lot.productId) === String(line.productId) &&
              String(lot.lot || "").trim().toLowerCase() === "disponibilita"
          )
          .sort((a, b) => Number(lotsAvailableMap[String(b.id)] || 0) - Number(lotsAvailableMap[String(a.id)] || 0));

        const genericLot = genericLots.find(
          (lot) => Number(lotsAvailableMap[String(lot.id)] || 0) >= qty
        );

        const totalGenericAvailable = genericLots.reduce(
          (sum, lot) => sum + Number(lotsAvailableMap[String(lot.id)] || 0),
          0
        );

        if (!genericLot) {
          alert(
            totalGenericAvailable > 0
              ? "Disponibilità generica insufficiente per questo prodotto. Disponibile: " + totalGenericAvailable
              : "Disponibilità generica non caricata per questo prodotto. Caricala prima dal magazzino."
          );
          return;
        }

        lotId = String(genericLot.id);
        lotCode = "DISPONIBILITA";
      }
    }

    if (qty > line.qtyToAssign) {
      alert("La quantità supera il residuo da assegnare");
      return;
    }

    const newAssignment = {
      assignmentId: `ASS-${Date.now()}`,
      lineId: String(line.lineId),
      lotId,
      lotCode,
      productId: String(line.productId),
      qty,
    };

    // Aggiornamento immediato dell'interfaccia: l'operatore non aspetta Google Sheet.
    setAssignments((prev) => ({
      ...prev,
      [line.lineId]: [
        ...(prev[line.lineId] || []),
        { assignmentId: newAssignment.assignmentId, lotId, productId: String(line.productId), qty },
      ],
    }));

    setInlineAssignmentForms((prev) => ({
      ...prev,
      [String(line.lineId)]: { lotId: "", qty: "" },
    }));

    setSelectedLineId(line.lineId);
    setSavingAssignmentLineId(String(line.lineId));

    try {
      const result = await callSheetsApi({
        action: "assignLot",
        payload: JSON.stringify(newAssignment),
      });

      if (!result || !result.success) {
        setAssignments((prev) => ({
          ...prev,
          [line.lineId]: (prev[line.lineId] || []).filter(
            (assignment) =>
              String(assignment.assignmentId) !== String(newAssignment.assignmentId)
          ),
        }));

        setInlineAssignmentForms((prev) => ({
          ...prev,
          [String(line.lineId)]: form,
        }));

        alert(
          "Errore nel salvataggio assegnazione sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
      }
    } catch (error) {
      setAssignments((prev) => ({
        ...prev,
        [line.lineId]: (prev[line.lineId] || []).filter(
          (assignment) =>
            String(assignment.assignmentId) !== String(newAssignment.assignmentId)
        ),
      }));

      setInlineAssignmentForms((prev) => ({
        ...prev,
        [String(line.lineId)]: form,
      }));

      alert("Errore di collegamento con Google Sheet: " + String(error));
    } finally {
      setSavingAssignmentLineId("");
    }
  };


  const confirmAssignment = async () => {
    if (!selectedLine || !selectedLotId || !assignQty) return;

    const qty = Number(assignQty);

    if (!qty || qty <= 0) {
      alert("Inserisci una quantità valida");
      return;
    }

    const selectedLot = lots.find((lot) => String(lot.id) === String(selectedLotId));

    if (!selectedLot) {
      alert("Lotto non trovato");
      return;
    }

    const lotInfo = lotAssignedMap[String(selectedLotId)] || {};
    const available = Number(lotInfo.assignable ?? (lotsAvailableMap[String(selectedLotId)] || 0));

    if (qty > available) {
      const giacenza = Number(lotInfo.total || 0);
      const impegnato = Number(lotInfo.assigned || 0);
      const ok = window.confirm(
        "Disponibili solo " + available + " pz di questo lotto (giacenza " + giacenza +
          ", gia' impegnati " + impegnato + " in altri ordini non ancora evasi).\n\n" +
          "La disponibilita' a 0 non vuol dire giacenza a 0: se la merce e' fisicamente presente " +
          "puoi assegnarne comunque " + qty + ". Gli altri ordini impegnati potrebbero non uscire prima di questo.\n\n" +
          "Assegnare comunque " + qty + " pz?"
      );
      if (!ok) return;
    }

    if (qty > selectedLine.qtyToAssign) {
      alert("La quantità supera il residuo da assegnare");
      return;
    }

    const newAssignment = {
      assignmentId: `ASS-${Date.now()}`,
      lineId: String(selectedLine.lineId),
      lotId: String(selectedLotId),
      lotCode: selectedLot.lot,
      productId: String(selectedLine.productId),
      qty,
    };

    const previousLotId = selectedLotId;
    const previousQty = assignQty;

    setAssignments((prev) => ({
      ...prev,
      [selectedLine.lineId]: [
        ...(prev[selectedLine.lineId] || []),
        { assignmentId: newAssignment.assignmentId, lotId: String(selectedLotId), productId: String(selectedLine.productId), qty },
      ],
    }));

    setAssignDialogOpen(false);
    setSelectedLotId("");
    setAssignQty("");

    try {
      const result = await callSheetsApi({
        action: "assignLot",
        payload: JSON.stringify(newAssignment),
      });

      if (!result || !result.success) {
        setAssignments((prev) => ({
          ...prev,
          [selectedLine.lineId]: (prev[selectedLine.lineId] || []).filter(
            (assignment) =>
              String(assignment.assignmentId) !== String(newAssignment.assignmentId)
          ),
        }));

        setSelectedLotId(previousLotId);
        setAssignQty(previousQty);

        alert(
          "Errore nel salvataggio assegnazione sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
      }
    } catch (error) {
      setAssignments((prev) => ({
        ...prev,
        [selectedLine.lineId]: (prev[selectedLine.lineId] || []).filter(
          (assignment) =>
            String(assignment.assignmentId) !== String(newAssignment.assignmentId)
        ),
      }));

      setSelectedLotId(previousLotId);
      setAssignQty(previousQty);

      alert("Errore di collegamento con Google Sheet: " + String(error));
    }
  };

  const archivedGroups = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();

    const archivedOrders = ordersWithComputed
      .filter((order) => order.archived)
      .filter((order) => {
        if (!q) return true;

        return (
          String(order.id).toLowerCase().includes(q) ||
          String(order.customer).toLowerCase().includes(q) ||
          String(order.notes).toLowerCase().includes(q)
        );
      })
      .sort((a, b) => String(b.dataPrepared || b.date || "").localeCompare(String(a.dataPrepared || a.date || "")));

    const groups = {};

    archivedOrders.forEach((order) => {
      const key = fmtDate(order.dataPrepared || order.date || "Senza data");

      if (!groups[key]) {
        groups[key] = [];
      }

      groups[key].push(order);
    });

    return groups;
  }, [ordersWithComputed, orderSearch]);

  const unarchiveOrder = async (orderId) => {
    if (!orderId) return;

    const conferma = window.confirm("Vuoi disarchiviare questo ordine?");
    if (!conferma) return;

    const previousOrders = orders;

    setOrders((prev) =>
      prev.map((order) =>
        String(order.id) === String(orderId) ? { ...order, archived: false } : order
      )
    );

    try {
      const result = await callSheetsApi({
        action: "unarchiveOrder",
        orderId,
      });

      if (!result || !result.success) {
        setOrders(previousOrders);
        alert(
          "Errore nel disarchiviare l'ordine: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setPage("ordini");
      setSelectedOrderId(orderId);
    } catch (error) {
      setOrders(previousOrders);
      alert("Errore di collegamento con Google Sheet: " + String(error));
    }
  };

  const openEditOrderDialog = () => {
    if (!selectedOrder) return;

    setEditOrderCustomer(selectedOrder.customer || "");
    setEditOrderNotes(selectedOrder.notes || "");
    setEditOrderDialogOpen(true);
  };

  const saveEditedOrder = async () => {
    if (!selectedOrder) return;

    if (!editOrderCustomer.trim()) {
      alert("Inserisci il nome ordine/cliente");
      return;
    }

    setSavingEditedOrder(true);

    const previousOrder = selectedOrder;

    setOrders((prev) =>
      prev.map((order) =>
        String(order.id) === String(selectedOrder.id)
          ? {
              ...order,
              customer: editOrderCustomer.trim(),
              notes: editOrderNotes.trim(),
            }
          : order
      )
    );

    try {
      const result = await callSheetsApi({
        action: "updateOrder",
        payload: JSON.stringify({
          orderId: selectedOrder.id,
          customer: editOrderCustomer.trim(),
          notes: editOrderNotes.trim(),
        }),
      });

      if (!result || !result.success) {
        setOrders((prev) =>
          prev.map((order) =>
            String(order.id) === String(previousOrder.id)
              ? {
                  ...order,
                  customer: previousOrder.customer,
                  notes: previousOrder.notes,
                }
              : order
          )
        );

        alert(
          "Errore nel salvataggio ordine sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setEditOrderDialogOpen(false);
    } catch (error) {
      setOrders((prev) =>
        prev.map((order) =>
          String(order.id) === String(previousOrder.id)
            ? {
                ...order,
                customer: previousOrder.customer,
                notes: previousOrder.notes,
              }
            : order
        )
      );

      alert("Errore di collegamento con Google Sheet: " + String(error));
    } finally {
      setSavingEditedOrder(false);
    }
  };

  const saveOrderColli = async (orderId, rawValue) => {
    if (!orderId) return;

    const trimmed = String(rawValue ?? "").trim();
    // Vuoto = ripristina il valore suggerito (cancella il manuale).
    let colliManual = null;
    let payloadColli = "";

    if (trimmed !== "") {
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n < 0) {
        alert("Inserisci un numero di colli valido.");
        return;
      }
      colliManual = Math.round(n);
      payloadColli = colliManual;
    }

    const previousOrders = orders;
    setSavingColliOrderId(orderId);

    setOrders((prev) =>
      prev.map((order) =>
        String(order.id) === String(orderId) ? { ...order, colliManual } : order
      )
    );

    try {
      const result = await callSheetsApi({
        action: "updateOrder",
        payload: JSON.stringify({ orderId, colli: payloadColli }),
      });

      if (!result || !result.success) {
        setOrders(previousOrders);
        alert(
          "Errore nel salvataggio colli sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      // Allinea il draft al valore salvato.
      setColliDrafts((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    } catch (error) {
      setOrders(previousOrders);
      alert("Errore di collegamento con Google Sheet: " + String(error));
    } finally {
      setSavingColliOrderId("");
    }
  };

  const persistOrderViewed = async (orderId) => {
    if (!orderId) return;

    // Aggiorna subito lo stato locale: l'ordine non e' piu' "nuovo".
    setOrders((prev) =>
      prev.map((order) =>
        String(order.id) === String(orderId)
          ? { ...order, workStatus: "In lavorazione" }
          : order
      )
    );

    // Salva sul foglio. Se fallisce non deve mai far crollare la pagina.
    try {
      await callSheetsApi({
        action: "markOrderViewed",
        orderId,
      });
    } catch (error) {
      console.warn("Errore markOrderViewed", orderId, error);
    }
  };

  const openOrderFromList = async (order) => {
    if (!order) return;

    setSelectedOrderId(order.id);
    setSelectedLineId(order.lines?.[0]?.lineId || "");

    if (String(order.workStatus || "").trim().toLowerCase() === "nuovo") {
      persistOrderViewed(order.id);
    }
  };

  const markVisibleOrdersAsViewed = async () => {
    const visibleNewOrders = filteredOrders.filter(
      (order) => String(order.workStatus || "").trim().toLowerCase() === "nuovo"
    );

    if (visibleNewOrders.length === 0) {
      alert("Non ci sono ordini nuovi da segnare come letti.");
      return;
    }

    const conferma = window.confirm(
      `Vuoi segnare come letti ${visibleNewOrders.length} ordini visibili?`
    );

    if (!conferma) return;

    setOrders((prev) =>
      prev.map((order) =>
        visibleNewOrders.some((visible) => String(visible.id) === String(order.id))
          ? { ...order, workStatus: "In lavorazione" }
          : order
      )
    );

    for (const order of visibleNewOrders) {
      try {
        await callSheetsApi({
          action: "markOrderViewed",
          orderId: order.id,
        });
      } catch (error) {
        console.warn("Errore markOrderViewed bulk", order.id, error);
      }
    }
  };

  const archiveAllPreparedOrders = async () => {
    const conferma = window.confirm(
      "Vuoi archiviare tutti gli ordini preparati non ancora archiviati?"
    );

    if (!conferma) return;

    try {
      const result = await callSheetsApi({
        action: "archiveAllPreparedOrders",
      });

      if (!result || !result.success) {
        alert(
          "Errore nell'archiviazione ordini preparati: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setOrders((prev) =>
        prev.map((order) =>
          String(order.status || "").trim().toLowerCase() === "preparato"
            ? { ...order, archived: true }
            : order
        )
      );

      setPage("archivio");
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    }
  };

  const archivePreparedOrder = async (orderId) => {
    if (!orderId) return;

    const conferma = window.confirm("Vuoi archiviare questo ordine preparato?");
    if (!conferma) return;

    try {
      const result = await callSheetsApi({
        action: "archiveOrder",
        orderId,
      });

      if (!result || !result.success) {
        alert(
          "Errore nell'archiviazione ordine: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setOrders((prev) =>
        prev.map((order) =>
          String(order.id) === String(orderId) ? { ...order, archived: true } : order
        )
      );
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    }
  };

  const togglePreparedDetails = (orderId) => {
    setExpandedPreparedOrders((prev) => ({
      ...prev,
      [String(orderId)]: !prev[String(orderId)],
    }));
  };

  const markOrderStopped = async () => {
    if (!selectedOrder) return;

    if (String(selectedOrder.status || "").trim().toLowerCase() === "preparato") {
      alert("Non puoi mettere in fermo un ordine già preparato.");
      return;
    }

    const conferma = window.confirm("Vuoi spostare questo ordine in Ordini fermi?");
    if (!conferma) return;

    try {
      const result = await callSheetsApi({
        action: "markOrderStopped",
        orderId: selectedOrder.id,
      });

      if (!result || !result.success) {
        alert(
          "Errore nello spostamento in Ordini fermi: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setOrders((prev) =>
        prev.map((order) =>
          String(order.id) === String(selectedOrder.id)
            ? { ...order, status: "Fermo", dataPrepared: "", archived: false }
            : order
        )
      );

      const nextOrder = activeOrders.find((order) => String(order.id) !== String(selectedOrder.id));

      setSelectedOrderId(nextOrder?.id || "");
      setSelectedLineId(nextOrder?.lines?.[0]?.lineId || "");
      setPage("fermi");
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    }
  };

  const restoreStoppedOrder = async (orderId) => {
    if (!orderId) return;

    try {
      const result = await callSheetsApi({
        action: "reopenOrder",
        orderId,
      });

      if (!result || !result.success) {
        alert(
          "Errore nel riportare l'ordine da preparare: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setOrders((prev) =>
        prev.map((order) =>
          String(order.id) === String(orderId)
            ? { ...order, status: "Da preparare", workStatus: "In lavorazione", dataPrepared: "", archived: false }
            : order
        )
      );

      setSelectedOrderId(orderId);
      setPage("ordini");
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    }
  };

  const reopenPreparedOrderForEditing = async (orderId) => {
    if (!orderId) return;

    const conferma = window.confirm(
      "Vuoi modificare questo ordine preparato? Verrà riportato in Da preparare e le quantità già scaricate verranno ripristinate."
    );

    if (!conferma) return;

    try {
      const result = await callSheetsApi({
        action: "reopenOrder",
        orderId,
      });

      if (!result || !result.success) {
        alert(
          "Errore nel riaprire l'ordine preparato: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setOrders((prev) =>
        prev.map((order) =>
          String(order.id) === String(orderId)
            ? {
                ...order,
                status: "Da preparare",
                dataPrepared: "",
                archived: false,
              }
            : order
        )
      );

      if (result.stockMovements && result.stockMovements.length) {
        setLots((prev) => applyStockMovementsToLots(prev, result.stockMovements || []));
      }

      setSelectedOrderId(orderId);
      setPage("ordini");
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    }
  };

  const markOrderPrepared = async () => {
    if (!selectedOrder) return;

    if (selectedOrder.totalToAssign > 0) {
      alert("Prima assegna tutti i lotti dell'ordine.");
      return;
    }

    setSavingPreparedOrderId(String(selectedOrder.id));

    try {
      const result = await callSheetsApi({
        action: "markOrderPrepared",
        orderId: selectedOrder.id,
      });

      if (!result || !result.success) {
        alert(
          "Errore nel salvataggio stato ordine sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setOrders((prev) =>
        prev.map((order) =>
          String(order.id) === String(selectedOrder.id)
            ? {
                ...order,
                status: "Preparato",
                dataPrepared: new Date().toISOString(),
                archived: false,
              }
            : order
        )
      );

      setLots((prev) => applyStockMovementsToLots(prev, result.stockMovements || []));

      // L'ordine viene evaso anche se per qualche lotto la giacenza fisica era
      // inferiore (es. merce gia' uscita ma non scaricata). Avvisiamo l'operatore
      // di quali lotti sono andati sotto zero cosi' puo' sistemare la giacenza.
      const warnings = Array.isArray(result.stockWarnings) ? result.stockWarnings : [];
      if (warnings.length > 0) {
        const righe = warnings
          .map((w) => {
            const prod = products.find((p) => String(p.id) === String(w.productId));
            const nome = prod ? prod.name : String(w.productId);
            const lotto = w.lot ? " (lotto " + w.lot + ")" : "";
            return "- " + nome + lotto + ": mancavano " + w.shortfall + " pz";
          })
          .join("\n");
        alert(
          "Ordine evaso. Attenzione: alcuni lotti non avevano giacenza sufficiente e sono stati " +
            "portati a 0 (scarico forzato):\n\n" + righe + "\n\n" +
            "Controlla la giacenza di questi lotti dalla pagina Magazzino e correggila se necessario."
        );
      }
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    } finally {
      setSavingPreparedOrderId("");
    }
  };

  const addEmptyOrderLine = () => {
    setNewOrderLines((prev) => [...prev, { productId: "", productSearch: "", customName: "", isOutsideStock: false, qtyOrdered: "", lotId: "" }]);
  };

  const updateNewOrderLine = (index, field, value) => {
    setNewOrderLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, [field]: value } : line))
    );
  };

  const removeNewOrderLine = (index) => {
    setNewOrderLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const createOrder = async () => {
    if (!newOrderCustomer.trim()) {
      alert("Inserisci il nome ordine/cliente");
      return;
    }

    const validLines = newOrderLines
      .filter((line) => {
        const hasQty = Number(line.qtyOrdered) > 0;
        const hasProduct = line.isOutsideStock
          ? String(line.customName || "").trim()
          : line.productId;

        return hasQty && hasProduct;
      })
      .map((line, index) => {
        if (line.isOutsideStock) {
          return {
            lineId: `RIGA-${Date.now()}-${index}`,
            productId: `${OUTSIDE_STOCK_PRODUCT_ID}-${Date.now()}-${index}`,
            productCode: OUTSIDE_STOCK_PRODUCT_ID,
            productName: String(line.customName || "").trim(),
            isOutsideStock: true,
            rowOrder: index + 1,
            qtyOrdered: Number(line.qtyOrdered),
          };
        }

        const product = products.find((p) => String(p.id) === String(line.productId));

        return {
          lineId: `RIGA-${Date.now()}-${index}`,
          productId: String(line.productId),
          productCode: product?.code || "",
          productName: product?.name || "",
          isOutsideStock: false,
          rowOrder: index + 1,
          qtyOrdered: Number(line.qtyOrdered),
          preassignedLotId: line.lotId ? String(line.lotId) : "",
        };
      });

    if (validLines.length === 0) {
      alert("Inserisci almeno una riga valida con articolo e quantità");
      return;
    }

    const newOrder = {
      id: `ORD-${Date.now()}`,
      customer: newOrderCustomer.trim(),
      notes: newOrderNotes.trim(),
      status: "Da preparare",
      workStatus: "Nuovo",
      date: new Date().toISOString().slice(0, 10),
      lines: validLines,
    };

    try {
      const result = await callSheetsApi({
        action: "createOrder",
        payload: JSON.stringify({
          id: newOrder.id,
          customer: newOrder.customer,
          notes: newOrder.notes,
          status: newOrder.status,
          workStatus: newOrder.workStatus,
          date: newOrder.date,
          lines: newOrder.lines,
        }),
      });

      if (!result || !result.success) {
        alert(
          "Errore nel salvataggio ordine sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setOrders((prev) => [newOrder, ...prev]);
      setSelectedOrderId(newOrder.id);
      setSelectedLineId(newOrder.lines[0]?.lineId || "");
      setNewOrderCustomer("");
      setNewOrderNotes("");
      setNewOrderLines([{ productId: "", productSearch: "", customName: "", isOutsideStock: false, qtyOrdered: "", lotId: "" }]);
      setOrderDialogOpen(false);
      setPage("ordini");

      // Auto-assegnazione lotti pre-selezionati al volo. Se la disp del lotto
      // non basta, assegno il minimo possibile e lascio il resto da assegnare
      // manualmente; segnalo a fine ciclo con un alert riepilogativo.
      const preassignedTasks = validLines.filter((l) => l.preassignedLotId && Number(l.qtyOrdered) > 0);
      if (preassignedTasks.length > 0) {
        const errorsRecap = [];
        for (const task of preassignedTasks) {
          try {
            const r = await callSheetsApi({
              action: "assignLot",
              payload: JSON.stringify({
                lineId: task.lineId,
                lotId: task.preassignedLotId,
                qty: task.qtyOrdered,
                operatore: "creazione ordine",
              }),
            });
            if (!r?.success) {
              errorsRecap.push(`- ${task.productName}: ${r?.error || "assegnazione fallita"}`);
            }
          } catch (err) {
            errorsRecap.push(`- ${task.productName}: ${String(err)}`);
          }
        }
        // Refresh dati: il piu' affidabile dopo assegnazioni multiple e' ricaricare.
        await loadDataFromSheets();
        if (errorsRecap.length > 0) {
          alert(
            "Ordine creato. Alcuni lotti non sono stati assegnati automaticamente:\n\n" +
              errorsRecap.join("\n") +
              "\n\nPuoi assegnarli a mano dalla pagina Ordini."
          );
        }
      }
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    }
  };

  const deleteOrder = async (orderId) => {
    if (!orderId) return;

    const orderToDelete = orders.find((order) => String(order.id) === String(orderId));

    const assignedLines = (orderToDelete?.lines || []).filter(
      (line) => (assignments[line.lineId] || []).length > 0
    );

    if (assignedLines.length > 0) {
      alert(
        "Prima di eliminare l'ordine devi eliminare le assegnazioni delle righe già assegnate."
      );
      return;
    }

    if (String(orderToDelete?.status || "").trim().toLowerCase() === "preparato") {
      alert(
        "Questo ordine è già preparato. Prima elimina eventuali assegnazioni e riportalo da preparare."
      );
      return;
    }

    const conferma = window.confirm("Vuoi eliminare davvero questo ordine?");
    if (!conferma) return;

    try {
      const result = await callSheetsApi({
        action: "deleteOrder",
        orderId,
      });

      if (!result || !result.success) {
        alert(
          "Errore nell'eliminazione ordine sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setAssignments((prev) => {
        const next = { ...prev };

        if (orderToDelete?.lines) {
          orderToDelete.lines.forEach((line) => {
            delete next[line.lineId];
          });
        }

        return next;
      });

      const remainingOrders = orders.filter((order) => String(order.id) !== String(orderId));

      setOrders(remainingOrders);

      const nextOrder = remainingOrders[0];

      setSelectedOrderId(nextOrder?.id ?? "");
      setSelectedLineId(nextOrder?.lines?.[0]?.lineId ?? "");


    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    }
  };


  const createLot = async () => {
    if (savingNewLot) return;

    if (!newLotProductId) {
      alert("Seleziona il prodotto");
      return;
    }

    const selectedProduct = products.find(
      (product) => String(product.id) === String(newLotProductId)
    );
    const managesLots = productManagesLots(selectedProduct);

    if (managesLots && !newLotCode.trim()) {
      alert("Inserisci il codice lotto");
      return;
    }

    if (managesLots && !newLotExpiry) {
      alert("Inserisci la scadenza");
      return;
    }

    if (!Number(newLotQty) || Number(newLotQty) <= 0) {
      alert("Inserisci una quantità valida");
      return;
    }

    const newLot = {
      id: `LOT-${Date.now()}`,
      productId: String(newLotProductId),
      lot: managesLots ? newLotCode.trim() : "DISPONIBILITA",
      expiry: managesLots ? newLotExpiry : "",
      loadedQty: Number(newLotQty),
    };

    setSavingNewLot(true);

    try {
      const result = await callSheetsApi({
        action: "createLot",
        payload: JSON.stringify(newLot),
      });

      if (!result || !result.success) {
        alert(
          "Errore nel salvataggio disponibilità sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      const returnedLotId = String(result.lotId || newLot.id);
      const returnedLotCode = String(result.lotCode || newLot.lot);
      const returnedQty =
        result.newQty !== undefined && result.newQty !== null && result.newQty !== ""
          ? Number(result.newQty)
          : Number(newLot.loadedQty);

      setLots((prev) => {
        const exists = prev.some(
          (lot) =>
            String(lot.id) === returnedLotId ||
            (String(lot.productId) === String(newLot.productId) &&
              String(lot.lot) === returnedLotCode)
        );

        if (exists) {
          return prev.map((lot) =>
            String(lot.id) === returnedLotId ||
            (String(lot.productId) === String(newLot.productId) &&
              String(lot.lot) === returnedLotCode)
              ? {
                  ...lot,
                  id: returnedLotId || lot.id,
                  lot: returnedLotCode || lot.lot,
                  expiry: newLot.expiry || lot.expiry,
                  loadedQty: returnedQty,
                }
              : lot
          );
        }

        return [
          {
            ...newLot,
            id: returnedLotId,
            lot: returnedLotCode,
            loadedQty: returnedQty,
          },
          ...prev,
        ];
      });

      setNewLotProductId("");
      setNewLotProductSearch("");
      setNewLotCode("");
      setNewLotExpiry("");
      setNewLotQty("");
      setLotDialogOpen(false);
      setPage("prodotti");
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    } finally {
      setSavingNewLot(false);
    }
  };


  const createProduct = async () => {
    if (!newProductCode.trim()) {
      alert("Inserisci il codice prodotto");
      return;
    }

    if (!newProductName.trim()) {
      alert("Inserisci la descrizione prodotto");
      return;
    }

    const newProduct = {
      id: newProductCode.trim(),
      productId: newProductCode.trim(),
      code: newProductCode.trim(),
      Codice_Prodotto: newProductCode.trim(),
      name: newProductName.trim(),
      productName: newProductName.trim(),
      Descrizione_Prodotto: newProductName.trim(),
      uom: newProductUom.trim() || "pz",
      UM: newProductUom.trim() || "pz",
      managesLots: newProductManagesLots,
      Gestione_Lotti: newProductManagesLots ? "SI" : "NO",
    };

    setSavingNewProduct(true);

    try {
      const result = await callSheetsApi({
        action: "createProduct",
        payload: JSON.stringify(newProduct),
      });

      if (!result || !result.success) {
        alert(
          "Errore nel salvataggio prodotto sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setProducts((prev) => [
        {
          id: newProduct.code,
          code: newProduct.code,
          name: newProduct.name,
          uom: newProduct.uom,
          managesLots: newProduct.managesLots,
        },
        ...prev,
      ]);

      setNewProductCode("");
      setNewProductName("");
      setNewProductUom("pz");
      setNewProductManagesLots(true);
      setProductDialogOpen(false);
      setPage("prodotti");

      
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    } finally {
      setSavingNewProduct(false);
    }
  };

  const openEditProductDialog = (product) => {
    if (!isAdmin) return;

    setEditingProductId(product.id);
    setEditProductCode(product.code);
    setEditProductName(product.name);
    setEditProductUom(product.uom || "pz");
    setEditProductManagesLots(productManagesLots(product));
    setEditProductDialogOpen(true);
  };

  const saveEditedProduct = async () => {
    if (!editingProductId || !editProductCode.trim() || !editProductName.trim()) {
      alert("Compila codice prodotto e descrizione");
      return;
    }

    const payload = {
      productId: String(editingProductId),
      id: String(editingProductId),
      code: editProductCode.trim(),
      Codice_Prodotto: editProductCode.trim(),
      name: editProductName.trim(),
      productName: editProductName.trim(),
      Descrizione_Prodotto: editProductName.trim(),
      uom: editProductUom.trim() || "pz",
      UM: editProductUom.trim() || "pz",
      managesLots: editProductManagesLots,
      Gestione_Lotti: editProductManagesLots ? "SI" : "NO",
    };

    setSavingProduct(true);

    try {
      const result = await callSheetsApi({
        action: "updateProduct",
        payload: JSON.stringify(payload),
      });

      if (!result || !result.success) {
        alert(
          "Errore nel salvataggio prodotto sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setProducts((prev) =>
        prev.map((product) =>
          String(product.id) === String(editingProductId)
            ? {
                ...product,
                code: editProductCode.trim(),
                name: editProductName.trim(),
                uom: editProductUom.trim() || "pz",
                managesLots: editProductManagesLots,
              }
            : product
        )
      );

      setEditProductDialogOpen(false);
      setEditingProductId(null);
      setEditProductCode("");
      setEditProductName("");
      setEditProductUom("pz");
      setEditProductManagesLots(true);

      
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    } finally {
      setSavingProduct(false);
    }
  };

  const deleteProduct = async (product) => {
    if (!isAdmin) {
      alert("Solo admin può eliminare un prodotto.");
      return;
    }

    if (!product) return;

    if ((product.productLots || []).length > 0) {
      alert("Impossibile eliminare questo prodotto perché ha lotti collegati.");
      return;
    }

    const productIdToDelete = product.id || product.code;

    const conferma = window.confirm(
      `Vuoi eliminare davvero il prodotto ${product.code} · ${product.name} dal Google Sheet?`
    );

    if (!conferma) return;

    setDeletingProductId(String(productIdToDelete));

    try {
      const result = await callSheetsApi({
        action: "deleteProduct",
        productId: productIdToDelete,
        adminPin: ADMIN_PIN,
      });

      if (!result || !result.success) {
        alert(
          "Errore nell'eliminazione prodotto sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setProducts((prev) => prev.filter((item) => String(item.id) !== String(product.id)));

      
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    } finally {
      setDeletingProductId("");
    }
  };

  const handleAdminAccess = () => {
    if (adminPinInput === ADMIN_PIN) {
      setIsAdmin(true);
      setAdminDialogOpen(false);
      setAdminPinInput("");
      setAdminError("");
      return;
    }

    setAdminError("PIN non corretto");
  };

  const exitAdminMode = () => {
    setIsAdmin(false);
    setAdminPinInput("");
    setAdminError("");
    setAdminDialogOpen(false);
  };

  const openAddLineDialog = () => {
    if (!isAdmin || !selectedOrder) return;

    setNewLineProductId("");
    setNewLineQty("");
    setAddLineDialogOpen(true);
  };

  const openEditLineDialog = (line) => {
    if (!isAdmin || !line) return;

    setEditingLineId(line.lineId);
    setEditingLineQty(String(line.qtyOrdered || ""));
    setEditLineDialogOpen(true);
  };

  const createOrderLine = async () => {
    if (!isAdmin || !selectedOrder) return;

    const qtyOrdered = Number(newLineQty);

    if (!qtyOrdered || qtyOrdered <= 0) {
      alert("Inserisci una quantità valida");
      return;
    }

    const nextRowOrder =
      Math.max(0, ...((selectedOrder.lines || []).map((line) => Number(line.rowOrder || 0)))) + 1;

    let newLine;

    if (newLineIsOutsideStock) {
      if (!newLineCustomName.trim()) {
        alert("Inserisci il nome dell'articolo fuori magazzino");
        return;
      }

      newLine = {
        lineId: `RIGA-${Date.now()}`,
        orderId: selectedOrder.id,
        productId: `${OUTSIDE_STOCK_PRODUCT_ID}-${Date.now()}`,
        productCode: OUTSIDE_STOCK_PRODUCT_ID,
        productName: newLineCustomName.trim(),
        isOutsideStock: true,
        rowOrder: nextRowOrder,
        qtyOrdered,
        qtyAssignedFromSheet: 0,
      };
    } else {
      if (!newLineProductId) {
        alert("Seleziona il prodotto");
        return;
      }

      const product = products.find((item) => String(item.id) === String(newLineProductId));

      if (!product) {
        alert("Prodotto non trovato");
        return;
      }

      newLine = {
        lineId: `RIGA-${Date.now()}`,
        orderId: selectedOrder.id,
        productId: String(product.id),
        productCode: product.code || product.id,
        productName: product.name || "",
        isOutsideStock: false,
        rowOrder: nextRowOrder,
        qtyOrdered,
        qtyAssignedFromSheet: 0,
      };
    }

    setSavingNewLine(true);

    setOrders((prev) =>
      prev.map((order) =>
        String(order.id) === String(selectedOrder.id)
          ? { ...order, lines: [...(order.lines || []), newLine] }
          : order
      )
    );

    setAddLineDialogOpen(false);
    setNewLineProductId("");
    setNewLineProductSearch("");
    setNewLineIsOutsideStock(false);
    setNewLineCustomName("");
    setNewLineQty("");

    try {
      const result = await callSheetsApi({
        action: "addOrderLine",
        payload: JSON.stringify({
          orderId: selectedOrder.id,
          lineId: newLine.lineId,
          productId: newLine.productId,
          productCode: newLine.productCode,
          productName: newLine.productName,
          isOutsideStock: newLine.isOutsideStock,
          rowOrder: newLine.rowOrder,
          qtyOrdered,
        }),
      });

      if (!result || !result.success) {
        setOrders((prev) =>
          prev.map((order) =>
            String(order.id) === String(selectedOrder.id)
              ? {
                  ...order,
                  lines: (order.lines || []).filter(
                    (line) => String(line.lineId) !== String(newLine.lineId)
                  ),
                }
              : order
          )
        );

        alert(
          "Errore nel salvataggio riga ordine sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
      }
    } catch (error) {
      setOrders((prev) =>
        prev.map((order) =>
          String(order.id) === String(selectedOrder.id)
            ? {
                ...order,
                lines: (order.lines || []).filter(
                  (line) => String(line.lineId) !== String(newLine.lineId)
                ),
              }
            : order
        )
      );

      alert("Errore di collegamento con Google Sheet: " + String(error));
    } finally {
      setSavingNewLine(false);
    }
  };

  const saveEditedOrderLine = async () => {
    if (!isAdmin || !editingLineId) return;

    const qtyOrdered = Number(editingLineQty);

    if (!qtyOrdered || qtyOrdered <= 0) {
      alert("Inserisci una quantità valida");
      return;
    }

    const previousOrders = orders;
    const assignedQty = (assignments[editingLineId] || []).reduce(
      (sum, assignment) => sum + Number(assignment.qty || 0),
      0
    );

    if (qtyOrdered < assignedQty) {
      alert("La quantità non può essere minore della quantità già assegnata");
      return;
    }

    const lineIdToUpdate = editingLineId;

    setSavingEditedLine(true);

    setOrders((prev) =>
      prev.map((order) => ({
        ...order,
        lines: (order.lines || []).map((line) =>
          String(line.lineId) === String(lineIdToUpdate)
            ? { ...line, qtyOrdered }
            : line
        ),
      }))
    );

    setEditLineDialogOpen(false);
    setEditingLineId("");
    setEditingLineQty("");

    try {
      const result = await callSheetsApi({
        action: "updateOrderLine",
        payload: JSON.stringify({
          lineId: lineIdToUpdate,
          qtyOrdered,
        }),
      });

      if (!result || !result.success) {
        setOrders(previousOrders);

        alert(
          "Errore nel salvataggio modifica riga sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
      }
    } catch (error) {
      setOrders(previousOrders);

      alert("Errore di collegamento con Google Sheet: " + String(error));
    } finally {
      setSavingEditedLine(false);
    }
  };

  const deleteLine = async (orderId, lineId) => {
    if (!orderId || !lineId) return;

    const conferma = window.confirm(
      "Vuoi eliminare davvero questa riga ordine? Verranno eliminate anche eventuali assegnazioni collegate."
    );

    if (!conferma) return;

    try {
      const result = await callSheetsApi({
        action: "deleteLine",
        lineId,
      });

      if (!result || !result.success) {
        alert(
          "Errore nell'eliminazione riga ordine sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setAssignments((prev) => {
        const next = { ...prev };
        delete next[lineId];
        return next;
      });

      const updatedOrders = orders
        .map((order) =>
          String(order.id) === String(orderId)
            ? {
                ...order,
                lines: (order.lines || []).filter(
                  (line) => String(line.lineId) !== String(lineId)
                ),
              }
            : order
        )
        .filter((order) => (order.lines || []).length > 0);

      setOrders(updatedOrders);

      const sameOrder = updatedOrders.find((order) => String(order.id) === String(orderId));

      setSelectedOrderId(sameOrder?.id ?? updatedOrders[0]?.id ?? "");
      setSelectedLineId(
        sameOrder?.lines?.[0]?.lineId ?? updatedOrders[0]?.lines?.[0]?.lineId ?? ""
      );

      
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    }
  };

  const deleteAssignment = async (lineId, assignmentId) => {
    if (!lineId || !assignmentId) return;

    const conferma = window.confirm("Vuoi eliminare questa assegnazione lotto?");
    if (!conferma) return;

    const assignmentToDelete = (assignments[lineId] || []).find(
      (assignment) => String(assignment.assignmentId) === String(assignmentId)
    );

    setAssignments((prev) => ({
      ...prev,
      [lineId]: (prev[lineId] || []).filter(
        (assignment) => String(assignment.assignmentId) !== String(assignmentId)
      ),
    }));

    try {
      const result = await callSheetsApi({
        action: "deleteAssignment",
        assignmentId,
      });

      if (!result || !result.success) {
        if (assignmentToDelete) {
          setAssignments((prev) => ({
            ...prev,
            [lineId]: [...(prev[lineId] || []), assignmentToDelete],
          }));
        }

        alert(
          "Errore nell'eliminazione assegnazione sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      // Se l'ordine era "preparato" ed e' stato riaperto, il backend ha
      // ripristinato lo stock di TUTTE le assegnazioni dell'ordine. Per evitare
      // qualsiasi disallineamento (causa del bug "tutto non disponibile"),
      // ricarichiamo lo stato completo dal foglio invece di applicare le patch
      // ottimistiche una per una.
      if (result.orderReopened) {
        await loadDataFromSheets();
        return;
      }

      if (result.stockRestored) {
        setLots((prev) => applyStockMovementsToLots(prev, [result.stockRestored]));
      }
    } catch (error) {
      if (assignmentToDelete) {
        setAssignments((prev) => ({
          ...prev,
          [lineId]: [...(prev[lineId] || []), assignmentToDelete],
        }));
      }

      alert("Errore di collegamento con Google Sheet: " + String(error));
    }
  };


  const openEditLotDialog = (lot) => {
    if (!lot) return;

    setEditingLotId(String(lot.id || lot.lot));
    setEditingLotCode(String(lot.lot || ""));
    setEditingLotExpiry(lot.expiry ? String(lot.expiry).slice(0, 10) : "");
    setEditingLotQty(String(Number(lot.loadedQty || 0)));
    setEditLotDialogOpen(true);
  };

  const saveEditedLot = async () => {
    if (!editingLotId) return;

    if (editingLotQty === "" || Number(editingLotQty) < 0 || isNaN(Number(editingLotQty))) {
      alert("Inserisci una quantità valida");
      return;
    }

    setSavingEditedLot(true);

    const previousLots = lots;

    setLots((prev) =>
      prev.map((lot) =>
        String(lot.id) === String(editingLotId) || String(lot.lot) === String(editingLotId)
          ? {
              ...lot,
              lot: editingLotCode.trim() || lot.lot,
              expiry: editingLotExpiry,
              loadedQty: Number(editingLotQty),
            }
          : lot
      )
    );

    try {
      const result = await callSheetsApi({
        action: "updateLot",
        payload: JSON.stringify({
          lotId: editingLotId,
          expiry: editingLotExpiry,
          loadedQty: Number(editingLotQty),
        }),
      });

      if (!result || !result.success) {
        setLots(previousLots);
        alert(
          "Errore nella modifica lotto sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setEditLotDialogOpen(false);
      setEditingLotId("");
      setEditingLotCode("");
      setEditingLotExpiry("");
      setEditingLotQty("");
    } catch (error) {
      setLots(previousLots);
      alert("Errore di collegamento con Google Sheet: " + String(error));
    } finally {
      setSavingEditedLot(false);
    }
  };

  const archiveLot = async (lotId) => {
    if (!lotId) return;

    const lotToArchive = lots.find((lot) => String(lot.id) === String(lotId));
    const lotCode = lotToArchive?.lot || lotId;
    const qty = Number(lotToArchive?.loadedQty || 0);
    const assigned = Number(lotAssignedMap[String(lotId)]?.assigned || 0);

    if (qty > 0) {
      alert("Puoi archiviare solo lotti con quantità a zero.");
      return;
    }

    if (assigned > 0) {
      alert("Non puoi archiviare un lotto ancora impegnato in ordini non preparati.");
      return;
    }

    const conferma = window.confirm(
      `Vuoi archiviare il lotto ${lotCode}? Non sarà più visibile nel magazzino attivo.`
    );

    if (!conferma) return;

    try {
      const result = await callSheetsApi({
        action: "archiveLot",
        lotId,
      });

      if (!result || !result.success) {
        alert(
          "Errore nell'archiviazione lotto sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setLots((prev) =>
        prev.map((lot) =>
          String(lot.id) === String(lotId) ? { ...lot, archived: true } : lot
        )
      );
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    }
  };

  const deleteLot = async (lotId) => {
    if (!lotId) return;

    const lotToDelete = lots.find((lot) => String(lot.id) === String(lotId));
    const lotCodeToDelete = lotToDelete?.lot || lotId;
    const lotIdToDelete = lotToDelete?.id || lotId;

    const isUsed = Object.values(assignments)
      .flat()
      .some(
        (assignment) =>
          String(assignment.lotId) === String(lotIdToDelete) ||
          String(assignment.lotId) === String(lotCodeToDelete)
      );

    if (isUsed) {
      alert("Impossibile eliminare questo lotto perché è già assegnato a un ordine.");
      return;
    }

    const conferma = window.confirm(
      `Vuoi eliminare davvero il lotto ${lotCodeToDelete} dal Google Sheet?`
    );

    if (!conferma) return;

    try {
      let result = await callSheetsApi({
        action: "deleteLot",
        lotId: lotIdToDelete,
      });

      if (!result || !result.success) {
        alert(
          "Errore nell'eliminazione lotto sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setLots((prev) =>
        prev.filter(
          (lot) =>
            String(lot.id) !== String(lotIdToDelete) &&
            String(lot.lot) !== String(lotCodeToDelete)
        )
      );
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #eef3f9 0%, #f7f9fc 42%, #eef3f9 100%)",
        padding: isSmallLayout ? 10 : 20,
        fontFamily: "Arial, sans-serif",
        overflowX: "hidden",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 1320, margin: "0 auto", width: "100%", boxSizing: "border-box", minWidth: 0 }}>
        <div
          style={{
            ...cardStyle({ background: "rgba(255,255,255,0.88)" }),
            padding: isSmallLayout ? 14 : 18,
            marginBottom: 20,
            position: "sticky",
            top: 10,
            zIndex: 20,
            backdropFilter: "blur(18px)",
            border: "1px solid rgba(207,216,230,0.85)",
            boxShadow: "0 18px 42px rgba(15,23,42,0.08)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 14,
              marginBottom: 14,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  fontStyle: "italic",
                  fontSize: isSmallLayout ? 20 : 24,
                  fontWeight: 700,
                  color: "#07153a",
                  letterSpacing: "-0.03em",
                  lineHeight: 1.05,
                }}
              >
                Gluten Free Experience Srl
              </div>
              <div
                style={{
                  marginTop: 4,
                  color: "#7a8699",
                  fontSize: 12,
                  fontWeight: 750,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                }}
              >
                gestione ordini · lotti · disponibilità
              </div>
            </div>

            <span style={badgeStyle(isAdmin ? "dark" : "outline")}>
              {isAdmin ? "ADMIN" : "OPERATORE"}
            </span>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: isSmallLayout ? "stretch" : "space-between",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                flex: "1 1 auto",
              }}
            >
              <button
                style={{
                  ...btnStyle(page === "ordini" ? "primary" : "soft"),
                  borderRadius: 999,
                  minWidth: isSmallLayout ? "calc(50% - 5px)" : 128,
                }}
                onClick={() => setPage("ordini")}
              >
                <ClipboardList size={18} /> Ordini
              </button>

              <button
                style={{
                  ...btnStyle(page === "prodotti" ? "primary" : "soft"),
                  borderRadius: 999,
                  minWidth: isSmallLayout ? "calc(50% - 5px)" : 128,
                }}
                onClick={() => setPage("prodotti")}
              >
                <Package size={18} /> Prodotti
              </button>

              <button
                style={{
                  ...btnStyle(page === "fermi" ? "primary" : "soft"),
                  borderRadius: 999,
                  minWidth: isSmallLayout ? "calc(50% - 5px)" : 138,
                }}
                onClick={() => setPage("fermi")}
              >
                <AlertTriangle size={18} /> Ordini fermi
              </button>

              <button
                style={{
                  ...btnStyle(page === "preparati" ? "primary" : "soft"),
                  borderRadius: 999,
                  minWidth: isSmallLayout ? "calc(50% - 5px)" : 128,
                }}
                onClick={() => setPage("preparati")}
              >
                <CheckCircle2 size={18} /> Preparati
              </button>

              <button
                style={{
                  ...btnStyle(page === "archivio" ? "primary" : "soft"),
                  borderRadius: 999,
                  minWidth: isSmallLayout ? "calc(50% - 5px)" : 128,
                }}
                onClick={() => setPage("archivio")}
              >
                <Archive size={18} /> Archivio
              </button>

              <button
                style={{
                  ...btnStyle(page === "magazzino" ? "primary" : "soft"),
                  borderRadius: 999,
                  minWidth: isSmallLayout ? "calc(50% - 5px)" : 158,
                }}
                onClick={() => setPage("magazzino")}
              >
                <Boxes size={18} /> Magazzino
              </button>

              <button
                style={{
                  ...btnStyle("primary"),
                  borderRadius: 999,
                  minWidth: isSmallLayout ? "100%" : 154,
                }}
                onClick={() => setOrderDialogOpen(true)}
              >
                <Plus size={18} /> Nuovo ordine
              </button>

              {isAdmin && (
                <>
                  <button
                    style={{
                      ...btnStyle("soft"),
                      borderRadius: 999,
                      minWidth: isSmallLayout ? "calc(50% - 5px)" : 158,
                    }}
                    onClick={() => setProductDialogOpen(true)}
                  >
                    <Plus size={18} /> Nuovo prodotto
                  </button>

                  <button
                    style={{
                      ...btnStyle("soft"),
                      borderRadius: 999,
                      minWidth: isSmallLayout ? "calc(50% - 5px)" : 142,
                    }}
                    onClick={() => setLotDialogOpen(true)}
                  >
                    <Boxes size={18} /> Carica lotto
                  </button>
                </>
              )}
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                justifyContent: isSmallLayout ? "stretch" : "flex-end",
                flex: isSmallLayout ? "1 1 100%" : "0 0 auto",
              }}
            >
              <button
                style={{
                  ...btnStyle("outline"),
                  borderRadius: 999,
                  minWidth: isSmallLayout ? "calc(50% - 5px)" : 128,
                }}
                onClick={loadDataFromSheets}
              >
                <RefreshCw size={18} /> Aggiorna
              </button>

              {!isAdmin ? (
                <button
                  style={{
                    ...btnStyle("outline"),
                    borderRadius: 999,
                    minWidth: isSmallLayout ? "calc(50% - 5px)" : 112,
                  }}
                  onClick={() => setAdminDialogOpen(true)}
                >
                  <Lock size={18} /> Admin
                </button>
              ) : (
                <button
                  style={{
                    ...btnStyle("outline"),
                    borderRadius: 999,
                    minWidth: isSmallLayout ? "calc(50% - 5px)" : 132,
                  }}
                  onClick={exitAdminMode}
                >
                  <Lock size={18} /> Esci admin
                </button>
              )}
            </div>
          </div>
        </div>

        {loadError ? (
          <div
            style={{
              ...cardStyle(),
              padding: 16,
              marginBottom: 16,
              background: "#fff8e6",
              color: "#8a5a00",
            }}
          >
            {loadError}
          </div>
        ) : null}

        {loadingData ? (
          <div style={{ ...cardStyle(), padding: 16, marginBottom: 16, color: "#6b7280" }}>
            Caricamento dati dal Google Sheet...
          </div>
        ) : null}

        {page === "ordini" && (
          <div style={{ display: "grid", gridTemplateColumns: responsiveTwoColumns, gap: 18, minWidth: 0 }}>
            <div style={{ ...cardStyle(), padding: isSmallLayout ? 16 : 20, alignSelf: "start" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 18,
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 800 }}>Ordini</div>

                <button style={btnStyle("outline")} onClick={markVisibleOrdersAsViewed}>
                  Letti
                </button>

                <button style={btnStyle("primary")} onClick={() => setOrderDialogOpen(true)}>
                  <Plus size={16} /> Nuovo
                </button>
              </div>

              <div style={{ position: "relative", marginBottom: 16 }}>
                <Search
                  size={16}
                  style={{ position: "absolute", left: 14, top: 18, color: "#97a3b6" }}
                />

                <input
                  style={{ ...inputStyle(), paddingLeft: 40 }}
                  value={orderSearch}
                  onChange={(event) => setOrderSearch(event.target.value)}
                  placeholder="Cerca nome ordine, cliente o ID"
                />
              </div>

              <div style={{ display: "grid", gap: 12 }}>
                {filteredOrders.map((order) => (
                  <button
                    key={order.id}
                    onClick={() => openOrderFromList(order)}
                    style={{
                      textAlign: "left",
                      padding: 18,
                      borderRadius: 24,
                      border:
                        selectedOrderId === order.id
                          ? "2px solid #07153a"
                          : String(order.workStatus || "").trim().toLowerCase() === "nuovo"
                            ? "2px solid #f59e0b"
                            : "1px solid #dbe2ea",
                      background:
                        selectedOrderId === order.id
                          ? "linear-gradient(135deg, #f8fbff, #eef4ff)"
                          : String(order.workStatus || "").trim().toLowerCase() === "nuovo"
                            ? "linear-gradient(135deg, #fff7ed, #ffffff)"
                            : "#fff",
                      cursor: "pointer",
                      boxShadow: selectedOrderId === order.id ? "0 12px 24px rgba(7,21,58,0.10)" : "0 5px 14px rgba(15,23,42,0.04)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 950, color: "#07153a", overflowWrap: "anywhere" }}>
                          {order.customer || "Ordine senza nome"}
                        </div>
                        <div style={{ color: "#66758b", marginTop: 4, fontSize: 12, overflowWrap: "anywhere" }}>
                          {fmtDate(order.date)} · ID {order.id}
                        </div>
                        {order.notes ? (
                          <div style={{ marginTop: 8, color: "#40516a", fontSize: 13, lineHeight: 1.35 }}>
                            {order.notes}
                          </div>
                        ) : null}
                      </div>

                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {String(order.workStatus || "").trim().toLowerCase() === "nuovo" ? (
                          <span style={badgeStyle("warning")}>NUOVO</span>
                        ) : null}
                        <span style={badgeStyle(order.totalToAssign > 0 ? "warning" : "success")}>{order.computedStatus}</span>
                      </div>
                    </div>

                    <div style={{ marginTop: 14, color: "#66758b" }}>
                      Da assegnare: {order.totalToAssign}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ ...cardStyle(), padding: isSmallLayout ? 16 : 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
                <div style={{ fontSize: 24, fontWeight: 950, color: "#07153a", letterSpacing: "-0.02em" }}>
                  Preparazione ordine
                </div>
                {selectedOrder ? (
                  <span style={badgeStyle(selectedOrder.totalToAssign > 0 ? "warning" : "success")}>
                    {selectedOrderCompletedLines}/{selectedOrderLines.length} righe complete
                  </span>
                ) : null}
              </div>

              {selectedOrder ? (
                <>
                  <div
                    style={{
                      ...cardStyle({ background: "linear-gradient(135deg, #f8fbff, #eef4ff)" }),
                      padding: isSmallLayout ? 16 : 20,
                      marginBottom: 16,
                      border: "1px solid #d4e0f2",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "flex-start",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: isSmallLayout ? 24 : 30, fontWeight: 950, color: "#07153a", overflowWrap: "anywhere" }}>
                          {selectedOrder.customer || "Ordine senza nome"}
                        </div>

                        <div style={{ marginTop: 6, color: "#66758b", fontSize: 13, overflowWrap: "anywhere" }}>
                          {fmtDate(selectedOrder.date)} · ID ordine {selectedOrder.id}
                        </div>

                        {selectedOrder.notes ? (
                          <div
                            style={{
                              marginTop: 12,
                              padding: 12,
                              borderRadius: 16,
                              background: "#f8fafc",
                              border: "1px solid #e5edf6",
                              color: "#40516a",
                              lineHeight: 1.45,
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {selectedOrder.notes}
                          </div>
                        ) : null}

                        <div
                          style={{
                            marginTop: 12,
                            padding: 12,
                            borderRadius: 16,
                            background: "#eef6ff",
                            border: "1px solid #d3e6fb",
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Boxes size={18} style={{ color: "#1d6fd0" }} />
                            <span style={{ fontWeight: 800, color: "#0f3b73" }}>Colli</span>
                          </div>

                          <input
                            type="number"
                            min={0}
                            step={1}
                            style={{
                              ...inputStyle(),
                              width: 90,
                              padding: "8px 10px",
                              fontWeight: 800,
                              fontSize: 18,
                              textAlign: "center",
                            }}
                            value={
                              colliDrafts[selectedOrder.id] !== undefined
                                ? colliDrafts[selectedOrder.id]
                                : String(selectedOrder.colli)
                            }
                            onChange={(event) =>
                              setColliDrafts((prev) => ({
                                ...prev,
                                [selectedOrder.id]: event.target.value,
                              }))
                            }
                          />

                          <span style={{ color: "#5b6b82", fontSize: 13 }}>
                            suggerito {selectedOrder.colliSuggested}
                            {selectedOrder.colliIsManual ? " · modificato a mano" : ""}
                          </span>

                          <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                            <button
                              style={btnStyle("primary", savingColliOrderId === String(selectedOrder.id))}
                              disabled={savingColliOrderId === String(selectedOrder.id)}
                              onClick={() =>
                                saveOrderColli(
                                  selectedOrder.id,
                                  colliDrafts[selectedOrder.id] !== undefined
                                    ? colliDrafts[selectedOrder.id]
                                    : String(selectedOrder.colli)
                                )
                              }
                            >
                              {savingColliOrderId === String(selectedOrder.id) ? "Salvo..." : "Salva colli"}
                            </button>

                            {selectedOrder.colliIsManual ? (
                              <button
                                style={btnStyle("outline")}
                                disabled={savingColliOrderId === String(selectedOrder.id)}
                                onClick={() => saveOrderColli(selectedOrder.id, "")}
                              >
                                Usa suggerito
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {isAdmin ? (
                          <>
                            <button style={btnStyle("outline")} onClick={openEditOrderDialog}>
                              <Pencil size={16} /> Modifica
                            </button>

                            <button style={btnStyle("primary")} onClick={openAddLineDialog}>
                              <Plus size={16} /> Riga
                            </button>

                          </>
                        ) : null}

                        {String(selectedOrder.status || "").trim().toLowerCase() !== "preparato" ? (
                          <button style={btnStyle("warning")} onClick={markOrderStopped}>
                            <AlertTriangle size={16} /> Fermo
                          </button>
                        ) : null}

                        <button style={btnStyle("outline")} onClick={() => deleteOrder(selectedOrder.id)}>
                          <Trash2 size={16} /> Elimina ordine
                        </button>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
                    {selectedOrderLines.map((line) => {
                      const product = productMap[String(line.productId)];
                      const lineAssignments = assignments[line.lineId] || [];
                      const availableLots = getAvailableLotsForLine(line);
                      const form = getInlineAssignmentForm(line.lineId);
                      const savingThisLine = savingAssignmentLineId === String(line.lineId);
                      const completed = line.qtyToAssign <= 0;

                      return (
                        <div
                          key={line.lineId}
                          style={{
                            ...cardStyle({
                              background: completed ? "linear-gradient(135deg, #f8fff9, #ffffff)" : "#fff",
                            }),
                            padding: isSmallLayout ? 14 : 16,
                            border: completed ? "1px solid #bfe7c8" : "1px solid #dbe2ea",
                            borderLeft: completed ? "6px solid #16a34a" : "6px solid #f59e0b",
                            boxShadow: completed ? "0 8px 18px rgba(22,163,74,0.07)" : "0 8px 18px rgba(245,158,11,0.07)",
                          }}
                        >
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: isSmallLayout
                                ? "1fr"
                                : "minmax(220px, 1.1fr) 180px minmax(300px, 1.4fr)",
                              gap: 12,
                              alignItems: "center",
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  flexWrap: "wrap",
                                  marginBottom: 3,
                                }}
                              >
                                <span style={{ fontSize: 17, fontWeight: 950, color: "#07153a" }}>
                                  {isOutsideStockLine(line) ? "FUORI MAGAZZINO" : product?.code || line.productId}
                                </span>
                                {isOutsideStockLine(line) ? (
                                  <span style={{ ...badgeStyle("warning"), padding: "4px 9px", fontSize: 12 }}>
                                    Articolo libero
                                  </span>
                                ) : null}
                                {completed ? (
                                  <span
                                    style={{
                                      ...badgeStyle("success"),
                                      padding: "4px 9px",
                                      fontSize: 12,
                                      color: "#166534",
                                    }}
                                  >
                                    Completa
                                  </span>
                                ) : null}
                              </div>

                              <div
                                style={{
                                  color: "#55657a",
                                  fontSize: 14,
                                  lineHeight: 1.25,
                                  overflowWrap: "anywhere",
                                }}
                              >
                                {isOutsideStockLine(line) ? line.productName : product?.name}
                              </div>
                            </div>

                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(3, 1fr)",
                                gap: 6,
                              }}
                            >
                              <div
                                style={{
                                  ...miniStatStyle("neutral"),
                                }}
                              >
                                <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700 }}>
                                  Ord.
                                </div>
                                <div style={{ fontSize: 17, fontWeight: 900 }}>{line.qtyOrdered}</div>
                              </div>

                              <div
                                style={{
                                  ...miniStatStyle("neutral"),
                                }}
                              >
                                <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700 }}>
                                  Ass.
                                </div>
                                <div style={{ fontSize: 17, fontWeight: 900 }}>{line.assignedQty}</div>
                              </div>

                              <div
                                style={{
                                  ...miniStatStyle(completed ? "success" : "warning"),
                                }}
                              >
                                <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700 }}>
                                  Res.
                                </div>
                                <div
                                  style={{
                                    fontSize: 17,
                                    fontWeight: 900,
                                    color: completed ? "#166534" : "#a16207",
                                  }}
                                >
                                  {line.qtyToAssign}
                                </div>
                              </div>
                            </div>

                            <div style={{ minWidth: 0 }}>
                              {completed ? (
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: isSmallLayout ? "1fr" : "minmax(0, 1fr) auto",
                                    alignItems: "center",
                                    gap: 8,
                                    minWidth: 0,
                                    width: "100%",
                                  }}
                                >
                                  <span
                                    style={{
                                      color: "#166534",
                                      fontWeight: 800,
                                      fontSize: 14,
                                      minWidth: 0,
                                      overflowWrap: "anywhere",
                                      lineHeight: 1.25,
                                    }}
                                  >
                                    {line.requiresLots === false
                                      ? "Quantità assegnata"
                                      : "Quantità completata"}
                                  </span>
                                  {(isAdmin || line.requiresLots === false) ? (
                                    <div
                                      style={{
                                        display: "flex",
                                        gap: 8,
                                        width: isSmallLayout ? "100%" : "auto",
                                      }}
                                    >
                                      {isAdmin ? (
                                        <button
                                          style={{
                                            ...compactBtnStyle("outline"),
                                            width: isSmallLayout ? "100%" : "auto",
                                          }}
                                          onClick={() => openEditLineDialog(line)}
                                        >
                                          Qtà
                                        </button>
                                      ) : null}

                                      <button
                                        style={{
                                          ...compactBtnStyle("outline"),
                                          width: isSmallLayout ? "100%" : "auto",
                                        }}
                                        onClick={() => deleteLine(selectedOrder.id, line.lineId)}
                                      >
                                        <Trash2 size={15} /> Riga
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              ) : !line.requiresLots ? (
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: isIPadLayout ? "1fr" : "minmax(0, 1fr) 76px 96px 92px",
                                    gap: 8,
                                    alignItems: "center",
                                  }}
                                >
                                  <div
                                    style={{
                                      ...compactInputStyle(),
                                      display: "flex",
                                      alignItems: "center",
                                      color: "#40516a",
                                      fontWeight: 800,
                                      minWidth: 0,
                                    }}
                                  >
                                    {isOutsideStockLine(line)
                                      ? "Fuori magazzino"
                                      : "Disponibilità generica"}
                                  </div>

                                  <input
                                    style={{ ...compactInputStyle(), minWidth: 0 }}
                                    type="number"
                                    min="1"
                                    value={form.qty}
                                    onChange={(event) =>
                                      updateInlineAssignmentForm(
                                        line.lineId,
                                        "qty",
                                        event.target.value
                                      )
                                    }
                                    placeholder="Qtà"
                                  />

                                  <button
                                    style={{
                                      ...compactBtnStyle("primary", savingThisLine),
                                      minWidth: 0,
                                      width: "100%",
                                    }}
                                    disabled={savingThisLine}
                                    onClick={() => confirmInlineAssignment(line)}
                                  >
                                    {savingThisLine ? "Salvo..." : "Assegna"}
                                  </button>

                                  <button
                                    style={{
                                      ...compactBtnStyle("outline"),
                                      minWidth: 0,
                                      width: "100%",
                                    }}
                                    onClick={() => deleteLine(selectedOrder.id, line.lineId)}
                                  >
                                    <Trash2 size={15} /> Riga
                                  </button>
                                </div>
                              ) : availableLots.length === 0 ? (
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    gap: 8,
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <span style={{ color: "#b45309", fontWeight: 800, fontSize: 14 }}>
                                    Nessun lotto disponibile
                                  </span>
                                  {isAdmin ? (
                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                      <button
                                        style={compactBtnStyle("outline")}
                                        onClick={() => openEditLineDialog(line)}
                                      >
                                        Qtà
                                      </button>

                                      <button
                                        style={compactBtnStyle("outline")}
                                        onClick={() => deleteLine(selectedOrder.id, line.lineId)}
                                      >
                                        <Trash2 size={15} /> Riga
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: isIPadLayout ? "1fr" : "minmax(0, 1fr) 76px 96px",
                                    gap: 8,
                                    alignItems: "center",
                                  }}
                                >
                                  <select
                                    style={{ ...compactInputStyle(), minWidth: 0 }}
                                    value={form.lotId}
                                    onChange={(event) =>
                                      handleInlineLotSelect(line, event.target.value)
                                    }
                                  >
                                    <option value="">Lotto</option>
                                    {availableLots.map((lot) => {
                                      const info = lotAssignedMap[String(lot.id)] || {};
                                      const disp = Number(info.assignable ?? 0);
                                      const giac = Number(info.total || 0);
                                      return (
                                        <option key={lot.id} value={String(lot.id)}>
                                          {lot.lot} · scad. {fmtDate(lot.expiry)} · disp. {disp}
                                          {disp === 0 && giac > 0 ? ` (giac. ${giac})` : ""}
                                        </option>
                                      );
                                    })}
                                  </select>

                                  <input
                                    style={{ ...compactInputStyle(), minWidth: 0 }}
                                    type="number"
                                    min="1"
                                    value={form.qty}
                                    onChange={(event) =>
                                      updateInlineAssignmentForm(
                                        line.lineId,
                                        "qty",
                                        event.target.value
                                      )
                                    }
                                    placeholder="Qtà"
                                  />

                                  <div
                                    style={{
                                      display: "flex",
                                      gap: 8,
                                      justifyContent: "stretch",
                                      minWidth: 0,
                                    }}
                                  >
                                    <button
                                      style={{
                                        ...compactBtnStyle("primary", savingThisLine),
                                        flex: 1,
                                        minWidth: 0,
                                        width: "100%",
                                      }}
                                      disabled={savingThisLine}
                                      onClick={() => confirmInlineAssignment(line)}
                                    >
                                      {savingThisLine ? "Salvo..." : "Assegna"}
                                    </button>

                                    {isAdmin ? (
                                      <>
                                        <button
                                          style={compactBtnStyle("outline")}
                                          onClick={() => openEditLineDialog(line)}
                                        >
                                          Qtà
                                        </button>

                                        <button
                                          style={compactBtnStyle("outline")}
                                          onClick={() => deleteLine(selectedOrder.id, line.lineId)}
                                        >
                                          <Trash2 size={15} />
                                        </button>
                                      </>
                                    ) : null}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {lineAssignments.length > 0 ? (
                            <div
                              style={{
                                marginTop: 10,
                                paddingTop: 10,
                                borderTop: "1px solid #e5e7eb",
                                display: "flex",
                                gap: 8,
                                alignItems: "center",
                                flexWrap: "wrap",
                              }}
                            >
                              <span style={{ color: "#66758b", fontSize: 13, fontWeight: 800 }}>
                                Assegnati:
                              </span>

                              {lineAssignments.map((assignment) => {
                                const lot = lots.find(
                                  (item) => String(item.id) === String(assignment.lotId)
                                );

                                return (
                                  <span
                                    key={assignment.assignmentId}
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 6,
                                      border: "1px solid #cfd8e6",
                                      background: "#fff",
                                      borderRadius: 999,
                                      padding: "5px 7px 5px 10px",
                                      fontSize: 13,
                                      fontWeight: 800,
                                    }}
                                  >
                                    {lot?.lot || assignment.lotId} x {assignment.qty}
                                    <button
                                      onClick={() =>
                                        deleteAssignment(line.lineId, assignment.assignmentId)
                                      }
                                      style={{
                                        border: "none",
                                        background: "transparent",
                                        cursor: "pointer",
                                        padding: 0,
                                        display: "inline-flex",
                                        alignItems: "center",
                                        color: "#991b1b",
                                      }}
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </span>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
                    {String(selectedOrder.status || "").trim().toLowerCase() === "preparato" ? (
                      <button style={btnStyle("success", true)} disabled>
                        <CheckCircle2 size={18} /> Pronto
                      </button>
                    ) : selectedOrder.totalToAssign === 0 ? (
                      <button
                        style={btnStyle("success", savingPreparedOrderId === String(selectedOrder.id))}
                        disabled={savingPreparedOrderId === String(selectedOrder.id)}
                        onClick={markOrderPrepared}
                      >
                        <CheckCircle2 size={18} />
                        {savingPreparedOrderId === String(selectedOrder.id)
                          ? "Salvataggio..."
                          : "Segna pronto"}
                      </button>
                    ) : (
                      <button style={btnStyle("outline", true)} disabled>
                        <Clock size={18} /> Completa i lotti
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ color: "#66758b" }}>Seleziona un ordine.</div>
              )}
            </div>
          </div>
        )}

        {page === "preparati" && (
          <div style={{ ...cardStyle(), padding: isSmallLayout ? 16 : 20 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: 18,
              }}
            >
              <div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#07153a" }}>
                  Ordini preparati non archiviati
                </div>
                <div style={{ marginTop: 4, color: "#66758b", fontSize: 14 }}>
                  Qui trovi gli ordini già usciti/preparati. Puoi aprirli, controllare le righe e riaprirli per modificarli: se aggiungi una riga tornano da preparare.
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={btnStyle("outline")} onClick={loadDataFromSheets}>
                  <RefreshCw size={18} /> Aggiorna
                </button>
                <button style={btnStyle("primary")} onClick={archiveAllPreparedOrders}>
                  <Archive size={18} /> Archivia preparati
                </button>
              </div>
            </div>

            <div style={{ position: "relative", marginBottom: 18 }}>
              <Search
                size={16}
                style={{ position: "absolute", left: 14, top: 18, color: "#97a3b6" }}
              />

              <input
                style={{ ...inputStyle(), paddingLeft: 40 }}
                value={orderSearch}
                onChange={(event) => setOrderSearch(event.target.value)}
                placeholder="Cerca ordine preparato per cliente, note o ID"
              />
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              {preparedOrders.length === 0 ? (
                <div style={{ color: "#66758b" }}>Nessun ordine preparato non archiviato.</div>
              ) : (
                preparedOrders.map((order) => {
                  const expanded = !!expandedPreparedOrders[String(order.id)];

                  return (
                    <div
                      key={order.id}
                      style={{
                        ...cardStyle({ background: "linear-gradient(135deg, #eefbf2, #ffffff)" }),
                        padding: 16,
                        borderLeft: "6px solid #22c55e",
                        display: "grid",
                        gap: 14,
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: isSmallLayout ? "1fr" : "1fr auto",
                          gap: 12,
                          alignItems: "center",
                        }}
                      >
                        <div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <div style={{ fontSize: 19, fontWeight: 950, color: "#07153a" }}>
                              {order.customer || "Ordine senza nome"}
                            </div>
                            <span style={badgeStyle("success")}>Preparato</span>
                          </div>

                          <div style={{ marginTop: 4, color: "#66758b", fontSize: 12 }}>
                            {fmtDate(order.dataPrepared || order.date)} · ID {order.id}
                          </div>

                          {order.notes ? (
                            <div style={{ marginTop: 8, color: "#40516a", fontSize: 13, lineHeight: 1.4 }}>
                              {order.notes}
                            </div>
                          ) : null}

                          <div style={{ marginTop: 8, color: "#66758b", fontSize: 13 }}>
                            {order.lines?.length || 0} righe
                          </div>

                          <div
                            style={{
                              marginTop: 10,
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <Boxes size={16} style={{ color: "#1d6fd0" }} />
                            <span style={{ fontWeight: 800, color: "#0f3b73", fontSize: 13 }}>Colli</span>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              style={{
                                ...inputStyle(),
                                width: 76,
                                padding: "6px 8px",
                                fontWeight: 800,
                                textAlign: "center",
                              }}
                              value={
                                colliDrafts[order.id] !== undefined
                                  ? colliDrafts[order.id]
                                  : String(order.colli)
                              }
                              onChange={(event) =>
                                setColliDrafts((prev) => ({ ...prev, [order.id]: event.target.value }))
                              }
                            />
                            <button
                              style={btnStyle("primary", savingColliOrderId === String(order.id))}
                              disabled={savingColliOrderId === String(order.id)}
                              onClick={() =>
                                saveOrderColli(
                                  order.id,
                                  colliDrafts[order.id] !== undefined
                                    ? colliDrafts[order.id]
                                    : String(order.colli)
                                )
                              }
                            >
                              {savingColliOrderId === String(order.id) ? "Salvo..." : "Salva"}
                            </button>
                            <span style={{ color: "#5b6b82", fontSize: 12 }}>
                              suggerito {order.colliSuggested}
                            </span>
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <button style={btnStyle("outline")} onClick={() => togglePreparedDetails(order.id)}>
                            {expanded ? "Nascondi" : "Apri"} dettagli
                          </button>

                          <button style={btnStyle("warning")} onClick={() => reopenPreparedOrderForEditing(order.id)}>
                            <Pencil size={16} /> Modifica
                          </button>

                          <button style={btnStyle("primary")} onClick={() => archivePreparedOrder(order.id)}>
                            <Archive size={16} /> Archivia
                          </button>
                        </div>
                      </div>

                      {expanded ? (
                        <div
                          style={{
                            borderTop: "1px solid #dbeafe",
                            paddingTop: 14,
                            display: "grid",
                            gap: 10,
                          }}
                        >
                          {(order.lines || []).map((line) => {
                            const product = productMap[String(line.productId)];
                            const lineAssignments = assignments[line.lineId] || [];

                            return (
                              <div
                                key={line.lineId}
                                style={{
                                  ...cardStyle({ background: "#fff" }),
                                  padding: 12,
                                  display: "grid",
                                  gap: 8,
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    gap: 12,
                                    flexWrap: "wrap",
                                    alignItems: "center",
                                  }}
                                >
                                  <div>
                                    <div style={{ fontWeight: 950, color: "#07153a" }}>
                                      {isOutsideStockLine(line)
                                        ? line.productName
                                        : product?.name || line.productName || line.productId}
                                    </div>
                                    <div style={{ marginTop: 3, color: "#66758b", fontSize: 12 }}>
                                      {isOutsideStockLine(line)
                                        ? "FUORI MAGAZZINO"
                                        : product?.code || line.productId}
                                    </div>
                                  </div>

                                  <span style={badgeStyle("outline")}>
                                    Ordinati {Number(line.qtyOrdered || 0)}
                                  </span>
                                </div>

                                {lineAssignments.length > 0 ? (
                                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    {lineAssignments.map((assignment) => {
                                      const assignedLot = lots.find(
                                        (lot) => String(lot.id) === String(assignment.lotId)
                                      );

                                      return (
                                        <span key={assignment.assignmentId} style={badgeStyle("success")}>
                                          {assignedLot?.lot || assignment.lotId} · {Number(assignment.qty || 0)}
                                        </span>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div style={{ color: "#66758b", fontSize: 13 }}>
                                    Nessuna assegnazione lotto collegata a questa riga.
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {page === "fermi" && (
          <div style={{ ...cardStyle(), padding: isSmallLayout ? 16 : 20 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: 18,
              }}
            >
              <div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#07153a" }}>
                  Ordini fermi
                </div>
                <div style={{ marginTop: 4, color: "#66758b", fontSize: 14 }}>
                  Ordini bloccati per mancanze, problemi o verifiche prima dell’evasione.
                </div>
              </div>

              <button style={btnStyle("outline")} onClick={loadDataFromSheets}>
                <RefreshCw size={18} /> Aggiorna
              </button>
            </div>

            <div style={{ position: "relative", marginBottom: 18 }}>
              <Search
                size={16}
                style={{ position: "absolute", left: 14, top: 18, color: "#97a3b6" }}
              />

              <input
                style={{ ...inputStyle(), paddingLeft: 40 }}
                value={orderSearch}
                onChange={(event) => setOrderSearch(event.target.value)}
                placeholder="Cerca ordine fermo per cliente, note o ID"
              />
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              {stoppedOrders.length === 0 ? (
                <div style={{ color: "#66758b" }}>Nessun ordine fermo.</div>
              ) : (
                stoppedOrders.map((order) => (
                  <div
                    key={order.id}
                    style={{
                      ...cardStyle({ background: "linear-gradient(135deg, #fff7ed, #ffffff)" }),
                      padding: 16,
                      borderLeft: "6px solid #f59e0b",
                      display: "grid",
                      gridTemplateColumns: isSmallLayout ? "1fr" : "1fr auto",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ fontSize: 19, fontWeight: 950, color: "#07153a" }}>
                          {order.customer || "Ordine senza nome"}
                        </div>
                        <span style={badgeStyle("warning")}>Fermo</span>
                      </div>

                      <div style={{ marginTop: 4, color: "#66758b", fontSize: 12 }}>
                        {fmtDate(order.date)} · ID {order.id}
                      </div>

                      {order.notes ? (
                        <div style={{ marginTop: 8, color: "#40516a", fontSize: 13, lineHeight: 1.4 }}>
                          {order.notes}
                        </div>
                      ) : null}

                      <div style={{ marginTop: 8, color: "#66758b", fontSize: 13 }}>
                        {order.lines?.length || 0} righe · {order.totalToAssign || 0} pezzi ancora da completare
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <button style={btnStyle("success")} onClick={() => restoreStoppedOrder(order.id)}>
                        <CheckCircle2 size={16} /> Riporta da preparare
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {page === "archivio" && (
          <div style={{ ...cardStyle(), padding: isSmallLayout ? 16 : 20 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: 18,
              }}
            >
              <div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#07153a" }}>Archivio ordini</div>
                <div style={{ marginTop: 4, color: "#66758b", fontSize: 14 }}>
                  Ordini preparati archiviati automaticamente dopo la mezzanotte.
                </div>
              </div>

              <button style={btnStyle("outline")} onClick={loadDataFromSheets}>
                <RefreshCw size={18} /> Aggiorna
              </button>
            </div>

            <div style={{ position: "relative", marginBottom: 18 }}>
              <Search
                size={16}
                style={{ position: "absolute", left: 14, top: 18, color: "#97a3b6" }}
              />

              <input
                style={{ ...inputStyle(), paddingLeft: 40 }}
                value={orderSearch}
                onChange={(event) => setOrderSearch(event.target.value)}
                placeholder="Cerca in archivio per nome, note o ID"
              />
            </div>

            <div style={{ display: "grid", gap: 16 }}>
              {Object.keys(archivedGroups).length === 0 ? (
                <div style={{ color: "#66758b" }}>Nessun ordine archiviato.</div>
              ) : (
                Object.entries(archivedGroups).map(([dateLabel, dayOrders]) => (
                  <div
                    key={dateLabel}
                    style={{
                      border: "1px solid #e5edf6",
                      borderRadius: 24,
                      overflow: "hidden",
                      background: "#fff",
                    }}
                  >
                    <div
                      style={{
                        padding: 16,
                        background: "#f8fafc",
                        borderBottom: "1px solid #e5edf6",
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "center",
                      }}
                    >
                      <div style={{ fontWeight: 900, color: "#07153a" }}>{dateLabel}</div>
                      <div style={{ color: "#66758b", fontSize: 13 }}>
                        {dayOrders.length} ordini
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: 10, padding: 14 }}>
                      {dayOrders.map((order) => (
                        <div
                          key={order.id}
                          style={{
                            ...cardStyle({ background: "linear-gradient(135deg, #ffffff, #fbfdff)" }),
                            padding: 16,
                            display: "grid",
                            gridTemplateColumns: isSmallLayout ? "1fr" : "1fr auto",
                            gap: 12,
                            alignItems: "center",
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 18, fontWeight: 950, color: "#07153a" }}>
                              {order.customer || "Ordine senza nome"}
                            </div>
                            <div style={{ marginTop: 4, color: "#66758b", fontSize: 12 }}>
                              ID {order.id} · preparato {fmtDate(order.dataPrepared || order.date)}
                            </div>
                            {order.notes ? (
                              <div style={{ marginTop: 8, color: "#40516a", fontSize: 13, lineHeight: 1.4 }}>
                                {order.notes}
                              </div>
                            ) : null}
                          </div>

                          {isAdmin ? (
                            <button style={btnStyle("outline")} onClick={() => unarchiveOrder(order.id)}>
                              <RotateCcw size={16} /> Disarchivia
                            </button>
                          ) : (
                            <span style={badgeStyle("success")}>Archiviato</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {page === "magazzino" && (
          <div style={{ ...cardStyle(), padding: 20 }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>Magazzino a prima vista</div>
              <div style={{ marginTop: 4, color: "#617086", fontSize: 14 }}>
                Raggruppato per prodotto: totale complessivo + dettaglio per ciascun lotto.
              </div>
            </div>

            <div style={{ position: "relative", marginBottom: 16, maxWidth: 420 }}>
              <Search
                size={16}
                style={{ position: "absolute", left: 14, top: 18, color: "#97a3b6" }}
              />
              <input
                style={{ ...inputStyle(), paddingLeft: 40 }}
                value={magazzinoSearch}
                onChange={(event) => setMagazzinoSearch(event.target.value)}
                placeholder="Cerca referenza, codice o lotto"
              />
            </div>

            {filteredMagazzinoRows.length === 0 ? (
              <div style={{ ...cardStyle({ background: "#fff7ed" }), padding: 18, color: "#b45309" }}>
                Nessun lotto trovato.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 0, border: "1px solid #e7ecf3", borderRadius: 12, overflow: "hidden" }}>
                {!isSmallLayout && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(220px, 2.2fr) minmax(110px, 1fr) minmax(110px, 1fr) 90px 90px 110px",
                      gap: 10,
                      padding: "12px 16px",
                      background: "#07153a",
                      color: "#fff",
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  >
                    <div>Referenza</div>
                    <div>Lotto</div>
                    <div>Scadenza</div>
                    <div style={{ textAlign: "right" }}>Giacenza</div>
                    <div style={{ textAlign: "right" }}>Impegnato</div>
                    <div style={{ textAlign: "right" }}>Disponibile</div>
                  </div>
                )}

                {magazzinoGrouped.map((group, gIndex) => (
                  <React.Fragment key={`${group.productId}-${gIndex}`}>
                    {/* Riga prodotto: totali aggregati. Sfondo evidenziato. */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: isSmallLayout
                          ? "1fr auto"
                          : "minmax(220px, 2.2fr) minmax(110px, 1fr) minmax(110px, 1fr) 90px 90px 110px",
                        gap: 10,
                        padding: isSmallLayout ? "12px 14px" : "12px 16px",
                        alignItems: "center",
                        background: "#e8eef9",
                        borderTop: gIndex === 0 ? "none" : "2px solid #c6d0e2",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 900, color: "#07153a", fontSize: 15 }}>{group.productName}</div>
                        <div style={{ fontSize: 12, color: "#5a6e90", marginTop: 2 }}>
                          {group.productCode}
                          {` · ${group.lots.length} ${group.lots.length === 1 ? "lotto" : "lotti"}`}
                          {isSmallLayout ? ` · Giac. ${group.totalLoaded} · Imp. ${group.totalCommitted}` : ""}
                        </div>
                      </div>

                      {!isSmallLayout && <div />}
                      {!isSmallLayout && <div />}
                      {!isSmallLayout && (
                        <div style={{ textAlign: "right", color: "#07153a", fontWeight: 800 }}>{group.totalLoaded}</div>
                      )}
                      {!isSmallLayout && (
                        <div style={{ textAlign: "right", color: group.totalCommitted > 0 ? "#b45309" : "#9aa7b8", fontWeight: 800 }}>
                          {group.totalCommitted}
                        </div>
                      )}

                      <div
                        style={{
                          textAlign: "right",
                          fontWeight: 900,
                          fontSize: isSmallLayout ? 20 : 18,
                          color: group.totalAvailable > 0 ? "#0a7d34" : "#b91c1c",
                        }}
                      >
                        {group.totalAvailable}
                      </div>
                    </div>

                    {/* Righe lotto sotto al prodotto */}
                    {group.lots.map((row, index) => (
                      <div
                        key={row.lotId}
                        style={{
                          display: "grid",
                          gridTemplateColumns: isSmallLayout
                            ? "1fr auto"
                            : "minmax(220px, 2.2fr) minmax(110px, 1fr) minmax(110px, 1fr) 90px 90px 110px",
                          gap: 10,
                          padding: isSmallLayout ? "10px 14px 10px 26px" : "10px 16px 10px 32px",
                          alignItems: "center",
                          background: index % 2 === 0 ? "#fff" : "#f7f9fc",
                          borderTop: "1px solid #eef2f7",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ color: "#3a4658", fontSize: 13 }}>
                            ↳ Lotto {row.lotCode || "—"}
                            {row.expiry ? ` · Scad. ${row.expiry}` : ""}
                            {isSmallLayout ? ` · Giac. ${row.loaded} · Imp. ${row.committed}` : ""}
                          </div>
                        </div>

                        {!isSmallLayout && <div style={{ color: "#3a4658" }}>{row.lotCode || "—"}</div>}
                        {!isSmallLayout && <div style={{ color: "#3a4658" }}>{row.expiry || "—"}</div>}
                        {!isSmallLayout && (
                          <div style={{ textAlign: "right", color: "#55657a" }}>{row.loaded}</div>
                        )}
                        {!isSmallLayout && (
                          <div style={{ textAlign: "right", color: row.committed > 0 ? "#b45309" : "#9aa7b8" }}>
                            {row.committed}
                          </div>
                        )}

                        <div
                          style={{
                            textAlign: "right",
                            fontWeight: 700,
                            fontSize: isSmallLayout ? 18 : 16,
                            color: row.available > 0 ? "#0a7d34" : "#b91c1c",
                          }}
                        >
                          {row.available}
                        </div>
                      </div>
                    ))}
                  </React.Fragment>
                ))}
              </div>
            )}

            <div style={{ marginTop: 14, color: "#617086", fontSize: 13 }}>
              {magazzinoGrouped.length} {magazzinoGrouped.length === 1 ? "prodotto" : "prodotti"} ·{" "}
              {filteredMagazzinoRows.length} lotti · Disponibili totali{" "}
              {magazzinoGrouped.reduce((sum, g) => sum + g.totalAvailable, 0)}
            </div>
          </div>
        )}

        {page === "prodotti" && (
          <div style={{ ...cardStyle(), padding: 20 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: 18,
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 800 }}>Prodotti e disponibilità</div>

              {isAdmin && (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button style={btnStyle("primary")} onClick={() => setProductDialogOpen(true)}>
                    <Plus size={16} /> Nuovo prodotto
                  </button>

                  <button style={btnStyle("primary")} onClick={() => setLotDialogOpen(true)}>
                    <Boxes size={16} /> Carica lotto
                  </button>
                </div>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isSmallLayout
                  ? "1fr"
                  : "minmax(260px, 1.4fr) minmax(180px, 0.8fr) minmax(180px, 0.8fr)",
                gap: 12,
                marginBottom: 18,
              }}
            >
              <div style={{ position: "relative" }}>
                <Search
                  size={16}
                  style={{ position: "absolute", left: 14, top: 18, color: "#97a3b6" }}
                />

                <input
                  style={{ ...inputStyle(), paddingLeft: 40 }}
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Cerca prodotto, codice o categoria"
                />
              </div>

              <select
                style={inputStyle()}
                value={productCategoryFilter}
                onChange={(event) => setProductCategoryFilter(event.target.value)}
              >
                <option value="">Tutte le categorie</option>
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>

              <select
                style={inputStyle()}
                value={productSubcategoryFilter}
                onChange={(event) => setProductSubcategoryFilter(event.target.value)}
              >
                <option value="">Tutte le sottocategorie</option>
                {subcategoryOptions.map((subcategory) => (
                  <option key={subcategory} value={subcategory}>
                    {subcategory}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              {groupedProducts.length === 0 ? (
                <div style={{ ...cardStyle({ background: "#fff7ed" }), padding: 18, color: "#b45309" }}>
                  Nessun prodotto trovato con i filtri selezionati.
                </div>
              ) : (
                groupedProducts.map((group) => {
                  const isOpen =
                    openProductSections[group.category] ??
                    Boolean(productCategoryFilter || productSubcategoryFilter || productSearch);

                  return (
                    <div key={group.category} style={{ ...cardStyle(), overflow: "hidden" }}>
                      <button
                        onClick={() => toggleProductSection(group.category)}
                        style={{
                          width: "100%",
                          border: 0,
                          background: isOpen ? "#07153a" : "#fff",
                          color: isOpen ? "#fff" : "#07153a",
                          padding: isSmallLayout ? 16 : 20,
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 14,
                          textAlign: "left",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: isSmallLayout ? 20 : 24, fontWeight: 950 }}>
                            {group.category}
                          </div>
                          <div
                            style={{
                              marginTop: 6,
                              color: isOpen ? "rgba(255,255,255,0.72)" : "#617086",
                              fontSize: 14,
                            }}
                          >
                            {group.products.length} prodotti · Totale {group.totalLoaded} · Impegnati {group.totalCommitted} · Disponibili {group.totalAvailable}
                          </div>
                        </div>

                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 42,
                            height: 42,
                            borderRadius: 16,
                            background: isOpen ? "rgba(255,255,255,0.14)" : "#eef3f9",
                            fontSize: 24,
                            fontWeight: 900,
                            flex: "0 0 auto",
                          }}
                        >
                          {isOpen ? "−" : "+"}
                        </div>
                      </button>

                      {isOpen ? (
                        <div style={{ padding: isSmallLayout ? 14 : 18, display: "grid", gap: 18 }}>
                          {Object.entries(group.subcategories)
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([subcategory, productsInSubcategory]) => (
                              <div key={subcategory} style={{ display: "grid", gap: 12 }}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 10,
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <div style={{ fontSize: 16, fontWeight: 900, color: "#243043" }}>
                                    {subcategory}
                                  </div>
                                  <span style={badgeStyle("outline")}>
                                    {productsInSubcategory.length} prodotti
                                  </span>
                                </div>

                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: responsiveProductColumns,
                                    gap: 16,
                                    minWidth: 0,
                                  }}
                                >
                                  {productsInSubcategory.map((product) => (
                                    <div key={product.id} style={{ ...cardStyle(), padding: 20 }}>
                                      <div
                                        style={{
                                          display: "flex",
                                          justifyContent: "space-between",
                                          gap: 12,
                                          alignItems: "flex-start",
                                        }}
                                      >
                                        <div>
                                          <div style={{ fontSize: 18, fontWeight: 900 }}>
                                            {product.code}
                                          </div>
                                          <div style={{ marginTop: 4, color: "#55657a" }}>
                                            {product.name}
                                          </div>

                                          {(product.category || product.subcategory) && (
                                            <div
                                              style={{
                                                display: "flex",
                                                gap: 8,
                                                flexWrap: "wrap",
                                                marginTop: 10,
                                              }}
                                            >
                                              {product.category ? (
                                                <span style={badgeStyle("dark")}>{product.category}</span>
                                              ) : null}

                                              {product.subcategory ? (
                                                <span style={badgeStyle("outline")}>
                                                  {product.subcategory}
                                                </span>
                                              ) : null}
                                            </div>
                                          )}
                                        </div>

                                        <div
                                          style={{
                                            display: "flex",
                                            gap: 8,
                                            alignItems: "center",
                                            flexWrap: "wrap",
                                            justifyContent: "flex-end",
                                          }}
                                        >
                                          <span style={badgeStyle("outline")}>
                                            Totale {product.totalLoaded}
                                          </span>
                                          <span style={badgeStyle("warning")}>
                                            Impegnati {product.totalCommitted}
                                          </span>
                                          <span style={badgeStyle("success")}>
                                            Disponibili {product.totalAvailable}
                                          </span>

                                          {isAdmin && (
                                            <>
                                              <button
                                                style={btnStyle("outline")}
                                                onClick={() => openEditProductDialog(product)}
                                              >
                                                <Pencil size={16} />
                                              </button>

                                              <button
                                                style={btnStyle(
                                                  "danger",
                                                  deletingProductId === String(product.id)
                                                )}
                                                disabled={deletingProductId === String(product.id)}
                                                onClick={() => deleteProduct(product)}
                                              >
                                                <Trash2 size={16} />
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      </div>

                                      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
                                        {product.productLots.length === 0 ? (
                                          <div
                                            style={{
                                              ...cardStyle({ background: "#fff7ed" }),
                                              padding: 14,
                                              color: "#b45309",
                                            }}
                                          >
                                            <div
                                              style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 8,
                                              }}
                                            >
                                              <AlertTriangle size={16} />{" "}
                                              {productManagesLots(product)
                                                ? "Nessun lotto disponibile"
                                                : "Nessuna disponibilità caricata"}
                                            </div>
                                          </div>
                                        ) : (
                                          product.productLots
                                            .sort((a, b) =>
                                              productManagesLots(product)
                                                ? new Date(a.expiry || "2099-12-31") - new Date(b.expiry || "2099-12-31")
                                                : 0
                                            )
                                            .map((lot) => (
                                              <div
                                                key={lot.id}
                                                style={{
                                                  ...cardStyle({ background: "#f8fafc" }),
                                                  padding: 16,
                                                }}
                                              >
                                                <div
                                                  style={{
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    gap: 12,
                                                  }}
                                                >
                                                  <div>
                                                    <div style={{ fontWeight: 800 }}>
                                                      {productManagesLots(product)
                                                        ? `Lotto ${lot.lot}`
                                                        : "Disponibilità generica"}
                                                    </div>
                                                    {productManagesLots(product) ? (
                                                      <div style={{ marginTop: 6, color: "#66758b" }}>
                                                        Scadenza {fmtDate(lot.expiry)}
                                                      </div>
                                                    ) : null}
                                                  </div>

                                                  <div
                                                    style={{
                                                      display: "flex",
                                                      gap: 8,
                                                      alignItems: "center",
                                                    }}
                                                  >
                                                    <div
                                                      style={{
                                                        display: "grid",
                                                        gap: 6,
                                                        minWidth: 96,
                                                        textAlign: "right",
                                                      }}
                                                    >
                                                      <span style={badgeStyle("outline")}>
                                                        Totale lotto {Number(lot.loadedQty || 0)}
                                                      </span>
                                                    </div>

                                                    <button
                                                      style={btnStyle("outline")}
                                                      onClick={() => openEditLotDialog(lot)}
                                                    >
                                                      <Pencil size={16} />
                                                    </button>

                                                    {Number(lot.loadedQty || 0) <= 0 ? (
                                                      <button
                                                        style={btnStyle("outline")}
                                                        onClick={() => archiveLot(lot.id)}
                                                        disabled={
                                                          (lotAssignedMap[String(lot.id)]?.assigned || 0) > 0
                                                        }
                                                        title="Archivia lotto a zero"
                                                      >
                                                        <Archive size={16} />
                                                      </button>
                                                    ) : null}

                                                    <button
                                                      style={btnStyle("outline")}
                                                      onClick={() => deleteLot(lot.id)}
                                                      disabled={
                                                        (lotAssignedMap[String(lot.id)]?.assigned || 0) > 0
                                                      }
                                                    >
                                                      <Trash2 size={16} />
                                                    </button>
                                                  </div>
                                                </div>
                                              </div>
                                            ))
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        <Modal
          open={assignDialogOpen}
          title="Assegna lotto"
          onClose={() => setAssignDialogOpen(false)}
          maxWidth={560}
        >
          {selectedLine && (
            <div style={{ display: "grid", gap: 18 }}>
              <div style={{ ...cardStyle({ background: "#f8fafc" }), padding: 16 }}>
                <div style={{ fontWeight: 800 }}>
                  {productMap[String(selectedLine.productId)]?.name}
                </div>
                <div style={{ color: "#66758b", marginTop: 6 }}>
                  Da assegnare: {selectedLine.qtyToAssign}
                </div>
              </div>

              <div>
                <label style={labelStyle()}>Lotto</label>

                <select
                  style={inputStyle()}
                  value={selectedLotId}
                  onChange={(event) => handleLotSelect(event.target.value)}
                >
                  <option value="">Seleziona lotto</option>

                  {availableLotsForSelectedLine.map((lot) => {
                    const info = lotAssignedMap[String(lot.id)] || {};
                    const disp = Number(info.assignable ?? 0);
                    const giac = Number(info.total || 0);
                    return (
                      <option key={lot.id} value={String(lot.id)}>
                        {lot.lot} · scad. {fmtDate(lot.expiry)} · disp. {disp}
                        {disp === 0 && giac > 0 ? ` (giac. ${giac})` : ""}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label style={labelStyle()}>Quantità</label>

                <input
                  style={inputStyle()}
                  type="number"
                  min="0"
                  value={assignQty}
                  onChange={(event) => setAssignQty(event.target.value)}
                  placeholder="0"
                />

                <div style={{ marginTop: 8, color: "#66758b", fontSize: 14 }}>
                  Quantità proposta in automatico, ma modificabile a mano.
                </div>
              </div>

              <button style={btnStyle("primary")} onClick={confirmAssignment}>
                Conferma lotto
              </button>
            </div>
          )}
        </Modal>

        <Modal
          open={orderDialogOpen}
          title="Nuovo ordine"
          onClose={() => setOrderDialogOpen(false)}
          maxWidth={760}
        >
          <div style={{ display: "grid", gap: 18 }}>
            <div>
              <label style={labelStyle()}>Nome ordine / cliente</label>

              <input
                style={inputStyle()}
                value={newOrderCustomer}
                onChange={(event) => setNewOrderCustomer(event.target.value)}
                placeholder="Nome ordine o cliente"
              />
            </div>

            <div>
              <label style={labelStyle()}>Note ordine</label>

              <textarea
                style={{ ...inputStyle(), minHeight: 94, resize: "vertical" }}
                value={newOrderNotes}
                onChange={(event) => setNewOrderNotes(event.target.value)}
                placeholder="Es. urgenze, consegna, corriere, indicazioni operatore..."
              />
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Righe ordine</div>

              {newOrderLines.map((line, index) => (
                <div
                  key={index}
                  style={{
                    border: "1px solid #dbe2ea",
                    borderRadius: 18,
                    padding: 14,
                    display: "grid",
                    gap: 12,
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      fontWeight: 800,
                      color: "#40516a",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!line.isOutsideStock}
                      onChange={(event) => {
                        updateNewOrderLine(index, "isOutsideStock", event.target.checked);
                        updateNewOrderLine(index, "productId", "");
                        updateNewOrderLine(index, "productSearch", "");
                      }}
                    />
                    Riga fuori magazzino
                  </label>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: responsiveOrderLineColumns,
                      gap: 12,
                    }}
                  >
                    {line.isOutsideStock ? (
                      <input
                        style={inputStyle()}
                        value={line.customName || ""}
                        onChange={(event) =>
                          updateNewOrderLine(index, "customName", event.target.value)
                        }
                        placeholder="Nome articolo fuori magazzino"
                      />
                    ) : (
                      <ProductSearchSelect
                        products={products}
                        value={line.productId}
                        search={line.productSearch || ""}
                        onSearchChange={(value) =>
                          updateNewOrderLine(index, "productSearch", value)
                        }
                        onChange={(value) => {
                          updateNewOrderLine(index, "productId", value);
                          // se cambio prodotto, resetto la selezione lotto.
                          updateNewOrderLine(index, "lotId", "");
                        }}
                      />
                    )}

                    <input
                      style={inputStyle()}
                      type="number"
                      min="1"
                      value={line.qtyOrdered}
                      onChange={(event) =>
                        updateNewOrderLine(index, "qtyOrdered", event.target.value)
                      }
                      placeholder="Quantità"
                    />

                    <button style={btnStyle("outline")} onClick={() => removeNewOrderLine(index)}>
                      Rimuovi
                    </button>
                  </div>

                  {/* Selettore lotto: visibile solo per righe di magazzino con prodotto scelto. */}
                  {!line.isOutsideStock && line.productId && (() => {
                    const prod = products.find((p) => String(p.id) === String(line.productId));
                    if (!prod || !productManagesLots(prod)) return null;
                    const productLots = lots
                      .filter((lot) => !lot.archived && String(lot.productId) === String(line.productId))
                      .map((lot) => {
                        const info = lotAssignedMap[String(lot.id)] || {};
                        return {
                          id: String(lot.id),
                          lot: lot.lot || "",
                          expiry: lot.expiry ? String(lot.expiry).slice(0, 10) : "",
                          available: Number(info.assignable ?? lot.loadedQty ?? 0),
                        };
                      })
                      .filter((l) => l.available > 0)
                      .sort((a, b) => String(a.expiry).localeCompare(String(b.expiry)));
                    const qtyN = Number(line.qtyOrdered) || 0;
                    const selectedLot = productLots.find((l) => l.id === String(line.lotId));
                    const tooLittle = selectedLot && qtyN > 0 && selectedLot.available < qtyN;
                    return (
                      <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontSize: 12, color: "#5a6e90", fontWeight: 700 }}>
                          Lotto da assegnare (opzionale, scadenza più vicina prima)
                        </label>
                        <select
                          style={inputStyle()}
                          value={line.lotId || ""}
                          onChange={(event) => updateNewOrderLine(index, "lotId", event.target.value)}
                        >
                          <option value="">— Assegna dopo (lasciamo libero) —</option>
                          {productLots.map((l) => (
                            <option key={l.id} value={l.id} disabled={l.available <= 0}>
                              {l.lot || "(senza codice)"} {l.expiry ? `· scad. ${l.expiry}` : ""} · disp. {l.available}
                              {l.available <= 0 ? " (esaurito)" : ""}
                            </option>
                          ))}
                          {productLots.length === 0 && (
                            <option value="" disabled>
                              Nessun lotto disponibile per questo prodotto
                            </option>
                          )}
                        </select>
                        {tooLittle && (
                          <div style={{ fontSize: 12, color: "#b45309" }}>
                            Disponibilità del lotto selezionato ({selectedLot.available}) inferiore alla quantità richiesta ({qtyN}). Verrà assegnato il massimo possibile, il resto resta da assegnare.
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ))}

              <button style={btnStyle("outline")} onClick={addEmptyOrderLine}>
                <Plus size={16} /> Aggiungi riga
              </button>
            </div>

            <button style={btnStyle("primary")} onClick={createOrder}>
              Crea ordine
            </button>
          </div>
        </Modal>

        <Modal
          open={editOrderDialogOpen}
          title="Modifica ordine"
          onClose={() => setEditOrderDialogOpen(false)}
          maxWidth={620}
        >
          <div style={{ display: "grid", gap: 18 }}>
            <div>
              <label style={labelStyle()}>Nome ordine / cliente</label>

              <input
                style={inputStyle()}
                value={editOrderCustomer}
                onChange={(event) => setEditOrderCustomer(event.target.value)}
                placeholder="Nome ordine o cliente"
              />
            </div>

            <div>
              <label style={labelStyle()}>Note ordine</label>

              <textarea
                style={{ ...inputStyle(), minHeight: 120, resize: "vertical" }}
                value={editOrderNotes}
                onChange={(event) => setEditOrderNotes(event.target.value)}
                placeholder="Note descrittive per admin/operatore"
              />
            </div>

            <button
              style={btnStyle("primary", savingEditedOrder)}
              disabled={savingEditedOrder}
              onClick={saveEditedOrder}
            >
              {savingEditedOrder ? "Salvataggio..." : "Salva ordine"}
            </button>
          </div>
        </Modal>

        <Modal
          open={adminDialogOpen}
          title="Accesso admin"
          onClose={() => setAdminDialogOpen(false)}
          maxWidth={420}
        >
          <div style={{ display: "grid", gap: 18 }}>
            <div>
              <label style={labelStyle()}>PIN</label>

              <input
                style={inputStyle()}
                type="password"
                value={adminPinInput}
                onChange={(event) => setAdminPinInput(event.target.value)}
                placeholder="Inserisci PIN"
              />
            </div>

            {adminError ? <div style={{ color: "#dc2626" }}>{adminError}</div> : null}

            <button style={btnStyle("primary")} onClick={handleAdminAccess}>
              Entra in admin
            </button>
          </div>
        </Modal>

        <Modal
          open={editProductDialogOpen}
          title="Modifica prodotto"
          onClose={() => setEditProductDialogOpen(false)}
          maxWidth={560}
        >
          <div style={{ display: "grid", gap: 18 }}>
            <div>
              <label style={labelStyle()}>Codice prodotto</label>

              <input
                style={inputStyle()}
                value={editProductCode}
                onChange={(event) => setEditProductCode(event.target.value)}
              />
            </div>

            <div>
              <label style={labelStyle()}>Descrizione</label>

              <input
                style={inputStyle()}
                value={editProductName}
                onChange={(event) => setEditProductName(event.target.value)}
              />
            </div>

            <div>
              <label style={labelStyle()}>Unità di misura</label>

              <input
                style={inputStyle()}
                value={editProductUom}
                onChange={(event) => setEditProductUom(event.target.value)}
              />
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: 14,
                border: "1px solid #dbe2ea",
                borderRadius: 16,
                background: "#f8fafc",
                fontWeight: 800,
              }}
            >
              <input
                type="checkbox"
                checked={editProductManagesLots}
                onChange={(event) => setEditProductManagesLots(event.target.checked)}
              />
              Gestisci lotti e scadenze per questo prodotto
            </label>

            <button
              style={btnStyle("primary", savingProduct)}
              disabled={savingProduct}
              onClick={saveEditedProduct}
            >
              {savingProduct ? "Salvataggio..." : "Salva modifiche"}
            </button>
          </div>
        </Modal>

        <Modal open={addLineDialogOpen} title="Aggiungi riga ordine" onClose={() => setAddLineDialogOpen(false)} maxWidth={560}>
          <div style={{ display: "grid", gap: 18 }}>
            <div style={{ ...cardStyle({ background: "#f8fafc" }), padding: 14 }}>
              <div style={{ fontWeight: 800 }}>Ordine {selectedOrder?.id}</div>
              <div style={{ marginTop: 4, color: "#66758b" }}>
                {selectedOrder?.customer}
              </div>
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: 14,
                border: "1px solid #dbe2ea",
                borderRadius: 16,
                background: "#f8fafc",
                fontWeight: 800,
              }}
            >
              <input
                type="checkbox"
                checked={newLineIsOutsideStock}
                onChange={(event) => {
                  setNewLineIsOutsideStock(event.target.checked);
                  setNewLineProductId("");
                  setNewLineProductSearch("");
                  setNewLineCustomName("");
                }}
              />
              Riga fuori magazzino
            </label>

            {newLineIsOutsideStock ? (
              <div>
                <label style={labelStyle()}>Nome articolo fuori magazzino</label>
                <input
                  style={inputStyle()}
                  value={newLineCustomName}
                  onChange={(event) => setNewLineCustomName(event.target.value)}
                  placeholder="Es. prodotto speciale / omaggio / extra"
                />
              </div>
            ) : (
              <div>
                <label style={labelStyle()}>Prodotto</label>
                <ProductSearchSelect
                  products={products}
                  value={newLineProductId}
                  search={newLineProductSearch}
                  onSearchChange={setNewLineProductSearch}
                  onChange={setNewLineProductId}
                />
              </div>
            )}

            <div>
              <label style={labelStyle()}>Quantità ordinata</label>
              <input
                style={inputStyle()}
                type="number"
                min="1"
                value={newLineQty}
                onChange={(event) => setNewLineQty(event.target.value)}
                placeholder="0"
              />
            </div>

            <button
              style={btnStyle("primary", savingNewLine)}
              disabled={savingNewLine}
              onClick={createOrderLine}
            >
              {savingNewLine ? "Salvataggio..." : "Aggiungi riga"}
            </button>
          </div>
        </Modal>

        <Modal open={editLineDialogOpen} title="Modifica quantità riga" onClose={() => setEditLineDialogOpen(false)} maxWidth={460}>
          <div style={{ display: "grid", gap: 18 }}>
            <div>
              <label style={labelStyle()}>Quantità ordinata</label>
              <input
                style={inputStyle()}
                type="number"
                min="1"
                value={editingLineQty}
                onChange={(event) => setEditingLineQty(event.target.value)}
                placeholder="0"
              />
            </div>

            <button
              style={btnStyle("primary", savingEditedLine)}
              disabled={savingEditedLine}
              onClick={saveEditedOrderLine}
            >
              {savingEditedLine ? "Salvataggio..." : "Salva quantità"}
            </button>
          </div>
        </Modal>

        <Modal
          open={productDialogOpen}
          title="Nuovo prodotto"
          onClose={() => setProductDialogOpen(false)}
          maxWidth={560}
        >
          <div style={{ display: "grid", gap: 18 }}>
            <div>
              <label style={labelStyle()}>Codice prodotto</label>

              <input
                style={inputStyle()}
                value={newProductCode}
                onChange={(event) => setNewProductCode(event.target.value)}
                placeholder="Es. NFARMA 014"
              />
            </div>

            <div>
              <label style={labelStyle()}>Descrizione</label>

              <input
                style={inputStyle()}
                value={newProductName}
                onChange={(event) => setNewProductName(event.target.value)}
                placeholder="Es. Mezzi paccheri 250"
              />
            </div>

            <div>
              <label style={labelStyle()}>Unità di misura</label>

              <input
                style={inputStyle()}
                value={newProductUom}
                onChange={(event) => setNewProductUom(event.target.value)}
                placeholder="pz"
              />
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: 14,
                border: "1px solid #dbe2ea",
                borderRadius: 16,
                background: "#f8fafc",
                fontWeight: 800,
              }}
            >
              <input
                type="checkbox"
                checked={newProductManagesLots}
                onChange={(event) => setNewProductManagesLots(event.target.checked)}
              />
              Gestisci lotti e scadenze per questo prodotto
            </label>

            <button
              style={btnStyle("primary", savingNewProduct)}
              disabled={savingNewProduct}
              onClick={createProduct}
            >
              {savingNewProduct ? "Salvataggio..." : "Salva prodotto"}
            </button>
          </div>
        </Modal>

        <Modal
          open={editLotDialogOpen}
          title="Modifica lotto / disponibilità"
          onClose={() => setEditLotDialogOpen(false)}
          maxWidth={560}
        >
          <div style={{ display: "grid", gap: 18 }}>
            <div>
              <label style={labelStyle()}>Codice lotto (solo lettura)</label>

              <input
                style={inputStyle()}
                value={editingLotCode}
                readOnly
                placeholder="Codice lotto non modificabile dall'app"
              />
            </div>

            <div>
              <label style={labelStyle()}>Scadenza</label>

              <input
                style={inputStyle()}
                type="date"
                value={editingLotExpiry}
                onChange={(event) => setEditingLotExpiry(event.target.value)}
              />
            </div>

            <div>
              <label style={labelStyle()}>Quantità presente</label>

              <input
                style={inputStyle()}
                type="number"
                min="0"
                value={editingLotQty}
                onChange={(event) => setEditingLotQty(event.target.value)}
                placeholder="0"
              />
            </div>

            <button
              style={btnStyle("primary", savingEditedLot)}
              disabled={savingEditedLot}
              onClick={saveEditedLot}
            >
              {savingEditedLot ? "Salvataggio..." : "Salva modifiche lotto"}
            </button>
          </div>
        </Modal>

        <Modal
          open={lotDialogOpen}
          title={selectedLotProduct && !productManagesLots(selectedLotProduct) ? "Carica disponibilità" : "Carica lotto"}
          onClose={() => setLotDialogOpen(false)}
          maxWidth={560}
        >
          <div style={{ display: "grid", gap: 18 }}>
            <div>
              <label style={labelStyle()}>Prodotto</label>

              <ProductSearchSelect
                products={products}
                value={newLotProductId}
                search={newLotProductSearch}
                onSearchChange={setNewLotProductSearch}
                onChange={setNewLotProductId}
                placeholder="Cerca prodotto per codice o descrizione"
              />
            </div>

            {selectedLotProduct && productManagesLots(selectedLotProduct) ? (
              <>
                <div>
                  <label style={labelStyle()}>Codice lotto</label>

                  <input
                    style={inputStyle()}
                    value={newLotCode}
                    onChange={(event) => setNewLotCode(event.target.value)}
                    placeholder="Es. 2604110"
                  />
                </div>

                <div>
                  <label style={labelStyle()}>Scadenza</label>

                  <input
                    style={inputStyle()}
                    type="date"
                    value={newLotExpiry}
                    onChange={(event) => setNewLotExpiry(event.target.value)}
                  />
                </div>
              </>
            ) : (
              <div style={{ ...cardStyle({ background: "#f8fafc" }), padding: 14, color: "#40516a" }}>
                Questo prodotto è impostato su disponibilità generica: carichi solo una quantità, senza lotto e senza scadenza.
              </div>
            )}

            <div>
              <label style={labelStyle()}>Quantità caricata</label>

              <input
                style={inputStyle()}
                type="number"
                min="1"
                value={newLotQty}
                onChange={(event) => setNewLotQty(event.target.value)}
                placeholder="0"
              />
            </div>

            <button style={btnStyle("primary")} onClick={createLot}>
              {selectedLotProduct && !productManagesLots(selectedLotProduct) ? "Salva disponibilità" : "Salva lotto"}
            </button>
          </div>
        </Modal>
      </div>
    </div>
  );
}
