// versione UI categorie a sezioni + delete lotto robusto
import React, { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";

const SHEETS_API_URL =
  "https://script.google.com/macros/s/AKfycbwaR6EycWBN5xoLWqu6oEDnnqbjPFdJR9wTXaA63qLgrl0kmZccn6C45KiutLGhgnGj/exec";
const ADMIN_PIN = "1234";

const fallbackProducts = [
  { id: "1", code: "NFARMA 013", name: "Pici 250", uom: "pz", category: "", subcategory: "" },
  { id: "2", code: "NFARMA 007", name: "Tonnarelli 250", uom: "pz", category: "", subcategory: "" },
];

const fallbackLots = [
  { id: "1", productId: "1", lot: "2604104", expiry: "2026-05-06", loadedQty: 34 },
  { id: "2", productId: "2", lot: "2604108", expiry: "2026-05-08", loadedQty: 18 },
];

function callSheetsApi(params = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = `jsonpCallback_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    let script;

    const cleanup = () => {
      try {
        delete window[callbackName];
      } catch (error) {
        // Ignora errori di pulizia del callback.
      }

      if (script && script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };

    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };

    const queryParts = [];

    Object.keys(params).forEach((key) => {
      const value = params[key];

      if (value !== undefined && value !== null && value !== "") {
        queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
      }
    });

    queryParts.push(`callback=${encodeURIComponent(callbackName)}`);

    script = document.createElement("script");
    script.src = `${SHEETS_API_URL}?${queryParts.join("&")}`;
    script.async = true;

    script.onerror = () => {
      cleanup();
      reject(new Error("Errore di collegamento con Google Sheet"));
    };

    document.body.appendChild(script);
  });
}

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
          getField(row, ["ID_Lotto", "Id_Lotto", "id", "Lotto", "Codice_Lotto", "Codice lotto"]) ||
            `LOT-${index + 1}`
        ),
        productId: productByCode[productCode] || productById[productIdRaw] || productIdRaw,
        lot: String(getField(row, ["Codice_Lotto", "Codice lotto", "Lotto"])).trim(),
        expiry: getField(row, ["Scadenza", "Data_Scadenza", "Data scadenza"]),
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
      status: String(getField(row, ["Stato", "status"]) || "Da preparare"),
      date: getField(row, ["Data_Ordine", "Data ordine", "Data", "date"]),
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

      return {
        lineId: String(getField(row, ["ID_Riga", "Id_Riga", "id"]) || `RIGA-${index + 1}`),
        orderId: String(getField(row, ["ID_Ordine", "Id_Ordine", "Ordine"])).trim(),
        productId: productByCode[productCode] || productById[productIdRaw] || productIdRaw,
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
  const lotByCode = Object.fromEntries(lots.map((lot) => [String(lot.lot), lot.id]));
  const grouped = {};

  rows.forEach((row, index) => {
    const lineId = String(getField(row, ["ID_Riga", "Id_Riga", "Riga"])).trim();
    if (!lineIds.has(lineId)) return;

    const lotCode = String(
      getField(row, ["Lotto", "Codice_Lotto", "Codice lotto", "ID_Lotto"])
    ).trim();

    const lotId = lotByCode[lotCode] || lotCode;
    if (!lotId) return;

    const item = {
      assignmentId: String(
        getField(row, ["ID_Assegnazione", "Id_Assegnazione", "id"]) || `ASS-${index + 1}`
      ),
      lotId,
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
  const [assignments, setAssignments] = useState({});
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedLotId, setSelectedLotId] = useState("");
  const [assignQty, setAssignQty] = useState("");

  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [addLineDialogOpen, setAddLineDialogOpen] = useState(false);
  const [editLineDialogOpen, setEditLineDialogOpen] = useState(false);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [lotDialogOpen, setLotDialogOpen] = useState(false);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [editProductDialogOpen, setEditProductDialogOpen] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPinInput, setAdminPinInput] = useState("");
  const [adminError, setAdminError] = useState("");

  const [newOrderCustomer, setNewOrderCustomer] = useState("");
  const [newOrderLines, setNewOrderLines] = useState([{ productId: "", qtyOrdered: "" }]);

  const [newLineProductId, setNewLineProductId] = useState("");
  const [newLineQty, setNewLineQty] = useState("");
  const [savingNewLine, setSavingNewLine] = useState(false);

  const [editingLineId, setEditingLineId] = useState("");
  const [editingLineQty, setEditingLineQty] = useState("");
  const [savingEditedLine, setSavingEditedLine] = useState(false);

  const [newProductCode, setNewProductCode] = useState("");
  const [newProductName, setNewProductName] = useState("");
  const [newProductUom, setNewProductUom] = useState("pz");
  const [savingNewProduct, setSavingNewProduct] = useState(false);

  const [newLotProductId, setNewLotProductId] = useState("");
  const [newLotCode, setNewLotCode] = useState("");
  const [newLotExpiry, setNewLotExpiry] = useState("");
  const [newLotQty, setNewLotQty] = useState("");

  const [editingProductId, setEditingProductId] = useState(null);
  const [editProductCode, setEditProductCode] = useState("");
  const [editProductName, setEditProductName] = useState("");
  const [editProductUom, setEditProductUom] = useState("pz");
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
      const raw = await callSheetsApi();

      const normalizedProducts = normalizeProducts(raw.prodotti || []);
      const safeProducts = normalizedProducts.length ? normalizedProducts : fallbackProducts;
      const normalizedLots = normalizeLots(raw.lotti || [], safeProducts);
      const safeLots = normalizedLots.length ? normalizedLots : fallbackLots;
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

  const lotsAvailableMap = useMemo(() => {
    const usedByLot = {};

    Object.values(assignments)
      .flat()
      .forEach((assignment) => {
        usedByLot[String(assignment.lotId)] =
          (usedByLot[String(assignment.lotId)] || 0) + assignment.qty;
      });

    return Object.fromEntries(
      lots.map((lot) => [
        String(lot.id),
        Math.max(0, lot.loadedQty - (usedByLot[String(lot.id)] || 0)),
      ])
    );
  }, [lots, assignments]);

  const ordersWithComputed = useMemo(() => {
    return orders.map((order) => {
      const lines = (order.lines || []).map((line) => {
        const assignedFromAssignments = (assignments[line.lineId] || []).reduce(
          (sum, assignment) => sum + assignment.qty,
          0
        );

        const assignedQty = assignedFromAssignments;

        const qtyToAssign = Math.max(0, line.qtyOrdered - assignedQty);

        return { ...line, assignedQty, qtyToAssign };
      });

      const totalToAssign = lines.reduce((sum, line) => sum + line.qtyToAssign, 0);
      const totalOrdered = lines.reduce((sum, line) => sum + line.qtyOrdered, 0);

      const explicitStatus = String(order.status || "");
      const computedStatus =
        explicitStatus === "Preparato"
          ? "Preparato"
          : totalToAssign === 0
            ? "Preparato"
            : totalToAssign < totalOrdered
              ? "Parziale"
              : "Da preparare";

      return { ...order, lines, totalToAssign, computedStatus };
    });
  }, [orders, assignments]);

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    const visibleOrders = ordersWithComputed
      .filter((order) => String(order.computedStatus) !== "Preparato" || !q)
      .sort((a, b) => {
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

  const selectedOrder =
    ordersWithComputed.find((order) => String(order.id) === String(selectedOrderId)) ||
    ordersWithComputed[0];

  const selectedLine =
    selectedOrder?.lines.find((line) => String(line.lineId) === String(selectedLineId)) ||
    selectedOrder?.lines[0];

  const selectedOrderLines = useMemo(() => {
    if (!selectedOrder?.lines) return [];

    return [...selectedOrder.lines].sort((a, b) => {
      const aDone = a.qtyToAssign <= 0 ? 1 : 0;
      const bDone = b.qtyToAssign <= 0 ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return String(a.lineId).localeCompare(String(b.lineId));
    });
  }, [selectedOrder]);

  const selectedOrderCompletedLines = selectedOrderLines.filter(
    (line) => line.qtyToAssign <= 0
  ).length;

  const availableLotsForSelectedLine = useMemo(() => {
    if (!selectedLine) return [];

    return lots
      .filter(
        (lot) =>
          String(lot.productId) === String(selectedLine.productId) &&
          lotsAvailableMap[String(lot.id)] > 0
      )
      .sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
  }, [selectedLine, lots, lotsAvailableMap]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();

    return products
      .map((product) => {
        const productLots = lots.filter((lot) => String(lot.productId) === String(product.id));
        const totalAvailable = productLots.reduce(
          (sum, lot) => sum + (lotsAvailableMap[String(lot.id)] || 0),
          0
        );

        return { ...product, productLots, totalAvailable };
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
    lots,
    lotsAvailableMap,
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
          totalAvailable: 0,
          totalLots: 0,
          subcategories: {},
        };
      }

      groups[category].products.push(product);
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

    return lots
      .filter(
        (lot) =>
          String(lot.productId) === String(line.productId) &&
          lotsAvailableMap[String(lot.id)] > 0
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

    if (!form.lotId || !form.qty) {
      alert("Seleziona lotto e quantità");
      return;
    }

    const qty = Number(form.qty);

    if (!qty || qty <= 0) {
      alert("Inserisci una quantità valida");
      return;
    }

    const selectedLot = lots.find((lot) => String(lot.id) === String(form.lotId));

    if (!selectedLot) {
      alert("Lotto non trovato");
      return;
    }

    const available = lotsAvailableMap[String(form.lotId)] || 0;

    if (qty > available) {
      alert("La quantità supera la disponibilità del lotto");
      return;
    }

    if (qty > line.qtyToAssign) {
      alert("La quantità supera il residuo da assegnare");
      return;
    }

    const newAssignment = {
      assignmentId: `ASS-${Date.now()}`,
      lineId: String(line.lineId),
      lotId: String(form.lotId),
      lotCode: selectedLot.lot,
      qty,
    };

    // Aggiornamento immediato dell'interfaccia: l'operatore non aspetta Google Sheet.
    setAssignments((prev) => ({
      ...prev,
      [line.lineId]: [
        ...(prev[line.lineId] || []),
        { assignmentId: newAssignment.assignmentId, lotId: String(form.lotId), qty },
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

    const available = lotsAvailableMap[String(selectedLotId)] || 0;

    if (qty > available) {
      alert("La quantità supera la disponibilità del lotto");
      return;
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
      qty,
    };

    const previousLotId = selectedLotId;
    const previousQty = assignQty;

    setAssignments((prev) => ({
      ...prev,
      [selectedLine.lineId]: [
        ...(prev[selectedLine.lineId] || []),
        { assignmentId: newAssignment.assignmentId, lotId: String(selectedLotId), qty },
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

  const markOrderPrepared = async () => {
    if (!selectedOrder) return;

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
            ? { ...order, status: "Preparato" }
            : order
        )
      );

      
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    }
  };

  const addEmptyOrderLine = () => {
    setNewOrderLines((prev) => [...prev, { productId: "", qtyOrdered: "" }]);
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
      alert("Inserisci il cliente");
      return;
    }

    const validLines = newOrderLines
      .filter((line) => line.productId && Number(line.qtyOrdered) > 0)
      .map((line, index) => {
        const product = products.find((p) => String(p.id) === String(line.productId));

        return {
          lineId: `RIGA-${Date.now()}-${index}`,
          productId: String(line.productId),
          productCode: product?.code || "",
          productName: product?.name || "",
          qtyOrdered: Number(line.qtyOrdered),
        };
      });

    if (validLines.length === 0) {
      alert("Inserisci almeno una riga ordine valida con prodotto e quantità");
      return;
    }

    const newOrder = {
      id: `ORD-${Date.now()}`,
      customer: newOrderCustomer.trim(),
      status: "Da preparare",
      date: new Date().toISOString().slice(0, 10),
      lines: validLines,
    };

    try {
      const result = await callSheetsApi({
        action: "createOrder",
        payload: JSON.stringify({
          id: newOrder.id,
          customer: newOrder.customer,
          status: newOrder.status,
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
      setNewOrderLines([{ productId: "", qtyOrdered: "" }]);
      setOrderDialogOpen(false);
      setPage("ordini");

      
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    }
  };

  const deleteOrder = async (orderId) => {
    if (!orderId) return;

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
        const orderToDelete = orders.find((order) => String(order.id) === String(orderId));

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
    if (!newLotProductId) {
      alert("Seleziona il prodotto");
      return;
    }

    if (!newLotCode.trim()) {
      alert("Inserisci il codice lotto");
      return;
    }

    if (!newLotExpiry) {
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
      lot: newLotCode.trim(),
      expiry: newLotExpiry,
      loadedQty: Number(newLotQty),
    };

    try {
      const result = await callSheetsApi({
        action: "createLot",
        payload: JSON.stringify(newLot),
      });

      if (!result || !result.success) {
        alert(
          "Errore nel salvataggio lotto sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setLots((prev) => [newLot, ...prev]);
      setNewLotProductId("");
      setNewLotCode("");
      setNewLotExpiry("");
      setNewLotQty("");
      setLotDialogOpen(false);
      setPage("prodotti");

      
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
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
        },
        ...prev,
      ]);

      setNewProductCode("");
      setNewProductName("");
      setNewProductUom("pz");
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
              }
            : product
        )
      );

      setEditProductDialogOpen(false);
      setEditingProductId(null);
      setEditProductCode("");
      setEditProductName("");
      setEditProductUom("pz");

      
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

    if (!newLineProductId) {
      alert("Seleziona il prodotto");
      return;
    }

    const qtyOrdered = Number(newLineQty);

    if (!qtyOrdered || qtyOrdered <= 0) {
      alert("Inserisci una quantità valida");
      return;
    }

    const product = products.find((item) => String(item.id) === String(newLineProductId));

    if (!product) {
      alert("Prodotto non trovato");
      return;
    }

    const newLine = {
      lineId: `RIGA-${Date.now()}`,
      orderId: selectedOrder.id,
      productId: String(product.id),
      productCode: product.code || product.id,
      qtyOrdered,
      qtyAssignedFromSheet: 0,
    };

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
    setNewLineQty("");

    try {
      const result = await callSheetsApi({
        action: "addOrderLine",
        payload: JSON.stringify({
          orderId: selectedOrder.id,
          lineId: newLine.lineId,
          productId: product.code || product.id,
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

    // Aggiornamento immediato dell'interfaccia: il residuo torna subito disponibile.
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

      // Alcuni fogli hanno come chiave ID_Lotto, altri Codice_Lotto.
      // Se il primo tentativo non trova la riga, riproviamo con il codice lotto visibile.
      if ((!result || !result.success) && String(lotCodeToDelete) !== String(lotIdToDelete)) {
        result = await callSheetsApi({
          action: "deleteLot",
          lotId: lotCodeToDelete,
        });
      }

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
            ...cardStyle({ background: "linear-gradient(135deg, #ffffff 0%, #f8fbff 100%)" }),
            padding: isSmallLayout ? 16 : 22,
            marginBottom: 20,
            position: "sticky",
            top: 10,
            zIndex: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 14,
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontSize: isSmallLayout ? 26 : 34, fontWeight: 950, color: "#07153a", letterSpacing: "-0.04em" }}>
                  MAGAZZINO 2.0
                </div>
                <span style={badgeStyle(isAdmin ? "dark" : "outline")}>
                  {isAdmin ? "ADMIN" : "OPERATORE"}
                </span>
              </div>
              <div style={{ marginTop: 6, color: "#65758f", fontSize: 14, fontWeight: 650 }}>
                Preparazione ordini · lotti · disponibilità
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: isSmallLayout ? "stretch" : "flex-end", flex: 1 }}>
              <button
                style={btnStyle(page === "ordini" ? "primary" : "soft")}
                onClick={() => setPage("ordini")}
              >
                <ClipboardList size={18} /> Ordini
              </button>

              <button
                style={btnStyle(page === "prodotti" ? "primary" : "soft")}
                onClick={() => setPage("prodotti")}
              >
                <Package size={18} /> Prodotti
              </button>

              <button style={btnStyle("primary")} onClick={() => setOrderDialogOpen(true)}>
                <Plus size={18} /> Nuovo ordine
              </button>

              {isAdmin && (
                <>
                  <button style={btnStyle("primary")} onClick={() => setProductDialogOpen(true)}>
                    <Plus size={18} /> Nuovo prodotto
                  </button>

                  <button style={btnStyle("primary")} onClick={() => setLotDialogOpen(true)}>
                    <Boxes size={18} /> Carica lotto
                  </button>
                </>
              )}

              <button style={btnStyle("outline")} onClick={loadDataFromSheets}>
                <RefreshCw size={18} /> Aggiorna
              </button>

              {!isAdmin ? (
                <button style={btnStyle("outline")} onClick={() => setAdminDialogOpen(true)}>
                  <Lock size={18} /> Admin
                </button>
              ) : (
                <button style={btnStyle("outline")} onClick={exitAdminMode}>
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
                  placeholder="Cerca ordine o cliente"
                />
              </div>

              <div style={{ display: "grid", gap: 12 }}>
                {filteredOrders.map((order) => (
                  <button
                    key={order.id}
                    onClick={() => {
                      setSelectedOrderId(order.id);
                      setSelectedLineId(order.lines[0]?.lineId || "");
                    }}
                    style={{
                      textAlign: "left",
                      padding: 18,
                      borderRadius: 24,
                      border:
                        selectedOrderId === order.id ? "2px solid #07153a" : "1px solid #dbe2ea",
                      background: selectedOrderId === order.id ? "linear-gradient(135deg, #f8fbff, #eef4ff)" : "#fff",
                      cursor: "pointer",
                      boxShadow: selectedOrderId === order.id ? "0 12px 24px rgba(7,21,58,0.10)" : "0 5px 14px rgba(15,23,42,0.04)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 17, fontWeight: 950, color: "#07153a", overflowWrap: "anywhere" }}>{order.id}</div>
                        <div style={{ color: "#66758b", marginTop: 4 }}>{order.customer}</div>
                      </div>

                      <span style={badgeStyle(order.totalToAssign > 0 ? "warning" : "success")}>{order.computedStatus}</span>
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
                        <div style={{ fontSize: isSmallLayout ? 20 : 24, fontWeight: 950, color: "#07153a", overflowWrap: "anywhere" }}>{selectedOrder.id}</div>

                        <div style={{ marginTop: 6, color: "#66758b" }}>
                          {selectedOrder.customer} · {fmtDate(selectedOrder.date)}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {isAdmin ? (
                          <button style={btnStyle("primary")} onClick={openAddLineDialog}>
                            <Plus size={16} /> Riga
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
                                  {product?.code || line.productId}
                                </span>
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
                                {product?.name}
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
                                    Quantità completata
                                  </span>
                                  {isAdmin ? (
                                    <div
                                      style={{
                                        display: "flex",
                                        gap: 8,
                                        width: isSmallLayout ? "100%" : "auto",
                                      }}
                                    >
                                      <button
                                        style={{
                                          ...compactBtnStyle("outline"),
                                          width: isSmallLayout ? "100%" : "auto",
                                        }}
                                        onClick={() => openEditLineDialog(line)}
                                      >
                                        Qtà
                                      </button>

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
                                    {availableLots.map((lot) => (
                                      <option key={lot.id} value={String(lot.id)}>
                                        {lot.lot} · scad. {fmtDate(lot.expiry)} · disp.{" "}
                                        {lotsAvailableMap[String(lot.id)]}
                                      </option>
                                    ))}
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
                    <button style={btnStyle("success")} onClick={markOrderPrepared}>
                      <CheckCircle2 size={18} /> Segna ordine preparato
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ color: "#66758b" }}>Seleziona un ordine.</div>
              )}
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
                            {group.products.length} prodotti · {group.totalLots} lotti · {group.totalAvailable} disponibili
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
                                              <AlertTriangle size={16} /> Nessun lotto disponibile
                                            </div>
                                          </div>
                                        ) : (
                                          product.productLots
                                            .sort((a, b) => new Date(a.expiry) - new Date(b.expiry))
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
                                                      Lotto {lot.lot}
                                                    </div>
                                                    <div style={{ marginTop: 6, color: "#66758b" }}>
                                                      Scadenza {fmtDate(lot.expiry)}
                                                    </div>
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
                                                        fontSize: 20,
                                                        fontWeight: 900,
                                                        color:
                                                          lotsAvailableMap[String(lot.id)] <= 10
                                                            ? "#dc2626"
                                                            : "#0f172a",
                                                      }}
                                                    >
                                                      {lotsAvailableMap[String(lot.id)]}
                                                    </div>

                                                    <button
                                                      style={btnStyle("outline")}
                                                      onClick={() => deleteLot(lot.id)}
                                                      disabled={
                                                        lotsAvailableMap[String(lot.id)] !==
                                                        lot.loadedQty
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

                  {availableLotsForSelectedLine.map((lot) => (
                    <option key={lot.id} value={String(lot.id)}>
                      {lot.lot} · scad. {fmtDate(lot.expiry)} · disp.{" "}
                      {lotsAvailableMap[String(lot.id)]}
                    </option>
                  ))}
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
              <label style={labelStyle()}>Cliente</label>

              <input
                style={inputStyle()}
                value={newOrderCustomer}
                onChange={(event) => setNewOrderCustomer(event.target.value)}
                placeholder="Nome cliente"
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
                    gridTemplateColumns: responsiveOrderLineColumns,
                    gap: 12,
                  }}
                >
                  <select
                    style={inputStyle()}
                    value={line.productId}
                    onChange={(event) =>
                      updateNewOrderLine(index, "productId", event.target.value)
                    }
                  >
                    <option value="">Seleziona prodotto</option>

                    {products.map((product) => (
                      <option key={product.id} value={String(product.id)}>
                        {productOptionLabel(product)}
                      </option>
                    ))}
                  </select>

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

            <div>
              <label style={labelStyle()}>Prodotto</label>
              <select
                style={inputStyle()}
                value={newLineProductId}
                onChange={(event) => setNewLineProductId(event.target.value)}
              >
                <option value="">Seleziona prodotto</option>
                {products.map((product) => (
                  <option key={product.id} value={String(product.id)}>
                    {productOptionLabel(product)}
                  </option>
                ))}
              </select>
            </div>

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
          open={lotDialogOpen}
          title="Carica lotto"
          onClose={() => setLotDialogOpen(false)}
          maxWidth={560}
        >
          <div style={{ display: "grid", gap: 18 }}>
            <div>
              <label style={labelStyle()}>Prodotto</label>

              <select
                style={inputStyle()}
                value={newLotProductId}
                onChange={(event) => setNewLotProductId(event.target.value)}
              >
                <option value="">Seleziona prodotto</option>

                {products.map((product) => (
                  <option key={product.id} value={String(product.id)}>
                    {productOptionLabel(product)}
                  </option>
                ))}
              </select>
            </div>

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
              Salva lotto
            </button>
          </div>
        </Modal>
      </div>
    </div>
  );
}
