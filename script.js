const grid = document.querySelector("#stat-grid");
const filter = document.querySelector("#stat-filter");
const visibleCount = document.querySelector("#visible-count");
const emptyState = document.querySelector("#empty-state");
const categoryStatus = document.querySelector("#category-status");
const viewButtons = document.querySelectorAll("[data-view]");
const viewPanels = document.querySelectorAll("[data-view-panel]");
const categoryButtons = document.querySelectorAll(".category-button");
const runeModeButtons = document.querySelectorAll("[data-rune-mode]");
const analyzerModeButtons = document.querySelectorAll("[data-analyzer-mode]");
const analyzerSlotsContainer = document.querySelector("#analyzer-slots");
const inferenceSummary = document.querySelector("#inference-summary");
const inferenceError = document.querySelector("#inference-error");
const inferenceErrorMessage = document.querySelector("#inference-error-message");
const resetAutoButton = document.querySelector("#reset-auto");
const resetAllButton = document.querySelector("#reset-all");
const rollTotalValue = document.querySelector("#roll-total-value");
const rollTotalSegments = document.querySelector("#roll-total-segments");
const confidenceLabel = document.querySelector("#confidence-label");
const confidenceDetail = document.querySelector("#confidence-detail");
const alternativesList = document.querySelector("#alternatives-list");
const overallScore = document.querySelector("#overall-score");
const overallGrade = document.querySelector("#overall-grade");
const overallBar = document.querySelector("#overall-bar");
const overallBarFill = document.querySelector("#overall-bar-fill");
const overallBarMarker = document.querySelector("#overall-bar-marker");
const overallContext = document.querySelector("#overall-context");
const overallCount = document.querySelector("#overall-count");
const ANALYZER_SLOT_COUNT = 4;
const ROLL_STAGES = [
  { label: "Base", rolls: 0, multiplier: 1 },
  { label: "1 roll", rolls: 1, multiplier: 2 },
  { label: "2 rolls", rolls: 2, multiplier: 3 },
  { label: "3 rolls", rolls: 3, multiplier: 4 },
  { label: "4 rolls", rolls: 4, multiplier: 5 }
];
let activeCategory = "all";
let activeRuneMode = "normal";
let activeAnalyzerRuneMode = "normal";
let loadedStats = [];
let inferenceBlocked = false;
let inferenceMinimumTotal = 0;
let currentInference = {
  totalRolls: 0,
  confidence: "Incomplete",
  confidenceDetail: "Add four valid stats for a combined stage estimate.",
  alternatives: [],
  items: []
};
let savedAlternativeCombinations = [];

function combinationSignature(combination) {
  return combination?.stages?.map(stage => stage.multiplier).join("-") || "";
}

function clearSavedAlternatives() {
  savedAlternativeCombinations = [];
}

function parseNumber(value) {
  const normalized = value?.trim();
  if (!normalized || !/^\+?\d+\s*%?$/.test(normalized)) return NaN;
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
      console.warn(`Ignored invalid stat \"${name}\". Min and Max must be non-negative whole numbers, and Max must be greater than or equal to Min.`);
      return null;
    }

    let ancientMax = null;
    if (fields.ancientmax !== undefined) {
      const parsedAncientMax = parseNumber(fields.ancientmax);
      if (Number.isFinite(parsedAncientMax) && parsedAncientMax >= min) {
        ancientMax = parsedAncientMax;
      } else {
        console.warn(`Ignored invalid AncientMax for \"${name}\". It must be a non-negative whole number greater than or equal to Min.`);
      }
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
      ancientMax,
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
  return `${value}${unit}`;
}

function resultCell(kind, base, multiplier, unit) {
  const result = base * multiplier;
  const shownBase = base;
  return `<td><span class="value value--${kind}">${formatValue(result, unit)}</span>
    <span class="formula">${shownBase}${unit} &times; ${multiplier}</span></td>`;
}

