const SPREADSHEET_ID = "1II2B8seE_aqNBNXSCTqUF6jSVu0Ifz6BidN9UrBOvSI";

const SHEET_VARIANTS = {
  prodotti: ["Prodotti", "PRODOTTI", "prodotti"],
  lotti: ["Lotti", "LOTTI", "lotti"],
  ordini: ["Ordini", "ORDINI", "ordini"],
  righeOrdine: [
    "Righe_Ordine",
    "Righe Ordine",
    "RigheOrdine",
    "RIGHE_ORDINE",
    "righeOrdine",
  ],
  assegnazioniLotti: [
    "Assegnazioni_Lotti",
    "Assegnazioni Lotti",
    "AssegnazioniLotti",
    "ASSEGNAZIONI_LOTTI",
    "assegnazioniLotti",
  ],
};

function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const callback = params.callback || "callback";
    const action = params.action || "";

    let result;

    if (!action) {
      result = getAllData();
    } else if (action === "createProduct") {
      result = createProduct_(parsePayload_(params.payload));
    } else if (action === "updateProduct") {
      result = updateProduct_(parsePayload_(params.payload));
    } else if (action === "deleteProduct") {
      result = deleteProduct_(
        params.productId ||
          getPayloadValue_(parsePayload_(params.payload), ["productId", "id", "code"])
      );
    } else if (action === "createLot") {
      result = createLot_(parsePayload_(params.payload));
    } else if (action === "deleteLot") {
      result = deleteLot_(
        params.lotId ||
          getPayloadValue_(parsePayload_(params.payload), ["lotId", "id", "lot", "lotCode"])
      );
    } else if (action === "createOrder") {
      result = createOrder_(parsePayload_(params.payload));
    } else if (action === "deleteOrder") {
      result = deleteOrder_(
        params.orderId || getPayloadValue_(parsePayload_(params.payload), ["orderId", "id"])
      );
    } else if (action === "markOrderPrepared") {
      result = markOrderPrepared_(
        params.orderId || getPayloadValue_(parsePayload_(params.payload), ["orderId", "id"])
      );
    } else if (action === "assignLot") {
      result = assignLot_(parsePayload_(params.payload));
    } else if (action === "deleteAssignment") {
      result = deleteAssignment_(
        params.assignmentId ||
          getPayloadValue_(parsePayload_(params.payload), ["assignmentId", "id"])
      );
    } else if (action === "deleteLine") {
      result = deleteLine_(
        params.lineId || getPayloadValue_(parsePayload_(params.payload), ["lineId", "id"])
      );
    } else if (action === "addOrderLine") {
      result = addOrderLine_(parsePayload_(params.payload));
    } else if (action === "updateOrderLine") {
      result = updateOrderLine_(parsePayload_(params.payload));
    } else {
      result = {
        success: false,
        error: "Azione non riconosciuta: " + action,
        debug: { branch: "unknown_action", action },
      };
    }

    return jsonp_(callback, result);
  } catch (error) {
    const callback = e && e.parameter && e.parameter.callback ? e.parameter.callback : "callback";

    return jsonp_(callback, {
      success: false,
      error: String(error),
      debug: { branch: "catch_doGet" },
    });
  }
}

function getAllData() {
  return {
    prodotti: sheetToObjects_("prodotti"),
    lotti: sheetToObjects_("lotti"),
    ordini: sheetToObjects_("ordini"),
    righeOrdine: sheetToObjects_("righeOrdine"),
    assegnazioniLotti: sheetToObjects_("assegnazioniLotti"),
    success: true,
    debug: { branch: "getAllData" },
  };
}

function createProduct_(payload) {
  const sheet = getSheet_("prodotti");
  const headers = getHeaders_(sheet);

  const productId =
    getPayloadValue_(payload, ["productId", "id", "ID_Prodotto", "Codice_Prodotto", "code"]) ||
    "PROD-" + Date.now();

  const code = getPayloadValue_(payload, ["code", "Codice_Prodotto", "productCode"]) || productId;
  const name =
    getPayloadValue_(payload, ["name", "productName", "Descrizione_Prodotto", "Descrizione"]) ||
    "";
  const uom = getPayloadValue_(payload, ["uom", "UM", "unit"]) || "pz";
  const categoria = getPayloadValue_(payload, ["category", "Categoria", "Categoria_Prodotto"]);
  const sottocategoria = getPayloadValue_(payload, [
    "subcategory",
    "Sottocategoria",
    "Sotto_Categoria",
    "Subcategoria",
  ]);

  if (!code || !name) {
    throw new Error("Codice prodotto e descrizione sono obbligatori");
  }

  const existing = findRowByAny_(sheet, headers, [
    { headers: ["ID_Prodotto", "Id_Prodotto", "id"], value: productId },
    { headers: ["Codice_Prodotto", "Codice prodotto", "Codice", "code"], value: code },
  ]);

  if (existing.rowIndex > 0) {
    throw new Error("Prodotto già presente");
  }

  const rowObject = {
    ID_Prodotto: productId,
    Codice_Prodotto: code,
    Descrizione_Prodotto: name,
    UM: uom,
    Categoria: categoria,
    Sottocategoria: sottocategoria,
  };

  appendObjectByHeaders_(sheet, headers, rowObject);

  return {
    success: true,
    productId,
    rowCreated: sheet.getLastRow(),
    writtenFields: Object.keys(rowObject),
    debug: { branch: "createProduct", action: "createProduct" },
  };
}

