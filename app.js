const STORE_KEY = "weld-lavadero-state-v1";
const API_STATE_URL = "/api/state";

const defaultServices = [
  { id: "svc-1", name: "Lavado basico", price: 25, duration: 25 },
  { id: "svc-2", name: "Lavado premium", price: 45, duration: 40 },
  { id: "svc-3", name: "Aspirado interior", price: 18, duration: 18 },
  { id: "svc-4", name: "Encerado", price: 65, duration: 55 },
  { id: "svc-5", name: "Detallado completo", price: 140, duration: 120 }
];

const initialState = {
  services: defaultServices,
  employees: [
    { id: "emp-1", name: "Carlos Rios", role: "Operario", commission: 8 },
    { id: "emp-2", name: "Ana Torres", role: "Cajera", commission: 5 },
    { id: "emp-3", name: "Miguel Vega", role: "Supervisor", commission: 10 }
  ],
  vehicles: [
    seedVehicle("ABC-123", "Luis Mendoza", "Toyota Corolla", "Lavado premium", "emp-1", "lavado", -22),
    seedVehicle("B8K-442", "Maria Salas", "Kia Sportage", "Lavado basico", "emp-3", "espera", -7),
    seedVehicle("DQP-811", "Jorge Ruiz", "Nissan Versa", "Encerado", "emp-1", "secado", -54)
  ],
  expenses: [
    { id: uid(), date: today(), category: "Productos", description: "Shampoo y cera", amount: 86 },
    { id: uid(), date: today(), category: "Servicios", description: "Pago de agua", amount: 52 }
  ],
  inventory: [
    { id: "inv-1", item: "Shampoo", stock: 7, min: 5, unit: "L" },
    { id: "inv-2", item: "Cera", stock: 2, min: 3, unit: "L" },
    { id: "inv-3", item: "Toallas", stock: 18, min: 12, unit: "und" },
    { id: "inv-4", item: "Ambientadores", stock: 9, min: 10, unit: "und" }
  ],
  cash: { opening: 150, openedAt: today() },
  business: { status: "cerrado", openedAt: null, closedAt: null }
};

let state = initialState;
let databaseMode = false;

function seedVehicle(plate, client, vehicle, serviceName, employeeId, status, minutesAgo) {
  const service = defaultServices.find((item) => item.name === serviceName) || { price: 0, duration: 30 };
  const arrivedAt = Date.now() + minutesAgo * 60000;
  const startedAt = ["lavado", "secado", "finalizado"].includes(status) ? arrivedAt + 4 * 60000 : null;
  return {
    id: uid(),
    plate,
    client,
    phone: "",
    vehicle,
    color: "",
    serviceId: service.id,
    serviceName,
    price: service.price,
    estimatedMinutes: service.duration,
    employeeId,
    payment: "Efectivo",
    notes: "",
    status,
    arrivedAt,
    startedAt,
    finishedAt: status === "finalizado" ? Date.now() - 8 * 60000 : null,
    paid: status === "finalizado"
  };
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function localDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" });
}

async function loadState() {
  try {
    const response = await fetch(API_STATE_URL, { cache: "no-store" });
    if (response.ok) {
      databaseMode = true;
      return await response.json();
    }
  } catch {
    databaseMode = false;
  }

  const saved = localStorage.getItem(STORE_KEY);
  if (!saved) return initialState;
  try {
    return JSON.parse(saved);
  } catch {
    return initialState;
  }
}

function ensureBusinessState() {
  if (!state.business) {
    state.business = { status: "cerrado", openedAt: null, closedAt: null };
  }
}

function saveState() {
  if (databaseMode) {
    fetch(API_STATE_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state)
    }).catch(() => {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    });
    return;
  }

  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function money(value) {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(value || 0);
}

function minutes(ms) {
  return Math.max(0, Math.floor(ms / 60000));
}

