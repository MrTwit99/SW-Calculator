const grid = document.querySelector("#stat-grid");
const filter = document.querySelector("#stat-filter");
const visibleCount = document.querySelector("#visible-count");
const emptyState = document.querySelector("#empty-state");
const categoryStatus = document.querySelector("#category-status");
const categoryButtons = document.querySelectorAll(".category-button");
let activeCategory = "all";

function parseNumber(value) {
  const normalized = value?.trim();
  if (!normalized || !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)\s*%?$/.test(normalized)) return NaN;
  return Number(normalized.replace("%", "").trim());
}

function makeShortName(name) {
  const aliases = {
    "flat hp": "HP", "hp%": "HP%", "flat attack": "ATK", "attack%": "ATK%",
    "flat defence": "DEF", "defence%": "DEF%", "speed": "SPD", "crit rate": "CR",
    "crit damage": "CD", "accuracy": "ACC", "resistance": "RES"
  };
  const normalizedName = name.toLowerCase();
  if (aliases[normalizedName]) return aliases[normalizedName];

  const hasPercent = name.includes("%");
  const initials = name.replace(/%/g, "").split(/\s+/).filter(Boolean)
    .map(word => word[0]).join("").slice(0, 4).toUpperCase();
  return `${initials || name.slice(0, 4).toUpperCase()}${hasPercent ? "%" : ""}`;
}

function parseRuneInfo(text) {
  return text.replace(/^\uFEFF/, "").split(/\r?\n\s*\r?\n/).map(block => {
    const lines = block.split(/\r?\n/).map(line => line.trim())
      .filter(line => line && !line.startsWith("#"));
    const name = lines.find(line => !line.includes("="));
    const fields = {};

    lines.filter(line => line.includes("=")).forEach(line => {
      const separator = line.indexOf("=");
      const key = line.slice(0, separator).trim().toLowerCase();
      fields[key] = line.slice(separator + 1).trim();
    });

    // A block is a stat only when its name, Min, and Max are all valid.
    if (!name || fields.min === undefined || fields.max === undefined) {
      console.warn("Ignored a rune_info.js block because it has no name, Min, or Max field.");
      return null;
    }
    const min = parseNumber(fields.min);
    const max = parseNumber(fields.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < 0 || min > max) {
      console.warn(`Ignored invalid stat \"${name}\". Min and Max must be non-negative numbers, and Max must be greater than or equal to Min.`);
      return null;
    }

    const unit = fields.min.includes("%") || fields.max.includes("%") || name.includes("%") ? "%" : "";
    const requestedCategories = (fields.category || "")
      .split(/[,|/]+/)
      .map(category => category.trim().toLowerCase())
      .filter(category => ["offensive", "defensive"].includes(category));
    const categories = [...new Set(requestedCategories)];
    if (categories.length === 0) categories.push("uncategorised");

    return {
      name,
      short: fields.short || makeShortName(name),
      min,
      max,
      unit,
      type: unit ? "Percent" : "Flat",
      categories
    };
  }).filter(Boolean);
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function formatValue(value, unit) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}${unit}`;
}

function resultCell(kind, base, multiplier, unit) {
  const result = base * multiplier;
  const shownBase = Number.isInteger(base) ? base : base.toFixed(1);
  return `<td><span class="value value--${kind}">${formatValue(result, unit)}</span>
    <span class="formula">${shownBase}${unit} &times; ${multiplier}</span></td>`;
}

function createCard(stat) {
  const average = (stat.min + stat.max) / 2;
  const categoryTags = stat.categories.map(category => {
    const label = category[0].toUpperCase() + category.slice(1);
    return `<span class="stat-card__category stat-card__category--${category}">${label}</span>`;
  }).join("");
  const rows = [1, 2, 3, 4].map(multiplier => `<tr>
    <td class="multiplier">${multiplier}&times;</td>
    ${resultCell("min", stat.min, multiplier, stat.unit)}
    ${resultCell("avg", average, multiplier, stat.unit)}
    ${resultCell("max", stat.max, multiplier, stat.unit)}</tr>`).join("");

  const article = document.createElement("article");
  article.className = "stat-card";
  article.dataset.name = stat.name.toLowerCase();
  article.dataset.categories = stat.categories.join(" ");
  article.innerHTML = `<div class="stat-card__header"><div class="stat-card__title">
    <span class="stat-card__icon" aria-hidden="true">${escapeHtml(stat.short)}</span><div>
    <h2>${escapeHtml(stat.name)}</h2>
    <p class="stat-card__range">Base range ${formatValue(stat.min, stat.unit)}&ndash;${formatValue(stat.max, stat.unit)}</p>
    <span class="stat-card__categories">${categoryTags}</span>
    </div></div><span class="stat-card__type">${stat.type}</span></div>
    <div class="table-wrap"><table><thead><tr><th scope="col">Rolls</th>
    <th scope="col">Min</th><th scope="col">Average</th><th scope="col">Max</th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
  return article;
}

