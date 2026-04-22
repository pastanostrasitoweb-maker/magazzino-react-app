import React, { useMemo, useState } from 'react';
import { ClipboardList, Package, Search, CheckCircle2, AlertTriangle } from 'lucide-react';

const initialProducts = [
  { id: 1, code: 'NFARMA 013', name: 'Pici 250', uom: 'pz' },
  { id: 2, code: 'NFARMA 007', name: 'Tonnarelli 250', uom: 'pz' },
  { id: 3, code: 'RAV-RS250', name: 'Ravioli ricotta e spinaci 250', uom: 'pz' },
  { id: 4, code: 'CAPPRO', name: 'Cappelletti al prosciutto', uom: 'pz' },
];

const initialLots = [
  { id: 1, productId: 1, lot: '2604104', expiry: '2026-05-06', loadedQty: 34 },
  { id: 2, productId: 2, lot: '2604108', expiry: '2026-05-08', loadedQty: 18 },
  { id: 3, productId: 3, lot: '2604103', expiry: '2026-05-04', loadedQty: 24 },
  { id: 4, productId: 4, lot: '2604109', expiry: '2026-05-09', loadedQty: 12 },
];

const initialOrders = [
  {
    id: 'ORD-0001',
    customer: 'Andycapp',
    status: 'Da preparare',
    date: '2026-04-22',
    lines: [
      { lineId: 'RIGA-0001', productId: 1, qtyOrdered: 5 },
      { lineId: 'RIGA-0002', productId: 3, qtyOrdered: 10 },
    ],
  },
  {
    id: 'ORD-0002',
    customer: 'Supermercato Rossi',
    status: 'Parziale',
    date: '2026-04-22',
    lines: [{ lineId: 'RIGA-0003', productId: 2, qtyOrdered: 8 }],
  },
];

function fmtDate(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('it-IT');
}

