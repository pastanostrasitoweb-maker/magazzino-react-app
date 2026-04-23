import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

const SHEETS_API_URL = "https://script.google.com/macros/s/AKfycbzMh4XDJmaIwEXfRbw015HRnXnbJJjcq7q2GIRIDhgOEorLENwG7eWsIUCIRVCHDorq/exec";
const ADMIN_PIN = "1234";

const fallbackProducts = [
  { id: 1, code: "NFARMA 013", name: "Pici 250", uom: "pz" },
  { id: 2, code: "NFARMA 007", name: "Tonnarelli 250", uom: "pz" },
];

const fallbackLots = [
  { id: 1, productId: 1, lot: "2604104", expiry: "2026-05-06", loadedQty: 34 },
  { id: 2, productId: 2, lot: "2604108", expiry: "2026-05-08", loadedQty: 18 },
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

function normalizeProducts(rows) {
  return rows
    .map((row, index) => ({
      id: String(getField(row, ["ID_Prodotto", "Id_Prodotto", "id", "Codice_Prodotto", "Codice prodotto"]) || `PROD-${index + 1}`),
      code: String(getField(row, ["Codice_Prodotto", "Codice prodotto", "Codice", "code"])).trim(),
      name: String(getField(row, ["Descrizione_Prodotto", "Descrizione prodotto", "Descrizione", "name"])).trim(),
      uom: String(getField(row, ["UM", "U_M", "Unità_Misura", "Unità di misura", "uom"]) || "pz").trim(),
    }))
    .filter((product) => product.code || product.name);
}

function normalizeLots(rows, products) {
  const productByCode = Object.fromEntries(products.map((p) => [String(p.code), p.id]));

  return rows
    .map((row, index) => {
      const productCode = String(getField(row, ["Codice_Prodotto", "Codice prodotto", "Codice", "Prodotto"])).trim();
      return {
        id: String(getField(row, ["ID_Lotto", "Id_Lotto", "id", "Lotto"]) || `LOT-${index + 1}`),
        productId: productByCode[productCode] || productCode,
        lot: String(getField(row, ["Lotto", "Codice_Lotto", "Codice lotto"])).trim(),
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

  return rows
    .map((row, index) => {
      const productCode = String(getField(row, ["Codice_Prodotto", "Codice prodotto", "Codice", "Prodotto"])).trim();
      return {
        lineId: String(getField(row, ["ID_Riga", "Id_Riga", "id"]) || `RIGA-${index + 1}`),
        orderId: String(getField(row, ["ID_Ordine", "Id_Ordine", "Ordine"])).trim(),
        productId: productByCode[productCode] || productCode,
        qtyOrdered: Number(
          getField(row, [
            "Quantità_Ordinata",
            "Quantita_Ordinata",
            "Quantità ordinata",
            "Quantita ordinata",
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

    const lotCode = String(getField(row, ["Lotto", "Codice_Lotto", "Codice lotto"])).trim();
    const lotId = lotByCode[lotCode] || lotCode;
    if (!lotId) return;

    const item = {
      assignmentId: String(getField(row, ["ID_Assegnazione", "Id_Assegnazione", "id"]) || `ASS-${index + 1}`),
      lotId,
      qty: Number(
        getField(row, [
          "Quantità_Assegnata",
          "Quantita_Assegnata",
          "Quantità assegnata",
          "Quantita assegnata",
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

export default function MiniAppMagazzinoLottiPasta() {
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

  const [newLotProductId, setNewLotProductId] = useState("");
  const [newLotCode, setNewLotCode] = useState("");
  const [newLotExpiry, setNewLotExpiry] = useState("");
  const [newLotQty, setNewLotQty] = useState("");

  const [editingProductId, setEditingProductId] = useState(null);
  const [editProductCode, setEditProductCode] = useState("");
  const [editProductName, setEditProductName] = useState("");
  const [editProductUom, setEditProductUom] = useState("pz");

  const loadDataFromSheets = async () => {
    setLoadingData(true);
    setLoadError("");

    try {
      const response = await fetch(SHEETS_API_URL, { method: "GET" });
      if (!response.ok) throw new Error("Impossibile leggere il foglio Google");
      const raw = await response.json();

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
      setLoadError("Non sono riuscito a leggere i dati dal Google Sheet. Per ora vedi una demo locale.");
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
        const assignedQty = (assignments[line.lineId] || []).reduce(
          (sum, assignment) => sum + assignment.qty,
          0
        );
        const qtyToAssign = Math.max(0, line.qtyOrdered - assignedQty);
        return { ...line, assignedQty, qtyToAssign };
      });

      const totalToAssign = lines.reduce((sum, line) => sum + line.qtyToAssign, 0);
      const totalOrdered = lines.reduce((sum, line) => sum + line.qtyOrdered, 0);
      const computedStatus =
        totalToAssign === 0
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

  const confirmAssignment = () => {
    if (!selectedLine || !selectedLotId || !assignQty) return;
    const qty = Number(assignQty);
    if (!qty || qty <= 0) return;

    setAssignments((prev) => ({
      ...prev,
      [selectedLine.lineId]: [
        ...(prev[selectedLine.lineId] || []),
        { assignmentId: `ASS-${Date.now()}`, lotId: String(selectedLotId), qty },
      ],
    }));

    setAssignDialogOpen(false);
    setSelectedLotId("");
    setAssignQty("");
  };

  const markOrderPrepared = () => {
    if (!selectedOrder) return;
    setOrders((prev) =>
      prev.map((order) =>
        String(order.id) === String(selectedOrder.id)
          ? { ...order, status: "Preparato" }
          : order
      )
    );
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

  const createOrder = () => {
    const validLines = newOrderLines
      .filter((line) => line.productId && Number(line.qtyOrdered) > 0)
      .map((line, index) => ({
        lineId: `RIGA-${Date.now()}-${index}`,
        productId: String(line.productId),
        qtyOrdered: Number(line.qtyOrdered),
      }));

    if (!newOrderCustomer.trim() || validLines.length === 0) return;

    const newOrder = {
      id: `ORD-${String(orders.length + 1).padStart(4, "0")}`,
      customer: newOrderCustomer.trim(),
      status: "Da preparare",
      date: new Date().toISOString().slice(0, 10),
      lines: validLines,
    };

    setOrders((prev) => [newOrder, ...prev]);
    setSelectedOrderId(newOrder.id);
    setSelectedLineId(newOrder.lines[0]?.lineId || "");
    setNewOrderCustomer("");
    setNewOrderLines([{ productId: "", qtyOrdered: "" }]);
    setOrderDialogOpen(false);
    setPage("ordini");
  };

  const createProduct = () => {
    if (!newProductCode.trim() || !newProductName.trim()) return;
    const newProduct = {
      id: `PROD-${Date.now()}`,
      code: newProductCode.trim(),
      name: newProductName.trim(),
      uom: newProductUom || "pz",
    };

    setProducts((prev) => [newProduct, ...prev]);
    setNewProductCode("");
    setNewProductName("");
    setNewProductUom("pz");
    setProductDialogOpen(false);
    setPage("prodotti");
  };

  const createLot = () => {
    if (!newLotProductId || !newLotCode.trim() || !newLotExpiry || Number(newLotQty) <= 0) return;
    const newLot = {
      id: `LOT-${Date.now()}`,
      productId: String(newLotProductId),
      lot: newLotCode.trim(),
      expiry: newLotExpiry,
      loadedQty: Number(newLotQty),
    };

    setLots((prev) => [newLot, ...prev]);
    setNewLotProductId("");
    setNewLotCode("");
    setNewLotExpiry("");
    setNewLotQty("");
    setLotDialogOpen(false);
    setPage("prodotti");
  };

  const openEditProductDialog = (product) => {
    if (!isAdmin) return;
    setEditingProductId(product.id);
    setEditProductCode(product.code);
    setEditProductName(product.name);
    setEditProductUom(product.uom || "pz");
    setEditProductDialogOpen(true);
  };

  const saveEditedProduct = () => {
    if (!editingProductId || !editProductCode.trim() || !editProductName.trim()) return;
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

  const deleteOrder = (orderId) => {
    const orderToDelete = orders.find((order) => String(order.id) === String(orderId));
    if (!orderToDelete) return;

    const lineIds = (orderToDelete.lines || []).map((line) => line.lineId);
    setAssignments((prev) => {
      const next = { ...prev };
      lineIds.forEach((lineId) => delete next[lineId]);
      return next;
    });

    const remainingOrders = orders.filter((order) => String(order.id) !== String(orderId));
    setOrders(remainingOrders);
    const nextOrder = remainingOrders[0];
    setSelectedOrderId(nextOrder?.id ?? "");
    setSelectedLineId(nextOrder?.lines?.[0]?.lineId ?? "");
  };

  const deleteLine = (orderId, lineId) => {
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
  };

  const deleteAssignment = (lineId, assignmentId) => {
    setAssignments((prev) => ({
      ...prev,
      [lineId]: (prev[lineId] || []).filter(
        (assignment) => String(assignment.assignmentId) !== String(assignmentId)
      ),
    }));
  };

  const deleteLot = (lotId) => {
    const isUsed = Object.values(assignments)
      .flat()
      .some((assignment) => String(assignment.lotId) === String(lotId));
    if (isUsed) return;
    setLots((prev) => prev.filter((lot) => String(lot.id) !== String(lotId)));
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-col gap-4 rounded-3xl bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">MAGAZZINO 2.0</h1>
            <p className="mt-1 text-sm text-slate-600">
              Interfaccia semplificata per magazzino: pochi passaggi, bottoni grandi, dati chiari.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:flex md:flex-wrap md:justify-end">
            <Button
              className={`h-14 rounded-2xl px-6 text-base ${
                page === "ordini" ? "" : "bg-slate-200 text-slate-800 hover:bg-slate-300"
              }`}
              onClick={() => setPage("ordini")}
            >
              <ClipboardList className="mr-2 h-5 w-5" /> Ordini
            </Button>
            <Button
              className={`h-14 rounded-2xl px-6 text-base ${
                page === "prodotti" ? "" : "bg-slate-200 text-slate-800 hover:bg-slate-300"
              }`}
              onClick={() => setPage("prodotti")}
            >
              <Package className="mr-2 h-5 w-5" /> Prodotti
            </Button>
            <Button className="h-14 rounded-2xl px-6 text-base" onClick={() => setOrderDialogOpen(true)}>
              <Plus className="mr-2 h-5 w-5" /> Nuovo ordine
            </Button>
            {isAdmin && (
              <>
                <Button className="h-14 rounded-2xl px-6 text-base" onClick={() => setProductDialogOpen(true)}>
                  <Plus className="mr-2 h-5 w-5" /> Nuovo prodotto
                </Button>
                <Button className="h-14 rounded-2xl px-6 text-base" onClick={() => setLotDialogOpen(true)}>
                  <Boxes className="mr-2 h-5 w-5" /> Carica lotto
                </Button>
              </>
            )}
            <Button className="h-14 rounded-2xl px-6 text-base" variant="outline" onClick={loadDataFromSheets}>
              <RefreshCw className="mr-2 h-5 w-5" /> Aggiorna
            </Button>
            {!isAdmin ? (
              <Button className="h-14 rounded-2xl px-6 text-base" variant="outline" onClick={() => setAdminDialogOpen(true)}>
                <Lock className="mr-2 h-5 w-5" /> Admin
              </Button>
            ) : (
              <Button className="h-14 rounded-2xl px-6 text-base" variant="outline" onClick={exitAdminMode}>
                <Lock className="mr-2 h-5 w-5" /> Esci admin
              </Button>
            )}
          </div>
        </div>

        {loadError ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {loadError}
          </div>
        ) : null}

        {loadingData ? (
          <div className="rounded-2xl border bg-white p-4 text-sm text-slate-500">
            Caricamento dati dal Google Sheet...
          </div>
        ) : null}

        {page === "ordini" && (
          <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
            <Card className="rounded-3xl shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>Ordini</CardTitle>
                  <Button className="rounded-2xl" onClick={() => setOrderDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" /> Nuovo
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    placeholder="Cerca ordine o cliente"
                    className="h-12 rounded-2xl pl-9"
                  />
                </div>

                <div className="space-y-3">
                  {filteredOrders.map((order) => (
                    <button
                      key={order.id}
                      onClick={() => {
                        setSelectedOrderId(order.id);
                        setSelectedLineId(order.lines[0]?.lineId || "");
                      }}
                      className={`w-full rounded-3xl border p-4 text-left transition ${
                        selectedOrderId === order.id
                          ? "border-slate-900 bg-slate-50"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-lg font-semibold">{order.id}</div>
                          <div className="text-sm text-slate-600">{order.customer}</div>
                        </div>
                        <Badge variant={order.computedStatus === "Preparato" ? "secondary" : "outline"}>
                          {order.computedStatus}
                        </Badge>
                      </div>
                      <div className="mt-2 text-sm text-slate-500">
                        Da assegnare: {order.totalToAssign}
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl shadow-sm">
              <CardHeader>
                <CardTitle>Preparazione ordine</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {selectedOrder ? (
                  <>
                    <div className="rounded-3xl bg-slate-50 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-2xl font-semibold">{selectedOrder.id}</div>
                          <div className="mt-1 text-sm text-slate-600">
                            {selectedOrder.customer} · {fmtDate(selectedOrder.date)}
                          </div>
                        </div>
                        <Button variant="outline" className="rounded-2xl" onClick={() => deleteOrder(selectedOrder.id)}>
                          <Trash2 className="mr-2 h-4 w-4" /> Elimina ordine
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                      <div className="space-y-4">
                        {selectedOrder.lines.map((line) => {
                          const product = productMap[String(line.productId)];
                          const active = String(selectedLineId) === String(line.lineId);

                          return (
                            <button
                              key={line.lineId}
                              onClick={() => setSelectedLineId(line.lineId)}
                              className={`w-full rounded-3xl border p-5 text-left transition ${
                                active
                                  ? "border-slate-900 bg-slate-50"
                                  : "border-slate-200 bg-white hover:bg-slate-50"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <div className="text-base font-semibold">{product?.code}</div>
                                  <div className="text-sm text-slate-700">{product?.name}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant={line.qtyToAssign === 0 ? "secondary" : "outline"}>
                                    Da assegnare {line.qtyToAssign}
                                  </Badge>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="rounded-2xl px-3"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteLine(selectedOrder.id, line.lineId);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                                <div className="rounded-2xl bg-slate-100 p-3">
                                  <div className="text-xs text-slate-500">Ordinati</div>
                                  <div className="text-xl font-semibold">{line.qtyOrdered}</div>
                                </div>
                                <div className="rounded-2xl bg-slate-100 p-3">
                                  <div className="text-xs text-slate-500">Assegnati</div>
                                  <div className="text-xl font-semibold">{line.assignedQty}</div>
                                </div>
                                <div className="rounded-2xl bg-slate-100 p-3">
                                  <div className="text-xs text-slate-500">Da assegnare</div>
                                  <div
                                    className={`text-xl font-semibold ${
                                      line.qtyToAssign > 0 ? "text-amber-700" : "text-emerald-700"
                                    }`}
                                  >
                                    {line.qtyToAssign}
                                  </div>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <div className="space-y-4">
                        {selectedLine ? (
                          <>
                            <div className="rounded-3xl border bg-white p-5">
                              <div className="text-lg font-semibold">
                                {productMap[String(selectedLine.productId)]?.name}
                              </div>
                              <div className="mt-1 text-sm text-slate-600">
                                Codice {productMap[String(selectedLine.productId)]?.code}
                              </div>
                              <div className="mt-4 grid grid-cols-2 gap-3">
                                <div className="rounded-2xl bg-slate-100 p-3">
                                  <div className="text-xs text-slate-500">Da assegnare</div>
                                  <div className="text-2xl font-semibold">{selectedLine.qtyToAssign}</div>
                                </div>
                                <div className="rounded-2xl bg-slate-100 p-3">
                                  <div className="text-xs text-slate-500">Lotti disponibili</div>
                                  <div className="text-2xl font-semibold">{availableLotsForSelectedLine.length}</div>
                                </div>
                              </div>
                              <div className="mt-5 grid gap-3">
                                <Button
                                  className="h-16 rounded-3xl text-lg"
                                  onClick={() => openAssignDialog(selectedLine.lineId)}
                                  disabled={selectedLine.qtyToAssign <= 0}
                                >
                                  Assegna lotto
                                </Button>
                              </div>
                            </div>

                            <div className="rounded-3xl border bg-white p-5">
                              <div className="mb-3 text-base font-semibold">Lotti assegnati</div>
                              <div className="space-y-3">
                                {(assignments[selectedLine.lineId] || []).length === 0 ? (
                                  <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                                    Nessun lotto assegnato.
                                  </div>
                                ) : (
                                  (assignments[selectedLine.lineId] || []).map((assignment) => {
                                    const lot = lots.find(
                                      (item) => String(item.id) === String(assignment.lotId)
                                    );
                                    return (
                                      <div key={assignment.assignmentId} className="rounded-2xl bg-slate-50 p-4">
                                        <div className="flex items-start justify-between gap-3">
                                          <div>
                                            <div className="font-medium">Lotto {lot?.lot}</div>
                                            <div className="text-sm text-slate-600">
                                              Quantità {assignment.qty} · Scadenza {fmtDate(lot?.expiry)}
                                            </div>
                                          </div>
                                          <Button
                                            variant="ghost"
                                            className="rounded-2xl px-3"
                                            onClick={() =>
                                              deleteAssignment(selectedLine.lineId, assignment.assignmentId)
                                            }
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="rounded-3xl border bg-white p-5 text-sm text-slate-500">
                            Seleziona una riga.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button className="h-16 rounded-3xl px-8 text-lg" onClick={markOrderPrepared}>
                        <CheckCircle2 className="mr-2 h-5 w-5" /> Segna ordine preparato
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-slate-500">Seleziona un ordine.</div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {page === "prodotti" && (
          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <Card className="rounded-3xl shadow-sm xl:col-span-2">
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <CardTitle>Prodotti e disponibilità</CardTitle>
                  {isAdmin && (
                    <div className="flex gap-3">
                      <Button className="rounded-2xl" onClick={() => setProductDialogOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" /> Nuovo prodotto
                      </Button>
                      <Button className="rounded-2xl" onClick={() => setLotDialogOpen(true)}>
                        <Boxes className="mr-2 h-4 w-4" /> Carica lotto
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative max-w-xl">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Cerca prodotto o codice"
                    className="h-12 rounded-2xl pl-9"
                  />
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  {filteredProducts.map((product) => (
                    <Card key={product.id} className="rounded-3xl border shadow-none">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-base font-semibold">{product.code}</div>
                            <div className="text-sm text-slate-700">{product.name}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">Disponibili {product.totalAvailable}</Badge>
                            {isAdmin && (
                              <Button
                                variant="ghost"
                                className="rounded-2xl px-3"
                                onClick={() => openEditProductDialog(product)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>

                        <div className="mt-4 space-y-3">
                          {product.productLots.length === 0 ? (
                            <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                              <AlertTriangle className="h-4 w-4" /> Nessun lotto disponibile
                            </div>
                          ) : (
                            product.productLots
                              .sort((a, b) => new Date(a.expiry) - new Date(b.expiry))
                              .map((lot) => (
                                <div key={lot.id} className="rounded-2xl bg-slate-50 p-4">
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <div className="font-medium">Lotto {lot.lot}</div>
                                      <div className="text-sm text-slate-600">
                                        Scadenza {fmtDate(lot.expiry)}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div
                                        className={`text-lg font-semibold ${
                                          lotsAvailableMap[String(lot.id)] <= 10
                                            ? "text-red-600"
                                            : "text-slate-900"
                                        }`}
                                      >
                                        {lotsAvailableMap[String(lot.id)]}
                                      </div>
                                      <Button
                                        variant="ghost"
                                        className="rounded-2xl px-3"
                                        onClick={() => deleteLot(lot.id)}
                                        disabled={
                                          lotsAvailableMap[String(lot.id)] !== lot.loadedQty
                                        }
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              ))
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent className="rounded-3xl sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-2xl">Assegna lotto</DialogTitle>
            </DialogHeader>
            {selectedLine && (
              <div className="space-y-5">
                <div className="rounded-3xl bg-slate-50 p-4">
                  <div className="font-semibold">{productMap[String(selectedLine.productId)]?.name}</div>
                  <div className="text-sm text-slate-600">Da assegnare: {selectedLine.qtyToAssign}</div>
                </div>
                <div className="space-y-2">
                  <Label className="text-base">Lotto</Label>
                  <Select value={selectedLotId} onValueChange={handleLotSelect}>
                    <SelectTrigger className="h-14 rounded-2xl text-base">
                      <SelectValue placeholder="Seleziona lotto" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableLotsForSelectedLine.map((lot) => (
                        <SelectItem key={lot.id} value={String(lot.id)}>
                          {lot.lot} · scad. {fmtDate(lot.expiry)} · disp. {lotsAvailableMap[String(lot.id)]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-base">Quantità</Label>
                  <Input
                    type="number"
                    min="0"
                    className="h-14 rounded-2xl text-lg"
                    value={assignQty}
                    onChange={(e) => setAssignQty(e.target.value)}
                    placeholder="0"
                  />
                  <p className="text-sm text-slate-500">
                    Quantità proposta in automatico, ma modificabile a mano.
                  </p>
                </div>
                <Button className="h-16 w-full rounded-3xl text-lg" onClick={confirmAssignment}>
                  Conferma lotto
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={orderDialogOpen} onOpenChange={setOrderDialogOpen}>
          <DialogContent className="rounded-3xl sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl">Nuovo ordine</DialogTitle>
            </DialogHeader>
            <div className="space-y-5">
              <div className="space-y-2">
                <Label className="text-base">Cliente</Label>
                <Input
                  className="h-14 rounded-2xl"
                  value={newOrderCustomer}
                  onChange={(e) => setNewOrderCustomer(e.target.value)}
                  placeholder="Nome cliente"
                />
              </div>
              <div className="space-y-3">
                <div className="text-base font-semibold">Righe ordine</div>
                {newOrderLines.map((line, index) => (
                  <div
                    key={index}
                    className="grid gap-3 rounded-2xl border p-4 md:grid-cols-[1fr_140px_110px]"
                  >
                    <Select
                      value={line.productId}
                      onValueChange={(value) => updateNewOrderLine(index, "productId", value)}
                    >
                      <SelectTrigger className="h-14 rounded-2xl text-base">
                        <SelectValue placeholder="Seleziona prodotto" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((product) => (
                          <SelectItem key={product.id} value={String(product.id)}>
                            {product.code} · {product.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="1"
                      className="h-14 rounded-2xl"
                      value={line.qtyOrdered}
                      onChange={(e) => updateNewOrderLine(index, "qtyOrdered", e.target.value)}
                      placeholder="Quantità"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-14 rounded-2xl"
                      onClick={() => removeNewOrderLine(index)}
                    >
                      Rimuovi
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  className="h-14 rounded-2xl"
                  onClick={addEmptyOrderLine}
                >
                  <Plus className="mr-2 h-4 w-4" /> Aggiungi riga
                </Button>
              </div>
              <Button className="h-16 w-full rounded-3xl text-lg" onClick={createOrder}>
                Crea ordine
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={adminDialogOpen} onOpenChange={setAdminDialogOpen}>
          <DialogContent className="rounded-3xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-2xl">Accesso admin</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-base">PIN</Label>
                <Input
                  type="password"
                  className="h-14 rounded-2xl"
                  value={adminPinInput}
                  onChange={(e) => setAdminPinInput(e.target.value)}
                  placeholder="Inserisci PIN"
                />
              </div>
              {adminError ? <div className="text-sm text-red-600">{adminError}</div> : null}
              <Button className="h-16 w-full rounded-3xl text-lg" onClick={handleAdminAccess}>
                Entra in admin
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={editProductDialogOpen} onOpenChange={setEditProductDialogOpen}>
          <DialogContent className="rounded-3xl sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-2xl">Modifica prodotto</DialogTitle>
            </DialogHeader>
            <div className="space-y-5">
              <div className="space-y-2">
                <Label className="text-base">Codice prodotto</Label>
                <Input
                  className="h-14 rounded-2xl"
                  value={editProductCode}
                  onChange={(e) => setEditProductCode(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-base">Descrizione</Label>
                <Input
                  className="h-14 rounded-2xl"
                  value={editProductName}
                  onChange={(e) => setEditProductName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-base">Unità di misura</Label>
                <Input
                  className="h-14 rounded-2xl"
                  value={editProductUom}
                  onChange={(e) => setEditProductUom(e.target.value)}
                />
              </div>
              <Button className="h-16 w-full rounded-3xl text-lg" onClick={saveEditedProduct}>
                Salva modifiche
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
          <DialogContent className="rounded-3xl sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-2xl">Nuovo prodotto</DialogTitle>
            </DialogHeader>
            <div className="space-y-5">
              <div className="space-y-2">
                <Label className="text-base">Codice prodotto</Label>
                <Input
                  className="h-14 rounded-2xl"
                  value={newProductCode}
                  onChange={(e) => setNewProductCode(e.target.value)}
                  placeholder="Es. NFARMA 014"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-base">Descrizione</Label>
                <Input
                  className="h-14 rounded-2xl"
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  placeholder="Es. Mezzi paccheri 250"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-base">Unità di misura</Label>
                <Input
                  className="h-14 rounded-2xl"
                  value={newProductUom}
                  onChange={(e) => setNewProductUom(e.target.value)}
                  placeholder="pz"
                />
              </div>
              <Button className="h-16 w-full rounded-3xl text-lg" onClick={createProduct}>
                Salva prodotto
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={lotDialogOpen} onOpenChange={setLotDialogOpen}>
          <DialogContent className="rounded-3xl sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-2xl">Carica lotto</DialogTitle>
            </DialogHeader>
            <div className="space-y-5">
              <div className="space-y-2">
                <Label className="text-base">Prodotto</Label>
                <Select value={newLotProductId} onValueChange={setNewLotProductId}>
                  <SelectTrigger className="h-14 rounded-2xl text-base">
                    <SelectValue placeholder="Seleziona prodotto" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={String(product.id)}>
                        {product.code} · {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-base">Codice lotto</Label>
                <Input
                  className="h-14 rounded-2xl"
                  value={newLotCode}
                  onChange={(e) => setNewLotCode(e.target.value)}
                  placeholder="Es. 2604110"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-base">Scadenza</Label>
                <Input
                  type="date"
                  className="h-14 rounded-2xl"
                  value={newLotExpiry}
                  onChange={(e) => setNewLotExpiry(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-base">Quantità caricata</Label>
                <Input
                  type="number"
                  min="1"
                  className="h-14 rounded-2xl"
                  value={newLotQty}
                  onChange={(e) => setNewLotQty(e.target.value)}
                  placeholder="0"
                />
              </div>
              <Button className="h-16 w-full rounded-3xl text-lg" onClick={createLot}>
                Salva lotto
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
