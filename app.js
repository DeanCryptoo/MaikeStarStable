const DEFAULT_LANGUAGE = "en";
const DATA_URL = "data/items.json";
const STORAGE_KEY = "starstable-checklist-state-v3";
const LEGACY_STORAGE_KEYS = ["starstable-checklist-state-v2", "starstable-checklist-state-v1"];
const PAGE_SIZE = 220;
const MOBILE_BREAKPOINT = 1120;
const LANGUAGE_META = {
  de: "Deutsch",
  en: "English",
  fr: "Français",
  pl: "Polski",
  se: "Svenska",
};

const CATEGORY_ORDER = [
  "clothes",
  "equipment",
  "decorations",
  "accessories",
  "hairstyles",
  "makeup",
  "horses",
  "bags",
  "pets",
];

const CATEGORY_META = {
  clothes: {
    label: "Clothes",
    icon: "https://ssodb.bplaced.net/db/media/images/menu/sign-clothes.jpg",
  },
  equipment: {
    label: "Equipment",
    icon: "https://ssodb.bplaced.net/db/media/images/menu/sign-equipment.jpg",
  },
  decorations: {
    label: "Decorations",
    icon: "https://ssodb.bplaced.net/db/media/images/menu/sign-decoration.jpg",
  },
  accessories: {
    label: "Accessories",
    icon: "https://ssodb.bplaced.net/db/media/images/menu/sign-accessories.jpg",
  },
  hairstyles: {
    label: "Hairstyles",
    icon: "https://ssodb.bplaced.net/db/media/images/menu/sign-hairstyle.jpg",
  },
  makeup: {
    label: "Makeup",
    icon: "https://ssodb.bplaced.net/db/media/images/menu/sign-makeup.jpg",
  },
  horses: {
    label: "Horses",
    icon: "https://ssodb.bplaced.net/db/media/images/menu/sign-horses.jpg",
  },
  bags: {
    label: "Bags",
    icon: "https://ssodb.bplaced.net/db/media/images/menu/sign-bags.jpg",
  },
  pets: {
    label: "Pets",
    icon: "https://ssodb.bplaced.net/db/media/images/menu/sign-pets.jpg",
  },
};

const DEFAULT_UI = {
  language: DEFAULT_LANGUAGE,
  searchText: "",
  ownedOnly: false,
  favoritesOnly: false,
  newOnly: false,
  activeCategory: null,
  locationFilter: "",
  shopFilter: "",
  typeFilter: "",
};

const dom = {
  mobileMenuBtn: document.getElementById("mobileMenuBtn"),
  mobileMenuClose: document.getElementById("mobileMenuClose"),
  menuBackdrop: document.getElementById("menuBackdrop"),
  sideMenu: document.getElementById("sideMenu"),
  languageSelect: document.getElementById("languageSelect"),
  searchInput: document.getElementById("searchInput"),
  ownedOnlyToggle: document.getElementById("ownedOnlyToggle"),
  favoritesOnlyToggle: document.getElementById("favoritesOnlyToggle"),
  newOnlyToggle: document.getElementById("newOnlyToggle"),
  locationFilter: document.getElementById("locationFilter"),
  shopFilter: document.getElementById("shopFilter"),
  typeFilter: document.getElementById("typeFilter"),
  clearFiltersBtn: document.getElementById("clearFiltersBtn"),
  activeFilters: document.getElementById("activeFilters"),
  categorySidebar: document.getElementById("categorySidebar"),
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
  favorites: {},
  owned: {},
  language: DEFAULT_LANGUAGE,
  activeCategory: null,
  ui: { ...DEFAULT_UI },
  renderLimit: PAGE_SIZE,
  datasets: {},
  datasetLoads: {},
};

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeLanguage(language) {
  return Object.hasOwn(LANGUAGE_META, language) ? language : DEFAULT_LANGUAGE;
}

function getLanguageJsonUrl(language) {
  return language === DEFAULT_LANGUAGE ? DATA_URL : `data/items-${language}.json`;
}

function getLanguageScriptUrl(language) {
  return `data/items-${language}.js`;
}

