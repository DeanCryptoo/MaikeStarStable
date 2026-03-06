const DATA_URL = "data/items.json";
const STORAGE_KEY = "starstable-checklist-state-v1";
const PAGE_SIZE = 220;

const dom = {
  searchInput: document.getElementById("searchInput"),
  ownedOnlyToggle: document.getElementById("ownedOnlyToggle"),
  favoritesOnlyToggle: document.getElementById("favoritesOnlyToggle"),
  newOnlyToggle: document.getElementById("newOnlyToggle"),
  categoryChips: document.getElementById("categoryChips"),
  toggleAllCategoriesBtn: document.getElementById("toggleAllCategoriesBtn"),
  exportStateBtn: document.getElementById("exportStateBtn"),
  importStateBtn: document.getElementById("importStateBtn"),
  clearStateBtn: document.getElementById("clearStateBtn"),
  importFileInput: document.getElementById("importFileInput"),
  ownedCount: document.getElementById("ownedCount"),
  totalCount: document.getElementById("totalCount"),
  favoritesCount: document.getElementById("favoritesCount"),
  filteredCount: document.getElementById("filteredCount"),
  progressFill: document.getElementById("progressFill"),
  itemsGrid: document.getElementById("itemsGrid"),
  emptyState: document.getElementById("emptyState"),
  loadMoreBtn: document.getElementById("loadMoreBtn"),
  cardTemplate: document.getElementById("itemCardTemplate"),
};

const appState = {
  allItems: [],
  filteredItems: [],
  selectedCategories: new Set(),
  favorites: {},
  owned: {},
  renderLimit: PAGE_SIZE,
};

function loadChecklistState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    const data = JSON.parse(saved);
    if (data && typeof data === "object") {
      if (data.favorites && typeof data.favorites === "object") {
        appState.favorites = data.favorites;
      }
      if (data.owned && typeof data.owned === "object") {
        appState.owned = data.owned;
      }
    }
  } catch (err) {
    console.warn("Failed to load saved checklist state.", err);
  }
}

