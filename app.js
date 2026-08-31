import {
  currentUser,
  emptyState,
  isCloudConfigured,
  loadState,
  normalizeState,
  onCloudAuthChange,
  saveStateData,
  signInWithEmail,
  signOutCloud,
  signUpWithEmail,
  storageSummary,
} from "./storage.js";
import {
  parseIncomingMessage as parseIncomingMessageDraft,
  splitMessages as splitImportedMessages,
} from "./message-parser.js";
import { bindExtensionBridge as bindWhatsAppExtensionBridge } from "./extension-bridge.js";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const today = () => new Date().toISOString().slice(0, 10);
const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

let state = await loadState();
let dashboardPeriod = {
  start: addDays(today(), -29),
  end: today(),
};
let financePeriod = {
  start: "",
  end: "",
};
let financePersonFilter = "";
let salesPeriod = {
  start: "",
  end: "",
};
let salesFilters = {
  type: "",
  value: "",
};
let productSalesPeriod = {
  start: "",
  end: "",
};
let stockTransferPeriod = {
  start: "",
  end: "",
};
let stockTransferFilters = {
  delivererId: "",
  productId: "",
};
let delivererEarningsPeriod = {
  start: "",
  end: "",
};
let delivererEarningsPersonFilter = "";
const lastSaleStorageKey = "codPerfumesErp.lastSale";

const views = {
  dashboard: "Visao geral",
  sales: "Vendas",
  "product-sales": "Produtos vendidos",
  products: "Estoque",
  "stock-entry": "Entrada estoque",
  "stock-alerts": "Alertas de estoque",
  "courier-stock": "Estoque entregador",
  "deliverer-earnings": "Ganhos entregadores",
  campaigns: "Campanhas",
  people: "Colaboradores",
  finance: "Conta corrente",
  integrations: "Integracoes",
  settings: "Backup",
};

const bulkDeleteTables = {
  sales: "#salesRows",
  products: "#productRows",
  stockEntries: "#stockEntryRows",
  campaigns: "#campaignRows",
  people: "#peopleRows",
};

function bulkDeleteCheckbox(view, id, label = "registro") {
  return `<input class="row-checkbox" data-bulk-delete-select="${view}" value="${escapeHtml(id)}" type="checkbox" aria-label="Selecionar ${escapeHtml(label)}" />`;
}

function setupBulkDeleteTables() {
  Object.entries(bulkDeleteTables).forEach(([view, selector]) => {
    const rows = document.querySelector(selector);
    const table = rows?.closest("table");
    const wrap = rows?.closest(".table-wrap");
    if (!rows || !table || !wrap || wrap.querySelector(`[data-bulk-delete-controls="${view}"]`)) return;
    table.querySelector("thead tr")?.insertAdjacentHTML("afterbegin", `<th><span class="sr-only">Selecionar</span></th>`);
    const controls = document.createElement("div");
    controls.className = "bulk-actions";
    controls.dataset.bulkDeleteControls = view;
    controls.innerHTML = `
      <label class="checkbox-label"><input data-bulk-delete-all="${view}" type="checkbox" /> Selecionar tudo</label>
      <button class="danger small" data-bulk-delete-button="${view}" type="button" disabled>Excluir selecionados</button>
      <span data-bulk-delete-count="${view}">0 selecionados</span>
    `;
    wrap.prepend(controls);
  });

  document.addEventListener("change", (event) => {
    const selectAll = event.target.closest("[data-bulk-delete-all]");
    if (selectAll) {
      const view = selectAll.dataset.bulkDeleteAll;
      document.querySelectorAll(`[data-bulk-delete-select="${view}"]`).forEach((checkbox) => {
        checkbox.checked = selectAll.checked;
      });
      updateBulkDeleteControls(view);
      return;
    }
    const checkbox = event.target.closest("[data-bulk-delete-select]");
    if (checkbox) updateBulkDeleteControls(checkbox.dataset.bulkDeleteSelect);
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-bulk-delete-button]");
    if (button) deleteSelectedRecords(button.dataset.bulkDeleteButton);
  });
}

function updateBulkDeleteControls(view) {
  const checkboxes = [...document.querySelectorAll(`[data-bulk-delete-select="${view}"]`)];
  const selectedCount = checkboxes.filter((checkbox) => checkbox.checked).length;
  const selectAll = document.querySelector(`[data-bulk-delete-all="${view}"]`);
  const button = document.querySelector(`[data-bulk-delete-button="${view}"]`);
  const count = document.querySelector(`[data-bulk-delete-count="${view}"]`);
  if (selectAll) {
    selectAll.checked = checkboxes.length > 0 && selectedCount === checkboxes.length;
    selectAll.indeterminate = selectedCount > 0 && selectedCount < checkboxes.length;
    selectAll.disabled = checkboxes.length === 0;
  }
  if (button) button.disabled = selectedCount === 0;
  if (count) count.textContent = `${selectedCount} ${selectedCount === 1 ? "selecionado" : "selecionados"}`;
}

function selectedRecordIds(view) {
  return [...document.querySelectorAll(`[data-bulk-delete-select="${view}"]:checked`)].map((checkbox) => checkbox.value);
}

const els = {
  viewTitle: document.querySelector("#viewTitle"),
  navItems: [...document.querySelectorAll(".nav-item")],
  views: [...document.querySelectorAll(".view")],
  saleModal: document.querySelector("#saleModal"),
  saleForm: document.querySelector("#saleForm"),
  saleItems: document.querySelector("#saleItems"),
  saleItemTemplate: document.querySelector("#saleItemTemplate"),
  salePayments: document.querySelector("#salePayments"),
  salePaymentTemplate: document.querySelector("#salePaymentTemplate"),
  saleTotalPreview: document.querySelector("#saleTotalPreview"),
  saleModalTitle: document.querySelector("#saleModalTitle"),
  saleSubmitButton: document.querySelector("#saleSubmitButton"),
  sellerCommissionPreview: document.querySelector("#sellerCommissionPreview"),
  delivererCommissionPreview: document.querySelector("#delivererCommissionPreview"),
  totalCommissionPreview: document.querySelector("#totalCommissionPreview"),
  productForm: document.querySelector("#productForm"),
  productFormTitle: document.querySelector("#productFormTitle"),
  productSubmitButton: document.querySelector("#productSubmitButton"),
  productCancelButton: document.querySelector("#productCancelButton"),
  stockEntryForm: document.querySelector("#stockEntryForm"),
  stockEntryFormTitle: document.querySelector("#stockEntryFormTitle"),
  stockEntrySubmitButton: document.querySelector("#stockEntrySubmitButton"),
  stockEntryCancelButton: document.querySelector("#stockEntryCancelButton"),
  stockEntryProductList: document.querySelector("#stockEntryProductList"),
  stockEntryItems: document.querySelector("#stockEntryItems"),
  stockEntryItemTemplate: document.querySelector("#stockEntryItemTemplate"),
  stockEntryBulkText: document.querySelector("#stockEntryBulkText"),
  personForm: document.querySelector("#personForm"),
  personFormTitle: document.querySelector("#personFormTitle"),
  personSubmitButton: document.querySelector("#personSubmitButton"),
  personCancelButton: document.querySelector("#personCancelButton"),
  ledgerForm: document.querySelector("#ledgerForm"),
  ledgerFormTitle: document.querySelector("#ledgerFormTitle"),
  ledgerSubmitButton: document.querySelector("#ledgerSubmitButton"),
  ledgerCancelButton: document.querySelector("#ledgerCancelButton"),
  stockTransferForm: document.querySelector("#stockTransferForm"),
  stockTransferFormTitle: document.querySelector("#stockTransferFormTitle"),
  stockTransferSubmitButton: document.querySelector("#stockTransferSubmitButton"),
  stockTransferCancelButton: document.querySelector("#stockTransferCancelButton"),
  stockTransferItems: document.querySelector("#stockTransferItems"),
  stockTransferItemTemplate: document.querySelector("#stockTransferItemTemplate"),
  campaignForm: document.querySelector("#campaignForm"),
  campaignFormTitle: document.querySelector("#campaignFormTitle"),
  campaignSubmitButton: document.querySelector("#campaignSubmitButton"),
  campaignCancelButton: document.querySelector("#campaignCancelButton"),
  messageImportForm: document.querySelector("#messageImportForm"),
  authForm: document.querySelector("#authForm"),
  authEmail: document.querySelector("#authEmail"),
  authPassword: document.querySelector("#authPassword"),
  authStatusTitle: document.querySelector("#authStatusTitle"),
  authStatusText: document.querySelector("#authStatusText"),
  themeToggle: document.querySelector("#themeToggle"),
  toast: document.querySelector("#toast"),
  dashboardStartDate: document.querySelector("#dashboardStartDate"),
  dashboardEndDate: document.querySelector("#dashboardEndDate"),
  salesStartDate: document.querySelector("#salesStartDate"),
  salesEndDate: document.querySelector("#salesEndDate"),
  salesFilterType: document.querySelector("#salesFilterType"),
  salesFilterSelect: document.querySelector("#salesFilterSelect"),
  salesFilterAmount: document.querySelector("#salesFilterAmount"),
  productSalesStartDate: document.querySelector("#productSalesStartDate"),
  productSalesEndDate: document.querySelector("#productSalesEndDate"),
  financeStartDate: document.querySelector("#financeStartDate"),
  financeEndDate: document.querySelector("#financeEndDate"),
  financePersonFilter: document.querySelector("#financePersonFilter"),
  stockTransferStartDate: document.querySelector("#stockTransferStartDate"),
  stockTransferEndDate: document.querySelector("#stockTransferEndDate"),
  stockTransferDelivererFilter: document.querySelector("#stockTransferDelivererFilter"),
  stockTransferProductFilter: document.querySelector("#stockTransferProductFilter"),
  stockTransferSelectAll: document.querySelector("#stockTransferSelectAll"),
  deleteSelectedStockTransfersButton: document.querySelector("#deleteSelectedStockTransfersButton"),
  stockTransferSelectionCount: document.querySelector("#stockTransferSelectionCount"),
  delivererEarningsPersonFilter: document.querySelector("#delivererEarningsPersonFilter"),
  delivererEarningsStartDate: document.querySelector("#delivererEarningsStartDate"),
  delivererEarningsEndDate: document.querySelector("#delivererEarningsEndDate"),
};

function initTheme() {
  const savedTheme = localStorage.getItem("codPerfumesErp.theme");
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  const theme = savedTheme || systemTheme;
  document.documentElement.dataset.theme = theme;
  els.themeToggle.checked = theme === "dark";
}

function handleThemeChange() {
  const theme = els.themeToggle.checked ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("codPerfumesErp.theme", theme);
}

function saveState(options = {}) {
  saveStateData(state, options)
    .then(() => {
      document.querySelector("#storageStatus").textContent = `Salvo as ${new Date().toLocaleTimeString("pt-BR")}`;
    })
    .catch(() => {
      document.querySelector("#storageStatus").textContent = "Erro ao salvar";
      showToast("Nao foi possivel salvar os dados.");
    });
}

function createAutomaticBackup(reason) {
  try {
    const backup = {
      id: uid("backup"),
      reason,
      createdAt: new Date().toISOString(),
      data: state,
    };
    const key = "codPerfumesErp.autoBackups";
    const backups = JSON.parse(localStorage.getItem(key) || "[]");
    backups.unshift(backup);
    localStorage.setItem(key, JSON.stringify(backups.slice(0, 10)));
  } catch {
    // Backup automatico e uma protecao extra; nao deve impedir a operacao principal.
  }
}

function markDeleted(collection, id) {
  if (!collection || !id) return;
  state._deleted = state._deleted || {};
  state._deleted[collection] = state._deleted[collection] || {};
  state._deleted[collection][id] = new Date().toISOString();
}

function money(value) {
  return currency.format(Number(value || 0));
}

function byId(collection, id) {
  return collection.find((item) => item.id === id);
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 2800);
}

function setView(viewId) {
  els.navItems.forEach((item) => item.classList.toggle("active", item.dataset.view === viewId));
  els.views.forEach((view) => view.classList.toggle("active", view.id === viewId));
  els.viewTitle.textContent = views[viewId] || "ERP";
}

function render() {
  renderSelects();
  renderDashboard();
  renderProducts();
  renderProductSales();
  renderStockEntries();
  renderStockAlerts();
  renderCourierStock();
  renderDelivererEarnings();
  renderCampaigns();
  renderPeople();
  renderSales();
  renderFinance();
  renderInbox();
}

function renderSelects() {
  document.querySelector("#sellerSelect").innerHTML = peopleOptions("", "seller");
  document.querySelector("#delivererSelect").innerHTML = peopleOptions("", "deliverer");
  document.querySelector("#ledgerPersonSelect").innerHTML = state.people.length
    ? state.people.map((person) => `<option value="${person.id}">${escapeHtml(person.name)}</option>`).join("")
    : "<option value=''>Cadastre um colaborador</option>";
  if (els.financePersonFilter) {
    els.financePersonFilter.innerHTML = ["<option value=''>Todos os colaboradores</option>"].concat(
      state.people.map((person) => `<option value="${person.id}">${escapeHtml(person.name)}</option>`),
    ).join("");
    els.financePersonFilter.value = financePersonFilter;
  }
  const delivererOptions = peopleOptions("", "deliverer");
  document.querySelector("#stockTransferDelivererSelect").innerHTML = state.people.some(isDeliverer)
    ? delivererOptions.replace("<option value=''>Sem colaborador</option>", "<option value=''>Selecione um entregador</option>")
    : "<option value=''>Cadastre um entregador</option>";
  if (els.stockTransferDelivererFilter) {
    els.stockTransferDelivererFilter.innerHTML = stockTransferDelivererFilterOptions();
    els.stockTransferDelivererFilter.value = stockTransferFilters.delivererId;
  }
  if (els.stockTransferProductFilter) {
    els.stockTransferProductFilter.innerHTML = stockTransferProductFilterOptions();
    els.stockTransferProductFilter.value = stockTransferFilters.productId;
  }
  if (els.stockEntryProductList) {
    els.stockEntryProductList.innerHTML = state.products.map((product) => `<option value="${escapeHtml(product.name)}"></option>`).join("");
  }
  if (els.delivererEarningsPersonFilter) {
    els.delivererEarningsPersonFilter.innerHTML = delivererEarningsPersonFilterOptions();
    els.delivererEarningsPersonFilter.value = delivererEarningsPersonFilter;
  }
  renderSalesFilterControls();

  [...els.saleItems.querySelectorAll("select[name='productId']")].forEach(populateProductSelect);
  [...els.stockTransferItems.querySelectorAll("select[name='productId']")].forEach(populateStockTransferProductSelect);
}

function renderSalesFilterControls() {
  if (!els.salesFilterType || !els.salesFilterSelect || !els.salesFilterAmount) return;
  els.salesFilterType.value = salesFilters.type;
  const isAmount = salesFilters.type === "amount";
  const needsSelect = ["seller", "deliverer", "product"].includes(salesFilters.type);
  document.querySelector("#salesFilterSelectWrap").hidden = !needsSelect;
  document.querySelector("#salesFilterAmountWrap").hidden = !isAmount;

  if (needsSelect) {
    els.salesFilterSelect.innerHTML = salesFilterOptions(salesFilters.type);
    els.salesFilterSelect.value = salesFilters.value;
  }
  if (isAmount) {
    els.salesFilterAmount.value = salesFilters.value || "";
  }
}

function salesFilterOptions(type) {
  if (type === "seller") {
    return ["<option value=''>Todos os vendedores</option>"].concat(
      state.people.filter(isSeller).map((person) => `<option value="${person.id}">${escapeHtml(person.name)}</option>`),
    ).join("");
  }
  if (type === "deliverer") {
    return ["<option value=''>Todos os entregadores</option>"].concat(
      state.people.filter(isDeliverer).map((person) => `<option value="${person.id}">${escapeHtml(person.name)}</option>`),
    ).join("");
  }
  if (type === "product") {
    return ["<option value=''>Todos os produtos</option>"].concat(
      state.products.map((product) => `<option value="${product.id}">${escapeHtml(product.name)}</option>`),
    ).join("");
  }
  return "";
}

function stockTransferDelivererFilterOptions() {
  const deliverers = state.people.filter(isDeliverer);
  return ["<option value=''>Todos os entregadores</option>"].concat(
    deliverers.map((person) => `<option value="${person.id}">${escapeHtml(person.name)}</option>`),
  ).join("");
}

function stockTransferProductFilterOptions() {
  return ["<option value=''>Todos os perfumes</option>"].concat(
    state.products.map((product) => `<option value="${product.id}">${escapeHtml(product.name)}</option>`),
  ).join("");
}

function delivererEarningsPersonFilterOptions() {
  const deliverers = state.people.filter(isDeliverer);
  return ["<option value=''>Todos os entregadores</option>"].concat(
    deliverers.map((person) => `<option value="${person.id}">${escapeHtml(person.name)}</option>`),
  ).join("");
}

function stockTransferProductOptions(selectedId = "") {
  if (!state.products.length) return "<option value=''>Cadastre um perfume</option>";
  return state.products
    .map((product) => {
      const selected = product.id === selectedId ? "selected" : "";
      return `<option value="${product.id}" ${selected}>${escapeHtml(product.name)} - ${Number(product.stock || 0)} un. base</option>`;
    })
    .join("");
}

function populateStockTransferProductSelect(select) {
  const current = select.value;
  select.innerHTML = stockTransferProductOptions(current);
}

function productOptions(selectedId = "", delivererId = "") {
  if (!state.products.length) return "<option value=''>Cadastre um produto</option>";
  const hasSelected = !selectedId || state.products.some((product) => product.id === selectedId);
  const fallback = hasSelected ? "" : `<option value="${escapeHtml(selectedId)}" selected>Produto removido</option>`;
  return fallback + state.products
    .map((product) => {
      const selected = product.id === selectedId ? "selected" : "";
      return `<option value="${product.id}" data-price="${product.price}" ${selected}>${escapeHtml(product.name)} - ${money(product.price)} (${stockAvailabilityLabel(product, delivererId)})</option>`;
    })
    .join("");
}

function populateProductSelect(select) {
  const current = select.value;
  select.innerHTML = productOptions(current, els.saleForm?.elements?.delivererId?.value || "");
}

function refreshSaleProductOptions() {
  [...els.saleItems.querySelectorAll("select[name='productId']")].forEach(populateProductSelect);
}

function stockAvailabilityLabel(product, delivererId = "") {
  const warehouseStock = Number(product.stock || 0);
  if (delivererId) {
    const deliverer = byId(state.people, delivererId);
    const delivererStock = courierStockAvailable(delivererId, product.id);
    return `${delivererStock} un. com ${deliverer?.name || "entregador"}`;
  }

  const courierStock = courierStockAvailableForProduct(product.id);
  const totalOperation = warehouseStock + courierStock;
  return `${totalOperation} un. disponiveis`;
}

function renderDashboard() {
  const periodSales = salesInPeriod(dashboardPeriod.start, dashboardPeriod.end);
  const deliveredSales = periodSales.filter((sale) => sale.status !== "Cancelada");
  const revenue = deliveredSales.reduce((sum, sale) => sum + sale.total, 0);
  const payable = collaboratorSummaries().reduce((sum, person) => sum + Math.max(person.balance, 0), 0);
  const lowStock = state.products.filter((product) => product.stock <= product.minStock).length;
  const deliveries = periodSales.filter((sale) => sale.delivererId).length;
  const profitToday = profitForPeriod(today(), today());
  const profit30Days = profitForPeriod(addDays(today(), -29), today());
  const selectedProfit = profitForPeriod(dashboardPeriod.start, dashboardPeriod.end);

  document.querySelector("#kpiRevenue").textContent = money(revenue);
  document.querySelector("#kpiSalesCount").textContent = `${deliveredSales.length} vendas no filtro`;
  document.querySelector("#kpiProfitToday").textContent = money(profitToday.realProfit);
  document.querySelector("#kpiProfit30Days").textContent = money(profit30Days.realProfit);
  document.querySelector("#kpiProfitPeriod").textContent = money(selectedProfit.realProfit);
  document.querySelector("#kpiProfitPeriodLabel").textContent = `${formatDate(dashboardPeriod.start)} ate ${formatDate(dashboardPeriod.end)} - ${selectedProfit.count} vendas - trafego ${money(selectedProfit.campaignCost)}`;
  document.querySelector("#kpiPayable").textContent = money(payable);
  document.querySelector("#kpiLowStock").textContent = lowStock;
  document.querySelector("#kpiDeliveries").textContent = deliveries;
  els.dashboardStartDate.value = dashboardPeriod.start;
  els.dashboardEndDate.value = dashboardPeriod.end;

  renderBalanceList();
  renderTopProducts(deliveredSales);
  renderRecentSales(periodSales);
}

function renderBalanceList() {
  const list = document.querySelector("#collaboratorBalanceList");
  const summaries = collaboratorSummaries().sort((a, b) => b.balance - a.balance);
  if (!summaries.length) {
    list.innerHTML = `<div class="empty">Cadastre colaboradores para acompanhar saldos.</div>`;
    return;
  }

  const max = Math.max(...summaries.map((person) => Math.abs(person.balance)), 1);
  list.innerHTML = summaries
    .map((person) => {
      const percent = Math.round((Math.abs(person.balance) / max) * 100);
      const balanceClass = person.balance >= 0 ? "positive" : "negative";
      return `
        <article class="balance-row clickable-card" data-view-jump="finance" role="button" tabindex="0">
          <header>
            <div><strong>${escapeHtml(person.name)}</strong><br><small>${escapeHtml(person.role)}</small></div>
            <strong class="${balanceClass}">${money(person.balance)}</strong>
          </header>
          <div class="meter"><span style="--value:${percent}%"></span></div>
        </article>
      `;
    })
    .join("");
}

