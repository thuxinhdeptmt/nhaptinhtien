"use strict";

// -----------------------------------------------------------------------------
// Config & state
// -----------------------------------------------------------------------------

const PEOPLE = ["Linh", "Trang", "Vương"];
const STORAGE_KEY = "bill-splitter-v2";
const DETAIL_MODE = {
  ALL: "all",
  SINGLE: "single",
};

const state = {
  people: {},
  editing: null,
  detailMode: null,
  selectedDebt: null,
};

// -----------------------------------------------------------------------------
// Small helpers
// -----------------------------------------------------------------------------

function emptyRow() {
  return { name: "", price: "" };
}

function cloneTemplate(id) {
  return document.getElementById(id).content.firstElementChild.cloneNode(true);
}

function setEditing(person, groupId, rowIndex, isNew) {
  state.editing = { person, groupId, rowIndex, isNew };
}

function clearEditing() {
  state.editing = null;
}

function setResultExpanded(expanded) {
  document
    .getElementById("resultTitleBtn")
    .setAttribute("aria-expanded", String(expanded));
}

function closeTypeMenu(menu) {
  menu.hidden = true;
  menu
    .closest(".type-adder-wrap")
    ?.querySelector(".type-tray-toggle")
    ?.setAttribute("aria-expanded", "false");
}

function closeOtherTypeMenus(currentMenu) {
  document.querySelectorAll(".type-menu").forEach(menu => {
    if (menu !== currentMenu) closeTypeMenu(menu);
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// -----------------------------------------------------------------------------
// State setup & persistence
// -----------------------------------------------------------------------------

function makeGroup(id, title, kind, target = null) {
  return {
    id,
    title,
    kind,
    target,
    rows: [emptyRow()],
  };
}

function groupDefinitionsFor(payer) {
  const others = PEOPLE.filter(person => person !== payer);

  return [
    makeGroup("split3", "Chia cho 3", "split3"),
    makeGroup(`split-${others[0]}`, `Chia với ${others[0]}`, "split2", others[0]),
    makeGroup(`advance-${others[0]}`, `Ứng tiền cho ${others[0]}`, "advance", others[0]),
    makeGroup(`split-${others[1]}`, `Chia với ${others[1]}`, "split2", others[1]),
    makeGroup(`advance-${others[1]}`, `Ứng tiền cho ${others[1]}`, "advance", others[1]),
  ];
}

function initState() {
  state.people = {};

  PEOPLE.forEach(person => {
    state.people[person] = {
      groups: groupDefinitionsFor(person),
    };
  });
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;

    const saved = JSON.parse(raw);
    initState();

    PEOPLE.forEach(person => {
      const savedGroups = saved?.people?.[person]?.groups || [];

      state.people[person].groups.forEach(group => {
        const previous = savedGroups.find(savedGroup => savedGroup.id === group.id);
        if (!previous?.rows) return;

        group.rows = previous.rows.map(row => ({
          name: String(row?.name ?? ""),
          price: String(row?.price ?? ""),
        }));

        normalizeRows(group);
      });
    });

    return true;
  } catch (error) {
    console.warn("Không thể đọc dữ liệu đã lưu:", error);
    return false;
  }
}

function saveState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ people: state.people }),
    );
  } catch (error) {
    console.warn("Không thể lưu dữ liệu:", error);
  }
}

// -----------------------------------------------------------------------------
// Money & group calculations
// -----------------------------------------------------------------------------