function updateProduct_(payload) {
  const sheet = getSheet_("prodotti");
  const headers = getHeaders_(sheet);

  const productId = getPayloadValue_(payload, ["productId", "id", "ID_Prodotto"]);
  const code = getPayloadValue_(payload, ["code", "Codice_Prodotto", "productCode"]);
  const name = getPayloadValue_(payload, ["name", "productName", "Descrizione_Prodotto"]);
  const uom = getPayloadValue_(payload, ["uom", "UM"]);
  const categoria = getPayloadValue_(payload, ["category", "Categoria", "Categoria_Prodotto"]);
  const sottocategoria = getPayloadValue_(payload, [
    "subcategory",
    "Sottocategoria",
    "Sotto_Categoria",
    "Subcategoria",
  ]);

  if (!productId && !code) {
    throw new Error("Prodotto non indicato");
  }

  const found = findRowByAny_(sheet, headers, [
    { headers: ["ID_Prodotto", "Id_Prodotto", "id"], value: productId },
    { headers: ["Codice_Prodotto", "Codice prodotto", "Codice", "code"], value: productId },
    { headers: ["Codice_Prodotto", "Codice prodotto", "Codice", "code"], value: code },
  ]);

  if (found.rowIndex < 1) {
    throw new Error("Prodotto non trovato");
  }

  const updatedFields = [];

  setCellIfHeaderExists_(
    sheet,
    headers,
    found.rowIndex,
    ["ID_Prodotto", "Id_Prodotto", "id"],
    productId || code,
    updatedFields
  );
  setCellIfHeaderExists_(
    sheet,
    headers,
    found.rowIndex,
    ["Codice_Prodotto", "Codice prodotto", "Codice", "code"],
    code,
    updatedFields
  );
  setCellIfHeaderExists_(
    sheet,
    headers,
    found.rowIndex,
    ["Descrizione_Prodotto", "Descrizione prodotto", "Descrizione", "name"],
    name,
    updatedFields
  );
  setCellIfHeaderExists_(
    sheet,
    headers,
    found.rowIndex,
    ["UM", "U_M", "Unità_Misura", "Unità di misura", "uom"],
    uom,
    updatedFields
  );
  setCellIfHeaderExists_(
    sheet,
    headers,
    found.rowIndex,
    ["Categoria", "category", "Categoria_Prodotto"],
    categoria,
    updatedFields
  );
  setCellIfHeaderExists_(
    sheet,
    headers,
    found.rowIndex,
    ["Sottocategoria", "Sotto_Categoria", "Subcategoria", "subcategory"],
    sottocategoria,
    updatedFields
  );

  return {
    success: true,
    productId: productId || code,
    rowUpdated: found.rowIndex,
    matchedBy: found.matchedBy,
    updatedFields,
    debug: { branch: "updateProduct", action: "updateProduct" },
  };
}

function deleteProduct_(productId) {
  if (!productId) {
    throw new Error("Prodotto non indicato");
  }

  const sheet = getSheet_("prodotti");
  const headers = getHeaders_(sheet);

  const found = findRowByAny_(sheet, headers, [
    { headers: ["ID_Prodotto", "Id_Prodotto", "id"], value: productId },
    { headers: ["Codice_Prodotto", "Codice prodotto", "Codice", "code"], value: productId },
  ]);

  if (found.rowIndex < 1) {
    throw new Error("Prodotto non trovato");
  }

  sheet.deleteRow(found.rowIndex);

  return {
    success: true,
    productId,
    rowDeleted: found.rowIndex,
    matchedBy: found.matchedBy,
    debug: { branch: "deleteProduct", action: "deleteProduct" },
  };
}