function renderTopProducts(sales = state.sales.filter((sale) => sale.status !== "Cancelada")) {
  const chart = document.querySelector("#topProductsChart");
  const rows = productSalesSummary(sales).slice(0, 12);
  if (!rows.length) {
    chart.innerHTML = `<div class="empty">As vendas registradas vao aparecer aqui.</div>`;
    return;
  }

  const max = Math.max(...rows.map((row) => row.quantity), 1);
  chart.innerHTML = rows
    .map((row) => `
      <div class="bar-row clickable-card" data-view-jump="product-sales" role="button" tabindex="0">
        <strong>${escapeHtml(row.name)}</strong>
        <div class="bar-track"><span style="--value:${Math.round((row.quantity / max) * 100)}%"></span></div>
        <span>${row.quantity}</span>
      </div>
    `)
    .join("");
}

function renderProductSales() {
  const chart = document.querySelector("#productSalesFullChart");
  const rowsElement = document.querySelector("#productSalesRows");
  if (!chart || !rowsElement) return;
  if (els.productSalesStartDate) els.productSalesStartDate.value = productSalesPeriod.start;
  if (els.productSalesEndDate) els.productSalesEndDate.value = productSalesPeriod.end;

  const deliveredSales = salesInPeriod(productSalesPeriod.start, productSalesPeriod.end).filter((sale) => sale.status !== "Cancelada");
  const rows = productSalesSummary(deliveredSales);
  const totalQuantity = rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const totalRevenue = rows.reduce((sum, row) => sum + Number(row.revenue || 0), 0);
  const totalQuantityElement = document.querySelector("#productSalesTotalQuantity");
  const totalRevenueElement = document.querySelector("#productSalesTotalRevenue");
  if (totalQuantityElement) totalQuantityElement.textContent = `${totalQuantity} un.`;
  if (totalRevenueElement) totalRevenueElement.textContent = money(totalRevenue);
  const periodLabel = document.querySelector("#productSalesPeriodLabel");
  if (periodLabel) {
    periodLabel.textContent =
      productSalesPeriod.start || productSalesPeriod.end
        ? `${formatDate(productSalesPeriod.start || productSalesPeriod.end)} ate ${formatDate(productSalesPeriod.end || productSalesPeriod.start)}`
        : "todos os periodos";
  }

  if (!rows.length) {
    chart.innerHTML = `<div class="empty">Nenhuma venda de perfume nesse periodo.</div>`;
    rowsElement.innerHTML = `<tr><td colspan="4" class="empty">Nenhuma venda encontrada.</td></tr>`;
    return;
  }

  const max = Math.max(...rows.map((row) => row.quantity), 1);
  chart.innerHTML = rows
    .map((row) => `
      <div class="bar-row product-sales-row">
        <strong>${escapeHtml(row.name)}</strong>
        <div class="bar-track"><span style="--value:${Math.round((row.quantity / max) * 100)}%"></span></div>
        <span>${row.quantity}</span>
      </div>
    `)
    .join("");

  rowsElement.innerHTML = rows
    .map((row) => `
      <tr>
        <td><strong>${escapeHtml(row.name)}</strong></td>
        <td>${row.quantity} un.</td>
        <td>${money(row.revenue)}</td>
        <td>${row.salesCount}</td>
      </tr>
    `)
    .join("");
}

function productSalesSummary(sales) {
  const totals = new Map();
  sales.forEach((sale) => {
    sale.items.forEach((item) => {
      const product = byId(state.products, item.productId);
      const name = product?.name || item.productName || "Produto removido";
      const key = item.productId || name;
      if (!totals.has(key)) {
        totals.set(key, {
          name,
          quantity: 0,
          revenue: 0,
          salesCodes: new Set(),
        });
      }
      const row = totals.get(key);
      row.quantity += Number(item.quantity || 0);
      row.revenue = roundMoney(row.revenue + Number(item.quantity || 0) * Number(item.unitPrice || 0));
      row.salesCodes.add(sale.code || sale.id);
    });
  });
  return [...totals.values()]
    .map((row) => ({ ...row, salesCount: row.salesCodes.size }))
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue || a.name.localeCompare(b.name));
}

function renderRecentSales(sales = state.sales) {
  const rows = document.querySelector("#recentSalesRows");
  const recent = [...sales].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  rows.innerHTML = recent.length
    ? recent.map(saleRow).join("")
    : `<tr><td colspan="6" class="empty">Nenhuma venda registrada.</td></tr>`;
}