function parseMoney(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

function formatInput(value) {
  const amount = parseMoney(value);
  return amount ? amount.toLocaleString("vi-VN") : "";
}

function formatMoney(value) {
  if (!Number.isFinite(value) || Math.abs(value) < 0.000001) return "—";

  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;

  return rounded.toLocaleString("vi-VN", {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function normalizeRows(group) {
  const filledRows = group.rows.filter(
    row => row.name.trim() !== "" || parseMoney(row.price) > 0,
  );

  group.rows = [...filledRows, emptyRow()];
}

function groupTotal(group) {
  return group.rows.reduce(
    (sum, row) => sum + parseMoney(row.price),
    0,
  );
}

function groupShare(group) {
  const total = groupTotal(group);

  if (group.kind === "split3") return total / 3;
  if (group.kind === "split2") return total / 2;
  return total;
}

function isGroupActive(group) {
  return (
    groupTotal(group) > 0 ||
    group.rows.some(row => row.name.trim() !== "")
  );
}

// -----------------------------------------------------------------------------
// Main rendering
// -----------------------------------------------------------------------------

function renderApp() {
  renderPeople();
  renderMatrix();
  renderDetailsByMode();
}

function renderPeople() {
  const grid = document.getElementById("peopleGrid");
  grid.innerHTML = "";

  const columns = [];
  const trays = [];

  PEOPLE.forEach(person => {
    const column = createPersonColumn(person);
    const panel = createPersonPanel(person);
    const groups = state.people[person].groups;

    const activeGroups = groups.filter(
      group =>
        isGroupActive(group) ||
        (
          state.editing?.person === person &&
          state.editing?.groupId === group.id
        ),
    );

    const inactiveGroups = groups.filter(
      group => !activeGroups.includes(group),
    );

    const activeContainer = panel.querySelector(".active-groups");
    activeGroups.forEach(group => {
      activeContainer.appendChild(renderGroup(person, group));
    });

    column.appendChild(panel);

    if (inactiveGroups.length) {
      const tray = createTypeTray(person, inactiveGroups);
      column.appendChild(tray);
      trays.push({ panel, tray });
    }

    columns.push({ panel });
    grid.appendChild(column);
  });

  alignTypeTrays(columns, trays);
}

function createPersonColumn(person) {
  const column = document.createElement("div");
  column.className = "person-column";
  column.dataset.person = person;
  return column;
}

function createPersonPanel(person) {
  const panel = cloneTemplate("personTemplate");
  panel.dataset.person = person;
  panel.querySelector(".person-title").textContent = `Chi của ${person}`;
  return panel;
}

function createTypeTray(person, inactiveGroups) {
  const tray = document.createElement("div");
  tray.className = "type-tray type-adder-wrap";
  tray.dataset.person = person;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "type-tray-toggle";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "Thêm khoản");
  toggle.innerHTML = '<span class="type-tray-more" aria-hidden="true">...</span>';

  const menu = document.createElement("div");
  menu.className = "type-menu";
  menu.hidden = true;

  inactiveGroups.forEach(group => {
    menu.appendChild(createTypeOption(person, group));
  });

  toggle.addEventListener("click", event => {
    event.stopPropagation();
    closeOtherTypeMenus(menu);

    menu.hidden = !menu.hidden;
    toggle.setAttribute("aria-expanded", String(!menu.hidden));
  });

  tray.append(toggle, menu);
  return tray;
}

function createTypeOption(person, group) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "type-option";
  button.textContent = group.title;
  button.title = group.title;

  button.addEventListener("click", event => {
    event.stopPropagation();

    setEditing(
      person,
      group.id,
      group.rows.length - 1,
      true,
    );

    renderPeople();
    requestAnimationFrame(() => focusActiveEditor(person, group.id));
  });

  return button;
}

function alignTypeTrays(columns, trays) {
  requestAnimationFrame(() => {
    const maxPanelHeight = Math.max(
      ...columns.map(({ panel }) => panel.offsetHeight),
    );

    trays.forEach(({ panel, tray }) => {
      const gap = 7;
      tray.style.marginTop = `${Math.max(
        gap,
        maxPanelHeight - panel.offsetHeight + gap,
      )}px`;
    });
  });
}

// -----------------------------------------------------------------------------
// Group rendering
// -----------------------------------------------------------------------------

function renderGroup(person, group) {
  const node = cloneTemplate("groupTemplate");
  node.dataset.person = person;
  node.dataset.group = group.id;
  node.querySelector(".group-title").textContent = group.title;

  renderGroupSummary(node, group);

  const rowsContainer = node.querySelector(".expense-rows");
  renderRowsInto(rowsContainer, person, group, node);

  node.querySelector(".group-add-btn").addEventListener("click", () => {
    setEditing(
      person,
      group.id,
      group.rows.length - 1,
      true,
    );

    renderRowsInto(rowsContainer, person, group, node);
  });

  return node;
}

function renderGroupSummary(groupNode, group) {
  const total = groupTotal(group);
  const share = groupShare(group);

  groupNode.querySelector(".summary-total").textContent = formatMoney(total);

  const label = groupNode.querySelector(".summary-share-label");
  const value = groupNode.querySelector(".summary-share");

  if (group.kind === "advance") {
    label.textContent = `${group.target} trả`;
    value.textContent = formatMoney(total);
    return;
  }

  label.textContent = "Mỗi người";
  value.textContent = formatMoney(share);
}

// -----------------------------------------------------------------------------
// Expense rows
// -----------------------------------------------------------------------------

function isEditing(person, groupId, rowIndex) {
  return Boolean(
    state.editing &&
    state.editing.person === person &&
    state.editing.groupId === groupId &&
    state.editing.rowIndex === rowIndex,
  );
}

function renderRowsInto(container, person, group, groupNode) {
  container.innerHTML = "";

  const visibleRows = group.rows
    .map((row, index) => ({ row, index }))
    .filter(
      ({ index }) =>
        index < group.rows.length - 1 ||
        isEditing(person, group.id, index),
    );

  visibleRows.forEach(({ index }) => {
    const rowNode = isEditing(person, group.id, index)
      ? renderEditorRow(person, group, index, groupNode)
      : renderDisplayRow(person, group, index, groupNode);

    container.appendChild(rowNode);
  });
}

function renderDisplayRow(person, group, index, groupNode) {
  const row = group.rows[index];
  const element = document.createElement("div");

  element.className = "expense-row-display";
  element.tabIndex = 0;
  element.innerHTML = `
    <button class="row-delete" type="button" aria-label="Xóa khoản">×</button>
    <span class="expense-name">${escapeHtml(row.name || "Không tên")}</span>
    <span class="expense-price">${formatMoney(parseMoney(row.price))}</span>
  `;

  const startEdit = () => {
    setEditing(person, group.id, index, false);
    renderRowsInto(
      groupNode.querySelector(".expense-rows"),
      person,
      group,
      groupNode,
    );
  };

  element.addEventListener("click", event => {
    if (event.target.closest(".row-delete")) return;
    startEdit();
  });

  element.addEventListener("keydown", event => {
    if (event.key === "Enter") startEdit();
  });

  element.querySelector(".row-delete").addEventListener("click", event => {
    event.stopPropagation();

    group.rows.splice(index, 1);
    normalizeRows(group);
    clearEditing();
    saveState();
    renderApp();
  });

  return element;
}

function renderEditorRow(person, group, index, groupNode) {
  const row = group.rows[index] || emptyRow();
  const original = { ...row };
  const isNew = state.editing?.isNew;
  const element = document.createElement("div");

  element.className = "expense-row-editor";
  element.innerHTML = `
    <div class="editor-actions">
      <button class="editor-cancel" type="button" title="Hủy">×</button>
      <button class="editor-save" type="button" title="Lưu">✓</button>
    </div>
    <input class="name-input" type="text" autocomplete="off" placeholder="Tên khoản" value="${escapeHtml(row.name)}">
    <input class="price-input" type="text" inputmode="numeric" autocomplete="off" placeholder="0" value="${escapeHtml(formatInput(row.price))}">
  `;

  const nameInput = element.querySelector(".name-input");
  const priceInput = element.querySelector(".price-input");

  const syncDraft = () => {
    group.rows[index].name = nameInput.value;
    group.rows[index].price = priceInput.value;

    renderGroupSummary(groupNode, group);
    renderMatrix();
    renderDetailsByMode();
  };

  const commit = () => {
    syncDraft();
    normalizeRows(group);
    clearEditing();
    saveState();
    renderApp();
  };

  const cancel = () => {
    group.rows[index] = isNew ? emptyRow() : original;
    normalizeRows(group);
    clearEditing();
    renderApp();
  };

  nameInput.addEventListener("input", syncDraft);
  priceInput.addEventListener("input", syncDraft);

  [nameInput, priceInput].forEach(input => {
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") commit();
      if (event.key === "Escape") cancel();
    });
  });

  element.querySelector(".editor-save").addEventListener("click", commit);
  element.querySelector(".editor-cancel").addEventListener("click", cancel);

  requestAnimationFrame(() => {
    nameInput.focus();
    const length = nameInput.value.length;
    nameInput.setSelectionRange(length, length);
  });

  return element;
}