function createLot_(payload) {
  const sheet = getSheet_("lotti");
  const headers = getHeaders_(sheet);

  const lotId = getPayloadValue_(payload, ["lotId", "id", "ID_Lotto"]) || "LOT-" + Date.now();
  const productId = getPayloadValue_(payload, ["productId", "ID_Prodotto", "Codice_Prodotto"]);
  const lotCode = getPayloadValue_(payload, ["lot", "lotCode", "Codice_Lotto", "Lotto"]) || lotId;
  const expiry = getPayloadValue_(payload, ["expiry", "Scadenza", "Data_Scadenza"]);
  const loadedQty = Number(
    getPayloadValue_(payload, [
      "loadedQty",
      "qty",
      "Quantità_Caricata",
      "Quantita_Caricata",
    ]) || 0
  );

  if (!productId) {
    throw new Error("Prodotto non indicato");
  }

  if (!lotCode) {
    throw new Error("Codice lotto non indicato");
  }

  if (!loadedQty || loadedQty <= 0) {
    throw new Error("Quantità lotto non valida");
  }

  const rowObject = {
    ID_Lotto: lotId,
    ID_Prodotto: productId,
    Codice_Prodotto: productId,
    Codice_Lotto: lotCode,
    Lotto: lotCode,
    Scadenza: expiry,
    Quantità_Caricata: loadedQty,
    Quantita_Caricata: loadedQty,
  };

  appendObjectByHeaders_(sheet, headers, rowObject);

  return {
    success: true,
    lotId: lotCode,
    rowCreated: sheet.getLastRow(),
    writtenFields: Object.keys(rowObject),
    debug: { branch: "createLot", action: "createLot" },
  };
}

function deleteLot_(lotId) {
  if (!lotId) {
    throw new Error("Lotto non indicato");
  }

  const sheet = getSheet_("lotti");
  const headers = getHeaders_(sheet);
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    throw new Error("Nessun lotto presente");
  }

  const wanted = normalizeLotValue_(lotId);

  const candidateHeaders = [
    "ID_Lotto",
    "Id_Lotto",
    "id",
    "Codice_Lotto",
    "Codice lotto",
    "Lotto",
  ];

  const candidateCols = candidateHeaders
    .map(function (headerName) {
      return findHeaderIndex_(headers, [headerName]);
    })
    .filter(function (index, position, array) {
      return index >= 0 && array.indexOf(index) === position;
    });

  if (candidateCols.length === 0) {
    throw new Error("Colonne lotto non trovate");
  }

  for (let r = 1; r < data.length; r++) {
    for (let c = 0; c < candidateCols.length; c++) {
      const colIndex = candidateCols[c];
      const cellValue = normalizeLotValue_(data[r][colIndex]);

      if (cellValue === wanted) {
        const rowToDelete = r + 1;
        sheet.deleteRow(rowToDelete);

        return {
          success: true,
          lotId,
          rowDeleted: rowToDelete,
          matchedBy: headers[colIndex],
          debug: {
            branch: "deleteLot",
            action: "deleteLot",
            wanted,
          },
        };
      }
    }
  }

  throw new Error("Lotto non trovato: " + lotId);
}

function createOrder_(payload) {
  const orderSheet = getSheet_("ordini");
  const lineSheet = getSheet_("righeOrdine");

  const orderHeaders = getHeaders_(orderSheet);
  const lineHeaders = getHeaders_(lineSheet);

  const orderId = getPayloadValue_(payload, ["id", "orderId", "ID_Ordine"]) || "ORD-" + Date.now();
  const customer = getPayloadValue_(payload, ["customer", "Cliente"]) || "";
  const status = getPayloadValue_(payload, ["status", "Stato"]) || "Da preparare";
  const date = getPayloadValue_(payload, ["date", "Data_Ordine"]) || new Date();
  const lines = payload.lines || [];

  if (!customer) {
    throw new Error("Cliente non indicato");
  }

  if (!lines.length) {
    throw new Error("Nessuna riga ordine indicata");
  }

  appendObjectByHeaders_(orderSheet, orderHeaders, {
    ID_Ordine: orderId,
    Cliente: customer,
    Stato: status,
    Data_Ordine: date,
  });

  lines.forEach(function (line, index) {
    const lineId =
      getPayloadValue_(line, ["lineId", "ID_Riga"]) || "RIGA-" + Date.now() + "-" + index;
    const productId = getPayloadValue_(line, ["productId", "productCode", "Codice_Prodotto"]);
    const qtyOrdered = Number(
      getPayloadValue_(line, ["qtyOrdered", "Quantità_Ordinata", "Quantita_Ordinata"]) || 0
    );

    appendObjectByHeaders_(lineSheet, lineHeaders, {
      ID_Riga: lineId,
      ID_Ordine: orderId,
      ID_Prodotto: productId,
      Codice_Prodotto: productId,
      Quantità_Ordinata: qtyOrdered,
      Quantita_Ordinata: qtyOrdered,
      Quantità_Assegnata: 0,
      Quantita_Assegnata: 0,
    });
  });

  return {
    success: true,
    orderId,
    linesCreated: lines.length,
    debug: { branch: "createOrder", action: "createOrder" },
  };
}

