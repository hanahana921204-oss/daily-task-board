"use strict";

(() => {
  const STORAGE_KEY = "civil.daily-task-board.v1";
  const STATUSES = ["待處理", "進行中", "已完成"];
  const CATEGORIES = ["施工", "材料", "安全衛生", "品質查驗", "行政", "其他"];
  const $ = (selector) => document.querySelector(selector);
  const form = $("#task-form");
  let tasks = [];
  let editingId = null;
  let deletingId = null;
  let statusFilter = "全部";
  let storageBlocked = false;
  let noticeTimer;

  function localDate(value = new Date()) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  function dateOffset(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return localDate(date);
  }
  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T12:00:00`);
    return !Number.isNaN(parsed.getTime()) && localDate(parsed) === value;
  }
  function validTask(task) {
    return task && typeof task.id === "string" && task.id.length > 0 &&
      typeof task.title === "string" && task.title.trim().length > 0 && task.title.length <= 80 &&
      typeof task.owner === "string" && task.owner.trim().length > 0 && task.owner.length <= 40 &&
      typeof task.notes === "string" && task.notes.length <= 500 &&
      CATEGORIES.includes(task.category) && STATUSES.includes(task.status) && validDate(task.dueDate);
  }
  function readTasks() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const stored = JSON.parse(raw);
    if (!stored || stored.version !== 1 || !Array.isArray(stored.tasks) || !stored.tasks.every(validTask) ||
      new Set(stored.tasks.map((task) => task.id)).size !== stored.tasks.length) {
      throw new Error("資料格式不正確");
    }
    return stored.tasks;
  }
  function storageError(message) {
    $("#storage-alert").textContent = message;
    $("#storage-alert").hidden = false;
    $("#storage-label").textContent = "本機儲存目前無法使用";
  }
  function persist(nextTasks) {
    if (storageBlocked) {
      storageError("原有儲存資料無法讀取，已停止寫入以保護資料。請先備份此網站的瀏覽器儲存內容，再依 README 處理後重新載入。");
      return false;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, tasks: nextTasks }));
      $("#storage-alert").hidden = true;
      $("#storage-label").textContent = "已儲存於此瀏覽器";
      return true;
    } catch {
      storageError("無法儲存，這次操作尚未生效。可能是瀏覽器封鎖儲存或容量已滿；請允許網站儲存，或以正常瀏覽模式及 HTTP 網址開啟。");
      return false;
    }
  }
  function commit(nextTasks, message) {
    if (!persist(nextTasks)) return false;
    tasks = nextTasks;
    render();
    notify(message);
    return true;
  }
  function notify(message) {
    clearTimeout(noticeTimer);
    $("#notice").textContent = message;
    noticeTimer = setTimeout(() => { $("#notice").textContent = ""; }, 5000);
  }
  function createId() {
    return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function formatDate(value) {
    const [year, month, day] = value.split("-");
    return `${year}.${month}.${day}`;
  }
  function renderTask(task) {
    const card = element("article", "task-card");
    card.dataset.id = task.id;
    card.dataset.status = task.status;
    const heading = element("div", "task-card-heading");
    const icon = element("span", "task-status-icon", task.status === "已完成" ? "✓" : task.status === "進行中" ? "◷" : "");
    icon.setAttribute("aria-hidden", "true");
    const title = element("div", "task-card-title");
    title.append(element("h3", "", task.title));
    heading.append(icon, title, element("span", "task-category", task.category));
    card.append(heading);
    if (task.notes) card.append(element("p", "task-notes", task.notes));
    const meta = element("div", "task-meta");
    const owner = element("span", "owner");
    owner.append(element("span", "avatar", task.owner.slice(-1)), element("span", "", task.owner));
    const overdue = task.dueDate < localDate() && task.status !== "已完成";
    meta.append(owner, element("span", "meta-divider", "·"), element("span", overdue ? "overdue" : "", `${formatDate(task.dueDate)}${overdue ? " · 已逾期" : " 完成"}`));
    card.append(meta);
    const footer = element("div", "task-card-footer");
    const status = element("select", "status-control");
    status.setAttribute("aria-label", `${task.title}的進度狀態`);
    STATUSES.forEach((name) => status.append(new Option(name, name)));
    status.value = task.status;
    status.addEventListener("change", () => {
      const next = tasks.map((item) => item.id === task.id ? { ...item, status: status.value } : item);
      if (!commit(next, "進度已更新並儲存。")) status.value = task.status;
    });
    const actions = element("div", "task-actions");
    const edit = element("button", "task-action", "修改");
    edit.type = "button";
    edit.setAttribute("aria-label", `修改${task.title}`);
    edit.addEventListener("click", () => editTask(task.id));
    const remove = element("button", "task-action delete", "刪除");
    remove.type = "button";
    remove.setAttribute("aria-label", `刪除${task.title}`);
    remove.addEventListener("click", () => {
      deletingId = task.id;
      $("#delete-description").textContent = task.title;
      $("#delete-dialog").returnValue = "cancel";
      $("#delete-dialog").showModal();
    });
    actions.append(edit, remove);
    footer.append(status, actions);
    card.append(footer);
    return card;
  }
  function render() {
    const completed = tasks.filter((task) => task.status === "已完成").length;
    const inProgress = tasks.filter((task) => task.status === "進行中").length;
    const rate = tasks.length ? Math.round(completed / tasks.length * 100) : 0;
    $("#stat-total").textContent = tasks.length;
    $("#stat-progress").textContent = inProgress;
    $("#stat-completed").textContent = completed;
    $("#stat-rate").replaceChildren(document.createTextNode(rate), element("span", "", "%"));
    $("#completion-progress").value = rate;
    document.querySelectorAll("[data-count]").forEach((node) => {
      node.textContent = node.dataset.count === "全部" ? tasks.length : tasks.filter((task) => task.status === node.dataset.count).length;
    });
    const search = $("#search").value.trim().toLocaleLowerCase();
    const category = $("#category-filter").value;
    const filtered = tasks.filter((task) => (statusFilter === "全部" || task.status === statusFilter) &&
      (category === "全部" || task.category === category) &&
      [task.title, task.owner, task.notes, task.category].join(" ").toLocaleLowerCase().includes(search))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
    $("#list-count").textContent = filtered.length;
    $("#result-summary").textContent = `共 ${tasks.length} 項工作，顯示 ${filtered.length} 項`;
    $("#task-list").replaceChildren(...filtered.map(renderTask));
    $("#empty-state").hidden = filtered.length !== 0;
  }
  function resetForm() {
    editingId = null;
    form.reset();
    $("#task-due").value = localDate();
    $("#editor-title").textContent = "新增待辦事項";
    $("#editor-description").textContent = "為下一步，留下一個安排。";
    $("#save-button").textContent = "＋ 新增事項";
    $("#cancel-edit").hidden = true;
    $("#form-error").hidden = true;
  }
  function editTask(id) {
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    editingId = id;
    $("#task-title").value = task.title;
    $("#task-owner").value = task.owner;
    $("#task-category").value = task.category;
    $("#task-due").value = task.dueDate;
    $("#task-status").value = task.status;
    $("#task-notes").value = task.notes;
    $("#editor-title").textContent = "修改待辦事項";
    $("#editor-description").textContent = "更新細節，讓安排更貼近現場。";
    $("#save-button").textContent = "儲存修改";
    $("#cancel-edit").hidden = false;
    $("#form-error").hidden = true;
    $("#editor-panel").scrollIntoView({ behavior: "smooth", block: "center" });
    $("#task-title").focus({ preventScroll: true });
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const item = { id: editingId || createId(), title: $("#task-title").value.trim(), owner: $("#task-owner").value.trim(),
      category: $("#task-category").value, dueDate: $("#task-due").value, status: $("#task-status").value, notes: $("#task-notes").value.trim() };
    if (!validTask(item)) {
      $("#form-error").textContent = "請填寫有效的事項名稱、負責人與日期；名稱及負責人不可只有空白。";
      $("#form-error").hidden = false;
      return;
    }
    if (editingId && !tasks.some((task) => task.id === editingId)) {
      notify("此筆資料已在其他分頁刪除，請重新新增。");
      resetForm();
      return;
    }
    const next = editingId ? tasks.map((task) => task.id === editingId ? item : task) : [...tasks, item];
    if (commit(next, editingId ? "待辦修改已儲存。" : "新待辦已加入，今天也向前一步。")) resetForm();
  });
  $("#delete-dialog").addEventListener("close", () => {
    if ($("#delete-dialog").returnValue === "delete" && deletingId) {
      if (commit(tasks.filter((task) => task.id !== deletingId), "待辦已刪除。") && editingId === deletingId) resetForm();
    }
    deletingId = null;
  });
  $("#cancel-edit").addEventListener("click", resetForm);
  $("#new-task-button").addEventListener("click", () => {
    resetForm();
    $("#editor-panel").scrollIntoView({ behavior: "smooth", block: "center" });
    $("#task-title").focus({ preventScroll: true });
  });
  $("#search").addEventListener("input", render);
  $("#category-filter").addEventListener("change", render);
  document.querySelectorAll(".status-tab").forEach((tab) => tab.addEventListener("click", () => {
    statusFilter = tab.dataset.filter;
    document.querySelectorAll(".status-tab").forEach((button) => {
      const active = button === tab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    render();
  }));
  $("#capture-button").addEventListener("click", () => {
    const active = document.body.classList.toggle("capture-mode");
    $("#capture-button").setAttribute("aria-pressed", String(active));
    $("#capture-button").textContent = active ? "結束截圖模式" : "截圖模式";
    $(".capture-hint").hidden = !active;
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    try {
      const latest = readTasks();
      tasks = latest || [];
      storageBlocked = false;
      if (editingId && !tasks.some((task) => task.id === editingId)) resetForm();
      render();
      notify("已同步其他分頁的資料變更。未儲存的編輯仍保留。" );
    } catch {
      storageBlocked = true;
      storageError("其他分頁的資料無法讀取，已停止寫入；請備份後確認儲存內容。");
    }
  });

  $("#today-label").textContent = new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(new Date());
  const demo = [
    { id: "demo-1", title: "基礎工程放樣查驗", category: "品質查驗", owner: "示範負責人甲", dueDate: dateOffset(1), status: "待處理", notes: "核對軸線與標高，整理查驗紀錄。" },
    { id: "demo-2", title: "鋼筋材料進場盤點", category: "材料", owner: "示範負責人乙", dueDate: localDate(), status: "進行中", notes: "清點數量，確認規格及材料標示。" },
    { id: "demo-3", title: "工區安全巡檢", category: "安全衛生", owner: "示範負責人丙", dueDate: localDate(), status: "已完成", notes: "確認防護設施與作業動線，完成巡檢紀錄。" }
  ];
  try {
    const saved = readTasks();
    tasks = saved === null ? demo : saved;
    if (saved === null) persist(tasks);
    else $("#storage-label").textContent = "已載入此瀏覽器的資料";
  } catch {
    storageBlocked = true;
    tasks = demo;
    storageError("無法讀取 localStorage；目前僅顯示示範資料，且已停止寫入以保護原資料。請改用正常瀏覽模式與 HTTP 網址；若資料格式損壞，請先備份再處理。" );
  }
  resetForm();
  render();
})();
