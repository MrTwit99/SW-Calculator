const stats = [
  { name: "Flat HP", short: "HP", min: 135, max: 375, unit: "", type: "Flat", category: "defensive" },
  { name: "HP%", short: "HP%", min: 5, max: 8, unit: "%", type: "Percent", category: "defensive" },
  { name: "Flat Attack", short: "ATK", min: 10, max: 20, unit: "", type: "Flat", category: "offensive" },
  { name: "Attack%", short: "ATK%", min: 5, max: 8, unit: "%", type: "Percent", category: "offensive" },
  { name: "Flat Defence", short: "DEF", min: 10, max: 20, unit: "", type: "Flat", category: "defensive" },
  { name: "Defence%", short: "DEF%", min: 5, max: 8, unit: "%", type: "Percent", category: "defensive" },
  { name: "Speed", short: "SPD", min: 4, max: 6, unit: "", type: "Flat", category: "offensive" },
  { name: "Crit Rate", short: "CR", min: 4, max: 6, unit: "%", type: "Percent", category: "offensive" },
  { name: "Crit Damage", short: "CD", min: 4, max: 7, unit: "%", type: "Percent", category: "offensive" },
  { name: "Resistance", short: "RES", min: 4, max: 8, unit: "%", type: "Percent", category: "defensive" }
];

const grid = document.querySelector("#stat-grid");
const filter = document.querySelector("#stat-filter");
const visibleCount = document.querySelector("#visible-count");
const emptyState = document.querySelector("#empty-state");
const categoryStatus = document.querySelector("#category-status");
const categoryButtons = document.querySelectorAll(".category-button");

function formatValue(value, unit) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}${unit}`;
}

function resultCell(kind, base, multiplier, unit) {
  const result = base * multiplier;
  const shownBase = Number.isInteger(base) ? base : base.toFixed(1);
  return `
    <td>
      <span class="value value--${kind}">${formatValue(result, unit)}</span>
      <span class="formula">${shownBase}${unit} × ${multiplier}</span>
    </td>`;
}

function createCard(stat) {
  const average = (stat.min + stat.max) / 2;
  const rows = [1, 2, 3, 4].map(multiplier => `
    <tr>
      <td class="multiplier">${multiplier}×</td>
      ${resultCell("min", stat.min, multiplier, stat.unit)}
      ${resultCell("avg", average, multiplier, stat.unit)}
      ${resultCell("max", stat.max, multiplier, stat.unit)}
    </tr>`).join("");

  const article = document.createElement("article");
  article.className = "stat-card";
  article.dataset.name = stat.name.toLowerCase();
  article.dataset.category = stat.category;
  article.innerHTML = `
    <div class="stat-card__header">
      <div class="stat-card__title">
        <span class="stat-card__icon" aria-hidden="true">${stat.short}</span>
        <div>
          <h2>${stat.name}</h2>
          <p class="stat-card__range">Base range ${formatValue(stat.min, stat.unit)}–${formatValue(stat.max, stat.unit)}</p>
          <span class="stat-card__category stat-card__category--${stat.category}">${stat.category[0].toUpperCase() + stat.category.slice(1)}</span>
        </div>
      </div>
      <span class="stat-card__type">${stat.type}</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Rolls</th>
            <th scope="col">Min</th>
            <th scope="col">Average</th>
            <th scope="col">Max</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  return article;
}

stats.forEach(stat => grid.appendChild(createCard(stat)));

function prioritizeCategory(category) {
  const cards = [...document.querySelectorAll(".stat-card")];
  const orderedCards = category === "all"
    ? cards.sort((a, b) => Number(a.dataset.originalIndex) - Number(b.dataset.originalIndex))
    : cards.sort((a, b) => {
        const aPriority = a.dataset.category === category ? 0 : 1;
        const bPriority = b.dataset.category === category ? 0 : 1;
        return aPriority - bPriority || Number(a.dataset.originalIndex) - Number(b.dataset.originalIndex);
      });

  orderedCards.forEach(card => grid.appendChild(card));

  categoryButtons.forEach(button => {
    const isActive = button.dataset.category === category;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  categoryStatus.textContent = category === "all"
    ? "Showing all stats in their default order."
    : `${category[0].toUpperCase() + category.slice(1)} stats are shown first; remaining stats follow below.`;
}

document.querySelectorAll(".stat-card").forEach((card, index) => {
  card.dataset.originalIndex = index;
});

categoryButtons.forEach(button => {
  button.addEventListener("click", () => prioritizeCategory(button.dataset.category));
});

filter.addEventListener("input", event => {
  const query = event.target.value.trim().toLowerCase();
  let count = 0;

  document.querySelectorAll(".stat-card").forEach(card => {
    const isVisible = card.dataset.name.includes(query);
    card.hidden = !isVisible;
    if (isVisible) count += 1;
  });

  visibleCount.textContent = `${count} ${count === 1 ? "stat" : "stats"}`;
  emptyState.hidden = count !== 0;
});