function focusActiveEditor(person, groupId) {
  const panel = document.querySelector(
    `.person-panel[data-person="${person}"]`,
  );
  const groupNode = panel?.querySelector(
    `.expense-group[data-group="${CSS.escape(groupId)}"]`,
  );

  groupNode?.querySelector(".name-input")?.focus();
}

// -----------------------------------------------------------------------------
// Debt calculation
// -----------------------------------------------------------------------------

function createDebtMatrix(defaultValueFactory) {
  const matrix = {};

  PEOPLE.forEach(rowPerson => {
    matrix[rowPerson] = {};
    PEOPLE.forEach(columnPerson => {
      matrix[rowPerson][columnPerson] = defaultValueFactory();
    });
  });

  return matrix;
}

function buildRawDebtData() {
  const debts = createDebtMatrix(() => 0);
  const grouped = createDebtMatrix(() => []);

  PEOPLE.forEach(payer => {
    state.people[payer].groups.forEach(group => {
      const total = groupTotal(group);
      if (total <= 0) return;

      let debtors;
      let owed = total;

      if (group.kind === "split3") {
        debtors = PEOPLE.filter(person => person !== payer);
        owed = total / 3;
      } else if (group.kind === "split2") {
        debtors = [group.target];
        owed = total / 2;
      } else {
        debtors = [group.target];
      }

      debtors.forEach(debtor => {
        debts[debtor][payer] += owed;
        grouped[debtor][payer].push({
          groupTitle: group.title,
          amount: owed,
        });
      });
    });
  });

  return { debts, grouped };
}