function getLoadedLanguageDataset(language) {
  if (language === DEFAULT_LANGUAGE && globalThis.STARSTABLE_ITEMS && typeof globalThis.STARSTABLE_ITEMS === "object") {
    return globalThis.STARSTABLE_ITEMS;
  }
  if (globalThis.STARSTABLE_ITEMS_BY_LANG && typeof globalThis.STARSTABLE_ITEMS_BY_LANG === "object") {
    return globalThis.STARSTABLE_ITEMS_BY_LANG[language] || null;
  }
  return null;
}

function loadLanguageScript(language) {
  const src = getLanguageScriptUrl(language);
  if (appState.datasetLoads[language]) {
    return appState.datasetLoads[language];
  }

  appState.datasetLoads[language] = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-lang-dataset="${language}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.defer = true;
    script.dataset.langDataset = language;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });

  return appState.datasetLoads[language];
}

async function loadDatasetForLanguage(language) {
  const normalizedLanguage = normalizeLanguage(language);
  if (appState.datasets[normalizedLanguage]) {
    return appState.datasets[normalizedLanguage];
  }

  const preloaded = getLoadedLanguageDataset(normalizedLanguage);
  if (preloaded) {
    appState.datasets[normalizedLanguage] = preloaded;
    return preloaded;
  }

  try {
    const response = await fetch(getLanguageJsonUrl(normalizedLanguage), { cache: "no-store" });
    if (response.ok) {
      const payload = await response.json();
      appState.datasets[normalizedLanguage] = payload;
      return payload;
    }
  } catch (error) {
    // `file://` fetch fails; fall through to script loading.
  }

  await loadLanguageScript(normalizedLanguage);
  const scriptedPayload = getLoadedLanguageDataset(normalizedLanguage);
  if (scriptedPayload) {
    appState.datasets[normalizedLanguage] = scriptedPayload;
    return scriptedPayload;
  }

  throw new Error(`Checklist payload did not load for language "${normalizedLanguage}".`);
}

function loadChecklistState() {
  try {
    let saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      for (const legacy of LEGACY_STORAGE_KEYS) {
        saved = localStorage.getItem(legacy);
        if (saved) break;
      }
    }
    if (!saved) return;

    const data = JSON.parse(saved);
    if (!data || typeof data !== "object") return;

    if (data.favorites && typeof data.favorites === "object") {
      appState.favorites = data.favorites;
    }
    if (data.owned && typeof data.owned === "object") {
      appState.owned = data.owned;
    }

    if (data.ui && typeof data.ui === "object") {
      const migrated = { ...DEFAULT_UI, ...data.ui };
      migrated.language = normalizeLanguage(migrated.language);
      if (!migrated.activeCategory && Array.isArray(migrated.selectedCategories)) {
        migrated.activeCategory = migrated.selectedCategories.length === 1 ? migrated.selectedCategories[0] : null;
      }
      appState.ui = migrated;
    }
  } catch (err) {
    console.warn("Failed to load saved checklist state.", err);
  }
}

function getCurrentUiState() {
  return {
    language: normalizeLanguage(dom.languageSelect.value || appState.language),
    searchText: dom.searchInput.value,
    ownedOnly: dom.ownedOnlyToggle.checked,
    favoritesOnly: dom.favoritesOnlyToggle.checked,
    newOnly: dom.newOnlyToggle.checked,
    activeCategory: appState.activeCategory,
    locationFilter: dom.locationFilter.value,
    shopFilter: dom.shopFilter.value,
    typeFilter: dom.typeFilter.value,
  };
}

function saveChecklistState() {
  try {
    const payload = {
      favorites: appState.favorites,
      owned: appState.owned,
      ui: getCurrentUiState(),
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn("Failed to save checklist state.", err);
  }
}

let saveTimer = null;
let lastTapInfo = null;
function scheduleSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = window.setTimeout(() => {
    saveChecklistState();
  }, 160);
}

function toggleOwnedState(itemId) {
  if (!itemId) return;
  setOwned(itemId, !isOwned(itemId));
  saveChecklistState();
  refreshView(false);
}

function isInteractiveCardTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("button, input, label, select, option, a, .details-toggle, .fav-btn, .owned-check"));
}

function isMobileMenuMode() {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
}

