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
  "https://script.google.com/macros/s/AKfycbxpvYo9fOEE3-_PigVpvbuCJ55YvXbo0i-AZ-zPfxj7MLdpKsFuTHEAurvdZKXwLRen/exec";
const ADMIN_PIN = "1234";

const fallbackProducts = [
  { id: "1", code: "NFARMA 013", name: "Pici 250", uom: "pz" },
  { id: "2", code: "NFARMA 007", name: "Tonnarelli 250", uom: "pz" },
];

const fallbackLots = [
  { id: "1", productId: "1", lot: "2604104", expiry: "2026-05-06", loadedQty: 34 },
  { id: "2", productId: "2", lot: "2604108", expiry: "2026-05-08", loadedQty: 18 },
];

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
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 24,
    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
    ...extra,
  };
}

function btnStyle(variant = "primary", disabled = false) {
  const base = {
    height: 52,
    borderRadius: 18,
    border: "1px solid transparent",
    padding: "0 18px",
    fontSize: 16,
    fontWeight: 700,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    whiteSpace: "nowrap",
  };

  if (variant === "outline") {
    return {
      ...base,
      background: "#fff",
      color: "#14213d",
      border: "1px solid #d7deea",
    };
  }

  if (variant === "soft") {
    return {
      ...base,
      background: "#e9eef6",
      color: "#22304a",
    };
  }

  if (variant === "success") {
    return {
      ...base,
      background: "#187437",
      color: "#fff",
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
    background: "#07153a",
    color: "#fff",
  };
}

function inputStyle() {
  return {
    width: "100%",
    height: 52,
    borderRadius: 18,
    border: "1px solid #d7deea",
    padding: "0 14px",
    fontSize: 16,
    outline: "none",
    background: "#fff",
    boxSizing: "border-box",
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
  return {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 13,
    fontWeight: 600,
    border: kind === "outline" ? "1px solid #d8dee8" : "1px solid #dfeee3",
    background: kind === "outline" ? "#fff" : "#effaf1",
    color: "#243043",
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
      const productIdRaw = String(getField(row, ["ID_Prodotto", "Id_Prodotto", "ProductId"])).trim();

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
      const productIdRaw = String(getField(row, ["ID_Prodotto", "Id_Prodotto", "ProductId"])).trim();

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
  const lineIds = new Set(lines.map((l) => String(l.lineId)));
  const lotByCode = Object.fromEntries(lots.map((l) => [String(l.lot), l.id]));
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
        onClick={(e) => e.stopPropagation()}
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
  const [orderSearch, setOrderSearch] = useState("");
  const [assignments, setAssignments] = useState({});
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedLotId, setSelectedLotId] = useState("");
  const [assignQty, setAssignQty] = useState("");

  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [lotDialogOpen, setLotDialogOpen] = useState(false);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [editProductDialogOpen, setEditProductDialogOpen] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPinInput, setAdminPinInput] = useState("");
  const [adminError, setAdminError] = useState("");

  const [newOrderCustomer, setNewOrderCustomer] = useState("");
  const [newOrderLines, setNewOrderLines] = useState([{ productId: "", qtyOrdered: "" }]);

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

  const loadDataFromSheets = async () => {
    setLoadingData(true);
    setLoadError("");

    try {
      const raw = await new Promise((resolve, reject) => {
        const callbackName = `jsonpCallback_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        let script;

        const cleanup = () => {
          try {
            delete window[callbackName];
          } catch {}
          if (script && script.parentNode) script.parentNode.removeChild(script);
        };

        window[callbackName] = (data) => {
          cleanup();
          resolve(data);
        };

        script = document.createElement("script");
        script.src = `${SHEETS_API_URL}?callback=${callbackName}`;
        script.async = true;
        script.onerror = () => {
          cleanup();
          reject(new Error("Impossibile leggere il foglio Google"));
        };

        document.body.appendChild(script);
      });

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

  const productMap = useMemo(
    () => Object.fromEntries(products.map((p) => [String(p.id), p])),
    [products]
  );

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

        const assignedQty = Math.max(
          Number(line.qtyAssignedFromSheet || 0),
          assignedFromAssignments
        );

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
    if (!q) return ordersWithComputed;
    return ordersWithComputed.filter(
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
      .filter(
        (product) =>
          !q ||
          String(product.code).toLowerCase().includes(q) ||
          String(product.name).toLowerCase().includes(q)
      );
  }, [products, lots, lotsAvailableMap, productSearch]);

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

    if (selectedLine && qty > selectedLine.qtyToAssign) {
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

    try {
      const result = await new Promise((resolve, reject) => {
        const callbackName = `jsonpAssignLot_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        let script;

        const cleanup = () => {
          try {
            delete window[callbackName];
          } catch {}
          if (script && script.parentNode) script.parentNode.removeChild(script);
        };

        window[callbackName] = (data) => {
          cleanup();
          resolve(data);
        };

        const payload = encodeURIComponent(JSON.stringify(newAssignment));

        script = document.createElement("script");
        script.src = `${SHEETS_API_URL}?action=assignLot&payload=${payload}&callback=${callbackName}`;
        script.async = true;
        script.onerror = () => {
          cleanup();
          reject(new Error("Errore di collegamento con Google Sheet"));
        };

        document.body.appendChild(script);
      });

      if (!result || !result.success) {
        alert(
          "Errore nel salvataggio assegnazione sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

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
      loadDataFromSheets();
      alert("Lotto assegnato correttamente");
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    }
  };

  const markOrderPrepared = async () => {
    if (!selectedOrder) return;

    try {
      const result = await new Promise((resolve, reject) => {
        const callbackName = `jsonpPrepared_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        let script;

        const cleanup = () => {
          try {
            delete window[callbackName];
          } catch {}
          if (script && script.parentNode) script.parentNode.removeChild(script);
        };

        window[callbackName] = (data) => {
          cleanup();
          resolve(data);
        };

        script = document.createElement("script");
        script.src = `${SHEETS_API_URL}?action=markOrderPrepared&orderId=${encodeURIComponent(
          selectedOrder.id
        )}&callback=${callbackName}`;
        script.async = true;
        script.onerror = () => {
          cleanup();
          reject(new Error("Errore di collegamento con Google Sheet"));
        };

        document.body.appendChild(script);
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

      loadDataFromSheets();
      alert("Ordine segnato come preparato");
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
      const result = await new Promise((resolve, reject) => {
        const callbackName = `jsonpSaveOrder_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        let script;

        const cleanup = () => {
          try {
            delete window[callbackName];
          } catch {}
          if (script && script.parentNode) script.parentNode.removeChild(script);
        };

        window[callbackName] = (data) => {
          cleanup();
          resolve(data);
        };

        const payload = encodeURIComponent(
          JSON.stringify({
            id: newOrder.id,
            customer: newOrder.customer,
            status: newOrder.status,
            date: newOrder.date,
            lines: newOrder.lines,
          })
        );

        script = document.createElement("script");
        script.src = `${SHEETS_API_URL}?action=createOrder&payload=${payload}&callback=${callbackName}`;
        script.async = true;
        script.onerror = () => {
          cleanup();
          reject(new Error("Errore di collegamento con Google Sheet"));
        };

        document.body.appendChild(script);
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
      loadDataFromSheets();
      alert("Ordine salvato correttamente");
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    }
  };

  const deleteOrder = async (orderId) => {
    if (!orderId) return;

    const conferma = window.confirm("Vuoi eliminare davvero questo ordine?");
    if (!conferma) return;

    try {
      const result = await new Promise((resolve, reject) => {
        const callbackName = `jsonpDeleteOrder_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        let script;

        const cleanup = () => {
          try {
            delete window[callbackName];
          } catch {}
          if (script && script.parentNode) script.parentNode.removeChild(script);
        };

        window[callbackName] = (data) => {
          cleanup();
          resolve(data);
        };

        script = document.createElement("script");
        script.src = `${SHEETS_API_URL}?action=deleteOrder&orderId=${encodeURIComponent(
          orderId
        )}&callback=${callbackName}`;
        script.async = true;
        script.onerror = () => {
          cleanup();
          reject(new Error("Errore di collegamento con Google Sheet"));
        };

        document.body.appendChild(script);
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
        const orderToDelete = orders.find((o) => String(o.id) === String(orderId));
        if (orderToDelete?.lines) {
          orderToDelete.lines.forEach((line) => delete next[line.lineId]);
        }
        return next;
      });

      const remainingOrders = orders.filter((order) => String(order.id) !== String(orderId));
      setOrders(remainingOrders);
      const nextOrder = remainingOrders[0];
      setSelectedOrderId(nextOrder?.id ?? "");
      setSelectedLineId(nextOrder?.lines?.[0]?.lineId ?? "");

      loadDataFromSheets();
      alert("Ordine eliminato correttamente");
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
      const result = await new Promise((resolve, reject) => {
        const callbackName = `jsonpSaveLot_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        let script;

        const cleanup = () => {
          try {
            delete window[callbackName];
          } catch {}
          if (script && script.parentNode) script.parentNode.removeChild(script);
        };

        window[callbackName] = (data) => {
          cleanup();
          resolve(data);
        };

        const payload = encodeURIComponent(JSON.stringify(newLot));

        script = document.createElement("script");
        script.src = `${SHEETS_API_URL}?action=createLot&payload=${payload}&callback=${callbackName}`;
        script.async = true;
        script.onerror = () => {
          cleanup();
          reject(new Error("Errore di collegamento con Google Sheet"));
        };

        document.body.appendChild(script);
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
      loadDataFromSheets();
      alert("Lotto salvato correttamente");
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
      const result = await new Promise((resolve, reject) => {
        const callbackName = `jsonpCreateProduct_${Date.now()}_${Math.floor(
          Math.random() * 10000
        )}`;
        let script;

        const cleanup = () => {
          try {
            delete window[callbackName];
          } catch {}
          if (script && script.parentNode) script.parentNode.removeChild(script);
        };

        window[callbackName] = (data) => {
          cleanup();
          resolve(data);
        };

        const payload = encodeURIComponent(JSON.stringify(newProduct));

        script = document.createElement("script");
        script.src = `${SHEETS_API_URL}?action=createProduct&payload=${payload}&callback=${callbackName}`;
        script.async = true;
        script.onerror = () => {
          cleanup();
          reject(new Error("Errore di collegamento con Google Sheet"));
        };

        document.body.appendChild(script);
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

      await loadDataFromSheets();

      alert("Prodotto creato correttamente");
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
      const result = await new Promise((resolve, reject) => {
        const callbackName = `jsonpUpdateProduct_${Date.now()}_${Math.floor(
          Math.random() * 10000
        )}`;
        let script;

        const cleanup = () => {
          try {
            delete window[callbackName];
          } catch {}
          if (script && script.parentNode) script.parentNode.removeChild(script);
        };

        window[callbackName] = (data) => {
          cleanup();
          resolve(data);
        };

        const encodedPayload = encodeURIComponent(JSON.stringify(payload));

        script = document.createElement("script");
        script.src = `${SHEETS_API_URL}?action=updateProduct&payload=${encodedPayload}&callback=${callbackName}`;
        script.async = true;
        script.onerror = () => {
          cleanup();
          reject(new Error("Errore di collegamento con Google Sheet"));
        };

        document.body.appendChild(script);
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

      await loadDataFromSheets();

      alert("Prodotto modificato correttamente");
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
      const result = await new Promise((resolve, reject) => {
        const callbackName = `jsonpDeleteProduct_${Date.now()}_${Math.floor(
          Math.random() * 10000
        )}`;
        let script;

        const cleanup = () => {
          try {
            delete window[callbackName];
          } catch {}
          if (script && script.parentNode) script.parentNode.removeChild(script);
        };

        window[callbackName] = (data) => {
          cleanup();
          resolve(data);
        };

        script = document.createElement("script");
        script.src = `${SHEETS_API_URL}?action=deleteProduct&productId=${encodeURIComponent(
          productIdToDelete
        )}&adminPin=${encodeURIComponent(ADMIN_PIN)}&callback=${callbackName}`;
        script.async = true;
        script.onerror = () => {
          cleanup();
          reject(new Error("Errore di collegamento con Google Sheet"));
        };

        document.body.appendChild(script);
      });

      if (!result || !result.success) {
        alert(
          "Errore nell'eliminazione prodotto sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setProducts((prev) =>
        prev.filter((item) => String(item.id) !== String(product.id))
      );

      await loadDataFromSheets();

      alert("Prodotto eliminato correttamente");
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

  const deleteLine = async (orderId, lineId) => {
    if (!orderId || !lineId) return;

    const conferma = window.confirm(
      "Vuoi eliminare davvero questa riga ordine? Verranno eliminate anche eventuali assegnazioni collegate."
    );
    if (!conferma) return;

    try {
      const result = await new Promise((resolve, reject) => {
        const callbackName = `jsonpDeleteLine_${Date.now()}_${Math.floor(
          Math.random() * 10000
        )}`;
        let script;

        const cleanup = () => {
          try {
            delete window[callbackName];
          } catch {}
          if (script && script.parentNode) script.parentNode.removeChild(script);
        };

        window[callbackName] = (data) => {
          cleanup();
          resolve(data);
        };

        script = document.createElement("script");
        script.src = `${SHEETS_API_URL}?action=deleteLine&lineId=${encodeURIComponent(
          lineId
        )}&callback=${callbackName}`;
        script.async = true;
        script.onerror = () => {
          cleanup();
          reject(new Error("Errore di collegamento con Google Sheet"));
        };

        document.body.appendChild(script);
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

      await loadDataFromSheets();

      alert("Riga ordine eliminata correttamente");
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    }
  };

  const deleteAssignment = async (lineId, assignmentId) => {
    if (!lineId || !assignmentId) return;

    const conferma = window.confirm("Vuoi eliminare questa assegnazione lotto?");
    if (!conferma) return;

    try {
      const result = await new Promise((resolve, reject) => {
        const callbackName = `jsonpDeleteAssignment_${Date.now()}_${Math.floor(
          Math.random() * 10000
        )}`;
        let script;

        const cleanup = () => {
          try {
            delete window[callbackName];
          } catch {}
          if (script && script.parentNode) script.parentNode.removeChild(script);
        };

        window[callbackName] = (data) => {
          cleanup();
          resolve(data);
        };

        script = document.createElement("script");
        script.src = `${SHEETS_API_URL}?action=deleteAssignment&assignmentId=${encodeURIComponent(
          assignmentId
        )}&callback=${callbackName}`;
        script.async = true;
        script.onerror = () => {
          cleanup();
          reject(new Error("Errore di collegamento con Google Sheet"));
        };

        document.body.appendChild(script);
      });

      if (!result || !result.success) {
        alert(
          "Errore nell'eliminazione assegnazione sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setAssignments((prev) => ({
        ...prev,
        [lineId]: (prev[lineId] || []).filter(
          (assignment) => String(assignment.assignmentId) !== String(assignmentId)
        ),
      }));

      await loadDataFromSheets();

      alert("Assegnazione eliminata correttamente");
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    }
  };

  const deleteLot = async (lotId) => {
    if (!lotId) return;

    const lotToDelete = lots.find((lot) => String(lot.id) === String(lotId));
    const lotCodeToDelete = lotToDelete?.lot || lotId;

    const isUsed = Object.values(assignments)
      .flat()
      .some(
        (assignment) =>
          String(assignment.lotId) === String(lotId) ||
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
      const result = await new Promise((resolve, reject) => {
        const callbackName = `jsonpDeleteLot_${Date.now()}_${Math.floor(
          Math.random() * 10000
        )}`;
        let script;

        const cleanup = () => {
          try {
            delete window[callbackName];
          } catch {}
          if (script && script.parentNode) script.parentNode.removeChild(script);
        };

        window[callbackName] = (data) => {
          cleanup();
          resolve(data);
        };

        script = document.createElement("script");
        script.src = `${SHEETS_API_URL}?action=deleteLot&lotId=${encodeURIComponent(
          lotCodeToDelete
        )}&callback=${callbackName}`;
        script.async = true;
        script.onerror = () => {
          cleanup();
          reject(new Error("Errore di collegamento con Google Sheet"));
        };

        document.body.appendChild(script);
      });

      if (!result || !result.success) {
        alert(
          "Errore nell'eliminazione lotto sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setLots((prev) => prev.filter((lot) => String(lot.id) !== String(lotId)));

      await loadDataFromSheets();

      alert("Lotto eliminato correttamente");
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f2f4f8", padding: 20, fontFamily: "Arial, sans-serif" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ ...cardStyle(), padding: 20, marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 14, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 32, fontWeight: 900, color: "#09122d" }}>MAGAZZINO 2.0</div>
              <div style={{ marginTop: 8, color: "#617086", fontSize: 18 }}>
                Interfaccia semplificata per magazzino: pochi passaggi, bottoni grandi, dati chiari.
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button style={btnStyle(page === "ordini" ? "primary" : "soft")} onClick={() => setPage("ordini")}>
                <ClipboardList size={18} /> Ordini
              </button>
              <button style={btnStyle(page === "prodotti" ? "primary" : "soft")} onClick={() => setPage("prodotti")}>
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
          <div style={{ ...cardStyle(), padding: 16, marginBottom: 16, background: "#fff8e6", color: "#8a5a00" }}>
            {loadError}
          </div>
        ) : null}

        {loadingData ? (
          <div style={{ ...cardStyle(), padding: 16, marginBottom: 16, color: "#6b7280" }}>
            Caricamento dati dal Google Sheet...
          </div>
        ) : null}

        {page === "ordini" && (
          <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 16 }}>
            <div style={{ ...cardStyle(), padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <div style={{ fontSize: 20, fontWeight: 800 }}>Ordini</div>
                <button style={btnStyle("primary")} onClick={() => setOrderDialogOpen(true)}>
                  <Plus size={16} /> Nuovo
                </button>
              </div>

              <div style={{ position: "relative", marginBottom: 16 }}>
                <Search size={16} style={{ position: "absolute", left: 14, top: 18, color: "#97a3b6" }} />
                <input
                  style={{ ...inputStyle(), paddingLeft: 40 }}
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
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
                      border: selectedOrderId === order.id ? "2px solid #0f172a" : "1px solid #dbe2ea",
                      background: selectedOrderId === order.id ? "#f8fafc" : "#fff",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 800 }}>{order.id}</div>
                        <div style={{ color: "#66758b", marginTop: 4 }}>{order.customer}</div>
                      </div>
                      <span style={badgeStyle("outline")}>{order.computedStatus}</span>
                    </div>
                    <div style={{ marginTop: 14, color: "#66758b" }}>Da assegnare: {order.totalToAssign}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ ...cardStyle(), padding: 20 }}>
              <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 18 }}>Preparazione ordine</div>

              {selectedOrder ? (
                <>
                  <div style={{ ...cardStyle({ background: "#f8fafc" }), padding: 20, marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontSize: 22, fontWeight: 900 }}>{selectedOrder.id}</div>
                        <div style={{ marginTop: 6, color: "#66758b" }}>
                          {selectedOrder.customer} · {fmtDate(selectedOrder.date)}
                        </div>
                      </div>
                      <button
                        style={btnStyle("outline")}
                        onClick={() => deleteOrder(selectedOrder.id)}
                      >
                        <Trash2 size={16} /> Elimina ordine
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 16 }}>
                    <div style={{ display: "grid", gap: 16 }}>
                      {selectedOrder.lines.map((line) => {
                        const product = productMap[String(line.productId)];
                        const active = String(selectedLineId) === String(line.lineId);

                        return (
                          <button
                            key={line.lineId}
                            onClick={() => setSelectedLineId(line.lineId)}
                            style={{
                              textAlign: "left",
                              padding: 20,
                              borderRadius: 24,
                              border: active ? "2px solid #0f172a" : "1px solid #dbe2ea",
                              background: active ? "#f8fafc" : "#fff",
                              cursor: "pointer",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                              <div>
                                <div style={{ fontSize: 18, fontWeight: 800 }}>{product?.code}</div>
                                <div style={{ marginTop: 4, color: "#55657a" }}>{product?.name}</div>
                              </div>
                              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <span style={badgeStyle("outline")}>Da assegnare {line.qtyToAssign}</span>
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteLine(selectedOrder.id, line.lineId);
                                  }}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    width: 40,
                                    height: 40,
                                    borderRadius: 14,
                                    border: "1px solid #d8dee8",
                                    background: "#fff",
                                  }}
                                >
                                  <Trash2 size={16} />
                                </span>
                              </div>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 18 }}>
                              <div style={{ ...cardStyle({ background: "#f1f5f9" }), padding: 16, textAlign: "center" }}>
                                <div style={{ fontSize: 13, color: "#6b7280" }}>Ordinati</div>
                                <div style={{ fontSize: 20, fontWeight: 900, marginTop: 6 }}>{line.qtyOrdered}</div>
                              </div>
                              <div style={{ ...cardStyle({ background: "#f1f5f9" }), padding: 16, textAlign: "center" }}>
                                <div style={{ fontSize: 13, color: "#6b7280" }}>Assegnati</div>
                                <div style={{ fontSize: 20, fontWeight: 900, marginTop: 6 }}>{line.assignedQty}</div>
                              </div>
                              <div style={{ ...cardStyle({ background: "#f1f5f9" }), padding: 16, textAlign: "center" }}>
                                <div style={{ fontSize: 13, color: "#6b7280" }}>Da assegnare</div>
                                <div
                                  style={{
                                    fontSize: 20,
                                    fontWeight: 900,
                                    marginTop: 6,
                                    color: line.qtyToAssign > 0 ? "#a16207" : "#166534",
                                  }}
                                >
                                  {line.qtyToAssign}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div style={{ display: "grid", gap: 16 }}>
                      {selectedLine ? (
                        <>
                          <div style={{ ...cardStyle(), padding: 20 }}>
                            <div style={{ fontSize: 18, fontWeight: 800 }}>
                              {productMap[String(selectedLine.productId)]?.name}
                            </div>
                            <div style={{ marginTop: 6, color: "#66758b" }}>
                              Codice {productMap[String(selectedLine.productId)]?.code}
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 18 }}>
                              <div style={{ ...cardStyle({ background: "#f1f5f9" }), padding: 16, textAlign: "center" }}>
                                <div style={{ fontSize: 13, color: "#6b7280" }}>Da assegnare</div>
                                <div style={{ fontSize: 26, fontWeight: 900, marginTop: 6 }}>{selectedLine.qtyToAssign}</div>
                              </div>
                              <div style={{ ...cardStyle({ background: "#f1f5f9" }), padding: 16, textAlign: "center" }}>
                                <div style={{ fontSize: 13, color: "#6b7280" }}>Lotti disponibili</div>
                                <div style={{ fontSize: 26, fontWeight: 900, marginTop: 6 }}>{availableLotsForSelectedLine.length}</div>
                              </div>
                            </div>

                            <div style={{ marginTop: 18 }}>
                              <button
                                style={btnStyle("primary", selectedLine.qtyToAssign <= 0)}
                                disabled={selectedLine.qtyToAssign <= 0}
                                onClick={() => openAssignDialog(selectedLine.lineId)}
                              >
                                Assegna lotto
                              </button>
                            </div>
                          </div>

                          <div style={{ ...cardStyle(), padding: 20 }}>
                            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Lotti assegnati</div>
                            <div style={{ display: "grid", gap: 12 }}>
                              {(assignments[selectedLine.lineId] || []).length === 0 ? (
                                <div style={{ ...cardStyle({ background: "#f8fafc" }), padding: 16, color: "#66758b" }}>
                                  Nessun lotto assegnato.
                                </div>
                              ) : (
                                (assignments[selectedLine.lineId] || []).map((assignment) => {
                                  const lot = lots.find((item) => String(item.id) === String(assignment.lotId));
                                  return (
                                    <div key={assignment.assignmentId} style={{ ...cardStyle({ background: "#f8fafc" }), padding: 16 }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                                        <div>
                                          <div style={{ fontWeight: 800 }}>Lotto {lot?.lot}</div>
                                          <div style={{ marginTop: 6, color: "#66758b" }}>
                                            Quantità {assignment.qty} · Scadenza {fmtDate(lot?.expiry)}
                                          </div>
                                        </div>
                                        <button
                                          style={btnStyle("outline")}
                                          onClick={() => deleteAssignment(selectedLine.lineId, assignment.assignmentId)}
                                        >
                                          <Trash2 size={16} />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div style={{ ...cardStyle(), padding: 20, color: "#66758b" }}>Seleziona una riga.</div>
                      )}
                    </div>
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
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 18 }}>
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

            <div style={{ position: "relative", maxWidth: 520, marginBottom: 18 }}>
              <Search size={16} style={{ position: "absolute", left: 14, top: 18, color: "#97a3b6" }} />
              <input
                style={{ ...inputStyle(), paddingLeft: 40 }}
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Cerca prodotto o codice"
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
              {filteredProducts.map((product) => (
                <div key={product.id} style={{ ...cardStyle(), padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800 }}>{product.code}</div>
                      <div style={{ marginTop: 4, color: "#55657a" }}>{product.name}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <span style={badgeStyle("outline")}>Disponibili {product.totalAvailable}</span>
                      {isAdmin && (
                        <>
                          <button style={btnStyle("outline")} onClick={() => openEditProductDialog(product)}>
                            <Pencil size={16} />
                          </button>
                          <button
                            style={btnStyle("danger", deletingProductId === String(product.id))}
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
                      <div style={{ ...cardStyle({ background: "#fff7ed" }), padding: 14, color: "#b45309" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <AlertTriangle size={16} /> Nessun lotto disponibile
                        </div>
                      </div>
                    ) : (
                      product.productLots
                        .sort((a, b) => new Date(a.expiry) - new Date(b.expiry))
                        .map((lot) => (
                          <div key={lot.id} style={{ ...cardStyle({ background: "#f8fafc" }), padding: 16 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                              <div>
                                <div style={{ fontWeight: 800 }}>Lotto {lot.lot}</div>
                                <div style={{ marginTop: 6, color: "#66758b" }}>
                                  Scadenza {fmtDate(lot.expiry)}
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <div
                                  style={{
                                    fontSize: 20,
                                    fontWeight: 900,
                                    color: lotsAvailableMap[String(lot.id)] <= 10 ? "#dc2626" : "#0f172a",
                                  }}
                                >
                                  {lotsAvailableMap[String(lot.id)]}
                                </div>
                                <button
                                  style={btnStyle("outline")}
                                  onClick={() => deleteLot(lot.id)}
                                  disabled={lotsAvailableMap[String(lot.id)] !== lot.loadedQty}
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
        )}

        <Modal open={assignDialogOpen} title="Assegna lotto" onClose={() => setAssignDialogOpen(false)} maxWidth={560}>
          {selectedLine && (
            <div style={{ display: "grid", gap: 18 }}>
              <div style={{ ...cardStyle({ background: "#f8fafc" }), padding: 16 }}>
                <div style={{ fontWeight: 800 }}>{productMap[String(selectedLine.productId)]?.name}</div>
                <div style={{ color: "#66758b", marginTop: 6 }}>Da assegnare: {selectedLine.qtyToAssign}</div>
              </div>

              <div>
                <label style={labelStyle()}>Lotto</label>
                <select
                  style={inputStyle()}
                  value={selectedLotId}
                  onChange={(e) => handleLotSelect(e.target.value)}
                >
                  <option value="">Seleziona lotto</option>
                  {availableLotsForSelectedLine.map((lot) => (
                    <option key={lot.id} value={String(lot.id)}>
                      {lot.lot} · scad. {fmtDate(lot.expiry)} · disp. {lotsAvailableMap[String(lot.id)]}
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
                  onChange={(e) => setAssignQty(e.target.value)}
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

        <Modal open={orderDialogOpen} title="Nuovo ordine" onClose={() => setOrderDialogOpen(false)} maxWidth={760}>
          <div style={{ display: "grid", gap: 18 }}>
            <div>
              <label style={labelStyle()}>Cliente</label>
              <input
                style={inputStyle()}
                value={newOrderCustomer}
                onChange={(e) => setNewOrderCustomer(e.target.value)}
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
                    gridTemplateColumns: "1fr 140px 110px",
                    gap: 12,
                  }}
                >
                  <select
                    style={inputStyle()}
                    value={line.productId}
                    onChange={(e) => updateNewOrderLine(index, "productId", e.target.value)}
                  >
                    <option value="">Seleziona prodotto</option>
                    {products.map((product) => (
                      <option key={product.id} value={String(product.id)}>
                        {product.code} · {product.name}
                      </option>
                    ))}
                  </select>

                  <input
                    style={inputStyle()}
                    type="number"
                    min="1"
                    value={line.qtyOrdered}
                    onChange={(e) => updateNewOrderLine(index, "qtyOrdered", e.target.value)}
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

        <Modal open={adminDialogOpen} title="Accesso admin" onClose={() => setAdminDialogOpen(false)} maxWidth={420}>
          <div style={{ display: "grid", gap: 18 }}>
            <div>
              <label style={labelStyle()}>PIN</label>
              <input
                style={inputStyle()}
                type="password"
                value={adminPinInput}
                onChange={(e) => setAdminPinInput(e.target.value)}
                placeholder="Inserisci PIN"
              />
            </div>
            {adminError ? <div style={{ color: "#dc2626" }}>{adminError}</div> : null}
            <button style={btnStyle("primary")} onClick={handleAdminAccess}>
              Entra in admin
            </button>
          </div>
        </Modal>

        <Modal open={editProductDialogOpen} title="Modifica prodotto" onClose={() => setEditProductDialogOpen(false)} maxWidth={560}>
          <div style={{ display: "grid", gap: 18 }}>
            <div>
              <label style={labelStyle()}>Codice prodotto</label>
              <input
                style={inputStyle()}
                value={editProductCode}
                onChange={(e) => setEditProductCode(e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle()}>Descrizione</label>
              <input
                style={inputStyle()}
                value={editProductName}
                onChange={(e) => setEditProductName(e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle()}>Unità di misura</label>
              <input
                style={inputStyle()}
                value={editProductUom}
                onChange={(e) => setEditProductUom(e.target.value)}
              />
            </div>
            <button style={btnStyle("primary", savingProduct)} disabled={savingProduct} onClick={saveEditedProduct}>
              {savingProduct ? "Salvataggio..." : "Salva modifiche"}
            </button>
          </div>
        </Modal>

        <Modal open={productDialogOpen} title="Nuovo prodotto" onClose={() => setProductDialogOpen(false)} maxWidth={560}>
          <div style={{ display: "grid", gap: 18 }}>
            <div>
              <label style={labelStyle()}>Codice prodotto</label>
              <input
                style={inputStyle()}
                value={newProductCode}
                onChange={(e) => setNewProductCode(e.target.value)}
                placeholder="Es. NFARMA 014"
              />
            </div>
            <div>
              <label style={labelStyle()}>Descrizione</label>
              <input
                style={inputStyle()}
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                placeholder="Es. Mezzi paccheri 250"
              />
            </div>
            <div>
              <label style={labelStyle()}>Unità di misura</label>
              <input
                style={inputStyle()}
                value={newProductUom}
                onChange={(e) => setNewProductUom(e.target.value)}
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

        <Modal open={lotDialogOpen} title="Carica lotto" onClose={() => setLotDialogOpen(false)} maxWidth={560}>
          <div style={{ display: "grid", gap: 18 }}>
            <div>
              <label style={labelStyle()}>Prodotto</label>
              <select
                style={inputStyle()}
                value={newLotProductId}
                onChange={(e) => setNewLotProductId(e.target.value)}
              >
                <option value="">Seleziona prodotto</option>
                {products.map((product) => (
                  <option key={product.id} value={String(product.id)}>
                    {product.code} · {product.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle()}>Codice lotto</label>
              <input
                style={inputStyle()}
                value={newLotCode}
                onChange={(e) => setNewLotCode(e.target.value)}
                placeholder="Es. 2604110"
              />
            </div>
            <div>
              <label style={labelStyle()}>Scadenza</label>
              <input
                style={inputStyle()}
                type="date"
                value={newLotExpiry}
                onChange={(e) => setNewLotExpiry(e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle()}>Quantità caricata</label>
              <input
                style={inputStyle()}
                type="number"
                min="1"
                value={newLotQty}
                onChange={(e) => setNewLotQty(e.target.value)}
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