function deleteOrder_(orderId) {
  if (!orderId) {
    throw new Error("Ordine non indicato");
  }

  const orderSheet = getSheet_("ordini");
  const lineSheet = getSheet_("righeOrdine");
  const assignmentSheet = getSheet_("assegnazioniLotti");

  const orderHeaders = getHeaders_(orderSheet);
  const lineHeaders = getHeaders_(lineSheet);
  const assignmentHeaders = getHeaders_(assignmentSheet);

  const lineIds = getLineIdsByOrderId_(lineSheet, lineHeaders, orderId);

  let assignmentsDeleted = 0;

  lineIds.forEach(function (lineId) {
    assignmentsDeleted += deleteRowsByValue_(
      assignmentSheet,
      assignmentHeaders,
      ["ID_Riga", "Id_Riga", "Riga"],
      lineId
    );
  });

  const linesDeleted = deleteRowsByValue_(
    lineSheet,
    lineHeaders,
    ["ID_Ordine", "Id_Ordine", "Ordine"],
    orderId
  );

  const foundOrder = findRowByAny_(orderSheet, orderHeaders, [
    { headers: ["ID_Ordine", "Id_Ordine", "Ordine", "id"], value: orderId },
  ]);

  if (foundOrder.rowIndex > 0) {
    orderSheet.deleteRow(foundOrder.rowIndex);
  }

  return {
    success: true,
    orderId,
    linesDeleted,
    assignmentsDeleted,
    orderDeleted: foundOrder.rowIndex > 0,
    debug: { branch: "deleteOrder", action: "deleteOrder" },
  };
}

function markOrderPrepared_(orderId) {
  if (!orderId) {
    throw new Error("Ordine non indicato");
  }

  const orderSheet = getSheet_("ordini");
  const lineSheet = getSheet_("righeOrdine");
  const assignmentSheet = getSheet_("assegnazioniLotti");
  const lotSheet = getSheet_("lotti");

  const orderHeaders = getHeaders_(orderSheet);
  const lineHeaders = getHeaders_(lineSheet);
  const assignmentHeaders = getHeaders_(assignmentSheet);
  const lotHeaders = getHeaders_(lotSheet);

  const foundOrder = findRowByAny_(orderSheet, orderHeaders, [
    { headers: ["ID_Ordine", "Id_Ordine", "Ordine", "id"], value: orderId },
  ]);

  if (foundOrder.rowIndex < 1) {
    throw new Error("Ordine non trovato");
  }

  const currentStatus = getValueFromRow_(orderSheet, orderHeaders, foundOrder.rowIndex, [
    "Stato",
    "status",
  ]);

  if (normalizeLotValue_(currentStatus) === "preparato") {
    return {
      success: true,
      orderId,
      alreadyPrepared: true,
      stockMovements: [],
      debug: { branch: "markOrderPrepared", action: "alreadyPrepared" },
    };
  }

  const lineData = lineSheet.getDataRange().getValues();
  const lineIdCol = findHeaderIndex_(lineHeaders, ["ID_Riga", "Id_Riga", "id"]);
  const orderIdCol = findHeaderIndex_(lineHeaders, ["ID_Ordine", "Id_Ordine", "Ordine"]);
  const qtyOrderedCol = findHeaderIndex_(lineHeaders, [
    "Quantità_Ordinata",
    "Quantita_Ordinata",
    "Quantità ordinata",
    "Quantita ordinata",
  ]);

  if (lineIdCol < 0 || orderIdCol < 0 || qtyOrderedCol < 0) {
    throw new Error("Colonne righe ordine non complete");
  }

  const orderLines = [];

  for (let r = 1; r < lineData.length; r++) {
    if (normalizeLotValue_(lineData[r][orderIdCol]) === normalizeLotValue_(orderId)) {
      orderLines.push({
        lineId: lineData[r][lineIdCol],
        qtyOrdered: Number(lineData[r][qtyOrderedCol] || 0),
      });
    }
  }

  if (orderLines.length === 0) {
    throw new Error("Nessuna riga ordine trovata");
  }

  const assignmentData = assignmentSheet.getDataRange().getValues();

  const assignmentLineCol = findHeaderIndex_(assignmentHeaders, ["ID_Riga", "Id_Riga", "Riga"]);
  const assignmentQtyCol = findHeaderIndex_(assignmentHeaders, [
    "Quantità_Assegnata",
    "Quantita_Assegnata",
    "Quantità assegnata",
    "Quantita assegnata",
    "Quantita_A",
  ]);

  const assignmentLotCols = [
    findHeaderIndex_(assignmentHeaders, ["ID_Lotto", "Id_Lotto", "id"]),
    findHeaderIndex_(assignmentHeaders, ["Codice_Lotto", "Codice lotto"]),
    findHeaderIndex_(assignmentHeaders, ["Lotto"]),
  ].filter(function (index, position, array) {
    return index >= 0 && array.indexOf(index) === position;
  });

  if (assignmentLineCol < 0 || assignmentQtyCol < 0 || assignmentLotCols.length === 0) {
    throw new Error("Colonne assegnazioni lotti non complete");
  }

  const stockMovements = [];

  orderLines.forEach(function (line) {
    let assignedForLine = 0;
    const assignmentsForLine = [];

    for (let r = 1; r < assignmentData.length; r++) {
      if (normalizeLotValue_(assignmentData[r][assignmentLineCol]) !== normalizeLotValue_(line.lineId)) {
        continue;
      }

      const qty = Number(assignmentData[r][assignmentQtyCol] || 0);

      if (!qty || qty <= 0) {
        continue;
      }

      let lotValue = "";

      for (let c = 0; c < assignmentLotCols.length; c++) {
        const candidate = assignmentData[r][assignmentLotCols[c]];

        if (candidate !== undefined && candidate !== null && candidate !== "") {
          lotValue = candidate;
          break;
        }
      }

      if (!lotValue) {
        throw new Error("Lotto non indicato su assegnazione riga " + line.lineId);
      }

      assignedForLine += qty;

      assignmentsForLine.push({
        lineId: line.lineId,
        lotValue,
        qty,
      });
    }

    if (assignedForLine < line.qtyOrdered) {
      throw new Error(
        "Ordine non completamente assegnato. Riga " +
          line.lineId +
          ": ordinati " +
          line.qtyOrdered +
          ", assegnati " +
          assignedForLine
      );
    }

    assignmentsForLine.forEach(function (assignment) {
      const movement = reduceLotStock_(
        lotSheet,
        lotHeaders,
        assignment.lotValue,
        assignment.qty,
        assignment.lineId
      );

      stockMovements.push(movement);
    });
  });

  const updatedFields = [];

  setCellIfHeaderExists_(
    orderSheet,
    orderHeaders,
    foundOrder.rowIndex,
    ["Stato", "status"],
    "Preparato",
    updatedFields
  );

  return {
    success: true,
    orderId,
    rowUpdated: foundOrder.rowIndex,
    updatedFields,
    stockMovements,
    debug: { branch: "markOrderPrepared", action: "markOrderPrepared" },
  };
}