function setMobileMenu(open) {
  const active = Boolean(open && isMobileMenuMode());
  document.body.classList.toggle("menu-open", active);
  dom.mobileMenuBtn.setAttribute("aria-expanded", active ? "true" : "false");
}

function closeMobileMenu() {
  setMobileMenu(false);
}

function categoryLabel(category) {
  return CATEGORY_META[category]?.label || category.charAt(0).toUpperCase() + category.slice(1);
}

function initLanguageSelect() {
  const fragment = document.createDocumentFragment();
  for (const [code, label] of Object.entries(LANGUAGE_META)) {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = label;
    fragment.appendChild(option);
  }
  dom.languageSelect.innerHTML = "";
  dom.languageSelect.appendChild(fragment);
  dom.languageSelect.value = normalizeLanguage(appState.ui.language || DEFAULT_LANGUAGE);
}

async function hydrateLanguage(language) {
  const normalizedLanguage = normalizeLanguage(language);
  const payload = await loadDatasetForLanguage(normalizedLanguage);
  appState.language = normalizedLanguage;
  appState.allItems = Array.isArray(payload.items) ? payload.items : [];
  document.documentElement.lang = normalizedLanguage;
  dom.languageSelect.value = normalizedLanguage;
  if (!appState.allItems.length) {
    throw new Error(`Checklist payload did not include items for "${normalizedLanguage}".`);
  }
}

function isOwned(itemId) {
  return appState.owned[itemId] === true;
}

function isFavorite(itemId) {
  return appState.favorites[itemId] === true;
}

function setOwned(itemId, value) {
  if (value) appState.owned[itemId] = true;
  else delete appState.owned[itemId];
}