function saveChecklistState() {
  const payload = {
    favorites: appState.favorites,
    owned: appState.owned,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function isOwned(itemId) {
  return appState.owned[itemId] === true;
}

function isFavorite(itemId) {
  return appState.favorites[itemId] === true;
}

function setOwned(itemId, value) {
  if (value) {
    appState.owned[itemId] = true;
  } else {
    delete appState.owned[itemId];
  }
}

function setFavorite(itemId, value) {
  if (value) {
    appState.favorites[itemId] = true;
  } else {
    delete appState.favorites[itemId];
  }
}

function prettyCategory(category) {
  return category
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function textMatch(item, needle) {
  if (!needle) return true;
  const hay = [
    item.title,
    item.description,
    item.type,
    item.subtype,
    item.location,
    item.shop,
    item.category,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}

function formatPrice(js, sc) {
  const parts = [];
  if (Number.isInteger(js) && js > 0) parts.push(`${js} JS`);
  if (Number.isInteger(sc) && sc > 0) parts.push(`${sc} SC`);
  return parts.length ? parts.join(" • ") : "No price listed";
}

function makeMetaRows(item) {
  const rows = [
    `Category: ${prettyCategory(item.category)}`,
    item.type ? `Type: ${item.type}` : "",
    item.subtype ? `Subtype: ${item.subtype}` : "",
    item.level && item.level > 0 ? `Required level: ${item.level}` : "",
    item.location ? `Location: ${item.location}` : "",
    formatPrice(item.priceJs, item.priceSc),
  ].filter(Boolean);
  return rows;
}

function buildCard(item, index) {
  const fragment = dom.cardTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".item-card");
  const favBtn = fragment.querySelector(".fav-btn");
  const img = fragment.querySelector(".item-image");
  const title = fragment.querySelector(".item-title");
  const desc = fragment.querySelector(".item-desc");
  const meta = fragment.querySelector(".item-meta");
  const ownedCheckbox = fragment.querySelector(".owned-check input");

  card.dataset.itemId = item.id;
  card.style.setProperty("--stagger", String(index % 18));

  const owned = isOwned(item.id);
  const favorite = isFavorite(item.id);

  card.classList.toggle("owned", owned);
  favBtn.classList.toggle("active", favorite);
  favBtn.textContent = favorite ? "★" : "☆";
  favBtn.dataset.action = "favorite";
  favBtn.dataset.itemId = item.id;

  ownedCheckbox.dataset.action = "owned";
  ownedCheckbox.dataset.itemId = item.id;
  ownedCheckbox.checked = owned;

  img.src = item.imageUrl || "";
  img.alt = item.title || "Star Stable item";
  img.referrerPolicy = "no-referrer";

  title.textContent = item.title || "Unnamed item";
  desc.textContent = item.description || "No description";

  const metaRows = makeMetaRows(item);
  meta.innerHTML = metaRows.map((line) => `<span>${line}</span>`).join("");
  return fragment;
}

function renderCategoryChips() {
  const categories = [...new Set(appState.allItems.map((item) => item.category))];
  const counts = categories.reduce((acc, category) => {
    acc[category] = appState.allItems.filter((item) => item.category === category).length;
    return acc;
  }, {});

  const fragment = document.createDocumentFragment();
  for (const category of categories) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip active";
    chip.dataset.category = category;
    chip.textContent = `${prettyCategory(category)} (${counts[category]})`;
    fragment.appendChild(chip);
    appState.selectedCategories.add(category);
  }
  dom.categoryChips.innerHTML = "";
  dom.categoryChips.appendChild(fragment);
}

function applyFilters() {
  const needle = dom.searchInput.value.trim().toLowerCase();
  const ownedOnly = dom.ownedOnlyToggle.checked;
  const favoritesOnly = dom.favoritesOnlyToggle.checked;
  const newOnly = dom.newOnlyToggle.checked;

  appState.filteredItems = appState.allItems.filter((item) => {
    if (!appState.selectedCategories.has(item.category)) return false;
    if (ownedOnly && !isOwned(item.id)) return false;
    if (favoritesOnly && !isFavorite(item.id)) return false;
    if (newOnly && !item.isNew) return false;
    if (!textMatch(item, needle)) return false;
    return true;
  });
}

function updateStats() {
  const total = appState.allItems.length;
  const ownedCount = Object.keys(appState.owned).length;
  const favoritesCount = Object.keys(appState.favorites).length;
  const filteredCount = appState.filteredItems.length;
  const ownedPct = total > 0 ? Math.round((ownedCount / total) * 100) : 0;

  dom.ownedCount.textContent = ownedCount.toLocaleString();
  dom.totalCount.textContent = `/ ${total.toLocaleString()} owned (${ownedPct}%)`;
  dom.favoritesCount.textContent = favoritesCount.toLocaleString();
  dom.filteredCount.textContent = filteredCount.toLocaleString();
  dom.progressFill.style.width = `${ownedPct}%`;
}

function renderItems() {
  const visibleItems = appState.filteredItems.slice(0, appState.renderLimit);
  dom.itemsGrid.innerHTML = "";

  const fragment = document.createDocumentFragment();
  visibleItems.forEach((item, index) => fragment.appendChild(buildCard(item, index)));
  dom.itemsGrid.appendChild(fragment);

  const hasResults = appState.filteredItems.length > 0;
  const hasMore = appState.filteredItems.length > appState.renderLimit;

  dom.emptyState.hidden = hasResults;
  dom.loadMoreBtn.hidden = !hasMore;
}

function refreshView(resetLimit = true) {
  if (resetLimit) {
    appState.renderLimit = PAGE_SIZE;
  }
  applyFilters();
  updateStats();
  renderItems();
}

function attachEventHandlers() {
  dom.searchInput.addEventListener("input", () => refreshView(true));
  dom.ownedOnlyToggle.addEventListener("change", () => refreshView(true));
  dom.favoritesOnlyToggle.addEventListener("change", () => refreshView(true));
  dom.newOnlyToggle.addEventListener("change", () => refreshView(true));

  dom.categoryChips.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const category = target.dataset.category;
    if (!category) return;
    if (appState.selectedCategories.has(category)) {
      appState.selectedCategories.delete(category);
      target.classList.remove("active");
    } else {
      appState.selectedCategories.add(category);
      target.classList.add("active");
    }
    refreshView(true);
  });

  dom.toggleAllCategoriesBtn.addEventListener("click", () => {
    const chips = [...dom.categoryChips.querySelectorAll(".chip")];
    const allSelected = chips.every((chip) => chip.classList.contains("active"));
    appState.selectedCategories.clear();
    for (const chip of chips) {
      if (!allSelected) {
        chip.classList.add("active");
        if (chip.dataset.category) appState.selectedCategories.add(chip.dataset.category);
      } else {
        chip.classList.remove("active");
      }
    }
    refreshView(true);
  });

  dom.itemsGrid.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.action !== "favorite") return;

    const itemId = target.dataset.itemId;
    if (!itemId) return;
    const next = !isFavorite(itemId);
    setFavorite(itemId, next);
    saveChecklistState();
    refreshView(false);
  });

  dom.itemsGrid.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.dataset.action !== "owned") return;

    const itemId = target.dataset.itemId;
    if (!itemId) return;
    setOwned(itemId, target.checked);
    saveChecklistState();
    refreshView(false);
  });

  dom.loadMoreBtn.addEventListener("click", () => {
    appState.renderLimit += PAGE_SIZE;
    renderItems();
  });

  dom.exportStateBtn.addEventListener("click", () => {
    const exportPayload = {
      exportedAt: new Date().toISOString(),
      source: "starstable-checklist",
      state: {
        favorites: appState.favorites,
        owned: appState.owned,
      },
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `starstable-checklist-state-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  });

  dom.importStateBtn.addEventListener("click", () => {
    dom.importFileInput.click();
  });

  dom.importFileInput.addEventListener("change", async () => {
    const file = dom.importFileInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const importedState = parsed.state || parsed;
      if (importedState.favorites && typeof importedState.favorites === "object") {
        appState.favorites = importedState.favorites;
      }
      if (importedState.owned && typeof importedState.owned === "object") {
        appState.owned = importedState.owned;
      }
      saveChecklistState();
      refreshView(false);
      alert("Checklist state imported.");
    } catch (err) {
      alert("Invalid JSON file.");
      console.error(err);
    } finally {
      dom.importFileInput.value = "";
    }
  });

  dom.clearStateBtn.addEventListener("click", () => {
    const confirmed = window.confirm("Clear all owned and favorite checks?");
    if (!confirmed) return;
    appState.owned = {};
    appState.favorites = {};
    saveChecklistState();
    refreshView(false);
  });
}

async function bootstrap() {
  loadChecklistState();

  let payload = null;
  if (globalThis.STARSTABLE_ITEMS && typeof globalThis.STARSTABLE_ITEMS === "object") {
    payload = globalThis.STARSTABLE_ITEMS;
  } else {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load ${DATA_URL} (${response.status})`);
    }
    payload = await response.json();
  }

  appState.allItems = Array.isArray(payload.items) ? payload.items : [];
  if (!appState.allItems.length) {
    throw new Error("Checklist payload did not include items.");
  }

  renderCategoryChips();
  attachEventHandlers();
  refreshView(true);
}

bootstrap().catch((error) => {
  console.error(error);
  dom.itemsGrid.innerHTML = "";
  dom.loadMoreBtn.hidden = true;
  dom.emptyState.hidden = false;
  if (location.protocol === "file:") {
    dom.emptyState.textContent =
      "Could not load checklist data. Use index.html with data/items.js in the same folder, or run a local server.";
  } else {
    dom.emptyState.textContent = "Could not load checklist data.";
  }
});