function reduceLotStock_(lotSheet, lotHeaders, lotValue, qtyToSubtract, lineId) {
  const foundLot = findRowByAny_(lotSheet, lotHeaders, [
    { headers: ["ID_Lotto", "Id_Lotto", "id"], value: lotValue },
    { headers: ["Codice_Lotto", "Codice lotto"], value: lotValue },
    { headers: ["Lotto"], value: lotValue },
  ]);

  if (foundLot.rowIndex < 1) {
    throw new Error("Lotto da scaricare non trovato: " + lotValue);
  }

  const qtyCol = findHeaderIndex_(lotHeaders, [
    "Quantità_Caricata",
    "Quantita_Caricata",
    "Quantità caricata",
    "Quantita caricata",
    "Qta",
  ]);

  if (qtyCol < 0) {
    throw new Error("Colonna quantità caricata non trovata nel foglio Lotti");
  }

  const currentQty = Number(lotSheet.getRange(foundLot.rowIndex, qtyCol + 1).getValue() || 0);
  const qty = Number(qtyToSubtract || 0);

  if (qty > currentQty) {
    throw new Error(
      "Quantità insufficiente sul lotto " +
        lotValue +
        ". Disponibile " +
        currentQty +
        ", da scaricare " +
        qty
    );
  }

  const newQty = currentQty - qty;

  lotSheet.getRange(foundLot.rowIndex, qtyCol + 1).setValue(newQty);

  return {
    lot: lotValue,
    lineId,
    rowUpdated: foundLot.rowIndex,
    matchedBy: foundLot.matchedBy,
    previousQty: currentQty,
    qtySubtracted: qty,
    newQty,
  };
}

function assignLot_(payload) {
  const sheet = getSheet_("assegnazioniLotti");
  const headers = getHeaders_(sheet);

  const assignmentId =
    getPayloadValue_(payload, ["assignmentId", "ID_Assegnazione", "id"]) || "ASS-" + Date.now();

  const lineId = getPayloadValue_(payload, ["lineId", "ID_Riga"]);
  const lotId = getPayloadValue_(payload, ["lotId", "ID_Lotto"]);
  const lotCode = getPayloadValue_(payload, ["lotCode", "lot", "Codice_Lotto", "Lotto"]) || lotId;
  const qty = Number(
    getPayloadValue_(payload, ["qty", "Quantità_Assegnata", "Quantita_Assegnata"]) || 0
  );

  if (!lineId) {
    throw new Error("Riga ordine non indicata");
  }

  if (!lotId && !lotCode) {
    throw new Error("Lotto non indicato");
  }

  if (!qty || qty <= 0) {
    throw new Error("Quantità assegnazione non valida");
  }

  appendObjectByHeaders_(sheet, headers, {
    ID_Assegnazione: assignmentId,
    ID_Riga: lineId,
    ID_Lotto: lotCode,
    Codice_Lotto: lotCode,
    Lotto: lotCode,
    Quantità_Assegnata: qty,
    Quantita_Assegnata: qty,
  });

  return {
    success: true,
    assignmentId,
    lineId,
    rowCreated: sheet.getLastRow(),
    debug: { branch: "assignLot", action: "assignLot" },
  };
}