function buildNetDebtData() {
  const raw = buildRawDebtData();
  const net = createDebtMatrix(() => 0);

  for (let i = 0; i < PEOPLE.length; i += 1) {
    for (let j = i + 1; j < PEOPLE.length; j += 1) {
      const a = PEOPLE[i];
      const b = PEOPLE[j];
      const difference = raw.debts[a][b] - raw.debts[b][a];

      if (difference > 0) net[a][b] = difference;
      if (difference < 0) net[b][a] = -difference;
    }
  }

  return { raw, net };
}

// -----------------------------------------------------------------------------
// Result matrix
// -----------------------------------------------------------------------------

function renderMatrix() {
  const data = buildNetDebtData();
  const table = document.getElementById("resultMatrix");
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");

  thead.innerHTML = `
    <tr>
      <th class="axis-cell">Trả ↓ / Nhận →</th>
      ${PEOPLE.map(person => `<th>${person}</th>`).join("")}
    </tr>
  `;
  tbody.innerHTML = "";

  PEOPLE.forEach(debtor => {
    const row = document.createElement("tr");
    const heading = document.createElement("th");

    heading.className = "axis-cell";
    heading.textContent = `${debtor} trả`;
    row.appendChild(heading);

    PEOPLE.forEach(receiver => {
      row.appendChild(createResultCell(debtor, receiver, data));
    });

    tbody.appendChild(row);
  });
}

function createResultCell(debtor, receiver, data) {
  const cell = document.createElement("td");
  cell.className = "result-cell";

  if (debtor === receiver) {
    cell.classList.add("diagonal");
    cell.textContent = "•";
    return cell;
  }

  const value = data.net[debtor][receiver];

  if (value <= 0) {
    cell.classList.add("empty-value");
    cell.textContent = "—";
    return cell;
  }

  cell.classList.add("has-value");
  cell.dataset.receiver = receiver;
  cell.textContent = formatMoney(value);

  const isSelected =
    state.detailMode === DETAIL_MODE.SINGLE &&
    state.selectedDebt?.debtor === debtor &&
    state.selectedDebt?.receiver === receiver;

  if (isSelected) cell.classList.add("active");

  cell.addEventListener("click", () => {
    state.detailMode = DETAIL_MODE.SINGLE;
    state.selectedDebt = { debtor, receiver };

    renderMatrix();
    renderDetailsByMode();
    setResultExpanded(false);
  });

  return cell;
}

// -----------------------------------------------------------------------------
// Detail panel
// -----------------------------------------------------------------------------

function collapseGroups(items) {
  const totalsByGroup = new Map();

  items.forEach(item => {
    totalsByGroup.set(
      item.groupTitle,
      (totalsByGroup.get(item.groupTitle) || 0) + item.amount,
    );
  });

  return [...totalsByGroup.entries()]
    .map(([title, amount]) => ({ title, amount }))
    .filter(item => item.amount > 0.000001);
}

function detailLines(items, sign) {
  return items
    .map(
      item => `
        <div class="detail-line">
          <span>${escapeHtml(item.title)}</span>
          <span class="amount">${sign}${formatMoney(item.amount)}</span>
        </div>
      `,
    )
    .join("");
}