function createCard(stat) {
  const effectiveMax = getEffectiveMax(stat);
  const average = Math.floor((stat.min + effectiveMax) / 2);
  const categoryTags = stat.categories.map(category => {
    const label = category[0].toUpperCase() + category.slice(1);
    return `<span class="stat-card__category stat-card__category--${category}">${label}</span>`;
  }).join("");
  const rows = ROLL_STAGES.map(stage => `<tr>
    <td class="multiplier">${stage.label}</td>
    ${resultCell("min", stat.min, stage.multiplier, stat.unit)}
    ${resultCell("avg", average, stage.multiplier, stat.unit)}
    ${resultCell("max", effectiveMax, stage.multiplier, stat.unit)}</tr>`).join("");

  const article = document.createElement("article");
  article.className = "stat-card";
  article.dataset.name = stat.name.toLowerCase();
  article.dataset.categories = stat.categories.join(" ");
  article.innerHTML = `<div class="stat-card__header"><div class="stat-card__title">
    <span class="stat-card__icon" aria-hidden="true">${escapeHtml(stat.short)}</span><div>
    <h2>${escapeHtml(stat.name)}</h2>
    <p class="stat-card__range">${activeRuneMode === "ancient" && stat.ancientMax !== null ? "Ancient" : "Base"} range ${formatValue(stat.min, stat.unit)}&ndash;${formatValue(effectiveMax, stat.unit)}</p>
    <span class="stat-card__categories">${categoryTags}</span>
    </div></div><span class="stat-card__type">${stat.type}</span></div>
    <div class="table-wrap"><table><thead><tr><th scope="col">Stage</th>
    <th scope="col">Min</th><th scope="col">Average</th><th scope="col">Max</th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
  return article;
}

function getEffectiveMax(stat, runeMode = activeRuneMode) {
  return runeMode === "ancient" && stat.ancientMax !== null
    ? stat.ancientMax : stat.max;
}

function qualityLabel(score) {
  if (score === 100) return "Perfect";
  if (score >= 90) return "Near perfect";
  if (score >= 75) return "Excellent";
  if (score >= 50) return "Good";
  if (score >= 25) return "Below average";
  return "Low";
}

function updateOverallEvaluation() {
  const slots = [...document.querySelectorAll(".analyzer-card")];
  const selectedCount = slots.filter(slot => analyzerElements(slot).statSelect.value !== "").length;
  const validScores = slots
    .map(slot => Number(slot.dataset.qualityScore))
    .filter(score => Number.isFinite(score));

  overallCount.textContent = `${validScores.length} of ${ANALYZER_SLOT_COUNT} stats`;

  if (inferenceBlocked) {
    overallScore.textContent = "—";
    overallGrade.textContent = "Evaluation blocked";
    overallGrade.dataset.rated = "false";
    overallBarFill.style.width = "0%";
    overallBarMarker.style.left = "0%";
    overallBar.setAttribute("aria-valuenow", "0");
    overallContext.textContent = `Overall grading is unavailable because the minimum valid combination requires ${inferenceMinimumTotal} rolls.`;
    return;
  }

  if (validScores.length === 0) {
    overallScore.textContent = "—";
    overallGrade.textContent = "Not rated";
    overallGrade.dataset.rated = "false";
    overallBarFill.style.width = "0%";
    overallBarMarker.style.left = "0%";
    overallBar.setAttribute("aria-valuenow", "0");
    overallContext.textContent = selectedCount === 0
      ? "Select at least one stat to evaluate the rune."
      : "Enter a valid value for the selected stat to calculate the result.";
    return;
  }

  const score = Math.floor(validScores.reduce((sum, value) => sum + value, 0) / validScores.length);
  overallScore.textContent = `${score}%`;
  overallGrade.textContent = qualityLabel(score);
  overallGrade.dataset.rated = "true";
  overallBarFill.style.width = `${score}%`;
  overallBarMarker.style.left = `${score}%`;
  overallBar.setAttribute("aria-valuenow", String(score));

  const invalidSelectedCount = selectedCount - validScores.length;
  overallContext.textContent = invalidSelectedCount > 0
    ? `Partial evaluation: ${invalidSelectedCount} selected ${invalidSelectedCount === 1 ? "stat needs" : "stats need"} a valid value.`
    : `Equal-weight average of ${validScores.length} valid ${validScores.length === 1 ? "stat" : "stats"}, rounded down.`;
}

function createAnalyzerSlot(slotIndex) {
  const article = document.createElement("article");
  article.className = "analyzer-card is-empty";
  article.dataset.analyzerSlot = String(slotIndex);
  const stageOptions = `<option value="auto">Auto &middot; Base</option>` + ROLL_STAGES.map(stage =>
    `<option value="${stage.multiplier}">${stage.label}</option>`).join("");
  article.innerHTML = `
    <div class="analyzer-card__heading">
      <span class="analyzer-card__number">Stat ${slotIndex + 1}</span>
      <div class="analyzer-card__meta">
        <span class="quality-grade" data-quality-grade>Not selected</span>
        <button class="slot-reset" data-reset-slot type="button" aria-label="Reset stat ${slotIndex + 1}" title="Reset this stat">&times;</button>
      </div>
    </div>
    <form class="analyzer-form" novalidate>
      <label class="field"><span>Stat</span><select data-analyzer-stat required></select></label>
      <label class="field"><span>Stage</span><select data-analyzer-stage>${stageOptions}</select></label>
      <label class="field"><span>Actual value</span>
        <input data-analyzer-value type="number" min="0" step="1" inputmode="numeric" placeholder="Value">
      </label>
    </form>
    <div class="stage-explanation">
      <span class="stage-mode" data-stage-mode>Auto</span>
      <p data-stage-reason>Choose a value to infer its stage.</p>
    </div>
    <div class="quality-output">
      <p class="quality-output__empty" data-quality-empty>Choose a stat to begin.</p>
      <p class="quality-output__error" data-quality-error hidden></p>
      <div class="quality-result" data-quality-result hidden>
        <div class="quality-result__summary">
          <div><span class="quality-result__label">Roll quality</span><strong data-quality-score>0%</strong></div>
        </div>
        <div class="quality-bar">
          <span class="quality-bar__fill" data-quality-fill></span>
          <span class="quality-bar__marker" data-quality-marker></span>
          <input class="quality-slider" data-quality-slider type="range" min="0" max="100" step="1" value="0" aria-label="Select actual stat value by sliding" disabled>
        </div>
        <div class="quality-scale">
          <span data-quality-min>Min 0</span><span data-quality-actual>Actual 0</span><span data-quality-max>Max 0</span>
        </div>
        <p class="quality-result__context" data-quality-context></p>
      </div>
    </div>`;
  return article;
}

function analyzerElements(slot) {
  return {
    statSelect: slot.querySelector("[data-analyzer-stat]"),
    stageSelect: slot.querySelector("[data-analyzer-stage]"),
    valueInput: slot.querySelector("[data-analyzer-value]"),
    stageMode: slot.querySelector("[data-stage-mode]"),
    stageReason: slot.querySelector("[data-stage-reason]"),
    empty: slot.querySelector("[data-quality-empty]"),
    error: slot.querySelector("[data-quality-error]"),
    result: slot.querySelector("[data-quality-result]"),
    score: slot.querySelector("[data-quality-score]"),
    grade: slot.querySelector("[data-quality-grade]"),
    fill: slot.querySelector("[data-quality-fill]"),
    marker: slot.querySelector("[data-quality-marker]"),
    slider: slot.querySelector("[data-quality-slider]"),
    min: slot.querySelector("[data-quality-min]"),
    actual: slot.querySelector("[data-quality-actual]"),
    max: slot.querySelector("[data-quality-max]"),
    context: slot.querySelector("[data-quality-context]")
  };
}

function refreshAnalyzerOptions() {
  const slots = [...document.querySelectorAll(".analyzer-card")];
  const selectedValues = slots.map(slot => analyzerElements(slot).statSelect.value).filter(Boolean);

  slots.forEach(slot => {
    const { statSelect } = analyzerElements(slot);
    [...statSelect.options].forEach(option => {
      option.disabled = option.value !== "" && option.value !== statSelect.value && selectedValues.includes(option.value);
    });
  });
}

function setAnalyzerSlotAverage(slot) {
  const { statSelect, stageSelect, valueInput } = analyzerElements(slot);
  const stat = statSelect.value === "" ? null : loadedStats[Number(statSelect.value)];
  const multiplier = stageSelect.value === "auto" ? 1 : Number(stageSelect.value);
  if (!stat || !ROLL_STAGES.some(stage => stage.multiplier === multiplier)) {
    valueInput.value = "";
    updateAllAnalyzerSlots();
    return;
  }
  const singleRollAverage = Math.floor((stat.min + getEffectiveMax(stat, activeAnalyzerRuneMode)) / 2);
  valueInput.value = String(singleRollAverage * multiplier);
  updateAllAnalyzerSlots();
}

function feasibleStagesForValue(stat, actual) {
  return ROLL_STAGES.filter(stage => {
    const minimum = stat.min * stage.multiplier;
    const maximum = getEffectiveMax(stat, activeAnalyzerRuneMode) * stage.multiplier;
    return actual >= minimum && actual <= maximum;
  });
}

function stageFitCost(stat, actual, stage) {
  const minimum = stat.min * stage.multiplier;
  const maximum = getEffectiveMax(stat, activeAnalyzerRuneMode) * stage.multiplier;
  const average = Math.floor((stat.min + getEffectiveMax(stat, activeAnalyzerRuneMode)) / 2) * stage.multiplier;
  return Math.abs(actual - average) / Math.max(1, maximum - minimum);
}

function inferAnalyzerStages() {
  const slots = [...document.querySelectorAll(".analyzer-card")];
  const assignments = new Map();
  inferenceBlocked = false;
  inferenceMinimumTotal = 0;
  inferenceError.hidden = true;
  currentInference = {
    totalRolls: 0,
    confidence: "Incomplete",
    confidenceDetail: "Add four valid stats for a combined stage estimate.",
    alternatives: [],
    items: []
  };
  const items = slots.map(slot => {
    const elements = analyzerElements(slot);
    const stat = elements.statSelect.value === "" ? null : loadedStats[Number(elements.statSelect.value)];
    const rawValue = elements.valueInput.value.trim();
    const actual = /^\d+$/.test(rawValue) ? Number(rawValue) : NaN;
    if (!stat || !Number.isSafeInteger(actual)) return null;

    const feasible = feasibleStagesForValue(stat, actual);
    const isAuto = elements.stageSelect.value === "auto";
    const manualStage = isAuto ? null
      : ROLL_STAGES.find(stage => stage.multiplier === Number(elements.stageSelect.value));
    const possibilities = isAuto ? feasible
      : manualStage && feasible.includes(manualStage) ? [manualStage] : [];
    const fallback = isAuto ? feasible[0] : manualStage;
    if (fallback) assignments.set(slot, fallback);
    return { slot, stat, actual, isAuto, possibilities, feasible };
  }).filter(Boolean);
  currentInference.items = items;

  const allEnteredValuesHaveStages = items.every(item => item.possibilities.length > 0);
  if (items.length > 0 && allEnteredValuesHaveStages) {
    inferenceMinimumTotal = items.reduce((sum, item) =>
      sum + Math.min(...item.possibilities.map(stage => stage.rolls)), 0);

    if (inferenceMinimumTotal > 4) {
      inferenceBlocked = true;
      inferenceErrorMessage.textContent = `These values require at least ${inferenceMinimumTotal} total rolls, but a rune can have no more than 4. Lower a value or correct a manually selected stage.`;
      inferenceError.hidden = false;
      inferenceSummary.textContent = `Unable to form a valid rune: minimum ${inferenceMinimumTotal} rolls required.`;
      currentInference = {
        totalRolls: inferenceMinimumTotal,
        confidence: "Invalid",
        confidenceDetail: `The lowest possible combination requires ${inferenceMinimumTotal} rolls.`,
        alternatives: [],
        items
      };
      return assignments;
    }
  }

  if (items.length !== ANALYZER_SLOT_COUNT || items.some(item => item.possibilities.length === 0)) {
    const hasImpossibleValue = items.some(item => item.isAuto && item.possibilities.length === 0);
    const hasManualConflict = items.some(item => !item.isAuto && item.possibilities.length === 0);
    inferenceSummary.textContent = hasImpossibleValue
      ? "One or more values do not fit any stage; other auto stages use the lower match."
      : hasManualConflict
        ? "A selected manual stage conflicts with its value; other auto stages use the lower match."
        : "Auto stages use the lower valid match until all four stats have valid values.";
    currentInference.totalRolls = [...assignments.values()].reduce((sum, stage) => sum + stage.rolls, 0);
    currentInference.confidence = hasImpossibleValue || hasManualConflict ? "Invalid" : "Incomplete";
    currentInference.confidenceDetail = hasImpossibleValue
      ? "At least one value does not match any stage."
      : hasManualConflict
        ? "A manual stage does not contain its entered value."
        : `${items.length} of ${ANALYZER_SLOT_COUNT} stats are ready.`;
    return assignments;
  }

  const combinations = [];
  function buildCombination(index, stages) {
    if (index === items.length) {
      const totalRolls = stages.reduce((sum, stage) => sum + stage.rolls, 0);
      const cost = stages.reduce((sum, stage, itemIndex) =>
        sum + stageFitCost(items[itemIndex].stat, items[itemIndex].actual, stage), 0);
      combinations.push({ stages: [...stages], totalRolls, cost });
      return;
    }
    items[index].possibilities.forEach(stage => {
      stages.push(stage);
      buildCombination(index + 1, stages);
      stages.pop();
    });
  }
  buildCombination(0, []);

  const manualRollTotal = items.filter(item => !item.isAuto)
    .reduce((sum, item) => sum + item.possibilities[0].rolls, 0);
  // Three rolls always take priority over four whenever a valid combination exists.
  let preferred = combinations.filter(combination => combination.totalRolls === 3);

  if (preferred.length === 0) {
    const lowestTotal = Math.min(...combinations.map(combination => combination.totalRolls));
    preferred = combinations.filter(combination => combination.totalRolls === lowestTotal);
  }

  preferred.sort((a, b) => {
    if (a.cost !== b.cost) return a.cost - b.cost;
    for (let index = 0; index < a.stages.length; index += 1) {
      if (a.stages[index].rolls !== b.stages[index].rolls) {
        return a.stages[index].rolls - b.stages[index].rolls;
      }
    }
    return 0;
  });

  const chosen = preferred[0];
  items.forEach((item, index) => assignments.set(item.slot, chosen.stages[index]));
  const reason = chosen.totalRolls === 4
    ? (manualRollTotal === 4 ? "confirmed by manual stages" : "required by the entered values")
    : (chosen.totalRolls === 3 ? "the standard total" : "the lowest valid total");
  inferenceSummary.textContent = `Inferred ${chosen.totalRolls} total ${chosen.totalRolls === 1 ? "roll" : "rolls"}: ${reason}.`;
  const viableAlternatives = combinations
    .filter(combination => combination !== chosen && combination.totalRolls <= 4)
    .sort((a, b) => {
      const aSameTotal = a.totalRolls === chosen.totalRolls ? 0 : 1;
      const bSameTotal = b.totalRolls === chosen.totalRolls ? 0 : 1;
      return aSameTotal - bSameTotal || a.totalRolls - b.totalRolls || a.cost - b.cost;
    });
  const costGap = preferred.length > 1 ? Math.abs(preferred[1].cost - chosen.cost) : Infinity;
  const allManual = items.every(item => !item.isAuto);
  const confidence = allManual ? "Manual"
    : preferred.length === 1 ? "Certain"
      : costGap < 0.05 ? "Ambiguous" : "Likely";
  const confidenceDetailText = confidence === "Manual"
    ? "Every stage is manually selected and valid."
    : confidence === "Certain"
      ? "Only one preferred roll combination fits."
      : confidence === "Ambiguous"
        ? "Multiple combinations are similarly plausible."
        : "One combination fits the expected roll values better.";
  currentInference = {
    totalRolls: chosen.totalRolls,
    confidence,
    confidenceDetail: confidenceDetailText,
    alternatives: viableAlternatives.slice(0, 3),
    items,
    chosen
  };
  return assignments;
}

function stageReasonFor(slot, stat, actual, stage, isAuto) {
  if (!isAuto) return "Manually selected; automatic inference is not applied.";
  const feasible = feasibleStagesForValue(stat, actual);
  if (feasible.length === 1) return `Only ${stage.label.toLowerCase()} contains this value.`;
  const lowerStage = feasible[0];
  if (stage === lowerStage) {
    return `Lower of ${feasible.length} matching stages${currentInference.totalRolls === 3 ? "; supports the 3-roll total" : ""}.`;
  }
  return `Higher matching stage selected to form the ${currentInference.totalRolls}-roll combination.`;
}

function applyAlternativeCombination(combination) {
  if (!combination || combination.stages.length !== ANALYZER_SLOT_COUNT) return;

  const previousCombination = currentInference.chosen;
  const selectedSignature = combinationSignature(combination);
  const availableBeforeSwap = [
    ...(previousCombination ? [{
      stages: [...previousCombination.stages],
      totalRolls: previousCombination.totalRolls,
      cost: previousCombination.cost
    }] : []),
    ...currentInference.alternatives,
    ...savedAlternativeCombinations
  ];
  savedAlternativeCombinations = availableBeforeSwap
    .filter(item => combinationSignature(item) !== selectedSignature)
    .filter((item, index, list) =>
      list.findIndex(candidate => combinationSignature(candidate) === combinationSignature(item)) === index);

  const slots = [...document.querySelectorAll(".analyzer-card")];
  slots.forEach((slot, index) => {
    analyzerElements(slot).stageSelect.value = String(combination.stages[index].multiplier);
  });
  updateAllAnalyzerSlots();
}

function updateInferenceDashboard() {
  const total = currentInference.totalRolls || 0;
  rollTotalValue.textContent = String(total);
  rollTotalSegments.classList.toggle("is-over", total > 4);
  [...rollTotalSegments.children].forEach((segment, index) => {
    segment.classList.toggle("is-filled", index < Math.min(total, 4));
  });
  confidenceLabel.textContent = currentInference.confidence;
  confidenceDetail.textContent = currentInference.confidenceDetail;

  const currentSignature = combinationSignature(currentInference.chosen);
  const alternatives = [...currentInference.alternatives, ...savedAlternativeCombinations]
    .filter(combination => combinationSignature(combination) !== currentSignature)
    .filter((combination, index, list) =>
      list.findIndex(item => combinationSignature(item) === combinationSignature(combination)) === index)
    .slice(0, 3);

  alternativesList.replaceChildren();
  if (alternatives.length === 0) {
    const message = document.createElement("p");
    message.textContent = currentInference.confidence === "Certain"
      ? "No other preferred combination fits."
      : "No alternatives available yet.";
    alternativesList.appendChild(message);
    return;
  }

  alternatives.forEach(combination => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "alternative-item";
    row.setAttribute("aria-label", `Load alternative with ${combination.totalRolls} total rolls`);
    const description = document.createElement("span");
    description.textContent = combination.stages.map((stage, index) =>
      `${currentInference.items[index].stat.short}: ${stage.label}`).join(" · ");
    const totalLabel = document.createElement("strong");
    totalLabel.textContent = `Load · ${combination.totalRolls} rolls`;
    row.append(description, totalLabel);
    row.addEventListener("click", () => applyAlternativeCombination(combination));
    alternativesList.appendChild(row);
  });
}

function updateAnalyzerSlot(slot, inferredStage) {
  const elements = analyzerElements(slot);
  const stat = elements.statSelect.value === "" ? null : loadedStats[Number(elements.statSelect.value)];
  const autoOption = elements.stageSelect.querySelector('option[value="auto"]');
  const isAuto = elements.stageSelect.value === "auto";
  const stage = isAuto ? inferredStage
    : ROLL_STAGES.find(item => item.multiplier === Number(elements.stageSelect.value));
  const multiplier = stage?.multiplier;
  autoOption.textContent = !stat ? "Auto · Base" : stage ? `Auto · ${stage.label}` : "Auto · No match";
  elements.error.hidden = true;
  delete slot.dataset.qualityScore;
  slot.classList.toggle("is-empty", !stat);
  elements.stageMode.textContent = isAuto ? "Auto" : "Manual";
  elements.stageMode.classList.toggle("is-manual", !isAuto);

  if (!stat) {
    elements.empty.hidden = false;
    elements.result.hidden = true;
    elements.slider.disabled = true;
    elements.grade.textContent = "Not selected";
    elements.grade.dataset.rated = "false";
    elements.stageReason.textContent = "Choose a stat to begin.";
    return;
  }

  if (!stage) {
    elements.empty.hidden = true;
    elements.result.hidden = true;
    elements.slider.disabled = true;
    elements.grade.textContent = "No valid stage";
    elements.grade.dataset.rated = "false";
    elements.error.textContent = "This value does not fit any roll stage.";
    elements.error.hidden = false;
    elements.stageReason.textContent = "No stage range contains this value.";
    return;
  }

  const minimum = stat.min * multiplier;
  const maximum = getEffectiveMax(stat, activeAnalyzerRuneMode) * multiplier;
  const rawValue = elements.valueInput.value.trim();
  const modeLabel = activeAnalyzerRuneMode === "ancient" ? "Ancient" : "Normal";

  elements.empty.hidden = true;
  elements.result.hidden = false;
  elements.score.textContent = "—";
  elements.grade.textContent = "Select value";
  elements.grade.dataset.rated = "false";
  elements.fill.style.width = "0%";
  elements.marker.style.left = "0%";
  elements.min.textContent = `Min ${minimum}${stat.unit}`;
  elements.actual.textContent = "Actual —";
  elements.max.textContent = `Max ${maximum}${stat.unit}`;
  elements.context.textContent = `${modeLabel} ${stat.name} · ${stage.label}`;
  elements.slider.min = String(minimum);
  elements.slider.max = String(maximum);
  elements.slider.value = String(minimum);
  elements.slider.disabled = false;
  elements.stageReason.textContent = /^\d+$/.test(rawValue)
    ? stageReasonFor(slot, stat, Number(rawValue), stage, isAuto)
    : "Enter a whole-number value to evaluate this stage.";

  if (rawValue === "") {
    return;
  }
  if (!/^\d+$/.test(rawValue)) {
    elements.error.textContent = "Enter a non-negative whole number.";
    elements.error.hidden = false;
    return;
  }

  const actual = Number(rawValue);
  if (!Number.isSafeInteger(actual) || actual < minimum || actual > maximum) {
    elements.error.textContent = `Enter ${minimum}${stat.unit} to ${maximum}${stat.unit}.`;
    elements.error.hidden = false;
    return;
  }

  const score = maximum === minimum ? 100
    : Math.floor(((actual - minimum) / (maximum - minimum)) * 100);
  elements.score.textContent = `${score}%`;
  elements.grade.textContent = qualityLabel(score);
  elements.grade.dataset.rated = "true";
  elements.fill.style.width = `${score}%`;
  elements.marker.style.left = `${score}%`;
  elements.slider.value = String(actual);
  elements.actual.textContent = `Actual ${actual}${stat.unit}`;
  slot.dataset.qualityScore = String(score);
}

function initializeAnalyzerSlots() {
  analyzerSlotsContainer.replaceChildren();
  for (let index = 0; index < ANALYZER_SLOT_COUNT; index += 1) {
    const slot = createAnalyzerSlot(index);
    const elements = analyzerElements(slot);
    elements.statSelect.add(new Option("Choose a stat", ""));
    loadedStats.map((stat, statIndex) => ({ stat, statIndex }))
      .sort((a, b) => a.stat.name.localeCompare(b.stat.name))
      .forEach(({ stat, statIndex }) => elements.statSelect.add(new Option(stat.name, String(statIndex))));

    slot.querySelector("form").addEventListener("submit", event => event.preventDefault());
    elements.statSelect.addEventListener("change", () => {
      clearSavedAlternatives();
      elements.stageSelect.value = "auto";
      refreshAnalyzerOptions();
      setAnalyzerSlotAverage(slot);
    });
    elements.stageSelect.addEventListener("change", () => {
      clearSavedAlternatives();
      if (elements.stageSelect.value === "auto") updateAllAnalyzerSlots();
      else setAnalyzerSlotAverage(slot);
    });
    elements.valueInput.addEventListener("input", () => {
      clearSavedAlternatives();
      updateAllAnalyzerSlots();
    });
    elements.slider.addEventListener("input", () => {
      clearSavedAlternatives();
      elements.valueInput.value = elements.slider.value;
      updateAllAnalyzerSlots();
    });
    slot.querySelector("[data-reset-slot]").addEventListener("click", () => {
      clearSavedAlternatives();
      elements.statSelect.value = "";
      elements.stageSelect.value = "auto";
      elements.valueInput.value = "";
      refreshAnalyzerOptions();
      updateAllAnalyzerSlots();
    });
    analyzerSlotsContainer.appendChild(slot);
  }
  refreshAnalyzerOptions();
}

function updateAllAnalyzerSlots() {
  const inferredStages = inferAnalyzerStages();
  updateInferenceDashboard();
  document.querySelectorAll(".analyzer-card").forEach(slot => updateAnalyzerSlot(slot, inferredStages.get(slot)));
  updateOverallEvaluation();
}

function renderStats() {
  grid.replaceChildren();
  loadedStats.forEach(stat => grid.appendChild(createCard(stat)));
  document.querySelectorAll(".stat-card").forEach((card, index) => {
    card.dataset.originalIndex = index;
  });
  selectCategory(activeCategory);
  updateAllAnalyzerSlots();
}

function selectCategory(category) {
  activeCategory = category;
  const cards = [...document.querySelectorAll(".stat-card")];
  cards.sort((a, b) => {
    if (category === "all") return a.dataset.name.localeCompare(b.dataset.name);

    const aCategories = a.dataset.categories.split(" ");
    const bCategories = b.dataset.categories.split(" ");
    const aHasBoth = aCategories.includes("offensive") && aCategories.includes("defensive");
    const bHasBoth = bCategories.includes("offensive") && bCategories.includes("defensive");
    if (aHasBoth !== bHasBoth) return aHasBoth ? -1 : 1;

    if (["offensive", "defensive"].includes(category)) {
      const aPriority = aCategories.includes(category) ? 0 : 1;
      const bPriority = bCategories.includes(category) ? 0 : 1;
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
    categoryStatus.textContent = "Showing all stats in alphabetical order.";
  } else if (category === "uncategorised") {
    categoryStatus.textContent = "Showing uncategorised stats only.";
  } else {
    const remainingCategory = category === "offensive" ? "defensive" : "offensive";
    categoryStatus.textContent = `Shared stats are shown first, followed by ${category} stats; ${remainingCategory} stats follow below.`;
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

viewButtons.forEach(button => {
  button.addEventListener("click", () => {
    const view = button.dataset.view;
    viewButtons.forEach(viewButton => {
      const isActive = viewButton === button;
      viewButton.classList.toggle("is-active", isActive);
      viewButton.setAttribute("aria-pressed", String(isActive));
    });
    viewPanels.forEach(panel => {
      panel.hidden = panel.dataset.viewPanel !== view;
    });
  });
});

resetAutoButton.addEventListener("click", () => {
  clearSavedAlternatives();
  document.querySelectorAll(".analyzer-card").forEach(slot => {
    analyzerElements(slot).stageSelect.value = "auto";
  });
  updateAllAnalyzerSlots();
});

resetAllButton.addEventListener("click", () => {
  clearSavedAlternatives();
  activeAnalyzerRuneMode = "normal";
  analyzerModeButtons.forEach(button => {
    const isActive = button.dataset.analyzerMode === "normal";
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  document.querySelectorAll(".analyzer-card").forEach(slot => {
    const elements = analyzerElements(slot);
    elements.statSelect.value = "";
    elements.stageSelect.value = "auto";
    elements.valueInput.value = "";
  });
  refreshAnalyzerOptions();
  updateAllAnalyzerSlots();
});

runeModeButtons.forEach(button => {
  button.addEventListener("click", () => {
    activeRuneMode = button.dataset.runeMode;
    runeModeButtons.forEach(modeButton => {
      const isActive = modeButton === button;
      modeButton.classList.toggle("is-active", isActive);
      modeButton.setAttribute("aria-pressed", String(isActive));
    });
    renderStats();
  });
});

analyzerModeButtons.forEach(button => {
  button.addEventListener("click", () => {
    clearSavedAlternatives();
    activeAnalyzerRuneMode = button.dataset.analyzerMode;
    analyzerModeButtons.forEach(modeButton => {
      const isActive = modeButton === button;
      modeButton.classList.toggle("is-active", isActive);
      modeButton.setAttribute("aria-pressed", String(isActive));
    });
    updateAllAnalyzerSlots();
  });
});

filter.addEventListener("input", applyFilters);

function loadStats() {
  grid.setAttribute("aria-busy", "true");
  try {
    if (typeof window.RUNE_INFO !== "string") throw new Error("rune_info.js did not provide stat data");
    loadedStats = parseRuneInfo(window.RUNE_INFO);
    if (loadedStats.length === 0) throw new Error("No valid stats were found in rune_info.js");

    initializeAnalyzerSlots();
    renderStats();
    categoryButtons.forEach(button => {
      const category = button.dataset.category;
      button.hidden = category !== "all" && !loadedStats.some(stat => stat.categories.includes(category));
    });
    visibleCount.textContent = `${loadedStats.length} ${loadedStats.length === 1 ? "stat" : "stats"}`;
    categoryStatus.textContent = "Showing all stats in alphabetical order.";
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