function deleteAssignment_(assignmentId) {
  if (!assignmentId) {
    throw new Error("Assegnazione non indicata");
  }

  const sheet = getSheet_("assegnazioniLotti");
  const headers = getHeaders_(sheet);

  const found = findRowByAny_(sheet, headers, [
    { headers: ["ID_Assegnazione", "Id_Assegnazione", "id"], value: assignmentId },
  ]);

  if (found.rowIndex < 1) {
    throw new Error("Assegnazione non trovata");
  }

  const lineId = getValueFromRow_(sheet, headers, found.rowIndex, ["ID_Riga", "Id_Riga", "Riga"]);

  sheet.deleteRow(found.rowIndex);

  return {
    success: true,
    assignmentId,
    lineId,
    rowDeleted: found.rowIndex,
    debug: { branch: "deleteAssignment", action: "deleteAssignment" },
  };
}

function deleteLine_(lineId) {
  if (!lineId) {
    throw new Error("Riga ordine non indicata");
  }

  const lineSheet = getSheet_("righeOrdine");
  const orderSheet = getSheet_("ordini");
  const assignmentSheet = getSheet_("assegnazioniLotti");

  const lineHeaders = getHeaders_(lineSheet);
  const orderHeaders = getHeaders_(orderSheet);
  const assignmentHeaders = getHeaders_(assignmentSheet);

  const foundLine = findRowByAny_(lineSheet, lineHeaders, [
    { headers: ["ID_Riga", "Id_Riga", "id"], value: lineId },
  ]);

  if (foundLine.rowIndex < 1) {
    throw new Error("Riga ordine non trovata");
  }

  const orderId = getValueFromRow_(lineSheet, lineHeaders, foundLine.rowIndex, [
    "ID_Ordine",
    "Id_Ordine",
    "Ordine",
  ]);

  const assignmentsDeleted = deleteRowsByValue_(
    assignmentSheet,
    assignmentHeaders,
    ["ID_Riga", "Id_Riga", "Riga"],
    lineId
  );

  lineSheet.deleteRow(foundLine.rowIndex);

  const remainingLineIds = getLineIdsByOrderId_(lineSheet, lineHeaders, orderId);

  let orderDeleted = false;

  if (remainingLineIds.length === 0 && orderId) {
    const foundOrder = findRowByAny_(orderSheet, orderHeaders, [
      { headers: ["ID_Ordine", "Id_Ordine", "Ordine", "id"], value: orderId },
    ]);

    if (foundOrder.rowIndex > 0) {
      orderSheet.deleteRow(foundOrder.rowIndex);
      orderDeleted = true;
    }
  }

  return {
    success: true,
    lineId,
    orderId,
    rowDeleted: foundLine.rowIndex,
    assignmentsDeleted,
    orderDeleted,
    debug: { branch: "deleteLine", action: "deleteLine" },
  };
}

function addOrderLine_(payload) {
  const lineSheet = getSheet_("righeOrdine");
  const orderSheet = getSheet_("ordini");

  const lineHeaders = getHeaders_(lineSheet);
  const orderHeaders = getHeaders_(orderSheet);

  const orderId = getPayloadValue_(payload, ["orderId", "ID_Ordine", "idOrdine"]);
  const lineId = getPayloadValue_(payload, ["lineId", "ID_Riga", "id"]) || "RIGA-" + Date.now();

  const productId = getPayloadValue_(payload, [
    "productId",
    "productCode",
    "ID_Prodotto",
    "Codice_Prodotto",
    "code",
  ]);

  const qtyOrdered = Number(
    getPayloadValue_(payload, ["qtyOrdered", "qty", "Quantità_Ordinata", "Quantita_Ordinata"]) ||
      0
  );

  if (!orderId) {
    throw new Error("Ordine non indicato");
  }

  if (!productId) {
    throw new Error("Prodotto non indicato");
  }

  if (!qtyOrdered || qtyOrdered <= 0) {
    throw new Error("Quantità ordinata non valida");
  }

  const foundOrder = findRowByAny_(orderSheet, orderHeaders, [
    { headers: ["ID_Ordine", "Id_Ordine", "Ordine", "id"], value: orderId },
  ]);

  if (foundOrder.rowIndex < 1) {
    throw new Error("Ordine non trovato");
  }

  const existingLine = findRowByAny_(lineSheet, lineHeaders, [
    { headers: ["ID_Riga", "Id_Riga", "id"], value: lineId },
  ]);

  if (existingLine.rowIndex > 0) {
    throw new Error("Riga ordine già presente");
  }

  appendObjectByHeaders_(lineSheet, lineHeaders, {
    ID_Riga: lineId,
    ID_Ordine: orderId,
    ID_Prodotto: productId,
    Codice_Prodotto: productId,
    Quantità_Ordinata: qtyOrdered,
    Quantita_Ordinata: qtyOrdered,
    Quantità_Assegnata: 0,
    Quantita_Assegnata: 0,
  });

  return {
    success: true,
    lineId,
    orderId,
    productId,
    qtyOrdered,
    rowCreated: lineSheet.getLastRow(),
    debug: { branch: "addOrderLine", action: "addOrderLine" },
  };
}