function singleDetailHtml(debtor, receiver, data) {
  const plusItems = collapseGroups(data.raw.grouped[debtor][receiver]);
  const minusItems = collapseGroups(data.raw.grouped[receiver][debtor]);
  const total = data.net[debtor][receiver];

  return `
    <div class="detail-block">
      <div class="detail-block-title">
        <span>${debtor} trả ${receiver}</span>
        <span>${formatMoney(total)}</span>
      </div>

      <div class="detail-person" data-person="${receiver}">${receiver}</div>
      ${detailLines(plusItems, "+")}

      ${
        minusItems.length
          ? `
            <div class="detail-person" data-person="${debtor}">${debtor}</div>
            ${detailLines(minusItems, "−")}
          `
          : ""
      }

      <div class="detail-total-row">
        <span>Còn phải trả</span>
        <strong>${formatMoney(total)}</strong>
      </div>
    </div>
  `;
}

function allDetailsHtml(data) {
  const blocks = [];

  PEOPLE.forEach(debtor => {
    PEOPLE.forEach(receiver => {
      if (debtor === receiver || data.net[debtor][receiver] <= 0) return;
      blocks.push(singleDetailHtml(debtor, receiver, data));
    });
  });

  return blocks.length
    ? blocks.join("")
    : '<div class="detail-line"><span>Chưa có khoản thanh toán.</span></div>';
}

function renderDetailsByMode() {
  const panel = document.getElementById("detailPanel");
  const data = buildNetDebtData();

  if (!state.detailMode) {
    hideDetailPanel(panel);
    return;
  }

  panel.classList.remove("is-hidden");

  if (state.detailMode === DETAIL_MODE.ALL) {
    panel.innerHTML = allDetailsHtml(data);
    return;
  }

  if (state.detailMode === DETAIL_MODE.SINGLE && state.selectedDebt) {
    const { debtor, receiver } = state.selectedDebt;

    if (data.net[debtor][receiver] > 0) {
      panel.innerHTML = singleDetailHtml(debtor, receiver, data);
      return;
    }

    state.detailMode = null;
    state.selectedDebt = null;
    hideDetailPanel(panel);
  }
}

function hideDetailPanel(panel) {
  panel.classList.add("is-hidden");
  panel.innerHTML = "";
}

// -----------------------------------------------------------------------------
// Actions & global events
// -----------------------------------------------------------------------------

function resetAll() {
  const hasData = PEOPLE.some(person =>
    state.people[person].groups.some(isGroupActive),
  );

  if (hasData && !confirm("Xóa toàn bộ dữ liệu đang nhập?")) return;

  localStorage.removeItem(STORAGE_KEY);
  clearEditing();
  state.detailMode = null;
  state.selectedDebt = null;

  initState();
  renderApp();
}

function toggleAllDetails() {
  if (state.detailMode === DETAIL_MODE.ALL) {
    state.detailMode = null;
    state.selectedDebt = null;
    setResultExpanded(false);
  } else {
    state.detailMode = DETAIL_MODE.ALL;
    state.selectedDebt = null;
    setResultExpanded(true);
  }

  renderMatrix();
  renderDetailsByMode();
}

function handleDocumentClick(event) {
  document.querySelectorAll(".type-menu").forEach(menu => {
    const wrap = menu.closest(".type-adder-wrap");
    if (!wrap?.contains(event.target)) closeTypeMenu(menu);
  });
}

function bindGlobalEvents() {
  document.getElementById("resetBtn").addEventListener("click", resetAll);
  document
    .getElementById("resultTitleBtn")
    .addEventListener("click", toggleAllDetails);
  document.addEventListener("click", handleDocumentClick);
}

// -----------------------------------------------------------------------------
// Ghi chú tự do (note-pad)
// -----------------------------------------------------------------------------

const NOTE_STORAGE_KEY = "bill-splitter-note-v1";

function autoResizeNote(notePad) {
  notePad.style.height = "auto";
  notePad.style.height = `${notePad.scrollHeight}px`;
}

function loadNote() {
  try {
    const notePad = document.getElementById("notePad");
    if (!notePad) return;
    notePad.value = localStorage.getItem(NOTE_STORAGE_KEY) || "";
    autoResizeNote(notePad);
  } catch (error) {
    console.warn("Không thể đọc ghi chú đã lưu:", error);
  }
}

function bindNotePad() {
  const notePad = document.getElementById("notePad");
  if (!notePad) return;

  notePad.addEventListener("input", () => {
    autoResizeNote(notePad);

    try {
      localStorage.setItem(NOTE_STORAGE_KEY, notePad.value);
    } catch (error) {
      console.warn("Không thể lưu ghi chú:", error);
    }
  });
}

// -----------------------------------------------------------------------------
// App bootstrap
// -----------------------------------------------------------------------------

bindGlobalEvents();
bindNotePad();
if (!loadState()) initState();
renderApp();
loadNote();