function Button({ children, className = '', variant = 'primary', ...props }) {
  return (
    <button className={`btn btn-${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}

function Badge({ children, tone = 'default' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function Card({ children, className = '' }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export default function App() {
  const [page, setPage] = useState('ordini');
  const [orders, setOrders] = useState(initialOrders);
  const [lots] = useState(initialLots);
  const [products] = useState(initialProducts);
  const [selectedOrderId, setSelectedOrderId] = useState(initialOrders[0]?.id ?? '');
  const [selectedLineId, setSelectedLineId] = useState(initialOrders[0]?.lines[0]?.lineId ?? '');
  const [productSearch, setProductSearch] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [assignments, setAssignments] = useState({
    'RIGA-0003': [{ assignmentId: 'ASS-0001', lotId: 2, qty: 3 }],
  });
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedLotId, setSelectedLotId] = useState('');
  const [assignQty, setAssignQty] = useState('');

  const productMap = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);

  const lotsAvailableMap = useMemo(() => {
    const usedByLot = {};
    Object.values(assignments).flat().forEach((a) => {
      usedByLot[a.lotId] = (usedByLot[a.lotId] || 0) + a.qty;
    });

    return Object.fromEntries(
      lots.map((lot) => [lot.id, Math.max(0, lot.loadedQty - (usedByLot[lot.id] || 0))])
    );
  }, [lots, assignments]);

  const ordersWithComputed = useMemo(() => {
    return orders.map((order) => {
      const lines = order.lines.map((line) => {
        const assignedQty = (assignments[line.lineId] || []).reduce((sum, a) => sum + a.qty, 0);
        const qtyToAssign = Math.max(0, line.qtyOrdered - assignedQty);
        return { ...line, assignedQty, qtyToAssign };
      });

      const totalToAssign = lines.reduce((sum, l) => sum + l.qtyToAssign, 0);
      const totalOrdered = lines.reduce((sum, l) => sum + l.qtyOrdered, 0);
      const status = totalToAssign === 0 ? 'Preparato' : totalToAssign < totalOrdered ? 'Parziale' : 'Da preparare';

      return { ...order, lines, totalToAssign, computedStatus: status };
    });
  }, [orders, assignments]);

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    if (!q) return ordersWithComputed;
    return ordersWithComputed.filter(
      (o) => o.id.toLowerCase().includes(q) || o.customer.toLowerCase().includes(q) || o.computedStatus.toLowerCase().includes(q)
    );
  }, [ordersWithComputed, orderSearch]);

  const selectedOrder = ordersWithComputed.find((o) => o.id === selectedOrderId) || ordersWithComputed[0];
  const selectedLine = selectedOrder?.lines.find((l) => l.lineId === selectedLineId) || selectedOrder?.lines[0];

  const availableLotsForSelectedLine = useMemo(() => {
    if (!selectedLine) return [];
    return lots
      .filter((lot) => lot.productId === selectedLine.productId && lotsAvailableMap[lot.id] > 0)
      .sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
  }, [selectedLine, lots, lotsAvailableMap]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return products
      .map((product) => {
        const productLots = lots.filter((l) => l.productId === product.id);
        const totalAvailable = productLots.reduce((sum, lot) => sum + (lotsAvailableMap[lot.id] || 0), 0);
        return { ...product, productLots, totalAvailable };
      })
      .filter((product) => !q || product.code.toLowerCase().includes(q) || product.name.toLowerCase().includes(q));
  }, [products, lots, lotsAvailableMap, productSearch]);

  const openAssignDialog = (lineId) => {
    setSelectedLineId(lineId);
    setSelectedLotId('');
    setAssignQty('');
    setAssignDialogOpen(true);
  };

  const handleLotSelect = (lotId) => {
    setSelectedLotId(lotId);
    if (!selectedLine) return;
    const available = lotsAvailableMap[Number(lotId)] || 0;
    const suggestedQty = Math.min(selectedLine.qtyToAssign, available);
    setAssignQty(String(suggestedQty));
  };

  const confirmAssignment = () => {
    if (!selectedLine || !selectedLotId || !assignQty) return;
    const lotId = Number(selectedLotId);
    const qty = Number(assignQty);
    if (!qty || qty <= 0) return;

    setAssignments((prev) => ({
      ...prev,
      [selectedLine.lineId]: [...(prev[selectedLine.lineId] || []), { assignmentId: `ASS-${Date.now()}`, lotId, qty }],
    }));

    setAssignDialogOpen(false);
    setSelectedLotId('');
    setAssignQty('');
  };

  const markOrderPrepared = () => {
    if (!selectedOrder) return;
    setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? { ...o, status: 'Preparato' } : o)));
  };

  return (
    <div className="app-shell">
      <div className="container">
        <div className="topbar card">
          <div>
            <h1>MAGAZZINO 2.0</h1>
            <p>Interfaccia semplificata per magazzino: pochi passaggi, bottoni grandi, dati chiari.</p>
          </div>
          <div className="nav-buttons">
            <Button className={page === 'ordini' ? '' : 'is-muted'} onClick={() => setPage('ordini')}>
              <ClipboardList size={20} /> Ordini
            </Button>
            <Button className={page === 'prodotti' ? '' : 'is-muted'} onClick={() => setPage('prodotti')}>
              <Package size={20} /> Prodotti
            </Button>
          </div>
        </div>

        {page === 'ordini' && (
          <div className="layout-orders">
            <Card>
              <div className="card-header"><h2>Ordini</h2></div>
              <div className="card-body stack">
                <div className="searchbox">
                  <Search size={16} className="search-icon" />
                  <input value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} placeholder="Cerca ordine o cliente" />
                </div>
                <div className="stack-sm">
                  {filteredOrders.map((order) => (
                    <button
                      key={order.id}
                      onClick={() => {
                        setSelectedOrderId(order.id);
                        setSelectedLineId(order.lines[0]?.lineId || '');
                      }}
                      className={`order-card ${selectedOrderId === order.id ? 'active' : ''}`}
                    >
                      <div className="row between start">
                        <div>
                          <div className="order-title">{order.id}</div>
                          <div className="muted">{order.customer}</div>
                        </div>
                        <Badge tone={order.computedStatus === 'Preparato' ? 'success' : 'default'}>{order.computedStatus}</Badge>
                      </div>
                      <div className="muted mt8">Da assegnare: {order.totalToAssign}</div>
                    </button>
                  ))}
                </div>
              </div>
            </Card>

            <Card>
              <div className="card-header"><h2>Preparazione ordine</h2></div>
              <div className="card-body stack-lg">
                {selectedOrder && (
                  <>
                    <div className="hero-box">
                      <div className="hero-title">{selectedOrder.id}</div>
                      <div className="muted">{selectedOrder.customer} · {fmtDate(selectedOrder.date)}</div>
                    </div>

                    <div className="split-layout">
                      <div className="stack">
                        {selectedOrder.lines.map((line) => {
                          const product = productMap[line.productId];
                          const active = selectedLineId === line.lineId;
                          return (
                            <button key={line.lineId} onClick={() => setSelectedLineId(line.lineId)} className={`line-card ${active ? 'active' : ''}`}>
                              <div className="row between start gap16">
                                <div>
                                  <div className="line-code">{product?.code}</div>
                                  <div className="muted-dark">{product?.name}</div>
                                </div>
                                <Badge tone={line.qtyToAssign === 0 ? 'success' : 'default'}>Da assegnare {line.qtyToAssign}</Badge>
                              </div>
                              <div className="metrics-grid mt16">
                                <div className="metric-box"><div className="metric-label">Ordinati</div><div className="metric-value">{line.qtyOrdered}</div></div>
                                <div className="metric-box"><div className="metric-label">Assegnati</div><div className="metric-value">{line.assignedQty}</div></div>
                                <div className="metric-box"><div className="metric-label">Da assegnare</div><div className={`metric-value ${line.qtyToAssign > 0 ? 'warn' : 'ok'}`}>{line.qtyToAssign}</div></div>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <div className="stack">
                        {selectedLine && (
                          <>
                            <Card className="inner-card">
                              <div className="card-body stack">
                                <div>
                                  <div className="section-title">{productMap[selectedLine.productId]?.name}</div>
                                  <div className="muted">Codice {productMap[selectedLine.productId]?.code}</div>
                                </div>
                                <div className="metrics-grid two-cols">
                                  <div className="metric-box"><div className="metric-label">Da assegnare</div><div className="metric-value">{selectedLine.qtyToAssign}</div></div>
                                  <div className="metric-box"><div className="metric-label">Lotti disponibili</div><div className="metric-value">{availableLotsForSelectedLine.length}</div></div>
                                </div>
                                <Button className="big-button" onClick={() => openAssignDialog(selectedLine.lineId)} disabled={selectedLine.qtyToAssign <= 0}>Assegna lotto</Button>
                              </div>
                            </Card>

                            <Card className="inner-card">
                              <div className="card-body stack">
                                <div className="section-title">Lotti assegnati</div>
                                {(assignments[selectedLine.lineId] || []).length === 0 ? (
                                  <div className="empty-box">Nessun lotto assegnato.</div>
                                ) : (
                                  (assignments[selectedLine.lineId] || []).map((a) => {
                                    const lot = lots.find((l) => l.id === a.lotId);
                                    return (
                                      <div key={a.assignmentId} className="assignment-box">
                                        <div className="assignment-title">Lotto {lot?.lot}</div>
                                        <div className="muted">Quantità {a.qty} · Scadenza {fmtDate(lot?.expiry)}</div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </Card>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="row end">
                      <Button className="big-button success" onClick={markOrderPrepared}><CheckCircle2 size={20} /> Segna ordine preparato</Button>
                    </div>
                  </>
                )}
              </div>
            </Card>
          </div>
        )}

        {page === 'prodotti' && (
          <Card>
            <div className="card-header"><h2>Prodotti e disponibilità</h2></div>
            <div className="card-body stack">
              <div className="searchbox maxw">
                <Search size={16} className="search-icon" />
                <input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Cerca prodotto o codice" />
              </div>
              <div className="products-grid">
                {filteredProducts.map((product) => (
                  <Card key={product.id} className="inner-card">
                    <div className="card-body stack">
                      <div className="row between start">
                        <div>
                          <div className="line-code">{product.code}</div>
                          <div className="muted-dark">{product.name}</div>
                        </div>
                        <Badge>Disponibili {product.totalAvailable}</Badge>
                      </div>
                      <div className="stack-sm">
                        {product.productLots.length === 0 ? (
                          <div className="warning-box"><AlertTriangle size={16} /> Nessun lotto disponibile</div>
                        ) : (
                          product.productLots.sort((a, b) => new Date(a.expiry) - new Date(b.expiry)).map((lot) => (
                            <div key={lot.id} className="assignment-box">
                              <div className="row between start">
                                <div>
                                  <div className="assignment-title">Lotto {lot.lot}</div>
                                  <div className="muted">Scadenza {fmtDate(lot.expiry)}</div>
                                </div>
                                <div className={`lot-qty ${lotsAvailableMap[lot.id] <= 10 ? 'warn' : ''}`}>{lotsAvailableMap[lot.id]}</div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </Card>
        )}

        {assignDialogOpen && selectedLine && (
          <div className="modal-backdrop" onClick={() => setAssignDialogOpen(false)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header"><h2>Assegna lotto</h2></div>
              <div className="stack-lg">
                <div className="hero-box small">
                  <div className="section-title">{productMap[selectedLine.productId]?.name}</div>
                  <div className="muted">Da assegnare: {selectedLine.qtyToAssign}</div>
                </div>

                <div className="stack-sm">
                  <label className="label">Lotto</label>
                  <select className="select" value={selectedLotId} onChange={(e) => handleLotSelect(e.target.value)}>
                    <option value="">Seleziona lotto</option>
                    {availableLotsForSelectedLine.map((lot) => (
                      <option key={lot.id} value={String(lot.id)}>
                        {lot.lot} · scad. {fmtDate(lot.expiry)} · disp. {lotsAvailableMap[lot.id]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="stack-sm">
                  <label className="label">Quantità</label>
                  <input type="number" min="0" className="input input-large" value={assignQty} onChange={(e) => setAssignQty(e.target.value)} placeholder="0" />
                  <p className="muted">Quantità proposta in automatico, ma modificabile a mano.</p>
                </div>

                <div className="row gap12 end wrap">
                  <Button variant="secondary" className="big-button muted-btn" onClick={() => setAssignDialogOpen(false)}>Annulla</Button>
                  <Button className="big-button" onClick={confirmAssignment}>Conferma lotto</Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