function renderProducts() {
  const rows = document.querySelector("#productRows");
  rows.innerHTML = state.products.length
    ? state.products
        .map((product) => {
          const warehouseStock = Number(product.stock || 0);
          const courierRows = courierStockBalances().filter((entry) => entry.productId === product.id && Number(entry.balance || 0) !== 0);
          const courierTotal = courierRows.reduce((sum, entry) => sum + Number(entry.balance || 0), 0);
          const operationalTotal = warehouseStock + courierTotal;
          const alert = warehouseStock <= Number(product.minStock || 0);
          return `
            <tr>
              <td>${bulkDeleteCheckbox("products", product.id, `produto ${product.name}`)}</td>
              <td><strong>${escapeHtml(product.name)}</strong></td>
              <td>${escapeHtml(product.sku || "-")}</td>
              <td>${money(product.price)}</td>
              <td><strong>${warehouseStock} un.</strong><br><small class="muted-text">estoque base</small></td>
              <td><strong>${courierTotal} un.</strong><br><small class="muted-text">em maos</small></td>
              <td><strong>${operationalTotal} un.</strong><br><small class="muted-text">base + entregadores</small></td>
              <td>${courierStockDetail(courierRows)}</td>
              <td><span class="pill ${alert ? "warn" : "good"}">${alert ? "Repor estoque" : "Disponivel"}</span></td>
              <td>${actionButtons("product", product.id)}</td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="10" class="empty">Cadastre seus perfumes para controlar o estoque.</td></tr>`;
  updateBulkDeleteControls("products");
}

function courierStockDetail(rows) {
  if (!rows.length) return `<span class="muted-text">Nenhum entregador com saldo</span>`;
  return `
    <div class="stock-detail-list">
      ${rows
        .sort((a, b) => b.balance - a.balance)
        .map((entry) => `<span><strong>${escapeHtml(entry.delivererName)}</strong> ${Number(entry.balance || 0)} un.</span>`)
        .join("")}
    </div>
  `;
}

function inventoryDetailRows() {
  return state.products.map((product) => {
    const warehouseStock = Number(product.stock || 0);
    const courierRows = courierStockBalances()
      .filter((entry) => entry.productId === product.id && Number(entry.balance || 0) !== 0)
      .sort((a, b) => b.balance - a.balance || a.delivererName.localeCompare(b.delivererName));
    const courierTotal = courierRows.reduce((sum, entry) => sum + Number(entry.balance || 0), 0);
    const operationalTotal = warehouseStock + courierTotal;
    return {
      product,
      warehouseStock,
      courierRows,
      courierTotal,
      operationalTotal,
      detail: courierRows.length ? courierRows.map((entry) => `${entry.delivererName}: ${Number(entry.balance || 0)} un.`).join("; ") : "Nenhum entregador com saldo",
      status: warehouseStock <= Number(product.minStock || 0) ? "Repor estoque" : "Disponivel",
    };
  });
}

function renderStockEntries() {
  const rows = document.querySelector("#stockEntryRows");
  if (!rows) return;
  rows.innerHTML = state.stockEntries.length
    ? [...state.stockEntries]
        .sort((a, b) => state.stockEntries.indexOf(b) - state.stockEntries.indexOf(a))
        .map(stockEntryRow)
        .join("")
    : `<tr><td colspan="7" class="empty">Registre entradas para somar ao estoque base.</td></tr>`;
  updateBulkDeleteControls("stockEntries");
}

function stockEntryRow(entry) {
  const product = byId(state.products, entry.productId);
  return `
    <tr>
      <td>${bulkDeleteCheckbox("stockEntries", entry.id, "entrada de estoque")}</td>
      <td>${formatDate(entry.date)}</td>
      <td><strong>${escapeHtml(product?.name || entry.productName || "Produto removido")}</strong></td>
      <td>${Number(entry.quantity || 0)} un.</td>
      <td>${entry.createdProduct ? "Novo produto" : "Produto existente"}</td>
      <td>${escapeHtml(entry.note || "-")}</td>
      <td>${actionButtons("stock-entry", entry.id)}</td>
    </tr>
  `;
}

function renderStockAlerts() {
  const rows = document.querySelector("#stockAlertRows");
  const products = state.products
    .filter((product) => Number(product.stock || 0) <= Number(product.minStock || 0))
    .sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0));

  rows.innerHTML = products.length
    ? products
        .map(
          (product) => `
            <tr>
              <td><strong>${escapeHtml(product.name)}</strong></td>
              <td>${escapeHtml(product.sku || "-")}</td>
              <td>${Number(product.stock || 0)} un.</td>
              <td>${Number(product.minStock || 0)} un.</td>
              <td>${money(product.price)}</td>
              <td>${actionButtons("product", product.id)}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="6" class="empty">Nenhum produto esta no estoque minimo ou abaixo.</td></tr>`;
}

function renderCourierStock() {
  const cards = document.querySelector("#courierStockCards");
  const rows = document.querySelector("#stockTransferRows");
  const allBalances = courierStockBalances();
  const balances = filterCourierStockBalances(allBalances).filter((entry) => entry.balance !== 0);
  els.stockTransferStartDate.value = stockTransferPeriod.start;
  els.stockTransferEndDate.value = stockTransferPeriod.end;
  if (els.stockTransferDelivererFilter) els.stockTransferDelivererFilter.value = stockTransferFilters.delivererId;
  if (els.stockTransferProductFilter) els.stockTransferProductFilter.value = stockTransferFilters.productId;
  renderCourierDelivererList(allBalances);

  cards.innerHTML = balances.length
    ? balances
        .map(
          (entry) => `
            <article class="finance-card">
              <header>
                <div><strong>${escapeHtml(entry.delivererName)}</strong><br><small>${escapeHtml(entry.productName)}</small></div>
                <strong class="${entry.balance >= 0 ? "positive" : "negative"}">${entry.balance} un.</strong>
              </header>
              <small>Saidas: ${entry.out} - Vendas: ${entry.sold} - Devolucoes: ${entry.returned}</small>
            </article>
          `
        )
        .join("")
    : `<div class="empty">Nenhum produto esta em maos de entregador.</div>`;

  const transfers = filterStockTransfers(stockTransfersInPeriod(stockTransferPeriod.start, stockTransferPeriod.end));
  const periodLabel = document.querySelector("#stockTransferPeriodLabel");
  if (periodLabel) {
    periodLabel.textContent =
      stockTransferPeriod.start || stockTransferPeriod.end
        ? `${formatDate(stockTransferPeriod.start || stockTransferPeriod.end)} ate ${formatDate(stockTransferPeriod.end || stockTransferPeriod.start)}`
        : "saidas e devolucoes";
  }
  rows.innerHTML = transfers.length
    ? [...transfers].sort(compareStockTransfersByLaunchDesc).map(stockTransferRow).join("")
    : `<tr><td colspan="8" class="empty">Registre a primeira saida para entregador.</td></tr>`;
  updateStockTransferSelectionControls();
}

function renderCourierDelivererList(balances) {
  const list = document.querySelector("#courierDelivererList");
  if (!list) return;
  const deliverers = state.people.filter(isDeliverer);
  const totalUnits = balances.reduce((sum, entry) => sum + Number(entry.balance || 0), 0);
  const buttons = [
    courierDelivererFilterButton("", "Todos", totalUnits),
    ...deliverers.map((person) => {
      const units = balances
        .filter((entry) => entry.delivererId === person.id)
        .reduce((sum, entry) => sum + Number(entry.balance || 0), 0);
      return courierDelivererFilterButton(person.id, person.name, units);
    }),
  ];
  list.innerHTML = buttons.join("");
}

function courierDelivererFilterButton(id, name, units) {
  const active = stockTransferFilters.delivererId === id ? "active" : "";
  const value = escapeHtml(id);
  return `
    <button class="deliverer-filter-button ${active}" data-courier-deliverer-filter="${value}" type="button">
      <span>${escapeHtml(name)}</span>
      <strong>${Number(units || 0)} un.</strong>
    </button>
  `;
}

function compareStockTransfersByLaunchDesc(a, b) {
  return state.stockTransfers.indexOf(b) - state.stockTransfers.indexOf(a);
}

function filterCourierStockBalances(balances) {
  return balances.filter((entry) => {
    if (stockTransferFilters.delivererId && entry.delivererId !== stockTransferFilters.delivererId) return false;
    if (stockTransferFilters.productId && entry.productId !== stockTransferFilters.productId) return false;
    return true;
  });
}

function filterStockTransfers(transfers) {
  return transfers.filter((entry) => {
    if (stockTransferFilters.delivererId && entry.delivererId !== stockTransferFilters.delivererId) return false;
    if (stockTransferFilters.productId && entry.productId !== stockTransferFilters.productId) return false;
    return true;
  });
}

function renderDelivererEarnings() {
  const cards = document.querySelector("#delivererEarningsCards");
  const rows = document.querySelector("#delivererEarningsRows");
  if (!cards || !rows) return;
  if (els.delivererEarningsStartDate) els.delivererEarningsStartDate.value = delivererEarningsPeriod.start;
  if (els.delivererEarningsEndDate) els.delivererEarningsEndDate.value = delivererEarningsPeriod.end;
  if (els.delivererEarningsPersonFilter) els.delivererEarningsPersonFilter.value = delivererEarningsPersonFilter;

  const entries = delivererEarningsEntriesInPeriod(delivererEarningsPeriod.start, delivererEarningsPeriod.end);
  const summaries = delivererEarningsSummaries(entries);
  const periodLabel = document.querySelector("#delivererEarningsPeriodLabel");
  if (periodLabel) {
    periodLabel.textContent =
      delivererEarningsPeriod.start || delivererEarningsPeriod.end
        ? `${formatDate(delivererEarningsPeriod.start || delivererEarningsPeriod.end)} ate ${formatDate(delivererEarningsPeriod.end || delivererEarningsPeriod.start)}`
        : "periodo livre";
  }

  cards.innerHTML = summaries.length
    ? summaries
        .map(
          (summary) => `
            <article class="finance-card">
              <header>
                <div><strong>${escapeHtml(summary.name)}</strong><br><small>${summary.count} lancamento(s)</small></div>
                <strong class="positive">${money(summary.total)}</strong>
              </header>
              <small>${escapeHtml(summary.types)}</small>
            </article>
          `,
        )
        .join("")
    : `<div class="empty">Nenhum ganho de entregador nesse periodo.</div>`;

  rows.innerHTML = entries.length
    ? entries
        .sort((a, b) => `${b.date || ""}${b.id}`.localeCompare(`${a.date || ""}${a.id}`))
        .map(delivererEarningsRow)
        .join("")
    : `<tr><td colspan="6" class="empty">Nenhum ganho encontrado.</td></tr>`;
}

function delivererEarningsRow(entry) {
  const person = byId(state.people, entry.personId);
  return `
    <tr>
      <td>${formatDate(entry.date)}</td>
      <td>${escapeHtml(person?.name || "Entregador removido")}</td>
      <td>${escapeHtml(entry.type)}</td>
      <td>${escapeHtml(entry.source || "Manual")}</td>
      <td>${escapeHtml(entry.description || "-")}</td>
      <td>${money(entry.amount)}</td>
    </tr>
  `;
}

function delivererEarningsEntriesInPeriod(startDate, endDate) {
  return delivererEarningsEntries(startDate, endDate, delivererEarningsPersonFilter);
}

function delivererEarningsEntries(startDate, endDate, personFilter = "") {
  return ledgerInPeriod(startDate, endDate).filter((entry) => {
    const person = byId(state.people, entry.personId);
    if (personFilter && entry.personId !== personFilter) return false;
    return isDeliverer(person) && isDelivererEarningEntry(entry);
  });
}

function isDelivererEarningEntry(entry) {
  return (
    entry.direction === "in" &&
    ["Comissao entrega", "Taxa entrega cancelada", "Comissao adicional entregador", "Comissao venda propria"].includes(entry.type)
  );
}

function delivererEarningsSummaries(entries) {
  const summaries = new Map();
  entries.forEach((entry) => {
    const person = byId(state.people, entry.personId);
    const key = entry.personId;
    if (!summaries.has(key)) {
      summaries.set(key, {
        name: person?.name || "Entregador removido",
        total: 0,
        count: 0,
        types: new Set(),
      });
    }
    const summary = summaries.get(key);
    summary.total = roundMoney(summary.total + Number(entry.amount || 0));
    summary.count += 1;
    summary.types.add(entry.type);
  });
  return [...summaries.values()]
    .map((summary) => ({ ...summary, types: [...summary.types].join(", ") || "Ganhos" }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

function renderCampaigns() {
  const rows = document.querySelector("#campaignRows");
  if (!rows) return;
  rows.innerHTML = state.campaigns.length
    ? [...state.campaigns]
        .sort((a, b) => state.campaigns.indexOf(b) - state.campaigns.indexOf(a))
        .map(campaignRow)
        .join("")
    : `<tr><td colspan="6" class="empty">Registre gastos diarios de campanha para calcular lucro real.</td></tr>`;
  updateBulkDeleteControls("campaigns");
}

function campaignRow(campaign) {
  return `
    <tr>
      <td>${bulkDeleteCheckbox("campaigns", campaign.id, `campanha ${campaign.name || ""}`)}</td>
      <td>${formatDate(campaign.date)}</td>
      <td><strong>${escapeHtml(campaign.name || "Campanha")}</strong></td>
      <td>${money(campaign.amount)}</td>
      <td>${escapeHtml(campaign.note || "-")}</td>
      <td>${actionButtons("campaign", campaign.id)}</td>
    </tr>
  `;
}

function renderPeople() {
  const rows = document.querySelector("#peopleRows");
  const summaries = collaboratorSummaries();
  rows.innerHTML = summaries.length
    ? summaries
        .map((person) => `
          <tr>
            <td>${bulkDeleteCheckbox("people", person.id, `colaborador ${person.name}`)}</td>
            <td><strong>${escapeHtml(person.name)}</strong></td>
            <td>${escapeHtml(person.role)}</td>
            <td>${money(person.deliveryCommission)}</td>
            <td>${Number(person.salesCommissionRate || 0).toFixed(2)}%</td>
            <td>${Number(person.ownSalesCommissionRate || 0).toFixed(2)}%</td>
            <td><strong class="${person.balance >= 0 ? "positive" : "negative"}">${money(person.balance)}</strong></td>
            <td>${actionButtons("person", person.id)}</td>
          </tr>
        `)
        .join("")
    : `<tr><td colspan="8" class="empty">Cadastre entregadores e vendedores.</td></tr>`;
  updateBulkDeleteControls("people");
}

function renderSales() {
  const rows = document.querySelector("#salesRows");
  const sales = filterSales(salesInPeriod(salesPeriod.start, salesPeriod.end));
  els.salesStartDate.value = salesPeriod.start;
  els.salesEndDate.value = salesPeriod.end;
  renderSalesFilterControls();
  rows.innerHTML = sales.length
    ? [...sales].sort(compareSalesByCodeDesc).map(fullSaleRow).join("")
    : `<tr><td colspan="11" class="empty">Registre a primeira venda para iniciar a operacao.</td></tr>`;
  updateBulkDeleteControls("sales");
}

function filterSales(sales) {
  if (!salesFilters.type || !salesFilters.value) return sales;
  if (salesFilters.type === "seller") return sales.filter((sale) => sale.sellerId === salesFilters.value);
  if (salesFilters.type === "deliverer") return sales.filter((sale) => sale.delivererId === salesFilters.value);
  if (salesFilters.type === "product") return sales.filter((sale) => sale.items.some((item) => item.productId === salesFilters.value));
  if (salesFilters.type === "amount") {
    const minimum = Number(salesFilters.value || 0);
    return sales.filter((sale) => Number(sale.total || 0) >= minimum);
  }
  return sales;
}

function compareSalesByCodeDesc(a, b) {
  return saleCodeNumber(b.code) - saleCodeNumber(a.code);
}

function saleCodeNumber(code) {
  const number = Number(String(code || "").replace(/\D/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function saleRow(sale) {
  const deliverer = byId(state.people, sale.delivererId);
  return `
    <tr>
      <td>${formatDate(sale.date)}</td>
      <td>${escapeHtml(sale.customer)}</td>
      <td><strong>${money(sale.total)}</strong></td>
      <td>${escapeHtml(salePaymentSummary(sale))}</td>
      <td>${escapeHtml(deliverer?.name || "-")}</td>
      <td>${statusPill(sale.status)}</td>
    </tr>
  `;
}

function fullSaleRow(sale) {
  const seller = byId(state.people, sale.sellerId);
  const deliverer = byId(state.people, sale.delivererId);
  const itemText = sale.items.map((item) => `${item.quantity}x ${escapeHtml(item.productName)}`).join("<br>");
  return `
    <tr>
      <td>${bulkDeleteCheckbox("sales", sale.id, `venda ${sale.code}`)}</td>
      <td><strong>${sale.code}</strong></td>
      <td>${formatDate(sale.date)}</td>
      <td>${escapeHtml(sale.customer)}</td>
      <td>${itemText}</td>
      <td><strong>${money(sale.total)}</strong></td>
      <td>${escapeHtml(salePaymentSummary(sale))}</td>
      <td>${escapeHtml(seller?.name || "-")}</td>
      <td>${escapeHtml(deliverer?.name || "-")}</td>
      <td>${statusPill(sale.status)}</td>
      <td>${actionButtons("sale", sale.id)}</td>
    </tr>
  `;
}

function renderFinance() {
  const cards = document.querySelector("#financeCards");
  const summaries = collaboratorSummaries();
  const totalPayable = summaries.reduce((sum, person) => sum + Math.max(person.balance, 0), 0);
  document.querySelector("#financeSummary").textContent = `${money(totalPayable)} em aberto`;
  els.financeStartDate.value = financePeriod.start;
  els.financeEndDate.value = financePeriod.end;

  cards.innerHTML = summaries.length
    ? summaries
        .map((person) => `
          <article class="finance-card">
            <header>
              <div><strong>${escapeHtml(person.name)}</strong><br><small>${escapeHtml(person.role)}</small></div>
              <strong class="${person.balance >= 0 ? "positive" : "negative"}">${money(person.balance)}</strong>
            </header>
            <small>Entradas: ${money(person.totalIn)} · Saidas: ${money(person.totalOut)} · Comissoes: ${money(person.commissions)} · Vales: ${money(person.advances)} · Pagamentos: ${money(person.payments)}</small>
          </article>
        `)
        .join("")
    : `<div class="empty">Sem colaboradores cadastrados.</div>`;

  const rows = document.querySelector("#ledgerRows");
  const filteredLedger = filterFinanceLedger(ledgerInPeriod(financePeriod.start, financePeriod.end));
  if (els.financePersonFilter) els.financePersonFilter.value = financePersonFilter;
  const periodLabel = document.querySelector("#financePeriodLabel");
  if (periodLabel) {
    periodLabel.textContent =
      financePeriod.start || financePeriod.end
        ? `${formatDate(financePeriod.start || financePeriod.end)} ate ${formatDate(financePeriod.end || financePeriod.start)}`
        : "comissoes, vales e pagamentos";
  }
  rows.innerHTML = filteredLedger.length
    ? [...filteredLedger].sort((a, b) => b.date.localeCompare(a.date)).map(ledgerRow).join("")
    : `<tr><td colspan="8" class="empty">O extrato vai mostrar comissoes, vales e pagamentos.</td></tr>`;
}

function filterFinanceLedger(entries) {
  if (!financePersonFilter) return entries;
  return entries.filter((entry) => entry.personId === financePersonFilter);
}

function renderInbox() {
  const pendingCount = state.inbox.filter((entry) => entry.status === "Pendente").length;
  const pendingLabel = document.querySelector("#pendingInboxCount");
  const list = document.querySelector("#inboxList");
  if (pendingLabel) pendingLabel.textContent = pendingCount;
  if (!list) return;

  const visibleEntries = [...state.inbox]
    .filter((entry) => entry.status !== "Oculta")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (!visibleEntries.length) {
    list.innerHTML = `<div class="empty">Nenhuma mensagem importada. Cole mensagens no simulador ou conecte a futura extensao.</div>`;
    return;
  }

  list.innerHTML = visibleEntries.map(inboxCard).join("");
}

function inboxCard(entry) {
  const reviewed = entry.status !== "Pendente";
  const product = entry.draft.items[0] || {};
  return `
    <article class="inbox-card ${reviewed ? "reviewed" : ""}" data-inbox-id="${entry.id}">
      <header>
        <div>
          <strong>${escapeHtml(entry.sourceName || "WhatsApp Web")}</strong>
          <small>${formatDate(entry.draft.date)} · confianca ${entry.confidence}%</small>
        </div>
        <span class="pill ${reviewed ? "good" : "warn"}">${escapeHtml(entry.status)}</span>
      </header>

      <pre class="raw-message">${escapeHtml(entry.rawMessage)}</pre>

      <div class="review-grid">
        <label>Cliente<input data-field="customer" value="${escapeHtml(entry.draft.customer)}" /></label>
        <label>Produto<select data-field="productId">${productOptions(product.productId, entry.draft.delivererId)}</select></label>
        <label>Qtd<input data-field="quantity" type="number" min="1" step="1" value="${product.quantity || 1}" /></label>
        <label>Preco<input data-field="unitPrice" type="number" min="0" step="0.01" value="${Number(product.unitPrice || 0).toFixed(2)}" /></label>
        <label>Pagamento<select data-field="paymentMethod">${paymentOptions(entry.draft.paymentMethod)}</select></label>
        <label>Status<select data-field="status">${statusOptions(entry.draft.status)}</select></label>
        <label>Vendedor<select data-field="sellerId">${peopleOptions(entry.draft.sellerId, "seller")}</select></label>
        <label>Entregador<select data-field="delivererId">${peopleOptions(entry.draft.delivererId, "deliverer")}</select></label>
        <label>Telefone<input data-field="customerPhone" value="${escapeHtml(entry.draft.customerPhone || "")}" /></label>
        <label>Taxa entrega cancelada<input data-field="canceledDeliveryFee" type="number" min="0" step="0.01" value="${Number(entry.draft.canceledDeliveryFee || 0).toFixed(2)}" /></label>
        <label>Comissao adicional para<select data-field="additionalCommissionTarget">${additionalCommissionTargetOptions(entry.draft.additionalCommissionTarget)}</select></label>
        <label>Valor adicional<input data-field="additionalCommissionAmount" type="number" min="0" step="0.01" value="${Number(entry.draft.additionalCommissionAmount || 0).toFixed(2)}" /></label>
      </div>

      <div class="inbox-actions">
        <button class="primary small" data-inbox-action="approve" type="button" ${reviewed ? "disabled" : ""}>Aprovar venda</button>
        <button class="secondary small" data-inbox-action="ignore" type="button" ${reviewed ? "disabled" : ""}>Ignorar</button>
      </div>
    </article>
  `;
}

function peopleOptions(selectedId = "", role = "all") {
  const people = state.people.filter((person) => {
    if (role === "seller") return isSeller(person);
    if (role === "deliverer") return isDeliverer(person);
    return true;
  });
  const selectedPerson = selectedId ? byId(state.people, selectedId) : null;
  const includeSelected = selectedPerson && !people.some((person) => person.id === selectedPerson.id);
  const options = ["<option value=''>Sem colaborador</option>"].concat(
    includeSelected ? [`<option value="${selectedPerson.id}" selected>${escapeHtml(selectedPerson.name)} (fora da funcao)</option>`] : [],
    people.map((person) => {
      const selected = person.id === selectedId ? "selected" : "";
      return `<option value="${person.id}" ${selected}>${escapeHtml(person.name)}</option>`;
    }),
  );
  return options.join("");
}

function isSeller(person) {
  return ["Vendedor", "Ambos"].includes(person?.role);
}

function isDeliverer(person) {
  return ["Entregador", "Ambos"].includes(person?.role);
}

function paymentOptions(selected = "PIX") {
  return ["PIX", "Dinheiro", "Cartao de credito", "Cartao de debito", "Outro"]
    .map((method) => `<option ${method === selected ? "selected" : ""}>${method}</option>`)
    .join("");
}

function statusOptions(selected = "Entregue") {
  return ["Entregue", "Danificado", "Perdido", "Cancelada"]
    .map((status) => `<option ${status === selected ? "selected" : ""}>${status}</option>`)
    .join("");
}

function additionalCommissionTargetOptions(selected = "") {
  return [
    ["", "Sem adicional"],
    ["seller", "Vendedor"],
    ["deliverer", "Entregador"],
  ]
    .map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`)
    .join("");
}

function ledgerRow(entry) {
  const person = byId(state.people, entry.personId);
  const isIn = entry.direction === "in";
  const isManual = entry.source === "Manual";
  return `
    <tr>
      <td>${formatDate(entry.date)}</td>
      <td>${escapeHtml(person?.name || "Colaborador removido")}</td>
      <td>${escapeHtml(entry.type)}</td>
      <td>${escapeHtml(entry.source || "Manual")}</td>
      <td>${escapeHtml(entry.description || "-")}</td>
      <td>${isIn ? money(entry.amount) : "-"}</td>
      <td>${!isIn ? money(entry.amount) : "-"}</td>
      <td>${isManual ? actionButtons("ledger", entry.id) : `<span class="muted-text">pela venda</span>`}</td>
    </tr>
  `;
}

function stockTransferRow(entry) {
  const deliverer = byId(state.people, entry.delivererId);
  const product = byId(state.products, entry.productId);
  return `
    <tr>
      <td><input class="row-checkbox" data-stock-transfer-select="${escapeHtml(entry.id)}" type="checkbox" aria-label="Selecionar movimento" /></td>
      <td>${formatDate(entry.date)}</td>
      <td>${escapeHtml(deliverer?.name || "Entregador removido")}</td>
      <td>${escapeHtml(product?.name || "Produto removido")}</td>
      <td><span class="pill ${entry.type === "Saida" ? "warn" : "good"}">${escapeHtml(entry.type)}</span></td>
      <td>${Number(entry.quantity || 0)} un.</td>
      <td>${escapeHtml(entry.note || "-")}</td>
      <td>${actionButtons("stock-transfer", entry.id)}</td>
    </tr>
  `;
}

function actionButtons(type, id) {
  const copyButton = type === "sale" ? `<button class="secondary small" data-copy-${type}="${id}" type="button">Copiar</button>` : "";
  return `
    <div class="row-actions">
      <button class="secondary small" data-edit-${type}="${id}" type="button">Editar</button>
      ${copyButton}
      <button class="danger small" data-delete-${type}="${id}" type="button">Excluir</button>
    </div>
  `;
}

function collaboratorSummaries() {
  return state.people.map((person) => {
    const entries = state.ledger.filter((entry) => entry.personId === person.id);
    const commissions = entries
      .filter((entry) => entry.direction === "in" && (String(entry.type || "").startsWith("Comissao") || entry.type === "Taxa entrega cancelada"))
      .reduce((sum, entry) => sum + entry.amount, 0);
    const advances = entries.filter((entry) => entry.type === "Vale").reduce((sum, entry) => sum + entry.amount, 0);
    const payments = entries.filter((entry) => entry.type === "Pagamento").reduce((sum, entry) => sum + entry.amount, 0);
    const totalIn = entries.filter((entry) => entry.direction === "in").reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const totalOut = entries.filter((entry) => entry.direction === "out").reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    return {
      ...person,
      commissions,
      advances,
      payments,
      totalIn,
      totalOut,
      balance: totalIn - totalOut,
    };
  });
}

function salesInPeriod(startDate, endDate) {
  return state.sales.filter((sale) => isDateInside(sale.date, startDate, endDate));
}

function ledgerInPeriod(startDate, endDate) {
  return state.ledger.filter((entry) => isDateInside(entry.date, startDate, endDate));
}

function stockTransfersInPeriod(startDate, endDate) {
  return state.stockTransfers.filter((entry) => isDateInside(entry.date, startDate, endDate));
}

function campaignsInPeriod(startDate, endDate) {
  return state.campaigns.filter((entry) => isDateInside(entry.date, startDate, endDate));
}

function isDateInside(date, startDate, endDate) {
  if (!date) return false;
  const start = startDate || endDate || "";
  const end = endDate || startDate || "";
  return (!start || date >= start) && (!end || date <= end);
}

function courierStockBalances() {
  const balances = new Map();

  const ensure = (delivererId, productId) => {
    const key = `${delivererId}|${productId}`;
    if (!balances.has(key)) {
      const deliverer = byId(state.people, delivererId);
      const product = byId(state.products, productId);
      balances.set(key, {
        delivererId,
        productId,
        delivererName: deliverer?.name || "Entregador removido",
        productName: product?.name || "Produto removido",
        out: 0,
        returned: 0,
        sold: 0,
        balance: 0,
      });
    }
    return balances.get(key);
  };

  state.stockTransfers.forEach((entry) => {
    const row = ensure(entry.delivererId, entry.productId);
    if (entry.type === "Devolucao") row.returned += Number(entry.quantity || 0);
    else row.out += Number(entry.quantity || 0);
  });

  state.sales
    .filter((sale) => sale.status !== "Cancelada" && sale.delivererId)
    .forEach((sale) => {
      sale.items
        .forEach((item) => {
          const courierQty = courierFulfilledQuantity(item);
          if (courierQty <= 0) return;
          const row = ensure(sale.delivererId, item.productId);
          row.sold += courierQty;
        });
    });

  balances.forEach((row) => {
    row.balance = row.out - row.returned - row.sold;
  });

  return [...balances.values()].sort((a, b) => a.delivererName.localeCompare(b.delivererName) || a.productName.localeCompare(b.productName));
}

function courierStockAvailable(delivererId, productId) {
  const row = courierStockBalances().find((entry) => entry.delivererId === delivererId && entry.productId === productId);
  return row?.balance || 0;
}

function courierStockAvailableForProduct(productId) {
  return courierStockBalances()
    .filter((entry) => entry.productId === productId)
    .reduce((sum, entry) => sum + Number(entry.balance || 0), 0);
}

function profitForPeriod(startDate, endDate) {
  const sales = state.sales.filter((sale) => {
    return sale.status !== "Cancelada" && sale.date >= startDate && sale.date <= endDate;
  });
  const saleCodes = new Set(sales.map((sale) => sale.code));
  const revenue = sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const productCost = sales.reduce((sum, sale) => {
    return (
      sum +
      sale.items.reduce((itemSum, item) => {
        const product = byId(state.products, item.productId);
        const unitCost = Number(item.unitCost ?? product?.cost ?? 0);
        return itemSum + unitCost * Number(item.quantity || 0);
      }, 0)
    );
  }, 0);
  const commissions = state.ledger
    .filter((entry) => saleCodes.has(entry.source) && String(entry.type || "").startsWith("Comissao"))
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const canceledDeliveryFees = state.ledger
    .filter((entry) => entry.date >= startDate && entry.date <= endDate && entry.type === "Taxa entrega cancelada")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const campaignCost = campaignsInPeriod(startDate, endDate).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const operationalProfit = revenue - productCost - commissions - canceledDeliveryFees;

  return {
    count: sales.length,
    revenue: roundMoney(revenue),
    productCost: roundMoney(productCost),
    commissions: roundMoney(commissions + canceledDeliveryFees),
    campaignCost: roundMoney(campaignCost),
    profit: roundMoney(operationalProfit),
    realProfit: roundMoney(operationalProfit - campaignCost),
  };
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthStart(dateString) {
  return `${dateString.slice(0, 7)}-01`;
}

function yearStart(dateString) {
  return `${dateString.slice(0, 4)}-01-01`;
}

function statusPill(status) {
  const className = status === "Entregue" ? "good" : status === "Cancelada" ? "bad" : "warn";
  return `<span class="pill ${className}">${escapeHtml(status)}</span>`;
}

function formatDate(date) {
  if (!date) return "-";
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function addSaleItem(itemOrProductId = "") {
  const seedItem = typeof itemOrProductId === "object" && itemOrProductId ? itemOrProductId : null;
  const productId = seedItem?.productId || itemOrProductId || "";
  const node = els.saleItemTemplate.content.firstElementChild.cloneNode(true);
  const productSelect = node.querySelector("select[name='productId']");
  const priceInput = node.querySelector("input[name='unitPrice']");
  node.dataset.originalProductName = seedItem?.productName || "";
  node.dataset.originalUnitCost = seedItem && Number.isFinite(Number(seedItem.unitCost)) ? Number(seedItem.unitCost) : "";

  populateProductSelect(productSelect);
  if (productId) productSelect.value = productId;

  const setPrice = () => {
    const product = byId(state.products, productSelect.value);
    priceInput.value = product ? Number(product.price).toFixed(2) : "0.00";
    updateSaleTotal();
  };

  productSelect.addEventListener("change", setPrice);
  node.querySelector("input[name='quantity']").addEventListener("input", updateSaleTotal);
  priceInput.addEventListener("input", updateSaleTotal);
  node.querySelector(".remove-item").addEventListener("click", () => {
    node.remove();
    if (!els.saleItems.children.length) addSaleItem();
    updateSaleTotal();
  });

  els.saleItems.appendChild(node);
  setPrice();
  if (seedItem) {
    node.querySelector("input[name='quantity']").value = Number(seedItem.quantity || 1);
    priceInput.value = Number(seedItem.unitPrice || 0).toFixed(2);
    updateSaleTotal();
  }
}

function addSalePayment(payment = {}) {
  const node = els.salePaymentTemplate.content.firstElementChild.cloneNode(true);
  const methodSelect = node.querySelector("select[name='paymentMethod']");
  const amountInput = node.querySelector("input[name='paymentAmount']");
  methodSelect.value = payment.method || payment.paymentMethod || "PIX";
  amountInput.value = payment.amount !== undefined && payment.amount !== "" ? Number(payment.amount || 0).toFixed(2) : "";
  methodSelect.addEventListener("change", updateSaleTotal);
  amountInput.addEventListener("input", () => {
    amountInput.dataset.autoTotal = "false";
    updateSaleTotal();
  });
  node.querySelector(".remove-payment").addEventListener("click", () => {
    node.remove();
    if (!els.salePayments.children.length) addSalePayment();
    updateSaleTotal();
  });
  els.salePayments.appendChild(node);
}

function updateSaleTotal() {
  const total = getSaleItems().reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  els.saleTotalPreview.textContent = money(total);
  syncSinglePaymentAmount(total);
  updateCommissionPreview(total);
}

function syncSinglePaymentAmount(total) {
  const rows = [...els.salePayments.querySelectorAll(".payment-item")];
  if (rows.length !== 1) return;
  const amountInput = rows[0].querySelector("input[name='paymentAmount']");
  if (!amountInput.value || amountInput.dataset.autoTotal === "true") {
    amountInput.value = Number(total || 0).toFixed(2);
    amountInput.dataset.autoTotal = "true";
  }
}

function updateCommissionPreview(total = getSaleItems().reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)) {
  const seller = byId(state.people, els.saleForm.elements.sellerId.value);
  const deliverer = byId(state.people, els.saleForm.elements.delivererId.value);
  const status = els.saleForm.elements.status.value;
  const isCanceled = status === "Cancelada";
  const isOwnDeliverySale = seller && deliverer && seller.id === deliverer.id;
  const canceledDeliveryFee = roundMoney(els.saleForm.elements.canceledDeliveryFee.value);
  const additionalTarget = els.saleForm.elements.additionalCommissionTarget.value;
  const additionalAmount = roundMoney(els.saleForm.elements.additionalCommissionAmount.value);

  let sellerCommission = 0;
  let delivererCommission = 0;

  if (isCanceled) {
    delivererCommission = deliverer ? canceledDeliveryFee : 0;
  } else {
    if (seller && isOwnDeliverySale && Number(seller.ownSalesCommissionRate) > 0) {
      sellerCommission = roundMoney(total * (Number(seller.ownSalesCommissionRate) / 100));
    } else if (seller && !isOwnDeliverySale && Number(seller.salesCommissionRate) > 0) {
      sellerCommission = roundMoney(total * (Number(seller.salesCommissionRate) / 100));
    }
    if (deliverer && Number(deliverer.deliveryCommission) > 0) {
      delivererCommission = roundMoney(deliverer.deliveryCommission);
    }
  }

  if (additionalAmount > 0) {
    if (additionalTarget === "seller" && seller) sellerCommission += additionalAmount;
    if (additionalTarget === "deliverer" && deliverer) delivererCommission += additionalAmount;
  }

  els.sellerCommissionPreview.textContent = money(sellerCommission);
  els.delivererCommissionPreview.textContent = money(delivererCommission);
  els.totalCommissionPreview.textContent = money(sellerCommission + delivererCommission);
}

function getSaleItems() {
  return [...els.saleItems.querySelectorAll(".sale-item")]
    .map((row) => {
      const product = byId(state.products, row.querySelector("select[name='productId']").value);
      const selectedProductId = row.querySelector("select[name='productId']").value;
      const originalProductName = row.dataset.originalProductName || "";
      const originalUnitCost = row.dataset.originalUnitCost;
      return {
        productId: product?.id || selectedProductId || "",
        productName: product?.name || originalProductName || "Produto removido",
        quantity: Number(row.querySelector("input[name='quantity']").value || 0),
        unitPrice: Number(row.querySelector("input[name='unitPrice']").value || 0),
        unitCost: originalUnitCost !== "" ? Number(originalUnitCost) : Number(product?.cost || 0),
      };
    })
    .filter((item) => item.productId && item.quantity > 0);
}

function getSalePayments(total = 0) {
  const rows = [...els.salePayments.querySelectorAll(".payment-item")];
  const payments = rows
    .map((row) => ({
      method: row.querySelector("select[name='paymentMethod']").value || "Nao informado",
      amount: roundMoney(row.querySelector("input[name='paymentAmount']").value),
    }))
    .filter((payment) => payment.amount > 0);

  if (!payments.length && total > 0) {
    const method = rows[0]?.querySelector("select[name='paymentMethod']")?.value || "PIX";
    return [{ method, amount: roundMoney(total) }];
  }

  return payments;
}

function salePaymentEntries(sale) {
  if (Array.isArray(sale.payments) && sale.payments.length) {
    return sale.payments.map((payment) => ({
      method: payment.method || payment.paymentMethod || "Nao informado",
      amount: roundMoney(payment.amount),
    }));
  }

  const method = sale.paymentMethod || "Nao informado";
  const amount = roundMoney(sale.total);
  return amount > 0 ? [{ method, amount }] : [];
}

function salePaymentSummary(sale) {
  const payments = salePaymentEntries(sale);
  if (!payments.length) return sale.paymentMethod || "Nao informado";
  if (payments.length === 1) return payments[0].method;
  return payments.map((payment) => `${payment.method} ${money(payment.amount)}`).join(" + ");
}

function cashPaymentAmount(sale) {
  return salePaymentEntries(sale)
    .filter((payment) => isCashPaymentMethod(payment.method))
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
}

function handleSaleSubmit(event) {
  event.preventDefault();
  const data = new FormData(els.saleForm);
  const items = getSaleItems();
  const editingSale = byId(state.sales, data.get("id"));

  if (!items.length) {
    showToast("Adicione pelo menos um produto na venda.");
    return;
  }

  const status = data.get("status") || "Entregue";

  if (!editingSale) {
    const shortage = items.find((item) => {
      const product = byId(state.products, item.productId);
      const courierAvailable = data.get("delivererId") ? courierStockAvailable(data.get("delivererId"), item.productId) : 0;
      return product && item.quantity > Number(product.stock || 0) + courierAvailable;
    });

    if (shortage && status !== "Cancelada") {
      showToast(`Estoque insuficiente para ${shortage.productName}.`);
      return;
    }
  }

  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const payments = getSalePayments(total);
  const paymentTotal = roundMoney(payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0));

  if (status !== "Cancelada" && total > 0 && paymentTotal !== roundMoney(total)) {
    showToast(`A soma dos pagamentos precisa fechar ${money(total)}.`);
    return;
  }

  const sale = {
    id: editingSale?.id || uid("sale"),
    code: editingSale?.code || nextSaleCode(),
    date: data.get("date") || today(),
    customer: data.get("customer") || "Cliente nao informado",
    paymentMethod: salePaymentSummary({ payments, total }),
    payments,
    status,
    sellerId: data.get("sellerId"),
    delivererId: data.get("delivererId"),
    canceledDeliveryFee: status === "Cancelada" ? roundMoney(data.get("canceledDeliveryFee")) : 0,
    additionalCommissionTarget: data.get("additionalCommissionTarget"),
    additionalCommissionAmount: roundMoney(data.get("additionalCommissionAmount")),
    items,
    total,
  };

  const result = editingSale ? replaceSale(editingSale, sale) : commitSale(sale);
  if (!result.ok) {
    showToast(result.message);
    return;
  }

  saveState(editingSale ? { force: true } : {});
  rememberLastSale(sale);
  els.saleModal.close();
  resetSaleForm();
  render();
  showToast(editingSale ? "Venda atualizada e saldos recalculados." : sale.status === "Cancelada" ? "Venda cancelada registrada com taxa do entregador." : "Venda registrada e estoque atualizado.");
}

function commitSale(sale) {
  if (sale.status !== "Cancelada") {
    const plan = planSaleFulfillment(sale);
    if (!plan.ok) {
      return { ok: false, message: plan.message };
    }

    const warehouseUsage = new Map();
    plan.items.forEach((itemPlan) => {
      warehouseUsage.set(itemPlan.productId, (warehouseUsage.get(itemPlan.productId) || 0) + itemPlan.warehouseQty);
    });

    const shortage = sale.items.find((item) => {
      const product = byId(state.products, item.productId);
      if (!product) return true;
      return Number(warehouseUsage.get(item.productId) || 0) > Number(product.stock || 0);
    });

    if (shortage) {
      return { ok: false, message: `Estoque insuficiente para ${shortage.productName || "produto selecionado"}.` };
    }

    plan.items.forEach((itemPlan, index) => {
      const item = sale.items[index];
      const product = byId(state.products, item.productId);
      item.fulfillmentDelivererQty = itemPlan.courierQty;
      item.fulfillmentWarehouseQty = itemPlan.warehouseQty;
      if (itemPlan.courierQty === Number(item.quantity || 0)) {
        item.fulfillment = "deliverer";
      } else if (itemPlan.warehouseQty === Number(item.quantity || 0)) {
        item.fulfillment = "warehouse";
      } else {
        item.fulfillment = "mixed";
      }
      if (itemPlan.warehouseQty > 0) {
        product.stock -= itemPlan.warehouseQty;
      }
    });
    createCommissionEntries(sale);
    createCashPaymentAdvance(sale);
  } else {
    createCanceledDeliveryFee(sale);
    createAdditionalCommissionEntry(sale);
  }

  state.sales.push(sale);
  return { ok: true };
}

function planSaleFulfillment(sale) {
  const courierUsage = new Map();
  const warehouseUsage = new Map();
  const items = [];

  for (const item of sale.items) {
    const product = byId(state.products, item.productId);
    if (!product) {
      return { ok: false, message: `Produto nao encontrado: ${item.productName || "produto selecionado"}.` };
    }

    const quantity = Number(item.quantity || 0);
    const key = `${sale.delivererId || ""}|${item.productId}`;
    const usedCourier = courierUsage.get(key) || 0;
    const courierAvailable = sale.delivererId ? Math.max(courierStockAvailable(sale.delivererId, item.productId) - usedCourier, 0) : 0;
    const courierQty = Math.min(quantity, courierAvailable);
    const warehouseQty = quantity - courierQty;
    const usedWarehouse = warehouseUsage.get(item.productId) || 0;

    if (warehouseQty > Number(product.stock || 0) - usedWarehouse) {
      return { ok: false, message: `Estoque insuficiente para ${item.productName || product.name}.` };
    }

    courierUsage.set(key, usedCourier + courierQty);
    warehouseUsage.set(item.productId, usedWarehouse + warehouseQty);
    items.push({ productId: item.productId, courierQty, warehouseQty });
  }

  return { ok: true, items };
}

function replaceSale(oldSale, newSale) {
  removeSaleEffects(oldSale);
  state.sales = state.sales.filter((sale) => sale.id !== oldSale.id);
  const result = commitSale(newSale);
  if (!result.ok) {
    commitSale(oldSale);
  }
  return result;
}

function removeSaleEffects(sale) {
  if (sale.status !== "Cancelada") {
    sale.items.forEach((item) => {
      const warehouseQty = warehouseFulfilledQuantity(item);
      if (warehouseQty <= 0) return;
      const product = byId(state.products, item.productId);
      if (product) product.stock += warehouseQty;
    });
  }
  state.ledger
    .filter((entry) => entry.source === sale.code)
    .forEach((entry) => markDeleted("ledger", entry.id));
  state.ledger = state.ledger.filter((entry) => entry.source !== sale.code);
}

function courierFulfilledQuantity(item) {
  if (Number.isFinite(Number(item.fulfillmentDelivererQty))) return Number(item.fulfillmentDelivererQty || 0);
  return item.fulfillment === "deliverer" ? Number(item.quantity || 0) : 0;
}

function warehouseFulfilledQuantity(item) {
  if (Number.isFinite(Number(item.fulfillmentWarehouseQty))) return Number(item.fulfillmentWarehouseQty || 0);
  if (item.fulfillment === "deliverer") return 0;
  return Number(item.quantity || 0);
}

function nextSaleCode() {
  const maxNumber = state.sales.reduce((max, sale) => {
    const number = Number(String(sale.code || "").replace(/\D/g, ""));
    return Number.isFinite(number) ? Math.max(max, number) : max;
  }, 0);
  return `V${String(maxNumber + 1).padStart(4, "0")}`;
}

function createCommissionEntries(sale) {
  const seller = byId(state.people, sale.sellerId);
  const deliverer = byId(state.people, sale.delivererId);
  const isOwnDeliverySale = seller && deliverer && seller.id === deliverer.id;

  if (seller && isOwnDeliverySale && Number(seller.ownSalesCommissionRate) > 0) {
    state.ledger.push({
      id: uid("ledger"),
      date: sale.date,
      personId: seller.id,
      type: "Comissao venda propria",
      source: sale.code,
      description: `${seller.ownSalesCommissionRate}% sobre venda propria ${sale.code}`,
      amount: roundMoney(sale.total * (Number(seller.ownSalesCommissionRate) / 100)),
      direction: "in",
    });
  } else if (seller && !isOwnDeliverySale && Number(seller.salesCommissionRate) > 0) {
    state.ledger.push({
      id: uid("ledger"),
      date: sale.date,
      personId: seller.id,
      type: "Comissao vendedor",
      source: sale.code,
      description: `${seller.salesCommissionRate}% sobre venda ${sale.code}`,
      amount: roundMoney(sale.total * (Number(seller.salesCommissionRate) / 100)),
      direction: "in",
    });
  }

  if (deliverer && Number(deliverer.deliveryCommission) > 0) {
    state.ledger.push({
      id: uid("ledger"),
      date: sale.date,
      personId: deliverer.id,
      type: "Comissao entrega",
      source: sale.code,
      description: `Entrega da venda ${sale.code}`,
      amount: roundMoney(Number(deliverer.deliveryCommission)),
      direction: "in",
    });
  }

  createAdditionalCommissionEntry(sale);
}

function createAdditionalCommissionEntry(sale) {
  const target = sale.additionalCommissionTarget;
  const amount = roundMoney(sale.additionalCommissionAmount);
  if (!target || amount <= 0) return;

  const personId = target === "seller" ? sale.sellerId : sale.delivererId;
  const person = byId(state.people, personId);
  if (!person) return;

  state.ledger.push({
    id: uid("ledger"),
    date: sale.date,
    personId: person.id,
    type: target === "seller" ? "Comissao adicional vendedor" : "Comissao adicional entregador",
    source: sale.code,
    description: `Comissao adicional da venda ${sale.code}`,
    amount,
    direction: "in",
  });
}

function createCashPaymentAdvance(sale) {
  const deliverer = byId(state.people, sale.delivererId);
  const amount = roundMoney(cashPaymentAmount(sale));
  if (!deliverer || amount <= 0) return;

  state.ledger.push({
    id: uid("ledger"),
    date: sale.date,
    personId: deliverer.id,
    type: "Vale",
    source: sale.code,
    description: `Dinheiro recebido na entrega da venda ${sale.code}`,
    amount,
    direction: "out",
  });
}

function createCanceledDeliveryFee(sale) {
  const deliverer = byId(state.people, sale.delivererId);
  const fee = roundMoney(sale.canceledDeliveryFee);
  if (!deliverer || fee <= 0) return;

  state.ledger.push({
    id: uid("ledger"),
    date: sale.date,
    personId: deliverer.id,
    type: "Taxa entrega cancelada",
    source: sale.code,
    description: `Taxa por tentativa de entrega cancelada ${sale.code}`,
    amount: fee,
    direction: "in",
  });
}

function isCashPaymentMethod(paymentMethod) {
  return String(paymentMethod || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .includes("dinheiro");
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function resetSaleForm() {
  els.saleForm.reset();
  els.saleForm.elements.id.value = "";
  els.saleForm.elements.date.value = latestSaleDate() || today();
  els.saleForm.elements.canceledDeliveryFee.value = 0;
  els.saleForm.elements.additionalCommissionTarget.value = "";
  els.saleForm.elements.additionalCommissionAmount.value = 0;
  els.salePayments.innerHTML = "";
  restoreLastSale();
  if (!els.salePayments.children.length) addSalePayment();
  els.saleItems.innerHTML = "";
  addSaleItem();
  els.saleModalTitle.textContent = "Nova venda";
  els.saleSubmitButton.textContent = "Registrar venda";
  updateSaleTotal();
}

function latestSaleDate() {
  return [...state.sales]
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))[0]?.date || "";
}

function fillSaleFormFromSale(sale, { copy = false } = {}) {
  renderSelects();
  els.saleForm.reset();
  els.saleForm.elements.id.value = copy ? "" : sale.id;
  els.saleForm.elements.date.value = sale.date || latestSaleDate() || today();
  els.saleForm.elements.customer.value = sale.customer || "";
  els.salePayments.innerHTML = "";
  salePaymentEntries(sale).forEach((payment) => addSalePayment(payment));
  if (!els.salePayments.children.length) addSalePayment({ method: sale.paymentMethod || "PIX", amount: sale.total || 0 });
  els.saleForm.elements.status.value = sale.status || "Entregue";
  els.saleForm.elements.sellerId.value = sale.sellerId || "";
  els.saleForm.elements.delivererId.value = sale.delivererId || "";
  els.saleForm.elements.canceledDeliveryFee.value = Number(sale.canceledDeliveryFee || 0).toFixed(2);
  els.saleForm.elements.additionalCommissionTarget.value = sale.additionalCommissionTarget || "";
  els.saleForm.elements.additionalCommissionAmount.value = Number(sale.additionalCommissionAmount || 0).toFixed(2);
  els.saleItems.innerHTML = "";
  sale.items.forEach((item) => addSaleItem(item));
  if (!els.saleItems.children.length) addSaleItem();
  els.saleModalTitle.textContent = copy ? `Copiar venda ${sale.code}` : `Editar venda ${sale.code}`;
  els.saleSubmitButton.textContent = copy ? "Registrar copia" : "Atualizar venda";
  updateSaleTotal();
  els.saleModal.showModal();
}

function editSale(saleId) {
  const sale = byId(state.sales, saleId);
  if (!sale) return;
  fillSaleFormFromSale(sale);
}

function copySale(saleId) {
  const sale = byId(state.sales, saleId);
  if (!sale) return;
  fillSaleFormFromSale(sale, { copy: true });
}

function deleteSale(saleId) {
  const sale = byId(state.sales, saleId);
  if (!sale) return;
  if (!confirm(`Excluir a venda ${sale.code}? O estoque e as comissoes dessa venda serao revertidos.`)) return;
  createAutomaticBackup(`Antes de excluir venda ${sale.code}`);
  removeSaleEffects(sale);
  markDeleted("sales", sale.id);
  state.sales = state.sales.filter((entry) => entry.id !== sale.id);
  const inboxEntry = state.inbox.find((entry) => entry.saleId === sale.id || entry.id === sale.sourceInboxId);
  if (inboxEntry && inboxEntry.status === "Aprovada") {
    inboxEntry.status = "Pendente";
    delete inboxEntry.saleId;
  }
  saveState({ force: true });
  render();
  showToast("Venda excluida e saldos recalculados.");
}

function rememberLastSale(sale) {
  localStorage.setItem(
    lastSaleStorageKey,
    JSON.stringify({
      date: sale.date,
      paymentMethod: sale.paymentMethod,
      payments: salePaymentEntries(sale).map((payment) => ({ method: payment.method })),
      status: sale.status,
      sellerId: sale.sellerId,
      delivererId: sale.delivererId,
      additionalCommissionTarget: sale.additionalCommissionTarget,
    })
  );
}

function restoreLastSale() {
  try {
    const memory = JSON.parse(localStorage.getItem(lastSaleStorageKey) || "{}");
    els.salePayments.innerHTML = "";
    if (Array.isArray(memory.payments) && memory.payments.length) {
      memory.payments.forEach((payment) => addSalePayment({ method: payment.method || payment.paymentMethod || "PIX" }));
    } else {
      addSalePayment({ method: memory.paymentMethod || "PIX" });
    }
    els.saleForm.elements.date.value = memory.date || latestSaleDate() || today();
    if (memory.status) els.saleForm.elements.status.value = memory.status;
    if (memory.sellerId && byId(state.people, memory.sellerId)) els.saleForm.elements.sellerId.value = memory.sellerId;
    if (memory.delivererId && byId(state.people, memory.delivererId)) els.saleForm.elements.delivererId.value = memory.delivererId;
    if (memory.additionalCommissionTarget) els.saleForm.elements.additionalCommissionTarget.value = memory.additionalCommissionTarget;
  } catch {
    localStorage.removeItem(lastSaleStorageKey);
  }
}

function handleProductSubmit(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const productId = data.get("id");
  const product = productId ? byId(state.products, productId) : null;
  const name = String(data.get("name") || "").trim();

  if (!name) {
    showToast("Informe o nome do perfume.");
    return;
  }

  const payload = {
    name,
    sku: data.get("sku"),
    price: roundMoney(data.get("price")),
    cost: roundMoney(data.get("cost")),
    stock: Number(data.get("stock") || 0),
    minStock: Number(data.get("minStock") || 0),
  };

  if (product) {
    Object.assign(product, payload);
  } else {
    state.products.push({
      id: uid("product"),
      ...payload,
    });
  }

  saveState();
  resetProductForm();
  render();
  showToast(product ? "Produto atualizado." : "Produto salvo.");
}

function editProduct(productId) {
  const product = byId(state.products, productId);
  if (!product) return;
  setView("products");
  els.productForm.elements.id.value = product.id;
  els.productForm.elements.name.value = product.name || "";
  els.productForm.elements.sku.value = product.sku || "";
  els.productForm.elements.price.value = Number(product.price || 0).toFixed(2);
  els.productForm.elements.cost.value = Number(product.cost || 0).toFixed(2);
  els.productForm.elements.stock.value = Number(product.stock || 0);
  els.productForm.elements.minStock.value = Number(product.minStock || 0);
  els.productFormTitle.textContent = "Editar produto";
  els.productSubmitButton.textContent = "Atualizar produto";
  els.productCancelButton.hidden = false;
  els.productForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function deleteProduct(productId) {
  const product = byId(state.products, productId);
  if (!product) return;
  const hasSales = state.sales.some((sale) => sale.items.some((item) => item.productId === product.id));
  const hasCourierStock = state.stockTransfers.some((entry) => entry.productId === product.id);
  const hasStockEntries = state.stockEntries.some((entry) => entry.productId === product.id);
  if (hasSales || hasCourierStock || hasStockEntries) {
    showToast("Este produto tem historico. Edite o cadastro em vez de excluir.");
    return;
  }
  if (!confirm(`Excluir o produto ${product.name}? Esta acao remove apenas o cadastro sem historico vinculado.`)) return;
  createAutomaticBackup(`Antes de excluir produto ${product.name}`);
  markDeleted("products", product.id);
  state.products = state.products.filter((entry) => entry.id !== product.id);
  resetProductForm();
  saveState({ force: true });
  render();
  showToast("Produto excluido.");
}

function resetProductForm() {
  els.productForm.reset();
  els.productForm.elements.id.value = "";
  els.productForm.elements.minStock.value = 3;
  els.productFormTitle.textContent = "Novo produto";
  els.productSubmitButton.textContent = "Salvar produto";
  els.productCancelButton.hidden = true;
}

function handleStockEntrySubmit(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const entryId = data.get("id");
  const currentEntry = entryId ? byId(state.stockEntries, entryId) : null;
  let itemRows = collectStockEntryItems();

  if (!itemRows.length && !currentEntry && String(els.stockEntryBulkText?.value || "").trim()) {
    itemRows = parseStockEntryBulkText(els.stockEntryBulkText.value);
  }

  if (!itemRows.length) {
    showToast("Informe uma lista do fornecedor ou adicione pelo menos um perfume.");
    return;
  }
  if (currentEntry && itemRows.length > 1) {
    showToast("Na edicao, mantenha apenas um item por entrada.");
    return;
  }

  const base = {
    date: data.get("date") || today(),
    note: data.get("note") || "",
  };
  const entries = itemRows.map((item) => ({
    id: currentEntry?.id || uid("stock_entry"),
    ...base,
    ...item,
  }));

  if (currentEntry) {
    const result = replaceStockEntry(currentEntry, entries[0]);
    if (!result.ok) {
      showToast(result.message);
      return;
    }
  } else {
    entries.forEach((entry) => commitStockEntry(entry));
  }

  saveState(currentEntry ? { force: true } : {});
  resetStockEntryForm();
  render();
  showToast(currentEntry ? "Entrada de estoque atualizada." : `${entries.length} item(ns) somado(s) ao estoque.`);
}

function collectStockEntryItems() {
  return [...els.stockEntryItems.querySelectorAll(".stock-entry-item")]
    .map((row) => ({
      productName: String(row.querySelector("[name='productName']").value || "").trim(),
      quantity: Number(row.querySelector("[name='quantity']").value || 0),
      sku: row.querySelector("[name='sku']").value || "",
      price: roundMoney(row.querySelector("[name='price']").value),
      cost: roundMoney(row.querySelector("[name='cost']").value),
      minStock: Number(row.querySelector("[name='minStock']").value || 3),
    }))
    .filter((item) => item.productName && item.quantity > 0);
}

function replaceStockEntry(oldEntry, newEntry) {
  const validation = validateStockEntryChange(oldEntry, newEntry);
  if (!validation.ok) return validation;
  reverseStockEntryEffects(oldEntry);
  state.stockEntries = state.stockEntries.filter((entry) => entry.id !== oldEntry.id);
  const result = commitStockEntry(newEntry);
  if (!result.ok) {
    commitStockEntry(oldEntry);
  }
  return result;
}

function validateStockEntryChange(oldEntry, newEntry) {
  const stockByProduct = new Map(state.products.map((product) => [product.id, Number(product.stock || 0)]));
  if (oldEntry) {
    stockByProduct.set(oldEntry.productId, (stockByProduct.get(oldEntry.productId) || 0) - Number(oldEntry.quantity || 0));
  }
  if (newEntry) {
    const product = findProductByName(newEntry.productName);
    if (product) stockByProduct.set(product.id, (stockByProduct.get(product.id) || 0) + Number(newEntry.quantity || 0));
  }
  for (const [productId, stock] of stockByProduct.entries()) {
    if (stock < 0) {
      const product = byId(state.products, productId);
      return { ok: false, message: `Nao e possivel alterar: o estoque base de ${product?.name || "produto"} ficaria negativo.` };
    }
  }
  return { ok: true };
}

function commitStockEntry(entry) {
  let product = findProductByName(entry.productName);
  const createdProduct = !product;

  if (!product) {
    product = {
      id: uid("product"),
      name: entry.productName,
      sku: entry.sku || "",
      price: roundMoney(entry.price),
      cost: roundMoney(entry.cost),
      stock: 0,
      minStock: Number(entry.minStock || 3),
    };
    state.products.push(product);
  } else {
    if (entry.sku) product.sku = entry.sku;
    if (Number(entry.price || 0) > 0) product.price = roundMoney(entry.price);
    if (Number(entry.cost || 0) > 0) product.cost = roundMoney(entry.cost);
    if (Number.isFinite(Number(entry.minStock)) && Number(entry.minStock) >= 0) product.minStock = Number(entry.minStock);
  }

  product.stock = Number(product.stock || 0) + Number(entry.quantity || 0);
  entry.productId = product.id;
  entry.productName = product.name;
  entry.createdProduct = createdProduct;
  state.stockEntries.push(entry);
  return { ok: true, createdProduct };
}

function reverseStockEntryEffects(entry) {
  const product = byId(state.products, entry.productId);
  if (!product) return;
  product.stock = Math.max(Number(product.stock || 0) - Number(entry.quantity || 0), 0);
}

function findProductByName(name) {
  const normalized = normalizeLookupText(name);
  return state.products.find((product) => normalizeLookupText(product.name) === normalized);
}

function findProductByApproximateName(name) {
  const normalized = normalizeLookupText(name);
  if (!normalized) return null;
  const exact = state.products.find((product) => normalizeLookupText(product.name) === normalized);
  if (exact) return exact;

  const expanded = expandCommonProductText(normalized);
  const candidates = state.products
    .map((product) => {
      const productName = normalizeLookupText(product.name);
      const expandedProduct = expandCommonProductText(productName);
      const distance = Math.min(levenshteinDistance(expanded, expandedProduct), levenshteinDistance(normalized, productName));
      const limit = Math.max(1, Math.floor(Math.max(expanded.length, expandedProduct.length) * 0.22));
      return { product, distance, limit };
    })
    .filter((candidate) => candidate.distance <= candidate.limit)
    .sort((a, b) => a.distance - b.distance);
  return candidates[0]?.product || null;
}

function expandCommonProductText(value) {
  return String(value || "")
    .replace(/\bd\b/g, "de")
    .replace(/\brose\b/g, "rose")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = temp;
    }
  }
  return previous[b.length];
}

function addStockEntryItem(item = {}) {
  const node = els.stockEntryItemTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector("[name='productName']").value = item.productName || "";
  node.querySelector("[name='quantity']").value = Number(item.quantity || 1);
  node.querySelector("[name='sku']").value = item.sku || "";
  node.querySelector("[name='price']").value = Number(item.price || 0) > 0 ? Number(item.price || 0).toFixed(2) : "";
  node.querySelector("[name='cost']").value = Number(item.cost || 0) > 0 ? Number(item.cost || 0).toFixed(2) : "";
  node.querySelector("[name='minStock']").value = Number(item.minStock ?? 3);
  node.querySelector(".remove-stock-entry-item").addEventListener("click", () => {
    node.remove();
    if (!els.stockEntryItems.children.length) addStockEntryItem();
  });
  els.stockEntryItems.appendChild(node);
}

function parseStockEntryList() {
  if (els.stockEntryForm.elements.id.value) {
    showToast("Cancele a edicao antes de importar uma lista.");
    return;
  }
  const parsedItems = parseStockEntryBulkText(els.stockEntryBulkText.value);
  if (!parsedItems.length) {
    showToast("Nao encontrei itens na lista. Use linhas como '50 asad' ou 'Asad 50'.");
    return;
  }
  els.stockEntryItems.innerHTML = "";
  parsedItems.forEach((item) => addStockEntryItem(item));
  const matched = parsedItems.filter((item) => item.matchedProduct).length;
  showToast(`${parsedItems.length} item(ns) lido(s). ${matched} reconhecido(s) no estoque.`);
}

function parseStockEntryBulkText(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => parseStockEntryLine(line))
    .filter(Boolean);
}

function parseStockEntryLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return null;
  const leading = trimmed.match(/^(\d+)\s+(.+)$/);
  const trailing = trimmed.match(/^(.+?)\s+(\d+)$/);
  const quantity = Number(leading?.[1] || trailing?.[2] || 0);
  const rawName = String(leading?.[2] || trailing?.[1] || "").trim();
  if (!rawName || quantity <= 0) return null;

  const matchedProduct = findProductByApproximateName(rawName);
  return {
    productName: matchedProduct?.name || normalizeDisplayProductName(rawName),
    quantity,
    sku: matchedProduct?.sku || "",
    price: Number(matchedProduct?.price || 0),
    cost: Number(matchedProduct?.cost || 0),
    minStock: Number(matchedProduct?.minStock ?? 3),
    matchedProduct: Boolean(matchedProduct),
  };
}

function normalizeDisplayProductName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

function normalizeLookupText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function editStockEntry(entryId) {
  const entry = byId(state.stockEntries, entryId);
  if (!entry) return;
  const product = byId(state.products, entry.productId);
  setView("stock-entry");
  els.stockEntryForm.elements.id.value = entry.id;
  els.stockEntryForm.elements.date.value = entry.date || today();
  if (els.stockEntryBulkText) els.stockEntryBulkText.value = "";
  els.stockEntryItems.innerHTML = "";
  addStockEntryItem({
    productName: product?.name || entry.productName || "",
    quantity: Number(entry.quantity || 1),
    sku: entry.sku || product?.sku || "",
    price: Number(entry.price || product?.price || 0),
    cost: Number(entry.cost || product?.cost || 0),
    minStock: Number(entry.minStock ?? product?.minStock ?? 3),
  });
  els.stockEntryForm.elements.note.value = entry.note || "";
  els.stockEntryFormTitle.textContent = "Editar entrada";
  els.stockEntrySubmitButton.textContent = "Atualizar entrada";
  els.stockEntryCancelButton.hidden = false;
  els.stockEntryForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetStockEntryForm() {
  els.stockEntryForm.reset();
  els.stockEntryForm.elements.id.value = "";
  els.stockEntryForm.elements.date.value = today();
  if (els.stockEntryBulkText) els.stockEntryBulkText.value = "";
  els.stockEntryItems.innerHTML = "";
  addStockEntryItem();
  els.stockEntryFormTitle.textContent = "Entrada de estoque";
  els.stockEntrySubmitButton.textContent = "Registrar entrada";
  els.stockEntryCancelButton.hidden = true;
}

function deleteStockEntry(entryId) {
  const entry = byId(state.stockEntries, entryId);
  if (!entry) return;
  const validation = validateStockEntryChange(entry, null);
  if (!validation.ok) {
    showToast(validation.message);
    return;
  }
  if (!confirm(`Excluir entrada de ${entry.quantity} unidade(s)? O estoque base sera reduzido.`)) return;
  createAutomaticBackup("Antes de excluir entrada de estoque");
  reverseStockEntryEffects(entry);
  markDeleted("stockEntries", entry.id);
  state.stockEntries = state.stockEntries.filter((item) => item.id !== entry.id);
  resetStockEntryForm();
  saveState({ force: true });
  render();
  showToast("Entrada de estoque excluida.");
}

function handleCampaignSubmit(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const campaignId = data.get("id");
  const campaign = campaignId ? byId(state.campaigns, campaignId) : null;
  const amount = roundMoney(data.get("amount"));

  if (amount <= 0) {
    showToast("Informe um valor de campanha maior que zero.");
    return;
  }

  const payload = {
    date: data.get("date") || today(),
    name: String(data.get("name") || "").trim() || "Campanha",
    amount,
    note: data.get("note") || "",
  };

  if (campaign) {
    Object.assign(campaign, payload);
  } else {
    state.campaigns.push({
      id: uid("campaign"),
      ...payload,
    });
  }

  saveState(campaign ? { force: true } : {});
  resetCampaignForm();
  render();
  showToast(campaign ? "Campanha atualizada." : "Gasto de campanha registrado.");
}

function editCampaign(campaignId) {
  const campaign = byId(state.campaigns, campaignId);
  if (!campaign) return;
  setView("campaigns");
  els.campaignForm.elements.id.value = campaign.id;
  els.campaignForm.elements.date.value = campaign.date || today();
  els.campaignForm.elements.name.value = campaign.name || "";
  els.campaignForm.elements.amount.value = Number(campaign.amount || 0).toFixed(2);
  els.campaignForm.elements.note.value = campaign.note || "";
  els.campaignFormTitle.textContent = "Editar campanha";
  els.campaignSubmitButton.textContent = "Atualizar gasto";
  els.campaignCancelButton.hidden = false;
  els.campaignForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetCampaignForm() {
  els.campaignForm.reset();
  els.campaignForm.elements.id.value = "";
  els.campaignForm.elements.date.value = today();
  els.campaignFormTitle.textContent = "Gasto de campanha";
  els.campaignSubmitButton.textContent = "Registrar gasto";
  els.campaignCancelButton.hidden = true;
}

function deleteCampaign(campaignId) {
  const campaign = byId(state.campaigns, campaignId);
  if (!campaign) return;
  if (!confirm(`Excluir gasto de campanha ${money(campaign.amount)}?`)) return;
  createAutomaticBackup("Antes de excluir campanha");
  markDeleted("campaigns", campaign.id);
  state.campaigns = state.campaigns.filter((entry) => entry.id !== campaign.id);
  resetCampaignForm();
  saveState({ force: true });
  render();
  showToast("Campanha excluida.");
}

function handlePersonSubmit(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const personId = data.get("id");
  const person = personId ? byId(state.people, personId) : null;
  const name = String(data.get("name") || "").trim();

  if (!name) {
    showToast("Informe o nome do colaborador.");
    return;
  }

  const payload = {
    name,
    role: data.get("role") || "Entregador",
    deliveryCommission: roundMoney(data.get("deliveryCommission")),
    salesCommissionRate: roundMoney(data.get("salesCommissionRate")),
    ownSalesCommissionRate: roundMoney(data.get("ownSalesCommissionRate")),
  };

  if (person) {
    const hasSellerHistory = state.sales.some((sale) => sale.sellerId === person.id);
    const hasDelivererHistory = state.sales.some((sale) => sale.delivererId === person.id) || state.stockTransfers.some((entry) => entry.delivererId === person.id);
    if (hasSellerHistory && !isSeller(payload)) {
      showToast("Este colaborador ja tem historico como vendedor. Use a funcao 'Entregador e vendedor'.");
      return;
    }
    if (hasDelivererHistory && !isDeliverer(payload)) {
      showToast("Este colaborador ja tem historico como entregador. Use a funcao 'Entregador e vendedor'.");
      return;
    }
    Object.assign(person, payload);
  } else {
    state.people.push({
      id: uid("person"),
      ...payload,
    });
  }
  saveState();
  resetPersonForm();
  render();
  showToast(person ? "Colaborador atualizado." : "Colaborador salvo.");
}

function editPerson(personId) {
  const person = byId(state.people, personId);
  if (!person) return;
  setView("people");
  els.personForm.elements.id.value = person.id;
  els.personForm.elements.name.value = person.name || "";
  els.personForm.elements.role.value = person.role || "Entregador";
  els.personForm.elements.deliveryCommission.value = Number(person.deliveryCommission || 0).toFixed(2);
  els.personForm.elements.salesCommissionRate.value = Number(person.salesCommissionRate || 0).toFixed(2);
  els.personForm.elements.ownSalesCommissionRate.value = Number(person.ownSalesCommissionRate || 0).toFixed(2);
  els.personFormTitle.textContent = "Editar colaborador";
  els.personSubmitButton.textContent = "Atualizar colaborador";
  els.personCancelButton.hidden = false;
  els.personForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetPersonForm() {
  els.personForm.reset();
  els.personForm.elements.id.value = "";
  els.personForm.elements.deliveryCommission.value = 0;
  els.personForm.elements.salesCommissionRate.value = 0;
  els.personForm.elements.ownSalesCommissionRate.value = 0;
  els.personFormTitle.textContent = "Novo colaborador";
  els.personSubmitButton.textContent = "Salvar colaborador";
  els.personCancelButton.hidden = true;
}

function deletePerson(personId) {
  const person = byId(state.people, personId);
  if (!person) return;
  const hasSales = state.sales.some((sale) => sale.sellerId === person.id || sale.delivererId === person.id);
  const hasLedger = state.ledger.some((entry) => entry.personId === person.id);
  const hasCourierStock = state.stockTransfers.some((entry) => entry.delivererId === person.id);
  if (hasSales || hasLedger || hasCourierStock) {
    showToast("Este colaborador tem historico. Edite o cadastro em vez de excluir.");
    return;
  }
  if (!confirm(`Excluir ${person.name}?`)) return;
  createAutomaticBackup(`Antes de excluir colaborador ${person.name}`);
  markDeleted("people", person.id);
  state.people = state.people.filter((entry) => entry.id !== person.id);
  resetPersonForm();
  resetSaleForm();
  saveState({ force: true });
  render();
  showToast("Colaborador excluido.");
}

function deleteSelectedRecords(view) {
  const ids = selectedRecordIds(view);
  if (!ids.length) return;
  const handlers = {
    sales: deleteSelectedSales,
    products: deleteSelectedProducts,
    stockEntries: deleteSelectedStockEntries,
    campaigns: deleteSelectedCampaigns,
    people: deleteSelectedPeople,
  };
  handlers[view]?.(ids);
}

function deleteSelectedSales(ids) {
  const selected = new Set(ids);
  const sales = state.sales.filter((sale) => selected.has(sale.id));
  if (!sales.length) return;
  if (!confirm(`Excluir ${sales.length} venda(s)? Receita, estoque, comissoes, conta corrente e demais dados vinculados serao recalculados.`)) return;
  createAutomaticBackup(`Antes de excluir ${sales.length} vendas`);
  sales.forEach((sale) => {
    removeSaleEffects(sale);
    markDeleted("sales", sale.id);
    const inboxEntry = state.inbox.find((entry) => entry.saleId === sale.id || entry.id === sale.sourceInboxId);
    if (inboxEntry && inboxEntry.status === "Aprovada") {
      inboxEntry.status = "Pendente";
      delete inboxEntry.saleId;
    }
  });
  state.sales = state.sales.filter((sale) => !selected.has(sale.id));
  resetSaleForm();
  saveState({ force: true });
  render();
  showToast(`${sales.length} venda(s) excluida(s) e dados vinculados recalculados.`);
}

function deleteSelectedProducts(ids) {
  const selected = new Set(ids);
  const products = state.products.filter((product) => selected.has(product.id));
  if (!products.length) return;
  const blocked = products.find((product) =>
    state.sales.some((sale) => sale.items.some((item) => item.productId === product.id)) ||
    state.stockTransfers.some((entry) => entry.productId === product.id) ||
    state.stockEntries.some((entry) => entry.productId === product.id),
  );
  if (blocked) {
    showToast(`${blocked.name} tem historico vinculado e nao pode ser excluido.`);
    return;
  }
  if (!confirm(`Excluir ${products.length} produto(s) sem historico vinculado?`)) return;
  createAutomaticBackup(`Antes de excluir ${products.length} produtos`);
  products.forEach((product) => markDeleted("products", product.id));
  state.products = state.products.filter((product) => !selected.has(product.id));
  resetProductForm();
  saveState({ force: true });
  render();
  showToast(`${products.length} produto(s) excluido(s).`);
}

function deleteSelectedStockEntries(ids) {
  const selected = new Set(ids);
  const entries = state.stockEntries.filter((entry) => selected.has(entry.id));
  if (!entries.length) return;
  const projectedStock = new Map(state.products.map((product) => [product.id, Number(product.stock || 0)]));
  entries.forEach((entry) => {
    projectedStock.set(entry.productId, Number(projectedStock.get(entry.productId) || 0) - Number(entry.quantity || 0));
  });
  for (const [productId, stock] of projectedStock.entries()) {
    if (stock < 0) {
      const product = byId(state.products, productId);
      showToast(`Nao e possivel excluir: o estoque base de ${product?.name || "produto"} ficaria negativo.`);
      return;
    }
  }
  if (!confirm(`Excluir ${entries.length} entrada(s)? As quantidades correspondentes serao retiradas do estoque base.`)) return;
  createAutomaticBackup(`Antes de excluir ${entries.length} entradas de estoque`);
  entries.forEach((entry) => {
    reverseStockEntryEffects(entry);
    markDeleted("stockEntries", entry.id);
  });
  state.stockEntries = state.stockEntries.filter((entry) => !selected.has(entry.id));
  resetStockEntryForm();
  saveState({ force: true });
  render();
  showToast(`${entries.length} entrada(s) excluida(s) e estoque recalculado.`);
}

function deleteSelectedCampaigns(ids) {
  const selected = new Set(ids);
  const campaigns = state.campaigns.filter((campaign) => selected.has(campaign.id));
  if (!campaigns.length) return;
  if (!confirm(`Excluir ${campaigns.length} gasto(s) de campanha? O lucro sera recalculado.`)) return;
  createAutomaticBackup(`Antes de excluir ${campaigns.length} campanhas`);
  campaigns.forEach((campaign) => markDeleted("campaigns", campaign.id));
  state.campaigns = state.campaigns.filter((campaign) => !selected.has(campaign.id));
  resetCampaignForm();
  saveState({ force: true });
  render();
  showToast(`${campaigns.length} campanha(s) excluida(s) e lucro recalculado.`);
}

function deleteSelectedPeople(ids) {
  const selected = new Set(ids);
  const people = state.people.filter((person) => selected.has(person.id));
  if (!people.length) return;
  const blocked = people.find((person) =>
    state.sales.some((sale) => sale.sellerId === person.id || sale.delivererId === person.id) ||
    state.ledger.some((entry) => entry.personId === person.id) ||
    state.stockTransfers.some((entry) => entry.delivererId === person.id),
  );
  if (blocked) {
    showToast(`${blocked.name} tem historico vinculado e nao pode ser excluido.`);
    return;
  }
  if (!confirm(`Excluir ${people.length} colaborador(es) sem historico vinculado?`)) return;
  createAutomaticBackup(`Antes de excluir ${people.length} colaboradores`);
  people.forEach((person) => markDeleted("people", person.id));
  state.people = state.people.filter((person) => !selected.has(person.id));
  resetPersonForm();
  resetSaleForm();
  saveState({ force: true });
  render();
  showToast(`${people.length} colaborador(es) excluido(s).`);
}

function handleLedgerSubmit(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const type = data.get("type");
  const amount = roundMoney(data.get("amount"));
  const ledgerId = data.get("id");
  const ledgerEntry = ledgerId ? byId(state.ledger, ledgerId) : null;
  if (!data.get("personId")) {
    showToast("Escolha um colaborador para registrar o movimento.");
    return;
  }
  if (amount <= 0) {
    showToast("Informe um valor maior que zero.");
    return;
  }
  const direction = type === "Ajuste positivo" ? "in" : "out";
  const payload = {
    date: data.get("date") || today(),
    personId: data.get("personId"),
    type: type || "Vale",
    source: "Manual",
    description: data.get("description"),
    amount,
    direction,
  };

  if (ledgerEntry) {
    Object.assign(ledgerEntry, payload);
  } else {
    state.ledger.push({
      id: uid("ledger"),
      ...payload,
    });
  }

  saveState();
  resetLedgerForm();
  render();
  showToast(ledgerEntry ? "Movimento atualizado." : "Movimento registrado no extrato.");
}

function editLedger(ledgerId) {
  const entry = byId(state.ledger, ledgerId);
  if (!entry || entry.source !== "Manual") return;
  setView("finance");
  els.ledgerForm.elements.id.value = entry.id;
  els.ledgerForm.elements.personId.value = entry.personId || "";
  els.ledgerForm.elements.date.value = entry.date || today();
  els.ledgerForm.elements.type.value = entry.type || "Vale";
  els.ledgerForm.elements.amount.value = Number(entry.amount || 0).toFixed(2);
  els.ledgerForm.elements.description.value = entry.description || "";
  els.ledgerFormTitle.textContent = "Editar movimento";
  els.ledgerSubmitButton.textContent = "Atualizar movimento";
  els.ledgerCancelButton.hidden = false;
  els.ledgerForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetLedgerForm() {
  els.ledgerForm.reset();
  els.ledgerForm.elements.id.value = "";
  els.ledgerForm.elements.date.value = today();
  els.ledgerFormTitle.textContent = "Movimento financeiro";
  els.ledgerSubmitButton.textContent = "Registrar movimento";
  els.ledgerCancelButton.hidden = true;
}

function deleteLedger(ledgerId) {
  const entry = byId(state.ledger, ledgerId);
  if (!entry || entry.source !== "Manual") return;
  if (!confirm("Excluir este movimento financeiro manual?")) return;
  createAutomaticBackup("Antes de excluir movimento financeiro");
  markDeleted("ledger", entry.id);
  state.ledger = state.ledger.filter((item) => item.id !== entry.id);
  resetLedgerForm();
  saveState({ force: true });
  render();
  showToast("Movimento excluido.");
}

function addStockTransferItem(item = {}) {
  const node = els.stockTransferItemTemplate.content.firstElementChild.cloneNode(true);
  const productSelect = node.querySelector("select[name='productId']");
  const quantityInput = node.querySelector("input[name='quantity']");
  populateStockTransferProductSelect(productSelect);
  if (item.productId) productSelect.value = item.productId;
  quantityInput.value = Number(item.quantity || 1);
  node.querySelector(".remove-stock-transfer-item").addEventListener("click", () => {
    node.remove();
    if (!els.stockTransferItems.children.length) addStockTransferItem();
  });
  els.stockTransferItems.appendChild(node);
}

function getStockTransferItems() {
  return [...els.stockTransferItems.querySelectorAll(".stock-transfer-item")]
    .map((row) => ({
      productId: row.querySelector("select[name='productId']").value,
      quantity: Number(row.querySelector("input[name='quantity']").value || 0),
    }))
    .filter((item) => item.productId && item.quantity > 0);
}

function handleStockTransferSubmit(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const transferId = data.get("id");
  const currentTransfer = transferId ? byId(state.stockTransfers, transferId) : null;
  const items = getStockTransferItems();

  if (!data.get("delivererId") || !items.length) {
    showToast("Informe entregador e ao menos um perfume com quantidade.");
    return;
  }

  const transfers = items.map((item, index) => ({
    id: currentTransfer?.id && index === 0 ? currentTransfer.id : uid("stock_transfer"),
    date: data.get("date") || today(),
    delivererId: data.get("delivererId"),
    productId: item.productId,
    type: data.get("type") || "Saida",
    quantity: Number(item.quantity || 0),
    note: data.get("note") || "",
  }));

  const validation = validateStockTransferBatch(currentTransfer, transfers);
  if (!validation.ok) {
    showToast(validation.message);
    return;
  }

  if (currentTransfer) {
    reverseStockTransferEffects(currentTransfer);
    state.stockTransfers = state.stockTransfers.filter((entry) => entry.id !== currentTransfer.id);
  }

  const appliedTransfers = [];
  for (const transfer of transfers) {
    const result = applyStockTransferEffects(transfer);
    if (!result.ok) {
      appliedTransfers.forEach(reverseStockTransferEffects);
      if (currentTransfer) {
        applyStockTransferEffects(currentTransfer);
        state.stockTransfers.push(currentTransfer);
      }
      showToast(result.message);
      return;
    }
    appliedTransfers.push(transfer);
  }

  if (!appliedTransfers.length) {
    if (currentTransfer) {
      applyStockTransferEffects(currentTransfer);
      state.stockTransfers.push(currentTransfer);
    }
    showToast("Informe ao menos um perfume com quantidade.");
    return;
  }

  state.stockTransfers.push(...appliedTransfers);
  saveState(currentTransfer ? { force: true } : {});
  resetStockTransferForm();
  render();
  showToast(currentTransfer ? "Movimento de estoque atualizado." : `${appliedTransfers.length} movimento(s) de estoque registrado(s).`);
}

function validateStockTransferBatch(currentTransfer, transfers) {
  const validation = validateStockTransferChange(currentTransfer, null);
  if (!validation.ok) return validation;

  const stockByProduct = new Map(state.products.map((product) => [product.id, Number(product.stock || 0)]));
  const balanceByPair = new Map(courierStockBalances().map((row) => [`${row.delivererId}|${row.productId}`, Number(row.balance || 0)]));

  const applyProjectedTransfer = (transfer, multiplier) => {
    if (!transfer) return;
    const quantity = Number(transfer.quantity || 0) * multiplier;
    const productStock = stockByProduct.get(transfer.productId) ?? 0;
    const pairKey = `${transfer.delivererId}|${transfer.productId}`;
    const pairBalance = balanceByPair.get(pairKey) ?? 0;

    if (transfer.type === "Devolucao") {
      stockByProduct.set(transfer.productId, productStock + quantity);
      balanceByPair.set(pairKey, pairBalance - quantity);
    } else {
      stockByProduct.set(transfer.productId, productStock - quantity);
      balanceByPair.set(pairKey, pairBalance + quantity);
    }
  };

  applyProjectedTransfer(currentTransfer, -1);
  transfers.forEach((transfer) => applyProjectedTransfer(transfer, 1));

  for (const [productId, stock] of stockByProduct.entries()) {
    if (stock < 0) {
      const product = byId(state.products, productId);
      return { ok: false, message: `O estoque principal de ${product?.name || "produto"} ficaria negativo.` };
    }
  }

  for (const [key, balance] of balanceByPair.entries()) {
    if (balance < 0) {
      const [delivererId, productId] = key.split("|");
      const deliverer = byId(state.people, delivererId);
      const product = byId(state.products, productId);
      return { ok: false, message: `${deliverer?.name || "Entregador"} ficaria com saldo negativo de ${product?.name || "produto"}.` };
    }
  }

  return { ok: true };
}

function validateStockTransferChange(currentTransfer, nextTransfer) {
  const stockByProduct = new Map(state.products.map((product) => [product.id, Number(product.stock || 0)]));
  const balanceByPair = new Map(courierStockBalances().map((row) => [`${row.delivererId}|${row.productId}`, Number(row.balance || 0)]));

  const applyProjectedTransfer = (transfer, multiplier) => {
    if (!transfer) return;
    const quantity = Number(transfer.quantity || 0) * multiplier;
    const productStock = stockByProduct.get(transfer.productId) ?? 0;
    const pairKey = `${transfer.delivererId}|${transfer.productId}`;
    const pairBalance = balanceByPair.get(pairKey) ?? 0;

    if (transfer.type === "Devolucao") {
      stockByProduct.set(transfer.productId, productStock + quantity);
      balanceByPair.set(pairKey, pairBalance - quantity);
    } else {
      stockByProduct.set(transfer.productId, productStock - quantity);
      balanceByPair.set(pairKey, pairBalance + quantity);
    }
  };

  applyProjectedTransfer(currentTransfer, -1);
  applyProjectedTransfer(nextTransfer, 1);

  for (const [productId, stock] of stockByProduct.entries()) {
    if (stock < 0) {
      const product = byId(state.products, productId);
      return { ok: false, message: `O estoque principal de ${product?.name || "produto"} ficaria negativo.` };
    }
  }

  for (const [key, balance] of balanceByPair.entries()) {
    if (balance < 0) {
      const [delivererId, productId] = key.split("|");
      const deliverer = byId(state.people, delivererId);
      const product = byId(state.products, productId);
      return { ok: false, message: `${deliverer?.name || "Entregador"} ficaria com saldo negativo de ${product?.name || "produto"}.` };
    }
  }

  return { ok: true };
}

function applyStockTransferEffects(transfer) {
  const product = byId(state.products, transfer.productId);
  if (!product) return { ok: false, message: "Produto nao encontrado." };

  if (transfer.type === "Devolucao") {
    const available = courierStockAvailable(transfer.delivererId, transfer.productId);
    if (transfer.quantity > available) {
      return { ok: false, message: `O entregador possui apenas ${available} unidade(s) em maos.` };
    }
    product.stock += transfer.quantity;
    return { ok: true };
  }

  if (transfer.quantity > Number(product.stock || 0)) {
    return { ok: false, message: `Estoque insuficiente para saida de ${product.name}.` };
  }
  product.stock -= transfer.quantity;
  return { ok: true };
}

function reverseStockTransferEffects(transfer) {
  const product = byId(state.products, transfer.productId);
  if (!product) return;
  if (transfer.type === "Devolucao") {
    product.stock = Math.max(Number(product.stock || 0) - Number(transfer.quantity || 0), 0);
  } else {
    product.stock += Number(transfer.quantity || 0);
  }
}

function editStockTransfer(transferId) {
  const transfer = byId(state.stockTransfers, transferId);
  if (!transfer) return;
  setView("courier-stock");
  els.stockTransferForm.elements.id.value = transfer.id;
  els.stockTransferForm.elements.date.value = transfer.date || today();
  els.stockTransferForm.elements.delivererId.value = transfer.delivererId || "";
  els.stockTransferForm.elements.type.value = transfer.type || "Saida";
  els.stockTransferItems.innerHTML = "";
  addStockTransferItem({ productId: transfer.productId, quantity: transfer.quantity || 1 });
  els.stockTransferForm.elements.note.value = transfer.note || "";
  els.stockTransferFormTitle.textContent = "Editar movimento";
  els.stockTransferSubmitButton.textContent = "Atualizar movimento";
  els.stockTransferCancelButton.hidden = false;
  els.stockTransferForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetStockTransferForm() {
  els.stockTransferForm.reset();
  els.stockTransferForm.elements.id.value = "";
  els.stockTransferForm.elements.date.value = today();
  els.stockTransferItems.innerHTML = "";
  addStockTransferItem();
  els.stockTransferFormTitle.textContent = "Saida para entregador";
  els.stockTransferSubmitButton.textContent = "Registrar movimento";
  els.stockTransferCancelButton.hidden = true;
}

function deleteStockTransfer(transferId) {
  const transfer = byId(state.stockTransfers, transferId);
  if (!transfer) return;
  const deletionPlan = planStockTransferDeletion([transfer]);
  if (!deletionPlan.ok) {
    showToast(deletionPlan.message);
    return;
  }
  if (!confirm(`Excluir este movimento de ${transfer.type.toLowerCase()} de ${transfer.quantity} unidade(s)? As vendas ja registradas serao preservadas e somente o estoque restante sera recalculado.`)) return;
  createAutomaticBackup("Antes de excluir movimento de estoque com entregador");
  applyStockTransferDeletion([transfer], deletionPlan);
  markDeleted("stockTransfers", transfer.id);
  state.stockTransfers = state.stockTransfers.filter((entry) => entry.id !== transfer.id);
  resetStockTransferForm();
  saveState({ force: true });
  render();
  showToast("Movimento de estoque excluido.");
}

function updateStockTransferSelectionControls() {
  if (!els.stockTransferSelectAll || !els.deleteSelectedStockTransfersButton) return;
  const checkboxes = [...document.querySelectorAll("[data-stock-transfer-select]")];
  const selectedCount = checkboxes.filter((checkbox) => checkbox.checked).length;
  els.stockTransferSelectAll.checked = checkboxes.length > 0 && selectedCount === checkboxes.length;
  els.stockTransferSelectAll.indeterminate = selectedCount > 0 && selectedCount < checkboxes.length;
  els.stockTransferSelectAll.disabled = checkboxes.length === 0;
  els.deleteSelectedStockTransfersButton.disabled = selectedCount === 0;
  if (els.stockTransferSelectionCount) {
    els.stockTransferSelectionCount.textContent = `${selectedCount} ${selectedCount === 1 ? "selecionado" : "selecionados"}`;
  }
}

function toggleAllStockTransfers() {
  document.querySelectorAll("[data-stock-transfer-select]").forEach((checkbox) => {
    checkbox.checked = els.stockTransferSelectAll.checked;
  });
  updateStockTransferSelectionControls();
}

function planStockTransferDeletion(transfers) {
  const stockByProduct = new Map(state.products.map((product) => [product.id, Number(product.stock || 0)]));
  const balanceByPair = new Map(courierStockBalances().map((row) => [`${row.delivererId}|${row.productId}`, Number(row.balance || 0)]));

  transfers.forEach((transfer) => {
    const quantity = Number(transfer.quantity || 0);
    const productStock = stockByProduct.get(transfer.productId) ?? 0;
    const pairKey = `${transfer.delivererId}|${transfer.productId}`;
    const pairBalance = balanceByPair.get(pairKey) ?? 0;
    if (transfer.type === "Devolucao") {
      stockByProduct.set(transfer.productId, productStock - quantity);
      balanceByPair.set(pairKey, pairBalance + quantity);
    } else {
      stockByProduct.set(transfer.productId, productStock + quantity);
      balanceByPair.set(pairKey, pairBalance - quantity);
    }
  });

  const reassignments = [];
  for (const [key, balance] of balanceByPair.entries()) {
    if (balance < 0) {
      const [delivererId, productId] = key.split("|");
      const deliverer = byId(state.people, delivererId);
      const product = byId(state.products, productId);
      const quantity = Math.abs(balance);
      const availableSoldQuantity = state.sales
        .filter((sale) => sale.status !== "Cancelada" && sale.delivererId === delivererId)
        .flatMap((sale) => sale.items)
        .filter((item) => item.productId === productId)
        .reduce((sum, item) => sum + courierFulfilledQuantity(item), 0);
      if (availableSoldQuantity < quantity) {
        return { ok: false, message: `Nao foi possivel reconciliar o saldo de ${deliverer?.name || "entregador"} para ${product?.name || "produto"}.` };
      }
      stockByProduct.set(productId, Number(stockByProduct.get(productId) || 0) - quantity);
      reassignments.push({ delivererId, productId, quantity });
    }
  }
  for (const [productId, stock] of stockByProduct.entries()) {
    if (stock < 0) {
      const product = byId(state.products, productId);
      return { ok: false, message: `Nao e possivel excluir: o estoque principal de ${product?.name || "produto"} ficaria negativo.` };
    }
  }
  return { ok: true, reassignments };
}

function reassignCourierSalesToWarehouse(delivererId, productId, quantity) {
  let remaining = Number(quantity || 0);
  const sales = state.sales
    .filter((sale) => sale.status !== "Cancelada" && sale.delivererId === delivererId)
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));

  for (const sale of sales) {
    for (const item of sale.items) {
      if (remaining <= 0) return;
      if (item.productId !== productId) continue;
      const courierQuantity = courierFulfilledQuantity(item);
      if (courierQuantity <= 0) continue;
      const movedQuantity = Math.min(courierQuantity, remaining);
      const warehouseQuantity = warehouseFulfilledQuantity(item) + movedQuantity;
      const remainingCourierQuantity = courierQuantity - movedQuantity;
      item.fulfillmentDelivererQty = remainingCourierQuantity;
      item.fulfillmentWarehouseQty = warehouseQuantity;
      item.fulfillment = remainingCourierQuantity <= 0 ? "warehouse" : warehouseQuantity <= 0 ? "deliverer" : "mixed";
      remaining -= movedQuantity;
    }
  }
}

function applyStockTransferDeletion(transfers, deletionPlan) {
  transfers.forEach(reverseStockTransferEffects);
  deletionPlan.reassignments.forEach((entry) => {
    reassignCourierSalesToWarehouse(entry.delivererId, entry.productId, entry.quantity);
    const product = byId(state.products, entry.productId);
    if (product) product.stock -= entry.quantity;
  });
}

function deleteSelectedStockTransfers() {
  const selectedIds = [...document.querySelectorAll("[data-stock-transfer-select]:checked")].map((checkbox) => checkbox.dataset.stockTransferSelect);
  const selectedSet = new Set(selectedIds);
  const transfers = state.stockTransfers.filter((transfer) => selectedSet.has(transfer.id));
  if (!transfers.length) return;
  const deletionPlan = planStockTransferDeletion(transfers);
  if (!deletionPlan.ok) {
    showToast(deletionPlan.message);
    return;
  }
  if (!confirm(`Excluir ${transfers.length} movimento(s) selecionado(s)? As vendas ja registradas serao preservadas e somente o estoque restante sera recalculado.`)) return;
  createAutomaticBackup(`Antes de excluir ${transfers.length} movimentos de estoque com entregador`);
  applyStockTransferDeletion(transfers, deletionPlan);
  transfers.forEach((transfer) => {
    markDeleted("stockTransfers", transfer.id);
  });
  state.stockTransfers = state.stockTransfers.filter((transfer) => !selectedSet.has(transfer.id));
  resetStockTransferForm();
  saveState({ force: true });
  render();
  showToast(`${transfers.length} movimento(s) excluido(s).`);
}

function handleMessageImportSubmit(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const messages = splitImportedMessages(data.get("messages"));

  if (!messages.length) {
    showToast("Cole ao menos uma mensagem para analisar.");
    return;
  }

  importIncomingMessages(messages, "Simulador");
  event.currentTarget.reset();
}

function splitMessages(text) {
  return String(text || "")
    .split(/\n\s*\n/g)
    .map((message) => message.trim())
    .filter(Boolean);
}

function importIncomingMessages(messages, sourceName = "WhatsApp Web") {
  const entries = messages.map((message) => createInboxEntry(message, sourceName));
  state.inbox.push(...entries);
  saveState();
  render();
  setView("integrations");
  showToast(`${entries.length} mensagem(ns) enviada(s) para revisao.`);
}

function createInboxEntry(message, sourceName) {
  const parsed = parseIncomingMessageDraft(message, sourceName, {
    products: state.products,
    people: state.people,
  });
  return {
    ...parsed,
    id: uid("inbox"),
    createdAt: new Date().toISOString(),
    draft: {
      date: today(),
      status: "Entregue",
      canceledDeliveryFee: 0,
      additionalCommissionTarget: "",
      additionalCommissionAmount: 0,
      ...parsed.draft,
    },
  };
}

function handleInboxClick(event) {
  const button = event.target.closest("[data-inbox-action]");
  if (!button) return;

  const card = button.closest("[data-inbox-id]");
  const entry = byId(state.inbox, card.dataset.inboxId);
  if (!entry || entry.status !== "Pendente") return;

  if (button.dataset.inboxAction === "ignore") {
    entry.status = "Ignorada";
    saveState();
    render();
    showToast("Mensagem ignorada.");
    return;
  }

  approveInboxEntry(entry, card);
}

function approveInboxEntry(entry, card) {
  const product = byId(state.products, card.querySelector("[data-field='productId']").value);
  const quantity = Number(card.querySelector("[data-field='quantity']").value || 0);
  const unitPrice = roundMoney(card.querySelector("[data-field='unitPrice']").value);
  const status = card.querySelector("[data-field='status']").value;

  const canceledDeliveryFee = status === "Cancelada" ? roundMoney(card.querySelector("[data-field='canceledDeliveryFee']").value) : 0;
  const total = roundMoney(quantity * unitPrice);
  const paymentMethod = card.querySelector("[data-field='paymentMethod']").value;

  if (!product || quantity <= 0 || (status !== "Cancelada" && unitPrice <= 0)) {
    showToast("Revise produto, quantidade e preco antes de aprovar.");
    return;
  }

  const sale = {
    id: uid("sale"),
    code: nextSaleCode(),
    date: entry.draft.date || today(),
    customer: card.querySelector("[data-field='customer']").value || "Cliente a revisar",
    customerPhone: card.querySelector("[data-field='customerPhone']").value || "",
    paymentMethod,
    payments: total > 0 ? [{ method: paymentMethod, amount: total }] : [],
    status,
    sellerId: card.querySelector("[data-field='sellerId']").value,
    delivererId: card.querySelector("[data-field='delivererId']").value,
    canceledDeliveryFee,
    additionalCommissionTarget: card.querySelector("[data-field='additionalCommissionTarget']").value,
    additionalCommissionAmount: roundMoney(card.querySelector("[data-field='additionalCommissionAmount']").value),
    source: entry.source,
    sourceInboxId: entry.id,
    items: [
      {
        productId: product.id,
        productName: product.name,
        quantity,
        unitPrice,
        unitCost: Number(product.cost || 0),
      },
    ],
    total,
  };

  const result = commitSale(sale);
  if (!result.ok) {
    showToast(result.message);
    return;
  }

  entry.status = "Aprovada";
  entry.saleId = sale.id;
  saveState();
  render();
  showToast("Venda importada aprovada.");
}

function hideApprovedInbox() {
  state.inbox.forEach((entry) => {
    if (entry.status !== "Pendente") entry.status = "Oculta";
  });
  saveState();
  render();
  showToast("Mensagens ja tratadas foram ocultadas.");
}

function restoreHiddenInbox() {
  let restored = 0;
  state.inbox.forEach((entry) => {
    if (entry.status === "Oculta") {
      entry.status = entry.saleId ? "Aprovada" : "Ignorada";
      restored += 1;
    }
  });
  saveState();
  render();
  showToast(restored ? "Mensagens ocultas foram exibidas novamente." : "Nao ha mensagens ocultas.");
}

function seedExamples() {
  if (state.products.length || state.people.length || state.sales.length || state.ledger.length) {
    if (!confirm("Isso vai adicionar exemplos aos dados atuais. Continuar?")) return;
  }

  const deliverer = { id: uid("person"), name: "Rafael Entregas", role: "Entregador", deliveryCommission: 8, salesCommissionRate: 0, ownSalesCommissionRate: 0 };
  const seller = { id: uid("person"), name: "Camila Vendas", role: "Vendedor", deliveryCommission: 0, salesCommissionRate: 5, ownSalesCommissionRate: 0 };
  const both = { id: uid("person"), name: "Joao Operacao", role: "Ambos", deliveryCommission: 7, salesCommissionRate: 3, ownSalesCommissionRate: 10 };
  const products = [
    { id: uid("product"), name: "Essencial Oud 100ml", sku: "PERF-001", price: 189.9, cost: 92, stock: 12, minStock: 3 },
    { id: uid("product"), name: "Malbec Gold 100ml", sku: "PERF-002", price: 169.9, cost: 80, stock: 8, minStock: 3 },
    { id: uid("product"), name: "Floratta Red 75ml", sku: "PERF-003", price: 129.9, cost: 59, stock: 4, minStock: 3 },
  ];

  state.people.push(deliverer, seller, both);
  state.products.push(...products);

  const exampleSale = {
    id: uid("sale"),
    code: "V0001",
    date: today(),
    customer: "Cliente exemplo",
    paymentMethod: "PIX",
    status: "Entregue",
    sellerId: seller.id,
    delivererId: deliverer.id,
    items: [
      { productId: products[0].id, productName: products[0].name, quantity: 1, unitPrice: products[0].price, unitCost: products[0].cost },
      { productId: products[2].id, productName: products[2].name, quantity: 1, unitPrice: products[2].price, unitCost: products[2].cost },
    ],
    total: products[0].price + products[2].price,
  };

  exampleSale.items.forEach((item) => {
    byId(state.products, item.productId).stock -= item.quantity;
  });
  state.sales.push(exampleSale);
  createCommissionEntries(exampleSale);
  state.ledger.push({
    id: uid("ledger"),
    date: today(),
    personId: deliverer.id,
    type: "Vale",
    source: "Manual",
    description: "Adiantamento exemplo",
    amount: 20,
    direction: "out",
  });
  state.inbox.push(
    createInboxEntry(
      `Venda finalizada
Cliente: Maria WhatsApp
Produto: Malbec Gold 100ml
Qtd: 1
Pagamento: Dinheiro
Vendedor: Joao Operacao
Entregador: Rafael Entregas
Telefone: 11999990000`,
      "Exemplo WhatsApp",
    ),
  );

  saveState();
  render();
  showToast("Exemplos carregados.");
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `backup-cod-perfumes-${today()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function exportAutomaticBackups() {
  const backups = JSON.parse(localStorage.getItem("codPerfumesErp.autoBackups") || "[]");
  if (!backups.length) {
    showToast("Ainda nao ha backups automaticos.");
    return;
  }
  const blob = new Blob([JSON.stringify(backups, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `backups-automaticos-cod-perfumes-${today()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("Backups automaticos exportados.");
}

function exportExcelData() {
  const workbook = [
    excelSheet("Resumo", summaryExportRows()),
    excelSheet("Vendas Completa", salesExportRows()),
    excelSheet("Itens Vendidos", saleItemsExportRows()),
    excelSheet("Acertos", settlementExportRows()),
    excelSheet("Pagamentos", ledgerExportRows()),
    excelSheet("Ganhos Entregadores", delivererEarningsExportRows()),
    excelSheet("Lucros", profitExportRows()),
    excelSheet("Campanhas", campaignExportRows()),
    excelSheet("Vendas por Produto", productSalesExportRows()),
    excelSheet("Formas de Pagamento", paymentSummaryExportRows()),
    excelSheet("Entradas Estoque", stockEntryExportRows()),
    excelSheet("Estoque", productExportRows()),
    excelSheet("Estoque Entregador", courierStockExportRows()),
    excelSheet("Colaboradores", collaboratorExportRows()),
  ].join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>
  <Style ss:ID="default"><Font ss:FontName="Calibri" ss:Size="11"/></Style>
  <Style ss:ID="header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1F766E" ss:Pattern="Solid"/></Style>
  <Style ss:ID="money"><NumberFormat ss:Format="R$ #,##0.00"/></Style>
  <Style ss:ID="integer"><NumberFormat ss:Format="0"/></Style>
  <Style ss:ID="percent"><NumberFormat ss:Format="0.00%"/></Style>
  <Style ss:ID="negative"><Font ss:Color="#B42318"/><NumberFormat ss:Format="R$ #,##0.00"/></Style>
  <Style ss:ID="total"><Font ss:Bold="1"/><Interior ss:Color="#DDEBE8" ss:Pattern="Solid"/></Style>
  <Style ss:ID="totalMoney"><Font ss:Bold="1"/><Interior ss:Color="#DDEBE8" ss:Pattern="Solid"/><NumberFormat ss:Format="R$ #,##0.00"/></Style>
  <Style ss:ID="totalInteger"><Font ss:Bold="1"/><Interior ss:Color="#DDEBE8" ss:Pattern="Solid"/><NumberFormat ss:Format="0"/></Style>
  <Style ss:ID="totalNegative"><Font ss:Bold="1" ss:Color="#B42318"/><Interior ss:Color="#DDEBE8" ss:Pattern="Solid"/><NumberFormat ss:Format="R$ #,##0.00"/></Style>
</Styles>
${workbook}
</Workbook>`;
  const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `relatorio-cod-perfumes-${today()}.xls`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("Planilha Excel exportada.");
}

function exportInventoryExcel() {
  const workbook = excelSheet("Estoque detalhado", productExportRows());
  const xml = excelWorkbookXml(workbook);
  const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `estoque-detalhado-cod-perfumes-${today()}.xls`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("Estoque exportado em Excel.");
}

function exportInventoryTxt() {
  const rows = inventoryDetailRows();
  const lines = [
    "ESTOQUE DETALHADO - COD PERFUMES",
    `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
    `Produtos: ${rows.length}`,
    "",
    ...rows.flatMap((row, index) => [
      `${index + 1}. ${row.product.name}`,
      `SKU: ${row.product.sku || "-"}`,
      `Preco venda: ${money(row.product.price)}`,
      `Custo: ${money(row.product.cost)}`,
      `Estoque base: ${row.warehouseStock} un.`,
      `Com entregadores: ${row.courierTotal} un.`,
      `Total operacional: ${row.operationalTotal} un.`,
      `Estoque minimo: ${Number(row.product.minStock || 0)} un.`,
      `Status: ${row.status}`,
      `Detalhe entregadores: ${row.detail}`,
      "",
    ]),
  ];
  const blob = new Blob([lines.join("\r\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `estoque-detalhado-cod-perfumes-${today()}.txt`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("Estoque exportado em TXT.");
}

function summaryExportRows() {
  const profitToday = profitForPeriod(today(), today());
  const profit30Days = profitForPeriod(addDays(today(), -29), today());
  const allDates = state.sales.map((sale) => sale.date).filter(Boolean).sort();
  const startAll = allDates[0] || today();
  const endAll = allDates.at(-1) || today();
  const allProfit = profitForPeriod(startAll, endAll);
  const summaries = collaboratorSummaries();
  const payable = summaries.reduce((sum, person) => sum + Math.max(person.balance, 0), 0);
  const receivableDiscount = summaries.reduce((sum, person) => sum + Math.abs(Math.min(person.balance, 0)), 0);
  const stockValue = state.products.reduce((sum, product) => sum + Number(product.stock || 0) * Number(product.cost || 0), 0);
  const courierUnits = courierStockBalances().reduce((sum, entry) => sum + Number(entry.balance || 0), 0);

  return [
    ["Indicador", "Valor", "Observacao"],
    ["Receita total", allProfit.revenue, `${formatDate(startAll)} ate ${formatDate(endAll)}`],
    ["Lucro operacional total", allProfit.profit, "Receita - custo - comissoes/taxas"],
    ["Trafego pago total", allProfit.campaignCost, "Gastos de campanha"],
    ["Lucro real total", allProfit.realProfit, "Lucro operacional - trafego pago"],
    ["Lucro real hoje", profitToday.realProfit, formatDate(today())],
    ["Lucro real ultimos 30 dias", profit30Days.realProfit, `${formatDate(addDays(today(), -29))} ate ${formatDate(today())}`],
    ["Vendas entregues", allProfit.count, "Nao inclui canceladas"],
    ["Comissoes em aberto", payable, "Saldo positivo dos colaboradores"],
    ["Saldo a descontar", receivableDiscount, "Saldo negativo dos colaboradores"],
    ["Valor de custo em estoque", roundMoney(stockValue), "Estoque principal pelo custo cadastrado"],
    ["Unidades com entregadores", courierUnits, "Saldo em maos"],
    ["Produtos cadastrados", state.products.length, ""],
    ["Colaboradores cadastrados", state.people.length, ""],
  ];
}

function salesExportRows() {
  const settlement = ledgerSettlementMap();
  const header = [
    "Codigo",
    "Data",
    "Cliente",
    "Telefone",
    "Status venda",
    "Forma pagamento",
    "Vendedor",
    "Entregador",
    "Itens",
    "Qtd total",
    "Receita venda",
    "Custo produtos",
    "Comissao vendedor",
    "Comissao entregador",
    "Taxa cancelada",
    "Comissao adicional vendedor",
    "Comissao adicional entregador",
    "Total comissoes/taxas",
    "Lucro",
    "Acerto vendedor",
    "Aberto vendedor",
    "Acerto entregador",
    "Aberto entregador",
  ];
  const rows = [...state.sales]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((sale) => {
      const seller = byId(state.people, sale.sellerId);
      const deliverer = byId(state.people, sale.delivererId);
      const breakdown = saleFinancialBreakdown(sale, settlement);
      return [
        sale.code,
        sale.date,
        sale.customer,
        sale.customerPhone || "",
        sale.status,
        salePaymentSummary(sale),
        seller?.name || "",
        deliverer?.name || "",
        sale.items.map((item) => `${item.quantity}x ${item.productName}`).join("; "),
        sale.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
        roundMoney(sale.total),
        breakdown.itemCost,
        breakdown.sellerCommission,
        breakdown.delivererCommission,
        breakdown.canceledFee,
        breakdown.additionalSeller,
        breakdown.additionalDeliverer,
        breakdown.commissionCost,
        breakdown.profit,
        breakdown.sellerSettlementStatus,
        breakdown.sellerOpen,
        breakdown.delivererSettlementStatus,
        breakdown.delivererOpen,
      ];
    });
  return [header, ...rows, excelTotalRow(header, rows, "TOTAL")];
}

function saleItemsExportRows() {
  const header = [
    "Codigo venda",
    "Data",
    "Cliente",
    "Status venda",
    "Produto",
    "Quantidade",
    "Preco unitario",
    "Total item",
    "Custo unitario",
    "Custo total",
    "Origem estoque",
    "Vendedor",
    "Entregador",
    "Forma pagamento",
  ];
  const rows = [...state.sales]
    .sort((a, b) => b.date.localeCompare(a.date))
    .flatMap((sale) => {
      const seller = byId(state.people, sale.sellerId);
      const deliverer = byId(state.people, sale.delivererId);
      return sale.items.map((item) => [
        sale.code,
        sale.date,
        sale.customer,
        sale.status,
        item.productName,
        Number(item.quantity || 0),
        roundMoney(item.unitPrice),
        roundMoney(Number(item.quantity || 0) * Number(item.unitPrice || 0)),
        roundMoney(item.unitCost),
        roundMoney(Number(item.quantity || 0) * Number(item.unitCost || 0)),
        stockOriginLabel(item),
        seller?.name || "",
        deliverer?.name || "",
        salePaymentSummary(sale),
      ]);
    });
  return [header, ...rows, excelTotalRow(header, rows, "TOTAL")];
}

function saleFinancialBreakdown(sale, settlement = ledgerSettlementMap()) {
  const entries = state.ledger.filter((entry) => entry.source === sale.code);
  const sellerEntries = entries.filter((entry) => entry.personId === sale.sellerId && entry.direction === "in");
  const delivererEntries = entries.filter((entry) => entry.personId === sale.delivererId && entry.direction === "in");
  const itemCost = roundMoney(sale.items.reduce((sum, item) => sum + Number(item.unitCost || 0) * Number(item.quantity || 0), 0));
  const sellerCommission = ledgerTypeSum(entries, "Comissao vendedor") + ledgerTypeSum(entries, "Comissao venda propria");
  const delivererCommission = ledgerTypeSum(entries, "Comissao entrega");
  const canceledFee = ledgerTypeSum(entries, "Taxa entrega cancelada");
  const additionalSeller = ledgerTypeSum(entries, "Comissao adicional vendedor");
  const additionalDeliverer = ledgerTypeSum(entries, "Comissao adicional entregador");
  const commissionCost = roundMoney(sellerCommission + delivererCommission + canceledFee + additionalSeller + additionalDeliverer);
  const profit = sale.status === "Cancelada" ? -commissionCost : roundMoney(Number(sale.total || 0) - itemCost - commissionCost);
  const sellerOpen = openAmountForEntries(sellerEntries, settlement);
  const delivererOpen = openAmountForEntries(delivererEntries, settlement);

  return {
    itemCost,
    sellerCommission: roundMoney(sellerCommission),
    delivererCommission: roundMoney(delivererCommission),
    canceledFee: roundMoney(canceledFee),
    additionalSeller: roundMoney(additionalSeller),
    additionalDeliverer: roundMoney(additionalDeliverer),
    commissionCost,
    profit,
    sellerOpen,
    delivererOpen,
    sellerSettlementStatus: settlementStatus(sellerEntries, settlement),
    delivererSettlementStatus: settlementStatus(delivererEntries, settlement),
  };
}

function ledgerTypeSum(entries, type) {
  return roundMoney(entries.filter((entry) => entry.type === type).reduce((sum, entry) => sum + Number(entry.amount || 0), 0));
}

function ledgerSettlementMap() {
  const settlement = new Map();
  state.people.forEach((person) => {
    let availableOut = state.ledger
      .filter((entry) => entry.personId === person.id && entry.direction === "out")
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    state.ledger
      .filter((entry) => entry.personId === person.id && entry.direction === "in")
      .sort((a, b) => `${a.date || ""}${a.id}`.localeCompare(`${b.date || ""}${b.id}`))
      .forEach((entry) => {
        const paid = Math.min(Number(entry.amount || 0), availableOut);
        const open = roundMoney(Number(entry.amount || 0) - paid);
        availableOut = roundMoney(availableOut - paid);
        settlement.set(entry.id, {
          paid: roundMoney(paid),
          open,
          status: open <= 0 ? "Pago" : paid > 0 ? "Parcial" : "Em aberto",
        });
      });
  });
  return settlement;
}

function openAmountForEntries(entries, settlement) {
  return roundMoney(entries.reduce((sum, entry) => sum + Number(settlement.get(entry.id)?.open ?? entry.amount ?? 0), 0));
}

function settlementStatus(entries, settlement) {
  if (!entries.length) return "-";
  const open = openAmountForEntries(entries, settlement);
  const total = entries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  if (open <= 0) return "Pago";
  if (open < total) return "Parcial";
  return "Em aberto";
}

function stockOriginLabel(item) {
  if (item.fulfillment === "mixed") return "Misto";
  if (item.fulfillment === "deliverer") return "Estoque entregador";
  if (item.fulfillment === "warehouse") return "Estoque principal";
  const delivererQty = Number(item.fulfillmentDelivererQty || 0);
  const warehouseQty = Number(item.fulfillmentWarehouseQty || 0);
  if (delivererQty && warehouseQty) return "Misto";
  if (delivererQty) return "Estoque entregador";
  return "Estoque principal";
}

function settlementExportRows() {
  const header = [
    "Colaborador",
    "Funcao",
    "Comissoes geradas",
    "Vales/adiantamentos",
    "Pagamentos realizados",
    "Outros descontos",
    "Total descontado/pago",
    "Saldo atual",
    "Status",
  ];
  const rows = collaboratorSummaries().map((person) => {
    const entries = state.ledger.filter((entry) => entry.personId === person.id);
    const otherDiscounts = entries
      .filter((entry) => entry.direction === "out" && !["Vale", "Pagamento"].includes(entry.type))
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    return [
      person.name,
      person.role,
      roundMoney(person.commissions),
      roundMoney(person.advances),
      roundMoney(person.payments),
      roundMoney(otherDiscounts),
      roundMoney(person.advances + person.payments + otherDiscounts),
      roundMoney(person.balance),
      person.balance > 0 ? "A pagar" : person.balance < 0 ? "A descontar" : "Quitado",
    ];
  });
  return [header, ...rows, excelTotalRow(header, rows, "TOTAL")];
}

function ledgerExportRows() {
  const header = ["Data", "Colaborador", "Tipo", "Origem", "Descricao", "Entrada", "Saida", "Saldo apos", "Status acerto"];
  const runningBalanceByPerson = new Map();
  const settlement = ledgerSettlementMap();
  const rows = [...state.ledger]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((entry) => {
      const person = byId(state.people, entry.personId);
      const isIn = entry.direction === "in";
      const previousBalance = runningBalanceByPerson.get(entry.personId) || 0;
      const runningBalance = previousBalance + (isIn ? Number(entry.amount || 0) : -Number(entry.amount || 0));
      runningBalanceByPerson.set(entry.personId, runningBalance);
      return [
        entry.date,
        person?.name || "Colaborador removido",
        entry.type,
        entry.source || "Manual",
        entry.description || "",
        isIn ? roundMoney(entry.amount) : "",
        !isIn ? roundMoney(entry.amount) : "",
        roundMoney(runningBalance),
        isIn ? settlement.get(entry.id)?.status || "Em aberto" : "Desconto/pagamento",
      ];
    });
  return [header, ...rows, excelTotalRow(header, rows, "TOTAL")];
}

function delivererEarningsExportRows() {
  const header = ["Data", "Entregador", "Tipo", "Origem", "Descricao", "Valor"];
  const rows = delivererEarningsEntries("", "")
    .sort((a, b) => `${a.date || ""}${a.id}`.localeCompare(`${b.date || ""}${b.id}`))
    .map((entry) => {
      const person = byId(state.people, entry.personId);
      return [
        entry.date,
        person?.name || "Entregador removido",
        entry.type,
        entry.source || "Manual",
        entry.description || "",
        roundMoney(entry.amount),
      ];
    });
  return [header, ...rows, excelTotalRow(header, rows, "TOTAL")];
}

function profitExportRows() {
  const allDates = state.sales.map((sale) => sale.date).filter(Boolean).sort();
  const startAll = allDates[0] || today();
  const endAll = allDates.at(-1) || today();
  const periods = [
    ["Hoje", today(), today()],
    ["Ultimos 30 dias", addDays(today(), -29), today()],
    ["Periodo filtrado na visao geral", dashboardPeriod.start, dashboardPeriod.end],
    ["Todo o historico", startAll, endAll],
  ];
  return [
    ["Periodo", "Inicio", "Fim", "Vendas", "Receita", "Custo produtos", "Comissoes/taxas", "Trafego pago", "Lucro operacional", "Lucro real"],
    ...periods.map(([label, start, end]) => {
      const result = profitForPeriod(start, end);
      return [label, start, end, result.count, result.revenue, result.productCost, result.commissions, result.campaignCost, result.profit, result.realProfit];
    }),
  ];
}

function campaignExportRows() {
  const header = ["Data", "Campanha", "Valor gasto", "Observacao"];
  const rows = [...state.campaigns]
    .sort((a, b) => state.campaigns.indexOf(b) - state.campaigns.indexOf(a))
    .map((campaign) => [
      campaign.date,
      campaign.name || "Campanha",
      roundMoney(campaign.amount),
      campaign.note || "",
    ]);
  return [header, ...rows, excelTotalRow(header, rows, "TOTAL")];
}

function productSalesExportRows() {
  const totals = new Map();
  state.sales
    .filter((sale) => sale.status !== "Cancelada")
    .forEach((sale) => {
      sale.items.forEach((item) => {
        const key = item.productId || item.productName;
        const current = totals.get(key) || {
          productName: item.productName || "Produto removido",
          quantity: 0,
          revenue: 0,
          cost: 0,
        };
        current.quantity += Number(item.quantity || 0);
        current.revenue += Number(item.quantity || 0) * Number(item.unitPrice || 0);
        current.cost += Number(item.quantity || 0) * Number(item.unitCost || 0);
        totals.set(key, current);
      });
    });

  const header = ["Produto", "Unidades vendidas", "Receita", "Custo produtos", "Lucro bruto"];
  const rows = [...totals.values()]
    .sort((a, b) => b.quantity - a.quantity)
    .map((row) => [row.productName, row.quantity, roundMoney(row.revenue), roundMoney(row.cost), roundMoney(row.revenue - row.cost)]);
  return [header, ...rows, excelTotalRow(header, rows, "TOTAL")];
}

function paymentSummaryExportRows() {
  const totals = new Map();
  state.sales
    .filter((sale) => sale.status !== "Cancelada")
    .forEach((sale) => {
      salePaymentEntries(sale).forEach((payment) => {
        const method = payment.method || "Nao informado";
        const current = totals.get(method) || { method, count: 0, revenue: 0 };
        current.count += 1;
        current.revenue += Number(payment.amount || 0);
        totals.set(method, current);
      });
    });

  const header = ["Forma de pagamento", "Quantidade vendas", "Receita"];
  const rows = [...totals.values()].sort((a, b) => b.revenue - a.revenue).map((row) => [row.method, row.count, roundMoney(row.revenue)]);
  return [header, ...rows, excelTotalRow(header, rows, "TOTAL")];
}

function stockEntryExportRows() {
  const header = ["Data", "Produto", "Quantidade", "Novo produto", "SKU", "Preco venda", "Custo", "Estoque minimo", "Observacao"];
  const rows = [...state.stockEntries]
    .sort((a, b) => state.stockEntries.indexOf(b) - state.stockEntries.indexOf(a))
    .map((entry) => {
      const product = byId(state.products, entry.productId);
      return [
        entry.date,
        product?.name || entry.productName || "",
        Number(entry.quantity || 0),
        entry.createdProduct ? "Sim" : "Nao",
        entry.sku || product?.sku || "",
        roundMoney(entry.price || product?.price || 0),
        roundMoney(entry.cost || product?.cost || 0),
        Number(entry.minStock ?? product?.minStock ?? 0),
        entry.note || "",
      ];
    });
  return [header, ...rows, excelTotalRow(header, rows, "TOTAL")];
}

function productExportRows() {
  const header = ["Perfume", "Estoque base", "SKU", "Preco venda", "Custo", "Valor custo estoque base", "Com entregadores", "Total operacional", "Estoque minimo", "Detalhe entregadores", "Status"];
  const rows = inventoryDetailRows().map((row) => [
    row.product.name,
    row.warehouseStock,
    row.product.sku || "",
    roundMoney(row.product.price),
    roundMoney(row.product.cost),
    roundMoney(row.warehouseStock * Number(row.product.cost || 0)),
    row.courierTotal,
    row.operationalTotal,
    Number(row.product.minStock || 0),
    row.detail,
    row.status,
  ]);
  return [header, ...rows, excelTotalRow(header, rows, "TOTAL")];
}

function courierStockExportRows() {
  const balanceRows = courierStockBalances().map((entry) => [
    "Saldo em maos",
    "",
    entry.delivererName,
    entry.productName,
    "",
    entry.out,
    entry.sold,
    entry.returned,
    entry.balance,
    "",
  ]);
  const movementRows = [...state.stockTransfers]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((entry) => {
      const deliverer = byId(state.people, entry.delivererId);
      const product = byId(state.products, entry.productId);
      return [
        "Movimento",
        entry.date,
        deliverer?.name || "Entregador removido",
        product?.name || "Produto removido",
        entry.type,
        entry.type === "Saida" ? Number(entry.quantity || 0) : "",
        "",
        entry.type === "Devolucao" ? Number(entry.quantity || 0) : "",
        "",
        entry.note || "",
      ];
    });

  const header = ["Tipo linha", "Data", "Entregador", "Produto", "Movimento", "Saidas", "Vendas", "Devolucoes", "Saldo em maos", "Observacao"];
  const rows = [...balanceRows, ...movementRows];
  return [header, ...rows, excelTotalRow(header, rows, "TOTAL")];
}

function collaboratorExportRows() {
  const header = ["Colaborador", "Funcao", "Comissao entrega", "Comissao venda %", "Venda propria %", "Entradas totais", "Saidas totais", "Comissoes", "Vales", "Pagamentos", "Saldo"];
  const rows = collaboratorSummaries().map((person) => [
    person.name,
    person.role,
    roundMoney(person.deliveryCommission),
    roundMoney(person.salesCommissionRate),
    roundMoney(person.ownSalesCommissionRate),
    roundMoney(person.totalIn),
    roundMoney(person.totalOut),
    roundMoney(person.commissions),
    roundMoney(person.advances),
    roundMoney(person.payments),
    roundMoney(person.balance),
  ]);
  return [header, ...rows, excelTotalRow(header, rows, "TOTAL")];
}

function excelWorkbookXml(workbook) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>
  <Style ss:ID="default"><Font ss:FontName="Calibri" ss:Size="11"/></Style>
  <Style ss:ID="header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1F766E" ss:Pattern="Solid"/></Style>
  <Style ss:ID="money"><NumberFormat ss:Format="R$ #,##0.00"/></Style>
  <Style ss:ID="integer"><NumberFormat ss:Format="0"/></Style>
  <Style ss:ID="percent"><NumberFormat ss:Format="0.00%"/></Style>
  <Style ss:ID="negative"><Font ss:Color="#B42318"/><NumberFormat ss:Format="R$ #,##0.00"/></Style>
  <Style ss:ID="total"><Font ss:Bold="1"/><Interior ss:Color="#DDEBE8" ss:Pattern="Solid"/></Style>
  <Style ss:ID="totalMoney"><Font ss:Bold="1"/><Interior ss:Color="#DDEBE8" ss:Pattern="Solid"/><NumberFormat ss:Format="R$ #,##0.00"/></Style>
  <Style ss:ID="totalInteger"><Font ss:Bold="1"/><Interior ss:Color="#DDEBE8" ss:Pattern="Solid"/><NumberFormat ss:Format="0"/></Style>
  <Style ss:ID="totalNegative"><Font ss:Bold="1" ss:Color="#B42318"/><Interior ss:Color="#DDEBE8" ss:Pattern="Solid"/><NumberFormat ss:Format="R$ #,##0.00"/></Style>
</Styles>
${workbook}
</Workbook>`;
}

function excelTotalRow(header, rows, label = "TOTAL") {
  if (!rows.length) return Array.from({ length: header.length }, (_, index) => (index === 0 ? label : ""));
  return header.map((title, index) => {
    if (index === 0) return label;
    if (String(title || "").includes("%")) return "";
    const values = rows.map((row) => row[index]).filter((value) => typeof value === "number" && Number.isFinite(value));
    if (!values.length) return "";
    return roundMoney(values.reduce((sum, value) => sum + value, 0));
  });
}

function excelSheet(name, rows) {
  const safeRows = rows.length ? rows : [["Sem dados"]];
  const columnCount = Math.max(...safeRows.map((row) => row.length), 1);
  const rowCount = safeRows.length;
  return `<Worksheet ss:Name="${excelEscape(name)}">
<Table>${excelColumns(safeRows)}${safeRows.map((row, index) => excelRow(row, index, safeRows[0])).join("")}</Table>
<AutoFilter x:Range="R1C1:R${rowCount}C${columnCount}" xmlns="urn:schemas-microsoft-com:office:excel"/>
<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
  <FreezePanes/>
  <FrozenNoSplit/>
  <SplitHorizontal>1</SplitHorizontal>
  <TopRowBottomPane>1</TopRowBottomPane>
  <ActivePane>2</ActivePane>
</WorksheetOptions>
</Worksheet>`;
}

function excelColumns(rows) {
  const columnCount = Math.max(...rows.map((row) => row.length), 1);
  return Array.from({ length: columnCount }, (_, index) => {
    const width = Math.max(
      80,
      Math.min(
        240,
        rows.reduce((max, row) => Math.max(max, String(row[index] ?? "").length * 7 + 24), 80),
      ),
    );
    return `<Column ss:AutoFitWidth="0" ss:Width="${width}"/>`;
  }).join("");
}

function excelRow(row, index, headers = []) {
  const isTotalRow = row[0] === "TOTAL";
  return `<Row>${row.map((value, columnIndex) => excelCell(value, index === 0, headers[columnIndex], isTotalRow)).join("")}</Row>`;
}

function excelCell(value, isHeader = false, header = "", isTotal = false) {
  const isNumber = typeof value === "number" && Number.isFinite(value);
  const style = isHeader ? "header" : excelStyleForValue(value, header, isTotal);
  const type = isNumber ? "Number" : "String";
  return `<Cell${style ? ` ss:StyleID="${style}"` : ""}><Data ss:Type="${type}">${excelEscape(value)}</Data></Cell>`;
}

function excelStyleForValue(value, header = "", isTotal = false) {
  const normalizedHeader = String(header || "").toLowerCase();
  if (typeof value !== "number" || !Number.isFinite(value)) return isTotal ? "total" : "";
  if (normalizedHeader.includes("%")) return isTotal ? "total" : "";
  if (["vendas", "quantidade", "unidades", "estoque", "produtos", "colaboradores", "qtd"].some((term) => normalizedHeader.includes(term))) return isTotal ? "totalInteger" : "integer";
  if (value < 0) return isTotal ? "totalNegative" : "negative";
  if (["preco", "custo", "total", "receita", "lucro", "comiss", "taxa", "entrada", "saida", "saldo", "aberto", "pagar", "descontado"].some((term) => normalizedHeader.includes(term))) return isTotal ? "totalMoney" : "money";
  if (isTotal) return "total";
  return "";
}

function excelEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!imported.products || !imported.people || !imported.sales || !imported.ledger) {
        throw new Error("Formato invalido");
      }
      if (!confirm("Importar este backup vai substituir os dados atuais por um arquivo JSON. Um backup automatico sera criado antes. Continuar?")) return;
      createAutomaticBackup("Antes de importar backup JSON");
      state = normalizeState(imported);
      saveState({ force: true });
      render();
      showToast("Backup importado com sucesso.");
    } catch {
      showToast("Nao foi possivel importar esse arquivo.");
    }
  };
  reader.readAsText(file);
}

async function refreshAuthStatus() {
  const user = await currentUser();
  const cloudEnabled = isCloudConfigured();

  if (!cloudEnabled) {
    els.authStatusTitle.textContent = "Modo local";
    els.authStatusText.textContent = "Preencha SUPABASE_URL e SUPABASE_ANON_KEY para ativar login e banco em nuvem.";
    document.querySelector("#storageStatus").textContent = await storageSummary();
    return;
  }

  if (user) {
    els.authStatusTitle.textContent = "Conta conectada";
    els.authStatusText.textContent = `Sincronizacao automatica ativa no Supabase: ${user.email}`;
  } else {
    els.authStatusTitle.textContent = "Nuvem configurada";
    els.authStatusText.textContent = "Use Criar/entrar e sincronizar para ativar o salvamento automatico.";
  }

  document.querySelector("#storageStatus").textContent = await storageSummary();
}

function authCredentials() {
  return {
    email: els.authEmail.value.trim(),
    password: els.authPassword.value,
  };
}

async function handleSignIn() {
  const { email, password } = authCredentials();
  if (!email || !password) {
    showToast("Informe e-mail e senha.");
    return;
  }

  try {
    createAutomaticBackup("Antes de entrar na conta");
    await signInWithEmail(email, password);
    state = await loadState();
    await saveStateData(state);
    render();
    await refreshAuthStatus();
    showToast("Conta conectada. Sincronizacao automatica ativa.");
  } catch (error) {
    showToast(error.message || "Nao foi possivel entrar.");
  }
}

async function handleSignUp() {
  const { email, password } = authCredentials();
  if (!email || !password) {
    showToast("Informe e-mail e senha.");
    return;
  }

  try {
    createAutomaticBackup("Antes de criar conta");
    await signUpWithEmail(email, password);
    try {
      await signInWithEmail(email, password);
      await saveStateData(state);
      state = await loadState();
      render();
    } catch {
      // Alguns projetos exigem confirmacao por e-mail antes do primeiro login.
    }
    await refreshAuthStatus();
    showToast("Conta criada. Se o Supabase pedir, confirme o e-mail para sincronizar.");
  } catch (error) {
    showToast(error.message || "Nao foi possivel criar a conta.");
  }
}

async function handleQuickAccount() {
  const { email, password } = authCredentials();
  if (!email || !password) {
    showToast("Informe e-mail e senha para conectar.");
    return;
  }

  try {
    createAutomaticBackup("Antes de conectar conta");
    await signInWithEmail(email, password);
    state = await loadState();
    await saveStateData(state);
    render();
    await refreshAuthStatus();
    showToast("Conta conectada. Sincronizacao automatica ativa.");
    return;
  } catch {
    // Se ainda nao existir conta, tenta criar sem obrigar a pessoa a escolher outro botao.
  }

  try {
    createAutomaticBackup("Antes de criar conta");
    await signUpWithEmail(email, password);
    try {
      await signInWithEmail(email, password);
      await saveStateData(state);
      state = await loadState();
      render();
      showToast("Conta criada e sincronizada.");
    } catch {
      showToast("Conta criada. Confirme o e-mail se o Supabase solicitar.");
    }
    await refreshAuthStatus();
  } catch (error) {
    showToast(error.message || "Nao foi possivel criar ou entrar na conta.");
  }
}

async function handleSignOut() {
  await signOutCloud();
  state = await loadState();
  render();
  await refreshAuthStatus();
  showToast("Conta desconectada.");
}

async function syncCloudNow() {
  try {
    await saveStateData(state);
    await refreshAuthStatus();
    showToast("Dados sincronizados.");
  } catch (error) {
    showToast(error.message || "Nao foi possivel sincronizar.");
  }
}

function clearData() {
  if (!confirm("Tem certeza que deseja limpar apenas os dados locais deste navegador? A nuvem nao sera apagada por este botao.")) return;
  createAutomaticBackup("Antes de limpar dados locais");
  state = structuredClone(emptyState);
  saveState({ localOnly: true });
  resetSaleForm();
  render();
  showToast("Dados limpos.");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function bindEvents() {
  els.navItems.forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  document.addEventListener("click", (event) => {
    const jump = event.target.closest("[data-view-jump]");
    if (jump) setView(jump.dataset.viewJump);

    const editButton = event.target.closest("[data-edit-product]");
    if (editButton) editProduct(editButton.dataset.editProduct);

    const deleteProductButton = event.target.closest("[data-delete-product]");
    if (deleteProductButton) deleteProduct(deleteProductButton.dataset.deleteProduct);

    const editStockEntryButton = event.target.closest("[data-edit-stock-entry]");
    if (editStockEntryButton) editStockEntry(editStockEntryButton.dataset.editStockEntry);

    const deleteStockEntryButton = event.target.closest("[data-delete-stock-entry]");
    if (deleteStockEntryButton) deleteStockEntry(deleteStockEntryButton.dataset.deleteStockEntry);

    const editPersonButton = event.target.closest("[data-edit-person]");
    if (editPersonButton) editPerson(editPersonButton.dataset.editPerson);

    const deletePersonButton = event.target.closest("[data-delete-person]");
    if (deletePersonButton) deletePerson(deletePersonButton.dataset.deletePerson);

    const editLedgerButton = event.target.closest("[data-edit-ledger]");
    if (editLedgerButton) editLedger(editLedgerButton.dataset.editLedger);

    const deleteLedgerButton = event.target.closest("[data-delete-ledger]");
    if (deleteLedgerButton) deleteLedger(deleteLedgerButton.dataset.deleteLedger);

    const editSaleButton = event.target.closest("[data-edit-sale]");
    if (editSaleButton) editSale(editSaleButton.dataset.editSale);

    const copySaleButton = event.target.closest("[data-copy-sale]");
    if (copySaleButton) copySale(copySaleButton.dataset.copySale);

    const deleteSaleButton = event.target.closest("[data-delete-sale]");
    if (deleteSaleButton) deleteSale(deleteSaleButton.dataset.deleteSale);

    const editStockTransferButton = event.target.closest("[data-edit-stock-transfer]");
    if (editStockTransferButton) editStockTransfer(editStockTransferButton.dataset.editStockTransfer);

    const deleteStockTransferButton = event.target.closest("[data-delete-stock-transfer]");
    if (deleteStockTransferButton) deleteStockTransfer(deleteStockTransferButton.dataset.deleteStockTransfer);

    const editCampaignButton = event.target.closest("[data-edit-campaign]");
    if (editCampaignButton) editCampaign(editCampaignButton.dataset.editCampaign);

    const deleteCampaignButton = event.target.closest("[data-delete-campaign]");
    if (deleteCampaignButton) deleteCampaign(deleteCampaignButton.dataset.deleteCampaign);

    const courierDelivererFilterButton = event.target.closest("[data-courier-deliverer-filter]");
    if (courierDelivererFilterButton) setCourierDelivererFilter(courierDelivererFilterButton.dataset.courierDelivererFilter);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const jump = event.target.closest("[data-view-jump]");
    if (!jump) return;
    event.preventDefault();
    setView(jump.dataset.viewJump);
  });
  document.querySelectorAll("[data-open-modal]").forEach((button) => {
    button.addEventListener("click", () => {
      resetSaleForm();
      els.saleModal.showModal();
    });
  });
  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => els.saleModal.close());
  });

  document.querySelector("#addItemButton").addEventListener("click", () => addSaleItem());
  document.querySelector("#addPaymentButton").addEventListener("click", () => {
    addSalePayment();
    updateSaleTotal();
  });
  document.querySelector("#parseStockEntryListButton").addEventListener("click", parseStockEntryList);
  document.querySelector("#addStockEntryItemButton").addEventListener("click", () => addStockEntryItem());
  document.querySelector("#addStockTransferItemButton").addEventListener("click", () => addStockTransferItem());
  document.querySelector("#seedButton").addEventListener("click", seedExamples);
  document.querySelector("#exportButton").addEventListener("click", exportData);
  document.querySelector("#exportAutoBackupsButton").addEventListener("click", exportAutomaticBackups);
  document.querySelector("#exportExcelButton").addEventListener("click", exportExcelData);
  document.querySelector("#exportInventoryExcelButton").addEventListener("click", exportInventoryExcel);
  document.querySelector("#exportInventoryTxtButton").addEventListener("click", exportInventoryTxt);
  document.querySelector("#importInput").addEventListener("change", (event) => importData(event.target.files[0]));
  document.querySelector("#clearButton").addEventListener("click", clearData);
  document.querySelector("#quickAccountButton").addEventListener("click", handleQuickAccount);
  document.querySelector("#signInButton").addEventListener("click", handleSignIn);
  document.querySelector("#signUpButton").addEventListener("click", handleSignUp);
  document.querySelector("#signOutButton").addEventListener("click", handleSignOut);
  document.querySelector("#syncCloudButton").addEventListener("click", syncCloudNow);
  document.querySelector("#clearApprovedInboxButton").addEventListener("click", hideApprovedInbox);
  document.querySelector("#restoreHiddenInboxButton").addEventListener("click", restoreHiddenInbox);
  document.querySelector("#inboxList").addEventListener("click", handleInboxClick);
  document.querySelector("#dashboardTodayButton").addEventListener("click", () => setDashboardPeriod(today(), today()));
  document.querySelector("#dashboard30DaysButton").addEventListener("click", () => setDashboardPeriod(addDays(today(), -29), today()));
  document.querySelector("#salesTodayButton").addEventListener("click", () => setSalesPeriod(today(), today()));
  document.querySelector("#salesClearDateButton").addEventListener("click", clearSalesFilters);
  document.querySelector("#productSalesTodayButton").addEventListener("click", () => setProductSalesPeriod(today(), today()));
  document.querySelector("#productSales30DaysButton").addEventListener("click", () => setProductSalesPeriod(addDays(today(), -29), today()));
  document.querySelector("#productSalesClearButton").addEventListener("click", () => setProductSalesPeriod("", ""));
  document.querySelector("#finance30DaysButton").addEventListener("click", () => setFinancePeriod(addDays(today(), -29), today()));
  document.querySelector("#financeClearDateButton").addEventListener("click", clearFinanceFilters);
  document.querySelector("#stockTransferTodayButton").addEventListener("click", () => setStockTransferPeriod(today(), today()));
  document.querySelector("#stockTransferClearDateButton").addEventListener("click", () => setStockTransferPeriod("", ""));
  els.stockTransferSelectAll.addEventListener("change", toggleAllStockTransfers);
  els.deleteSelectedStockTransfersButton.addEventListener("click", deleteSelectedStockTransfers);
  document.querySelector("#stockTransferRows").addEventListener("change", (event) => {
    if (event.target.matches("[data-stock-transfer-select]")) updateStockTransferSelectionControls();
  });
  document.querySelector("#delivererEarningsTodayButton").addEventListener("click", () => setDelivererEarningsPeriod(today(), today()));
  document.querySelector("#delivererEarningsMonthButton").addEventListener("click", () => setDelivererEarningsPeriod(monthStart(today()), today()));
  document.querySelector("#delivererEarningsYearButton").addEventListener("click", () => setDelivererEarningsPeriod(yearStart(today()), today()));
  document.querySelector("#delivererEarningsClearButton").addEventListener("click", () => setDelivererEarningsPeriod("", ""));
  els.dashboardStartDate.addEventListener("change", handleDashboardPeriodChange);
  els.dashboardEndDate.addEventListener("change", handleDashboardPeriodChange);
  els.salesStartDate.addEventListener("change", handleSalesPeriodChange);
  els.salesEndDate.addEventListener("change", handleSalesPeriodChange);
  els.salesFilterType.addEventListener("change", handleSalesFilterTypeChange);
  els.salesFilterSelect.addEventListener("change", handleSalesFilterValueChange);
  els.salesFilterAmount.addEventListener("input", handleSalesFilterValueChange);
  els.productSalesStartDate.addEventListener("change", handleProductSalesPeriodChange);
  els.productSalesEndDate.addEventListener("change", handleProductSalesPeriodChange);
  els.financeStartDate.addEventListener("change", handleFinancePeriodChange);
  els.financeEndDate.addEventListener("change", handleFinancePeriodChange);
  els.financePersonFilter.addEventListener("change", handleFinancePersonFilterChange);
  els.stockTransferStartDate.addEventListener("change", handleStockTransferPeriodChange);
  els.stockTransferEndDate.addEventListener("change", handleStockTransferPeriodChange);
  els.stockTransferDelivererFilter.addEventListener("change", handleStockTransferFilterChange);
  els.stockTransferProductFilter.addEventListener("change", handleStockTransferFilterChange);
  els.delivererEarningsPersonFilter.addEventListener("change", handleDelivererEarningsPersonFilterChange);
  els.delivererEarningsStartDate.addEventListener("change", handleDelivererEarningsPeriodChange);
  els.delivererEarningsEndDate.addEventListener("change", handleDelivererEarningsPeriodChange);
  els.saleForm.elements.sellerId.addEventListener("change", () => updateSaleTotal());
  els.saleForm.elements.delivererId.addEventListener("change", () => {
    refreshSaleProductOptions();
    updateSaleTotal();
  });
  els.saleForm.elements.status.addEventListener("change", () => updateSaleTotal());
  els.saleForm.elements.canceledDeliveryFee.addEventListener("input", () => updateSaleTotal());
  els.saleForm.elements.additionalCommissionTarget.addEventListener("change", () => updateSaleTotal());
  els.saleForm.elements.additionalCommissionAmount.addEventListener("input", () => updateSaleTotal());
  els.themeToggle.addEventListener("change", handleThemeChange);

  els.productForm.addEventListener("submit", handleProductSubmit);
  els.productCancelButton.addEventListener("click", resetProductForm);
  els.stockEntryForm.addEventListener("submit", handleStockEntrySubmit);
  els.stockEntryCancelButton.addEventListener("click", resetStockEntryForm);
  els.personForm.addEventListener("submit", handlePersonSubmit);
  els.personCancelButton.addEventListener("click", resetPersonForm);
  els.ledgerForm.addEventListener("submit", handleLedgerSubmit);
  els.ledgerCancelButton.addEventListener("click", resetLedgerForm);
  els.stockTransferForm.addEventListener("submit", handleStockTransferSubmit);
  els.stockTransferCancelButton.addEventListener("click", resetStockTransferForm);
  els.campaignForm.addEventListener("submit", handleCampaignSubmit);
  els.campaignCancelButton.addEventListener("click", resetCampaignForm);
  els.messageImportForm.addEventListener("submit", handleMessageImportSubmit);
  els.saleForm.addEventListener("submit", handleSaleSubmit);
  bindWhatsAppExtensionBridge((messages, meta) => {
    importIncomingMessages(messages, meta.sourceName || "Extensao WhatsApp");
  });

  onCloudAuthChange(async () => {
    state = await loadState();
    render();
    await refreshAuthStatus();
  });
}

function handleDashboardPeriodChange() {
  const start = els.dashboardStartDate.value || today();
  const end = els.dashboardEndDate.value || start;
  setDashboardPeriod(start <= end ? start : end, end >= start ? end : start);
}

function setDashboardPeriod(start, end) {
  dashboardPeriod = { start, end };
  renderDashboard();
}

function handleSalesPeriodChange() {
  const start = els.salesStartDate.value;
  const end = els.salesEndDate.value || start;
  if (!start && !end) {
    setSalesPeriod("", "");
    return;
  }
  setSalesPeriod(start <= end ? start : end, end >= start ? end : start);
}

function setSalesPeriod(start, end) {
  salesPeriod = { start, end };
  renderSales();
}

function handleSalesFilterTypeChange() {
  salesFilters = {
    type: els.salesFilterType.value,
    value: "",
  };
  renderSales();
}

function handleSalesFilterValueChange() {
  salesFilters = {
    type: els.salesFilterType.value,
    value: els.salesFilterType.value === "amount" ? els.salesFilterAmount.value : els.salesFilterSelect.value,
  };
  renderSales();
}

function clearSalesFilters() {
  salesPeriod = { start: "", end: "" };
  salesFilters = { type: "", value: "" };
  renderSales();
}

function handleProductSalesPeriodChange() {
  const start = els.productSalesStartDate.value;
  const end = els.productSalesEndDate.value || start;
  if (!start && !end) {
    setProductSalesPeriod("", "");
    return;
  }
  setProductSalesPeriod(start <= end ? start : end, end >= start ? end : start);
}

function setProductSalesPeriod(start, end) {
  productSalesPeriod = { start, end };
  renderProductSales();
}

function handleFinancePeriodChange() {
  const start = els.financeStartDate.value;
  const end = els.financeEndDate.value || start;
  if (!start && !end) {
    setFinancePeriod("", "");
    return;
  }
  setFinancePeriod(start <= end ? start : end, end >= start ? end : start);
}

function setFinancePeriod(start, end) {
  financePeriod = { start, end };
  renderFinance();
}

function handleFinancePersonFilterChange() {
  financePersonFilter = els.financePersonFilter.value;
  renderFinance();
}

function clearFinanceFilters() {
  financePeriod = { start: "", end: "" };
  financePersonFilter = "";
  renderFinance();
}

function handleStockTransferPeriodChange() {
  const start = els.stockTransferStartDate.value;
  const end = els.stockTransferEndDate.value || start;
  if (!start && !end) {
    setStockTransferPeriod("", "");
    return;
  }
  setStockTransferPeriod(start <= end ? start : end, end >= start ? end : start);
}

function setStockTransferPeriod(start, end) {
  stockTransferPeriod = { start, end };
  renderCourierStock();
}

function handleStockTransferFilterChange() {
  stockTransferFilters = {
    delivererId: els.stockTransferDelivererFilter.value,
    productId: els.stockTransferProductFilter.value,
  };
  renderCourierStock();
}

function setCourierDelivererFilter(delivererId) {
  stockTransferFilters = {
    ...stockTransferFilters,
    delivererId,
  };
  renderCourierStock();
}

function handleDelivererEarningsPeriodChange() {
  const start = els.delivererEarningsStartDate.value;
  const end = els.delivererEarningsEndDate.value || start;
  if (!start && !end) {
    setDelivererEarningsPeriod("", "");
    return;
  }
  setDelivererEarningsPeriod(start <= end ? start : end, end >= start ? end : start);
}

function setDelivererEarningsPeriod(start, end) {
  delivererEarningsPeriod = { start, end };
  renderDelivererEarnings();
}

function handleDelivererEarningsPersonFilterChange() {
  delivererEarningsPersonFilter = els.delivererEarningsPersonFilter.value;
  renderDelivererEarnings();
}

initTheme();
setupBulkDeleteTables();
bindEvents();
resetProductForm();
resetStockEntryForm();
resetPersonForm();
resetLedgerForm();
resetStockTransferForm();
resetCampaignForm();
resetSaleForm();
render();
refreshAuthStatus();