function setFavorite(itemId, value) {
  if (value) appState.favorites[itemId] = true;
  else delete appState.favorites[itemId];
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

function getCategoryScopedItems() {
  if (!appState.activeCategory) {
    return appState.allItems;
  }
  return appState.allItems.filter((item) => item.category === appState.activeCategory);
}

function getFilterContext() {
  return {
    needle: dom.searchInput.value.trim().toLowerCase(),
    ownedOnly: dom.ownedOnlyToggle.checked,
    favoritesOnly: dom.favoritesOnlyToggle.checked,
    newOnly: dom.newOnlyToggle.checked,
    location: dom.locationFilter.value,
    shop: dom.shopFilter.value,
    type: dom.typeFilter.value,
  };
}

function matchesFilterContext(item, context, excludeField = "") {
  if (appState.activeCategory && item.category !== appState.activeCategory) return false;
  if (context.needle && !textMatch(item, context.needle)) return false;
  if (context.ownedOnly && !isOwned(item.id)) return false;
  if (context.favoritesOnly && !isFavorite(item.id)) return false;
  if (context.newOnly && !item.isNew) return false;
  if (excludeField !== "location" && context.location && item.location !== context.location) return false;
  if (excludeField !== "shop" && context.shop && item.shop !== context.shop) return false;
  if (excludeField !== "type" && context.type && item.type !== context.type) return false;
  return true;
}

function uniqueSortedValues(items, key) {
  const seen = new Set();
  for (const item of items) {
    const value = item[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    seen.add(trimmed);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

function fillSelect(select, values, selected, label) {
  const fragment = document.createDocumentFragment();
  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = `All ${label}`;
  fragment.appendChild(defaultOption);

  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    fragment.appendChild(option);
  }

  select.innerHTML = "";
  select.appendChild(fragment);
  if (selected && values.includes(selected)) {
    select.value = selected;
  } else {
    select.value = "";
  }
}

function renderLoadingSkeletons(count = 10) {
  dom.itemsGrid.innerHTML = "";
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < count; i += 1) {
    const card = document.createElement("article");
    card.className = "item-card skeleton-card";
    card.innerHTML = [
      '<div class="skeleton media"></div>',
      '<div class="item-content">',
      '  <div class="skeleton line-lg"></div>',
      '  <div class="skeleton line-md"></div>',
      '  <div class="skeleton chip"></div>',
      '  <div class="skeleton line-sm"></div>',
      "</div>",
    ].join("");
    fragment.appendChild(card);
  }
  dom.itemsGrid.appendChild(fragment);
  dom.loadMoreBtn.hidden = true;
  dom.emptyState.hidden = true;
}

function refreshFilterOptions() {
  const context = getFilterContext();
  const sourceItems = getCategoryScopedItems();

  const locationItems = sourceItems.filter((item) => matchesFilterContext(item, context, "location"));
  const shopItems = sourceItems.filter((item) => matchesFilterContext(item, context, "shop"));
  const typeItems = sourceItems.filter((item) => matchesFilterContext(item, context, "type"));

  fillSelect(dom.locationFilter, uniqueSortedValues(locationItems, "location"), context.location, "locations");
  fillSelect(dom.shopFilter, uniqueSortedValues(shopItems, "shop"), context.shop, "shops");
  fillSelect(dom.typeFilter, uniqueSortedValues(typeItems, "type"), context.type, "types");
}

function makeCardInfo(item) {
  const quickRows = [];
  quickRows.push(
    `<div class="meta-row"><span class="meta-label">Category</span><span class="meta-value">${escapeHtml(
      categoryLabel(item.category)
    )}</span></div>`
  );
  if (item.type) {
    quickRows.push(
      `<div class="meta-row"><span class="meta-label">Type</span><span class="meta-value">${escapeHtml(
        item.type
      )}</span></div>`
    );
  }
  if (item.location) {
    quickRows.push(
      `<div class="meta-row"><span class="meta-label">Location</span><span class="meta-value">${escapeHtml(
        item.location
      )}</span></div>`
    );
  }

  const detailRows = [];
  if (item.subtype) {
    detailRows.push(
      `<div class="meta-row"><span class="meta-label">Subtype</span><span class="meta-value">${escapeHtml(
        item.subtype
      )}</span></div>`
    );
  }
  if (Number.isInteger(item.level) && item.level > 0) {
    detailRows.push(
      `<div class="meta-row"><span class="meta-label">Required level</span><span class="meta-value">${item.level}</span></div>`
    );
  }
  if (item.shop) {
    detailRows.push(
      `<div class="meta-row"><span class="meta-label">Shop</span><span class="meta-value">${escapeHtml(item.shop)}</span></div>`
    );
  }

  const priceTags = [];
  if (Number.isInteger(item.priceJs) && item.priceJs > 0) {
    priceTags.push(`<span class="price-tag js">${item.priceJs.toLocaleString()} JS</span>`);
  }
  if (Number.isInteger(item.priceSc) && item.priceSc > 0) {
    priceTags.push(`<span class="price-tag sc"><strong>${item.priceSc.toLocaleString()} SC</strong></span>`);
  }
  if (!priceTags.length) {
    priceTags.push('<span class="price-tag none">No price listed</span>');
  }

  return {
    quickHtml: `<div class="price-row">${priceTags.join("")}</div>${quickRows.join("")}`,
    detailsHtml: detailRows.join(""),
    hasDetails: detailRows.length > 0,
  };
}

function buildCard(item, index) {
  const fragment = dom.cardTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".item-card");
  const favBtn = fragment.querySelector(".fav-btn");
  const img = fragment.querySelector(".item-image");
  const title = fragment.querySelector(".item-title");
  const desc = fragment.querySelector(".item-desc");
  const quick = fragment.querySelector(".item-quick");
  const detailsToggle = fragment.querySelector(".details-toggle");
  const meta = fragment.querySelector(".item-meta");
  const ownedCheckbox = fragment.querySelector(".owned-check input");

  card.dataset.itemId = item.id;
  card.style.setProperty("--stagger", String(index % 16));

  const owned = isOwned(item.id);
  const favorite = isFavorite(item.id);

  card.classList.toggle("owned", owned);
  favBtn.classList.toggle("active", favorite);
  favBtn.textContent = favorite ? "\u2605" : "\u2606";
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

  const cardInfo = makeCardInfo(item);
  quick.innerHTML = cardInfo.quickHtml;
  meta.innerHTML = cardInfo.detailsHtml;
  meta.hidden = true;

  detailsToggle.dataset.action = "toggle-details";
  detailsToggle.setAttribute("aria-expanded", "false");
  if (!cardInfo.hasDetails) {
    detailsToggle.hidden = true;
  }

  return fragment;
}

function renderCategorySidebar() {
  const counts = {};
  for (const item of appState.allItems) {
    counts[item.category] = (counts[item.category] || 0) + 1;
  }

  const categoryList = CATEGORY_ORDER.filter((category) => counts[category]).concat(
    Object.keys(counts).filter((category) => !CATEGORY_ORDER.includes(category)).sort((a, b) => a.localeCompare(b))
  );

  const fragment = document.createDocumentFragment();

  const allButton = document.createElement("button");
  allButton.type = "button";
  allButton.className = "side-category" + (appState.activeCategory ? "" : " active");
  allButton.dataset.category = "all";
  allButton.innerHTML =
    '<img class="side-icon" src="https://ssodb.bplaced.net/db/media/images/menu/sign-home.jpg" alt="All" referrerpolicy="no-referrer">' +
    '<span class="side-label">All items</span>' +
    `<span class="side-count">${appState.allItems.length.toLocaleString()}</span>`;
  fragment.appendChild(allButton);

  for (const category of categoryList) {
    const meta = CATEGORY_META[category] || {};
    const button = document.createElement("button");
    button.type = "button";
    button.className = "side-category" + (appState.activeCategory === category ? " active" : "");
    button.dataset.category = category;
    button.innerHTML =
      `<img class="side-icon" src="${escapeHtml(meta.icon || "")}" alt="${escapeHtml(
        categoryLabel(category)
      )}" referrerpolicy="no-referrer">` +
      `<span class="side-label">${escapeHtml(categoryLabel(category))}</span>` +
      `<span class="side-count">${(counts[category] || 0).toLocaleString()}</span>`;
    fragment.appendChild(button);
  }

  dom.categorySidebar.innerHTML = "";
  dom.categorySidebar.appendChild(fragment);
}

function applyFilters() {
  const context = getFilterContext();
  appState.filteredItems = appState.allItems.filter((item) => matchesFilterContext(item, context));
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

function updateActiveFiltersDisplay() {
  const chips = [];
  const context = getFilterContext();

  if (appState.activeCategory) {
    chips.push({ key: "activeCategory", label: `Category: ${categoryLabel(appState.activeCategory)}` });
  }
  if (context.location) chips.push({ key: "locationFilter", label: `Location: ${context.location}` });
  if (context.shop) chips.push({ key: "shopFilter", label: `Shop: ${context.shop}` });
  if (context.type) chips.push({ key: "typeFilter", label: `Type: ${context.type}` });
  if (context.needle) chips.push({ key: "searchText", label: `Search: "${context.needle}"` });
  if (context.ownedOnly) chips.push({ key: "ownedOnly", label: "Owned only" });
  if (context.favoritesOnly) chips.push({ key: "favoritesOnly", label: "Favorites only" });
  if (context.newOnly) chips.push({ key: "newOnly", label: "New items only" });

  if (!chips.length) {
    dom.activeFilters.innerHTML = '<span class="filter-hint">No active filters.</span>';
    return;
  }

  dom.activeFilters.innerHTML = chips
    .map(
      (chip) =>
        `<button type="button" class="filter-chip" data-clear="${escapeHtml(chip.key)}">${escapeHtml(chip.label)} <span aria-hidden="true">&times;</span></button>`
    )
    .join("");
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
  updateActiveFiltersDisplay();
  renderItems();
}

function applyUiStateFromStorage() {
  dom.languageSelect.value = normalizeLanguage(appState.ui.language || appState.language);
  dom.searchInput.value = appState.ui.searchText || "";
  dom.ownedOnlyToggle.checked = Boolean(appState.ui.ownedOnly);
  dom.favoritesOnlyToggle.checked = Boolean(appState.ui.favoritesOnly);
  dom.newOnlyToggle.checked = Boolean(appState.ui.newOnly);

  if (appState.ui.activeCategory && CATEGORY_META[appState.ui.activeCategory]) {
    appState.activeCategory = appState.ui.activeCategory;
  } else {
    appState.activeCategory = null;
  }

  renderCategorySidebar();
  refreshFilterOptions();

  if (appState.ui.locationFilter) {
    dom.locationFilter.value = [...dom.locationFilter.options].some((o) => o.value === appState.ui.locationFilter)
      ? appState.ui.locationFilter
      : "";
  }
  if (appState.ui.shopFilter) {
    dom.shopFilter.value = [...dom.shopFilter.options].some((o) => o.value === appState.ui.shopFilter)
      ? appState.ui.shopFilter
      : "";
  }
  if (appState.ui.typeFilter) {
    dom.typeFilter.value = [...dom.typeFilter.options].some((o) => o.value === appState.ui.typeFilter)
      ? appState.ui.typeFilter
      : "";
  }

  refreshFilterOptions();
}

function setActiveCategory(category) {
  appState.activeCategory = category && category !== "all" ? category : null;
  renderCategorySidebar();
  refreshFilterOptions();
}

function clearAllFilters() {
  appState.activeCategory = null;
  dom.searchInput.value = "";
  dom.ownedOnlyToggle.checked = false;
  dom.favoritesOnlyToggle.checked = false;
  dom.newOnlyToggle.checked = false;

  renderCategorySidebar();
  refreshFilterOptions();
  dom.locationFilter.value = "";
  dom.shopFilter.value = "";
  dom.typeFilter.value = "";

  saveChecklistState();
  refreshView(true);
}

function clearOneFilter(key) {
  switch (key) {
    case "activeCategory":
      appState.activeCategory = null;
      renderCategorySidebar();
      break;
    case "locationFilter":
      dom.locationFilter.value = "";
      break;
    case "shopFilter":
      dom.shopFilter.value = "";
      break;
    case "typeFilter":
      dom.typeFilter.value = "";
      break;
    case "searchText":
      dom.searchInput.value = "";
      break;
    case "ownedOnly":
      dom.ownedOnlyToggle.checked = false;
      break;
    case "favoritesOnly":
      dom.favoritesOnlyToggle.checked = false;
      break;
    case "newOnly":
      dom.newOnlyToggle.checked = false;
      break;
    default:
      break;
  }

  refreshFilterOptions();
  saveChecklistState();
  refreshView(true);
}

function attachEventHandlers() {
  dom.languageSelect.addEventListener("change", async () => {
    const previousLanguage = appState.language;
    appState.ui = { ...DEFAULT_UI, ...getCurrentUiState(), language: normalizeLanguage(dom.languageSelect.value) };
    try {
      await hydrateLanguage(appState.ui.language);
      applyUiStateFromStorage();
      saveChecklistState();
      refreshView(true);
    } catch (error) {
      console.error(error);
      appState.ui.language = previousLanguage;
      dom.languageSelect.value = previousLanguage;
      await hydrateLanguage(previousLanguage);
      applyUiStateFromStorage();
      refreshView(true);
      alert("Could not load that language dataset.");
    }
  });

  dom.mobileMenuBtn.addEventListener("click", () => {
    const isOpen = document.body.classList.contains("menu-open");
    setMobileMenu(!isOpen);
  });
  dom.mobileMenuClose.addEventListener("click", () => closeMobileMenu());
  dom.menuBackdrop.addEventListener("click", () => closeMobileMenu());
  window.addEventListener("resize", () => {
    if (!isMobileMenuMode()) {
      closeMobileMenu();
    }
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMobileMenu();
    }
  });

  dom.searchInput.addEventListener("input", () => {
    refreshFilterOptions();
    scheduleSave();
    refreshView(true);
  });

  const filterChangeHandler = () => {
    refreshFilterOptions();
    scheduleSave();
    refreshView(true);
  };
  dom.ownedOnlyToggle.addEventListener("change", filterChangeHandler);
  dom.favoritesOnlyToggle.addEventListener("change", filterChangeHandler);
  dom.newOnlyToggle.addEventListener("change", filterChangeHandler);
  dom.locationFilter.addEventListener("change", filterChangeHandler);
  dom.shopFilter.addEventListener("change", filterChangeHandler);
  dom.typeFilter.addEventListener("change", filterChangeHandler);

  dom.clearFiltersBtn.addEventListener("click", () => {
    clearAllFilters();
  });

  dom.activeFilters.addEventListener("click", (event) => {
    const target = event.target;
    const button = target instanceof HTMLElement ? target.closest(".filter-chip") : null;
    if (!(button instanceof HTMLButtonElement)) return;
    const key = button.dataset.clear;
    if (!key) return;
    clearOneFilter(key);
  });

  dom.categorySidebar.addEventListener("click", (event) => {
    const target = event.target;
    const button = target instanceof HTMLElement ? target.closest(".side-category") : null;
    if (!(button instanceof HTMLButtonElement)) return;
    const category = button.dataset.category || "all";
    setActiveCategory(category);
    saveChecklistState();
    refreshView(true);
    if (isMobileMenuMode()) {
      closeMobileMenu();
    }
  });

  dom.itemsGrid.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.action === "toggle-details") {
      const detailsButton = target;
      const card = detailsButton.closest(".item-card");
      if (!(card instanceof HTMLElement)) return;
      const panel = card.querySelector(".item-meta");
      if (!(panel instanceof HTMLElement)) return;
      const open = detailsButton.getAttribute("aria-expanded") === "true";
      detailsButton.setAttribute("aria-expanded", open ? "false" : "true");
      detailsButton.textContent = open ? "Details" : "Hide details";
      panel.hidden = open;
      return;
    }
    if (target.dataset.action !== "favorite") return;

    const itemId = target.dataset.itemId;
    if (!itemId) return;
    setFavorite(itemId, !isFavorite(itemId));
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

  dom.itemsGrid.addEventListener("dblclick", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (isInteractiveCardTarget(target)) return;

    const card = target.closest(".item-card");
    if (!(card instanceof HTMLElement)) return;
    const itemId = card.dataset.itemId;
    if (!itemId) return;
    toggleOwnedState(itemId);
  });

  dom.itemsGrid.addEventListener(
    "touchend",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (isInteractiveCardTarget(target)) return;

      const card = target.closest(".item-card");
      if (!(card instanceof HTMLElement)) return;
      const itemId = card.dataset.itemId;
      if (!itemId) return;

      const touch = event.changedTouches && event.changedTouches[0] ? event.changedTouches[0] : null;
      const now = Date.now();
      const x = touch ? touch.clientX : 0;
      const y = touch ? touch.clientY : 0;

      if (
        lastTapInfo &&
        lastTapInfo.itemId === itemId &&
        now - lastTapInfo.time < 330 &&
        Math.abs(lastTapInfo.x - x) < 30 &&
        Math.abs(lastTapInfo.y - y) < 30
      ) {
        lastTapInfo = null;
        event.preventDefault();
        toggleOwnedState(itemId);
        return;
      }

      lastTapInfo = { itemId, time: now, x, y };
    },
    { passive: false }
  );

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
        ui: getCurrentUiState(),
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
      if (importedState.ui && typeof importedState.ui === "object") {
        appState.ui = { ...DEFAULT_UI, ...importedState.ui };
        appState.ui.language = normalizeLanguage(appState.ui.language);
      }

      await hydrateLanguage(appState.ui.language || appState.language || DEFAULT_LANGUAGE);
      applyUiStateFromStorage();
      saveChecklistState();
      refreshView(true);
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

  window.addEventListener("beforeunload", () => {
    saveChecklistState();
  });
}

async function bootstrap() {
  loadChecklistState();
  renderLoadingSkeletons();
  initLanguageSelect();
  await hydrateLanguage(appState.ui.language || DEFAULT_LANGUAGE);
  applyUiStateFromStorage();
  attachEventHandlers();
  refreshView(true);
}

bootstrap().catch((error) => {
  console.error(error);
  dom.itemsGrid.innerHTML = "";
  dom.loadMoreBtn.hidden = true;
  dom.emptyState.hidden = false;
  if (location.protocol === "file:") {
    dom.emptyState.innerHTML =
      "<h3>Data failed to load</h3><p>Use index.html with data/items.js in the same folder, or run a local server.</p>";
  } else {
    dom.emptyState.innerHTML = "<h3>Data failed to load</h3><p>Could not load checklist data.</p>";
  }
});