function updateOrderLine_(payload) {
  const lineSheet = getSheet_("righeOrdine");
  const assignmentSheet = getSheet_("assegnazioniLotti");

  const lineHeaders = getHeaders_(lineSheet);
  const assignmentHeaders = getHeaders_(assignmentSheet);

  const lineId = getPayloadValue_(payload, ["lineId", "ID_Riga", "id"]);
  const newProductId = getPayloadValue_(payload, [
    "productId",
    "productCode",
    "ID_Prodotto",
    "Codice_Prodotto",
    "code",
  ]);

  const qtyValue = getPayloadValue_(payload, [
    "qtyOrdered",
    "qty",
    "Quantità_Ordinata",
    "Quantita_Ordinata",
  ]);

  const hasQty = qtyValue !== "";
  const newQtyOrdered = Number(qtyValue || 0);

  if (!lineId) {
    throw new Error("Riga ordine non indicata");
  }

  const foundLine = findRowByAny_(lineSheet, lineHeaders, [
    { headers: ["ID_Riga", "Id_Riga", "id"], value: lineId },
  ]);

  if (foundLine.rowIndex < 1) {
    throw new Error("Riga ordine non trovata");
  }

  const assignedQty = getAssignedQtyForLine_(assignmentSheet, assignmentHeaders, lineId);
  const hasAssignments = assignedQty > 0;

  if (newProductId && hasAssignments) {
    throw new Error("Non puoi cambiare prodotto su una riga che ha già lotti assegnati");
  }

  if (hasQty && (!newQtyOrdered || newQtyOrdered <= 0)) {
    throw new Error("Quantità ordinata non valida");
  }

  if (hasQty && newQtyOrdered < assignedQty) {
    throw new Error("La nuova quantità non può essere minore della quantità già assegnata");
  }

  const updatedFields = [];

  if (newProductId) {
    setCellIfHeaderExists_(
      lineSheet,
      lineHeaders,
      foundLine.rowIndex,
      ["ID_Prodotto", "Id_Prodotto"],
      newProductId,
      updatedFields
    );
    setCellIfHeaderExists_(
      lineSheet,
      lineHeaders,
      foundLine.rowIndex,
      ["Codice_Prodotto", "Codice prodotto", "Codice", "Prodotto"],
      newProductId,
      updatedFields
    );
  }

  if (hasQty) {
    setCellIfHeaderExists_(
      lineSheet,
      lineHeaders,
      foundLine.rowIndex,
      ["Quantità_Ordinata", "Quantita_Ordinata", "Quantità ordinata", "Quantita ordinata"],
      newQtyOrdered,
      updatedFields
    );
  }

  return {
    success: true,
    lineId,
    productId: newProductId || "",
    qtyOrdered: hasQty ? newQtyOrdered : "",
    assignedQty,
    rowUpdated: foundLine.rowIndex,
    updatedFields,
    debug: { branch: "updateOrderLine", action: "updateOrderLine" },
  };
}

function getAssignedQtyForLine_(sheet, headers, lineId) {
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    return 0;
  }

  const lineCol = findHeaderIndex_(headers, ["ID_Riga", "Id_Riga", "Riga"]);
  const qtyCol = findHeaderIndex_(headers, [
    "Quantità_Assegnata",
    "Quantita_Assegnata",
    "Quantità assegnata",
    "Quantita assegnata",
    "Quantita_A",
  ]);

  if (lineCol < 0 || qtyCol < 0) {
    return 0;
  }

  let total = 0;

  for (let r = 1; r < data.length; r++) {
    if (normalizeLotValue_(data[r][lineCol]) === normalizeLotValue_(lineId)) {
      total += Number(data[r][qtyCol] || 0);
    }
  }

  return total;
}

function getLineIdsByOrderId_(sheet, headers, orderId) {
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    return [];
  }

  const orderCol = findHeaderIndex_(headers, ["ID_Ordine", "Id_Ordine", "Ordine"]);
  const lineCol = findHeaderIndex_(headers, ["ID_Riga", "Id_Riga", "id"]);

  if (orderCol < 0 || lineCol < 0) {
    return [];
  }

  const lineIds = [];

  for (let r = 1; r < data.length; r++) {
    if (normalizeLotValue_(data[r][orderCol]) === normalizeLotValue_(orderId)) {
      lineIds.push(String(data[r][lineCol]));
    }
  }

  return lineIds;
}

function deleteRowsByValue_(sheet, headers, headerCandidates, value) {
  if (!value) {
    return 0;
  }

  const col = findHeaderIndex_(headers, headerCandidates);

  if (col < 0) {
    return 0;
  }

  const data = sheet.getDataRange().getValues();
  let deleted = 0;

  for (let r = data.length - 1; r >= 1; r--) {
    if (normalizeLotValue_(data[r][col]) === normalizeLotValue_(value)) {
      sheet.deleteRow(r + 1);
      deleted++;
    }
  }

  return deleted;
}