function elapsed(vehicle) {
  if (!vehicle.startedAt) return "00:00";
  const end = vehicle.finishedAt || Date.now();
  const total = Math.max(0, Math.floor((end - vehicle.startedAt) / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function getService(id) {
  return state.services.find((service) => service.id === id) || state.services[0];
}

function getEmployee(id) {
  return state.employees.find((employee) => employee.id === id) || { name: "Sin asignar", commission: 0 };
}

function completedToday() {
  return state.vehicles.filter((vehicle) => vehicle.paid && new Date(vehicle.arrivedAt).toISOString().slice(0, 10) === today());
}

function incomeToday() {
  return completedToday().reduce((sum, vehicle) => sum + Number(vehicle.price || 0), 0);
}

function expensesToday() {
  return state.expenses.filter((expense) => expense.date === today()).reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
}

function dashboardStats() {
  const active = state.vehicles.filter((vehicle) => ["lavado", "secado"].includes(vehicle.status));
  const waiting = state.vehicles.filter((vehicle) => vehicle.status === "espera");
  const finished = state.vehicles.filter((vehicle) => ["finalizado", "entregado"].includes(vehicle.status));
  const durations = finished.filter((vehicle) => vehicle.startedAt && vehicle.finishedAt).map((vehicle) => minutes(vehicle.finishedAt - vehicle.startedAt));
  const average = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
  return { active, waiting, finished, average };
}

function render() {
  ensureBusinessState();
  document.querySelector("#today-label").textContent = new Date().toLocaleDateString("es-PE", { weekday: "long", day: "2-digit", month: "long" });
  renderDashboard();
  renderQueue();
  renderCash();
  renderClients();
  renderEmployees();
  renderInventory();
  renderReports();
  renderSettings();
  fillSelects();
}

function card(label, value, hint) {
  return `<article class="panel stat"><span>${label}</span><strong>${value}</strong><small>${hint}</small></article>`;
}

function renderDashboard() {
  const { active, waiting, finished, average } = dashboardStats();
  const isOpen = state.business.status === "abierto";
  document.querySelector("#dashboard").innerHTML = `
    <div class="grid stats-grid">
      ${card("Estado del negocio", isOpen ? "Abierto" : "Cerrado", isOpen ? `Desde ${new Date(state.business.openedAt).toLocaleTimeString("es-PE")}` : "No se aceptan nuevos vehiculos")}
      ${card("Ingresos de hoy", money(incomeToday()), `${completedToday().length} servicios cobrados`)}
      ${card("Egresos de hoy", money(expensesToday()), "Gastos operativos registrados")}
      ${card("Ganancia neta", money(incomeToday() - expensesToday()), "Ingresos menos egresos")}
    </div>

    <div class="dashboard-layout">
      <div class="dashboard-main">
        <section class="panel">
          <div class="panel-head">
            <div><h2>Cola de lavados</h2><p class="meta">${waiting.length} en espera, ${active.length} en proceso</p></div>
            <button class="ghost-button" data-view-link="queue">Ver cola completa</button>
          </div>
          ${vehicleTable(state.vehicles.filter((vehicle) => vehicle.status !== "entregado").slice(0, 6))}
        </section>

        <section class="panel">
          <div class="panel-head"><div><h2>Lavados activos</h2><p class="meta">Temporizadores en tiempo real</p></div></div>
          ${activeWashCards(active)}
        </section>

        <div class="split-grid">
          <section class="panel">
            <div class="panel-head"><h2>Productividad de empleados</h2></div>
            ${employeeProductivityTable()}
          </section>
          <section class="panel">
            <div class="panel-head"><h2>Alertas de inventario</h2></div>
            ${inventoryAlertTable()}
          </section>
        </div>
      </div>

      <aside class="dashboard-side">
        <section class="panel quick-panel">
          <div class="panel-head"><div><h2>Nuevo vehiculo</h2><p class="meta">Ingreso directo a la cola</p></div></div>
          ${quickVehicleForm()}
        </section>
        <section class="panel">
          <div class="panel-head"><h2>Resumen rapido</h2></div>
          <div class="list compact-list">
            <div><span>Lavados hoy</span><strong>${completedToday().length}</strong></div>
            <div><span>Autos activos</span><strong>${active.length}</strong></div>
            <div><span>En espera</span><strong>${waiting.length}</strong></div>
            <div><span>Tiempo promedio</span><strong>${average} min</strong></div>
          </div>
        </section>
        <section class="panel">
          <div class="panel-head"><h2>Resumen de caja</h2></div>
          <div class="kpi-row">
            <div class="kpi"><span>Inicial</span><strong>${money(state.cash.opening)}</strong></div>
            <div class="kpi"><span>Entradas</span><strong>${money(incomeToday())}</strong></div>
            <div class="kpi"><span>Cierre</span><strong>${money(state.cash.opening + incomeToday() - expensesToday())}</strong></div>
          </div>
        </section>
      </aside>
    </div>
  `;
}

function activeWashCards(active) {
  if (!active.length) return `<div class="empty">No hay lavados activos.</div>`;
  return `
    <div class="active-list">
      ${active.map((vehicle) => `
        <div class="active-wash">
          <div class="active-time">${elapsed(vehicle)}<span>tiempo transcurrido</span></div>
          <div><strong>${vehicle.plate}</strong><span>${vehicle.serviceName}</span></div>
          <div><strong>${getEmployee(vehicle.employeeId).name}</strong><span>Empleado</span></div>
          <button class="ghost-button" data-status="${vehicle.id}:${vehicle.status === "lavado" ? "secado" : "finalizado"}">${vehicle.status === "lavado" ? "Secado" : "Finalizar"}</button>
        </div>
      `).join("")}
    </div>
  `;
}

function employeeProductivityTable() {
  return `
    <div class="table-wrap compact-table"><table>
      <thead><tr><th>Empleado</th><th>Lavados</th><th>Ingresos</th><th>Comision</th></tr></thead>
      <tbody>${state.employees.map((employee) => {
        const vehicles = state.vehicles.filter((vehicle) => vehicle.employeeId === employee.id && vehicle.paid);
        const generated = vehicles.reduce((sum, vehicle) => sum + Number(vehicle.price), 0);
        return `<tr><td><strong>${employee.name}</strong></td><td>${vehicles.length}</td><td>${money(generated)}</td><td>${money(generated * employee.commission / 100)}</td></tr>`;
      }).join("")}</tbody>
    </table></div>
  `;
}

function inventoryAlertTable() {
  const items = state.inventory.filter((item) => Number(item.stock) <= Number(item.min));
  if (!items.length) return `<div class="empty">Inventario sin alertas.</div>`;
  return `
    <div class="table-wrap compact-table"><table>
      <thead><tr><th>Producto</th><th>Stock</th><th>Minimo</th><th>Estado</th></tr></thead>
      <tbody>${items.map((item) => `<tr><td><strong>${item.item}</strong></td><td>${item.stock} ${item.unit}</td><td>${item.min}</td><td><span class="status cancelado">bajo</span></td></tr>`).join("")}</tbody>
    </table></div>
  `;
}

function quickVehicleForm() {
  return `
    <form id="quick-vehicle-form" class="quick-form">
      <label>Placa<input name="plate" required placeholder="Ej: ABC123" /></label>
      <label>Cliente<input name="client" required placeholder="Nombre del cliente" /></label>
      <label>Telefono<input name="phone" placeholder="Para WhatsApp" /></label>
      <label>Vehiculo<input name="vehicle" placeholder="Marca y modelo" /></label>
      <label>Color<input name="color" placeholder="Color" /></label>
      <label>Servicio<select name="service" id="quick-service-select"></select></label>
      <label>Empleado<select name="employee" id="quick-employee-select"></select></label>
      <label>Pago<select name="payment"><option>Efectivo</option><option>Tarjeta</option><option>Transferencia</option><option>Yape / Plin</option></select></label>
      <label>Observaciones<textarea name="notes" rows="3" placeholder="Observaciones adicionales"></textarea></label>
      <button class="primary-button" type="submit">Guardar</button>
    </form>
  `;
}

function alerts() {
  const slow = state.vehicles.filter((vehicle) => ["lavado", "secado"].includes(vehicle.status) && minutes(Date.now() - vehicle.startedAt) > vehicle.estimatedMinutes);
  const lowStock = state.inventory.filter((item) => Number(item.stock) <= Number(item.min));
  return [
    ...slow.map((vehicle) => ({ title: `${vehicle.plate} supero el tiempo`, text: `${elapsed(vehicle)} frente a ${vehicle.estimatedMinutes} min estimados.` })),
    ...lowStock.map((item) => ({ title: `Stock bajo: ${item.item}`, text: `Quedan ${item.stock} ${item.unit}. Minimo recomendado: ${item.min}.` }))
  ];
}

function vehicleTable(vehicles) {
  if (!vehicles.length) return `<div class="empty">No hay vehiculos para mostrar.</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Placa</th><th>Cliente</th><th>Servicio</th><th>Estado</th><th>Tiempo</th><th>Total</th><th>Acciones</th></tr></thead>
        <tbody>
          ${vehicles.map((vehicle) => `
            <tr>
              <td><strong>${vehicle.plate}</strong><div class="meta">${vehicle.vehicle || "Vehiculo"}</div></td>
              <td>${vehicle.client}<div class="meta">${vehicle.phone || "Sin telefono"}</div></td>
              <td>${vehicle.serviceName}</td>
              <td><span class="status ${vehicle.status}">${vehicle.status}</span></td>
              <td class="timer">${elapsed(vehicle)}<div class="meta">${vehicle.estimatedMinutes} min estimado</div></td>
              <td>${money(vehicle.price)}</td>
              <td><div class="row-actions">${actionsFor(vehicle)}</div></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function actionsFor(vehicle) {
  const next = {
    espera: ["lavado", "Iniciar"],
    lavado: ["secado", "Secado"],
    secado: ["finalizado", "Finalizar"],
    finalizado: ["entregado", "Entregar"]
  }[vehicle.status];
  return `
    ${next ? `<button class="ghost-button" data-status="${vehicle.id}:${next[0]}">${next[1]}</button>` : ""}
    <button class="success-button" data-whatsapp="${vehicle.id}">WhatsApp</button>
    ${vehicle.status !== "cancelado" && vehicle.status !== "entregado" ? `<button class="danger-button" data-status="${vehicle.id}:cancelado">Cancelar</button>` : ""}
  `;
}

function renderQueue() {
  document.querySelector("#queue").innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <div><h2>Cola de espera y proceso</h2><p class="meta">Controla estados, tiempos reales y entregas.</p></div>
        <button class="primary-button" data-open-modal="vehicle-modal">Nuevo vehiculo</button>
      </div>
      ${vehicleTable([...state.vehicles].sort((a, b) => a.arrivedAt - b.arrivedAt))}
    </div>
  `;
}

function renderCash() {
  document.querySelector("#cash").innerHTML = `
    <div class="grid content-grid">
      <section class="panel">
        <div class="panel-head"><div><h2>Registrar egreso</h2><p class="meta">Gastos de productos, servicios, sueldos o mantenimiento.</p></div></div>
        <form id="expense-form" class="inline-form">
          <label>Categoria<input name="category" required placeholder="Productos" /></label>
          <label>Descripcion<input name="description" required placeholder="Compra de insumos" /></label>
          <label>Monto<input name="amount" required type="number" min="0" step="0.01" /></label>
          <label>Fecha<input name="date" type="date" value="${today()}" /></label>
          <button class="primary-button">Agregar</button>
        </form>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Cierre estimado</h2></div>
        <div class="kpi-row">
          <div class="kpi"><span>Monto inicial</span><strong>${money(state.cash.opening)}</strong></div>
          <div class="kpi"><span>Ingresos</span><strong>${money(incomeToday())}</strong></div>
          <div class="kpi"><span>Egresos</span><strong>${money(expensesToday())}</strong></div>
        </div>
        <div style="margin-top:12px" class="kpi"><span>Total en caja</span><strong>${money(state.cash.opening + incomeToday() - expensesToday())}</strong></div>
      </section>
    </div>
    <section class="panel" style="margin-top:16px">
      <div class="panel-head"><h2>Egresos registrados</h2></div>
      ${expenseTable()}
    </section>
  `;
}

function expenseTable() {
  if (!state.expenses.length) return `<div class="empty">Aun no hay egresos.</div>`;
  return `
    <div class="table-wrap"><table>
      <thead><tr><th>Fecha</th><th>Categoria</th><th>Descripcion</th><th>Monto</th></tr></thead>
      <tbody>${state.expenses.map((expense) => `<tr><td>${expense.date}</td><td>${expense.category}</td><td>${expense.description}</td><td>${money(expense.amount)}</td></tr>`).join("")}</tbody>
    </table></div>
  `;
}

function renderClients() {
  const clients = [...new Map(state.vehicles.map((vehicle) => [vehicle.client, vehicle])).values()];
  document.querySelector("#clients").innerHTML = `
    <section class="panel">
      <div class="panel-head"><div><h2>Clientes</h2><p class="meta">Historial por cliente y vehiculo.</p></div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Cliente</th><th>Telefono</th><th>Ultimo vehiculo</th><th>Visitas</th><th>Total gastado</th></tr></thead>
        <tbody>${clients.map((client) => {
          const visits = state.vehicles.filter((vehicle) => vehicle.client === client.client);
          return `<tr><td><strong>${client.client}</strong></td><td>${client.phone || "Sin telefono"}</td><td>${client.vehicle || "-"}</td><td>${visits.length}</td><td>${money(visits.reduce((sum, vehicle) => sum + (vehicle.paid ? Number(vehicle.price) : 0), 0))}</td></tr>`;
        }).join("")}</tbody>
      </table></div>
    </section>
  `;
}

function renderEmployees() {
  document.querySelector("#employees").innerHTML = `
    <section class="panel">
      <div class="panel-head"><h2>Productividad de empleados</h2></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Empleado</th><th>Rol</th><th>Autos asignados</th><th>Ingresos generados</th><th>Comision</th></tr></thead>
        <tbody>${state.employees.map((employee) => {
          const vehicles = state.vehicles.filter((vehicle) => vehicle.employeeId === employee.id && vehicle.paid);
          const generated = vehicles.reduce((sum, vehicle) => sum + Number(vehicle.price), 0);
          return `<tr><td><strong>${employee.name}</strong></td><td>${employee.role}</td><td>${vehicles.length}</td><td>${money(generated)}</td><td>${money(generated * employee.commission / 100)}</td></tr>`;
        }).join("")}</tbody>
      </table></div>
    </section>
  `;
}

function renderInventory() {
  document.querySelector("#inventory").innerHTML = `
    <section class="panel">
      <div class="panel-head"><div><h2>Inventario</h2><p class="meta">Actualiza stock y minimos para recibir alertas.</p></div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Producto</th><th>Stock</th><th>Minimo</th><th>Unidad</th><th>Estado</th><th>Ajuste</th></tr></thead>
        <tbody>${state.inventory.map((item) => `
          <tr>
            <td><strong>${item.item}</strong></td>
            <td>${item.stock}</td>
            <td>${item.min}</td>
            <td>${item.unit}</td>
            <td><span class="status ${item.stock <= item.min ? "cancelado" : "finalizado"}">${item.stock <= item.min ? "bajo" : "ok"}</span></td>
            <td><div class="row-actions"><button class="ghost-button" data-stock="${item.id}:1">+1</button><button class="ghost-button" data-stock="${item.id}:-1">-1</button></div></td>
          </tr>
        `).join("")}</tbody>
      </table></div>
    </section>
  `;
}

function renderReports() {
  const totalIncome = state.vehicles.reduce((sum, vehicle) => sum + (vehicle.paid ? Number(vehicle.price) : 0), 0);
  const totalExpenses = state.expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const serviceCounts = state.services.map((service) => ({
    name: service.name,
    count: state.vehicles.filter((vehicle) => vehicle.serviceId === service.id).length
  })).sort((a, b) => b.count - a.count);
  document.querySelector("#reports").innerHTML = `
    <div class="grid stats-grid">
      ${card("Ingresos historicos", money(totalIncome), "Todos los servicios cobrados")}
      ${card("Egresos historicos", money(totalExpenses), "Todos los gastos")}
      ${card("Utilidad historica", money(totalIncome - totalExpenses), "Resultado acumulado")}
      ${card("Autos registrados", state.vehicles.length, "Cola, procesos y entregados")}
    </div>
    <section class="panel" style="margin-top:16px">
      <div class="panel-head"><h2>Servicios mas solicitados</h2></div>
      <div class="list">${serviceCounts.map((item) => `<div class="list-item"><strong>${item.name}</strong><span class="meta">${item.count} solicitudes</span></div>`).join("")}</div>
    </section>
  `;
}

function renderSettings() {
  document.querySelector("#settings").innerHTML = `
    <section class="panel">
      <div class="panel-head"><h2>Servicios y precios</h2></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Servicio</th><th>Precio</th><th>Duracion</th></tr></thead>
        <tbody>${state.services.map((service) => `<tr><td><strong>${service.name}</strong></td><td>${money(service.price)}</td><td>${service.duration} min</td></tr>`).join("")}</tbody>
      </table></div>
    </section>
  `;
}

function fillSelects() {
  document.querySelectorAll("#service-select, #quick-service-select").forEach((select) => {
    select.innerHTML = state.services.map((service) => `<option value="${service.id}">${service.name} - ${money(service.price)}</option>`).join("");
  });
  document.querySelectorAll("#employee-select, #quick-employee-select").forEach((select) => {
    select.innerHTML = state.employees.map((employee) => `<option value="${employee.id}">${employee.name}</option>`).join("");
  });
}

document.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-view], [data-view-link]");
  if (nav) setView(nav.dataset.view || nav.dataset.viewLink);

  const open = event.target.closest("[data-open-modal]");
  if (open) {
    ensureBusinessState();
    if (state.business.status !== "abierto") {
      alert("Primero debes abrir el negocio para registrar vehiculos.");
      return;
    }
    document.getElementById(open.dataset.openModal).showModal();
  }

  const close = event.target.closest("[data-close-modal]");
  if (close) document.getElementById(close.dataset.closeModal).close();

  const statusButton = event.target.closest("[data-status]");
  if (statusButton) {
    const [id, status] = statusButton.dataset.status.split(":");
    updateStatus(id, status);
  }

  const stockButton = event.target.closest("[data-stock]");
  if (stockButton) {
    const [id, delta] = stockButton.dataset.stock.split(":");
    const item = state.inventory.find((entry) => entry.id === id);
    item.stock = Math.max(0, Number(item.stock) + Number(delta));
    saveState();
    render();
  }

  const whatsappButton = event.target.closest("[data-whatsapp]");
  if (whatsappButton) {
    sendReceiptWhatsApp(whatsappButton.dataset.whatsapp);
  }
});

function setView(view) {
  document.querySelectorAll(".view").forEach((item) => item.classList.toggle("active", item.id === view));
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  const titles = { dashboard: "Panel de control", queue: "Cola de lavado", cash: "Caja e ingresos", clients: "Clientes", employees: "Empleados", inventory: "Inventario", reports: "Reportes", settings: "Servicios" };
  document.querySelector("#view-title").textContent = titles[view] || "Panel de control";
}

function updateStatus(id, status) {
  const vehicle = state.vehicles.find((item) => item.id === id);
  vehicle.status = status;
  if (status === "lavado" && !vehicle.startedAt) vehicle.startedAt = Date.now();
  if (status === "finalizado") {
    vehicle.finishedAt = Date.now();
    vehicle.paid = true;
  }
  if (status === "entregado") vehicle.paid = true;
  saveState();
  render();
}

function registerVehicleFromForm(formElement) {
  ensureBusinessState();
  if (state.business.status !== "abierto") {
    alert("El negocio esta cerrado. Abre el negocio antes de registrar un vehiculo.");
    return false;
  }
  const form = new FormData(formElement);
  const service = getService(form.get("service"));
  state.vehicles.push({
    id: uid(),
    plate: String(form.get("plate")).toUpperCase(),
    client: form.get("client"),
    phone: form.get("phone"),
    vehicle: form.get("vehicle"),
    color: form.get("color"),
    serviceId: service.id,
    serviceName: service.name,
    price: service.price,
    estimatedMinutes: service.duration,
    employeeId: form.get("employee"),
    payment: form.get("payment"),
    notes: form.get("notes"),
    status: "espera",
    arrivedAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    paid: false
  });
  formElement.reset();
  saveState();
  render();
  setView("queue");
  return true;
}

document.querySelector("#vehicle-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (registerVehicleFromForm(event.currentTarget)) {
    document.querySelector("#vehicle-modal").close();
  }
});

document.addEventListener("submit", (event) => {
  if (event.target.id === "quick-vehicle-form") {
    event.preventDefault();
    registerVehicleFromForm(event.target);
    return;
  }

  if (event.target.id !== "expense-form") return;
  event.preventDefault();
  const form = new FormData(event.target);
  state.expenses.push({
    id: uid(),
    date: form.get("date") || today(),
    category: form.get("category"),
    description: form.get("description"),
    amount: Number(form.get("amount"))
  });
  event.target.reset();
  saveState();
  render();
});

document.querySelector("#export-xlsx").addEventListener("click", () => {
  if (databaseMode) {
    window.location.href = "/api/export.xlsx";
    return;
  }

  alert("Para exportar XLSX debes iniciar la app con 'Iniciar WELD Lavadero.bat'.");
});

document.querySelector("#open-business").addEventListener("click", () => {
  ensureBusinessState();
  state.business.status = "abierto";
  state.business.openedAt = Date.now();
  state.business.closedAt = null;
  saveState();
  render();
});

document.querySelector("#close-business").addEventListener("click", () => {
  ensureBusinessState();
  state.business.status = "cerrado";
  state.business.closedAt = Date.now();
  saveState();
  render();
});

document.querySelector("#logout-button").addEventListener("click", () => {
  document.body.insertAdjacentHTML("beforeend", `
    <div class="session-lock active" id="session-lock">
      <div class="session-card">
        <div class="brand" style="color:var(--ink); padding:0">
          <div class="brand-mark">W</div>
          <div><strong>WELD</strong><span>Lavadero</span></div>
        </div>
        <h2>Sesion cerrada</h2>
        <p class="meta">La informacion esta guardada. Vuelve a entrar para continuar operando.</p>
        <button class="primary-button" id="login-again">Entrar</button>
      </div>
    </div>
  `);
  document.querySelector("#login-again").addEventListener("click", () => {
    document.querySelector("#session-lock").remove();
  });
});

function sendReceiptWhatsApp(id) {
  const vehicle = state.vehicles.find((item) => item.id === id);
  if (!vehicle) return;
  const phone = String(vehicle.phone || "").replace(/\D/g, "");
  const text = [
    "Recibo WELD Lavadero",
    `Placa: ${vehicle.plate}`,
    `Cliente: ${vehicle.client}`,
    `Servicio: ${vehicle.serviceName}`,
    `Total: ${money(vehicle.price)}`,
    `Estado: ${vehicle.status}`,
    `Tiempo: ${elapsed(vehicle)}`,
    "Gracias por su preferencia."
  ].join("\n");
  const url = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  link.click();
}

async function initApp() {
  state = await loadState();
  render();
  setInterval(() => {
    const active = document.activeElement;
    const isTyping = active && ["INPUT", "SELECT", "TEXTAREA"].includes(active.tagName);
    if (!isTyping) render();
  }, 1000);
}

initApp();