function selectCategory(category) {
  activeCategory = category;
  const cards = [...document.querySelectorAll(".stat-card")];
  cards.sort((a, b) => {
    if (["offensive", "defensive"].includes(category)) {
      const aPriority = a.dataset.categories.split(" ").includes(category) ? 0 : 1;
      const bPriority = b.dataset.categories.split(" ").includes(category) ? 0 : 1;
      if (aPriority !== bPriority) return aPriority - bPriority;
    }
    return Number(a.dataset.originalIndex) - Number(b.dataset.originalIndex);
  });
  cards.forEach(card => grid.appendChild(card));

  categoryButtons.forEach(button => {
    const isActive = button.dataset.category === category;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  if (category === "all") {
    categoryStatus.textContent = "Showing all stats in their file order.";
  } else if (category === "uncategorised") {
    categoryStatus.textContent = "Showing uncategorised stats only.";
  } else {
    const remainingCategory = category === "offensive" ? "defensive" : "offensive";
    categoryStatus.textContent = `${category[0].toUpperCase() + category.slice(1)} stats are shown first; ${remainingCategory} stats follow below.`;
  }
  applyFilters();
}

function applyFilters() {
  const query = filter.value.trim().toLowerCase();
  let count = 0;

  document.querySelectorAll(".stat-card").forEach(card => {
    const categories = card.dataset.categories.split(" ");
    const isUncategorised = categories.includes("uncategorised");
    const matchesCategory = activeCategory === "all"
      || (activeCategory === "uncategorised" && isUncategorised)
      || (["offensive", "defensive"].includes(activeCategory) && !isUncategorised);
    const matchesSearch = card.dataset.name.includes(query);
    const isVisible = matchesCategory && matchesSearch;
    card.hidden = !isVisible;
    if (isVisible) count += 1;
  });

  visibleCount.textContent = `${count} ${count === 1 ? "stat" : "stats"}`;
  emptyState.hidden = count !== 0;
}

categoryButtons.forEach(button => {
  button.addEventListener("click", () => selectCategory(button.dataset.category));
});

filter.addEventListener("input", applyFilters);

function loadStats() {
  grid.setAttribute("aria-busy", "true");
  try {
    if (typeof window.RUNE_INFO !== "string") throw new Error("rune_info.js did not provide stat data");
    const stats = parseRuneInfo(window.RUNE_INFO);
    if (stats.length === 0) throw new Error("No valid stats were found in rune_info.js");

    stats.forEach(stat => grid.appendChild(createCard(stat)));
    document.querySelectorAll(".stat-card").forEach((card, index) => {
      card.dataset.originalIndex = index;
    });
    categoryButtons.forEach(button => {
      const category = button.dataset.category;
      button.hidden = category !== "all" && !stats.some(stat => stat.categories.includes(category));
    });
    visibleCount.textContent = `${stats.length} ${stats.length === 1 ? "stat" : "stats"}`;
    categoryStatus.textContent = "Showing all stats in their file order.";
    applyFilters();
  } catch (error) {
    visibleCount.textContent = "Stats unavailable";
    categoryStatus.textContent = "The stat file could not be read.";
    grid.innerHTML = `<div class="load-error" role="alert"><strong>Unable to load rune_info.js</strong>
      <p>Check that the file exists and contains at least one block with valid Min and Max fields.</p></div>`;
    console.error(error);
  } finally {
    grid.setAttribute("aria-busy", "false");
  }
}

loadStats();