function sheetToObjects_(key) {
  const sheet = getSheet_(key);
  const values = sheet.getDataRange().getValues();

  if (!values.length) {
    return [];
  }

  const headers = values[0].map(function (header) {
    return String(header).trim();
  });

  return values
    .slice(1)
    .filter(function (row) {
      return row.some(function (cell) {
        return cell !== "";
      });
    })
    .map(function (row) {
      const obj = {};

      headers.forEach(function (header, index) {
        obj[header] = row[index];
      });

      return obj;
    });
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSheet_(key) {
  const ss = getSpreadsheet_();
  const variants = SHEET_VARIANTS[key] || [key];

  for (let i = 0; i < variants.length; i++) {
    const sheet = ss.getSheetByName(variants[i]);

    if (sheet) {
      return sheet;
    }
  }

  throw new Error("Foglio non trovato: " + key);
}

function getHeaders_(sheet) {
  const lastColumn = sheet.getLastColumn();

  if (lastColumn < 1) {
    throw new Error("Il foglio " + sheet.getName() + " non ha intestazioni");
  }

  return sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (header) {
    return String(header).trim();
  });
}

function appendObjectByHeaders_(sheet, headers, object) {
  const row = headers.map(function (header) {
    if (object[header] !== undefined) {
      return object[header];
    }

    const normalizedHeader = normalize_(header);

    for (const key in object) {
      if (normalize_(key) === normalizedHeader) {
        return object[key];
      }
    }

    return "";
  });

  sheet.appendRow(row);
}

function setCellIfHeaderExists_(sheet, headers, rowIndex, headerCandidates, value, updatedFields) {
  if (value === undefined || value === null || value === "") {
    return;
  }

  const col = findHeaderIndex_(headers, headerCandidates);

  if (col < 0) {
    return;
  }

  sheet.getRange(rowIndex, col + 1).setValue(value);

  if (updatedFields) {
    updatedFields.push(headers[col]);
  }
}

function getValueFromRow_(sheet, headers, rowIndex, headerCandidates) {
  const col = findHeaderIndex_(headers, headerCandidates);

  if (col < 0) {
    return "";
  }

  return sheet.getRange(rowIndex, col + 1).getValue();
}

function findRowByAny_(sheet, headers, matchers) {
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    return { rowIndex: -1, matchedBy: "" };
  }

  for (let m = 0; m < matchers.length; m++) {
    const matcher = matchers[m];

    if (matcher.value === undefined || matcher.value === null || matcher.value === "") {
      continue;
    }

    const col = findHeaderIndex_(headers, matcher.headers);

    if (col < 0) {
      continue;
    }

    for (let r = 1; r < data.length; r++) {
      if (normalizeLotValue_(data[r][col]) === normalizeLotValue_(matcher.value)) {
        return {
          rowIndex: r + 1,
          matchedBy: headers[col],
        };
      }
    }
  }

  return { rowIndex: -1, matchedBy: "" };
}

function findHeaderIndex_(headers, candidates) {
  const normalizedHeaders = headers.map(normalize_);

  for (let i = 0; i < candidates.length; i++) {
    const wanted = normalize_(candidates[i]);
    const index = normalizedHeaders.indexOf(wanted);

    if (index >= 0) {
      return index;
    }
  }

  return -1;
}

function parsePayload_(payload) {
  if (!payload) {
    return {};
  }

  if (typeof payload === "object") {
    return payload;
  }

  try {
    return JSON.parse(payload);
  } catch (error) {
    try {
      return JSON.parse(decodeURIComponent(payload));
    } catch (innerError) {
      throw new Error("Payload non valido");
    }
  }
}

function getPayloadValue_(payload, keys) {
  if (!payload) {
    return "";
  }

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];

    if (payload[key] !== undefined && payload[key] !== null && payload[key] !== "") {
      return payload[key];
    }
  }

  return "";
}

function normalize_(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[àá]/g, "a")
    .replace(/[èé]/g, "e")
    .replace(/[ìí]/g, "i")
    .replace(/[òó]/g, "o")
    .replace(/[ùú]/g, "u");
}

function normalizeLotValue_(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value)
    .trim()
    .replace(/\.0$/, "")
    .toLowerCase();
}

function jsonp_(callback, data) {
  const safeCallback = callback || "callback";

  return ContentService
    .createTextOutput(safeCallback + "(" + JSON.stringify(data) + ")")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function trovaGoogleSheet() {
  const ss = getSpreadsheet_();

  Logger.log("NOME FILE: " + ss.getName());
  Logger.log("URL FILE: " + ss.getUrl());
  Logger.log("ID FILE: " + ss.getId());

  const sheets = ss.getSheets().map(function (sheet) {
    return sheet.getName() + " (" + sheet.getLastRow() + " righe)";
  });

  Logger.log("FOGLI: " + sheets.join(", "));
}
