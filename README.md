# Rune Stat Calculator

A responsive, dependency-free webpage showing the minimum, midpoint average, and maximum values for every rune stat from its 1× base value through four rolls at 5×. Offensive and Defensive controls move the chosen category to the top while keeping the remaining stats visible below it.

The interface separates the focused Rune Evaluation workspace from the searchable Stat Reference tables. Evaluation is the default view.

Average values use the lower whole-number midpoint: `floor((Min + Max) / 2)`. The floored midpoint is calculated before applying the roll multiplier.

The Roll Quality analyzer provides four independent stat slots. Each selected stat must be unique and becomes unavailable in the other slots until it is deselected. A separate Normal/Ancient selector applies the appropriate maximums to all four analyzed stats without changing the reference tables. Selecting a stat defaults to automatic stage detection at Base and its floored average value. Typing moves the marker, and moving the slider fills the value field immediately. Percentages are rounded down to whole numbers; decimal, negative, and out-of-range inputs are rejected.

Automatic stage detection evaluates every roll stage whose range contains the entered value. With four valid stats, it evaluates their combinations together. Any valid three-roll combination always takes priority over every four-roll combination. Four total rolls are selected only when manual stages make three impossible, or when the entered values cannot form a valid three-roll result. Otherwise it chooses the lowest valid total, and overlapping stage ranges are resolved toward the lower stage. Any stage can still be selected manually.

If the minimum feasible stages require more than four total rolls, the analyzer displays an impossible-combination warning and blocks the Overall Rune Evaluation. Individual stat results remain visible so the conflicting values or manual stages can be corrected.

The Overall Rune Evaluation is a roll-weighted average of all valid selected stat quality scores, rounded down to a whole percentage. A Base stat has weight 1, and every additional roll adds 1 to its weight, so the weights run from 1 at Base through 5 at four rolls. The calculation is `floor(sum(quality score * weight) / sum(weights))`. This gives stats receiving more rune rolls proportionally more influence. If a selected stat is invalid, the interface marks the result as partial and excludes that stat until corrected.

The inference dashboard shows the selected combination's total rolls, confidence, and up to three alternative valid combinations. Alternatives are selectable: loading one applies its stages to all four cards as manual choices, preserves the other available alternatives, and places the previously active combination back into the list. Each stat explains whether its stage was inferred automatically or selected manually and why that stage was used. Per-stat reset, Return all to Auto, and Reset all controls are provided.

## Add or update stats

`rune_info.js` is loaded and parsed whenever the page starts. Add stat blocks inside its `window.RUNE_INFO` template string and separate them with a blank line:

```text
New Stat
Min = 4%
Max = 8%
Category = Defensive
```

Both `Min` and `Max` are required. They must be valid, non-negative whole numbers, and `Max` must be greater than or equal to `Min`. Decimals and blocks that fail validation are ignored. A `%` in the name or either value makes it a percentage stat.

`Category` accepts `Offensive`, `Defensive`, or both separated by a comma, such as `Category = Offensive, Defensive`. It is optional; a stat with no recognized category is displayed as `Uncategorised`. An optional `Short` field can set the abbreviation shown on its card.

An optional `AncientMax` field supplies the maximum used when Ancient rune mode is selected. Stats without it retain their normal maximum:

```text
Speed
Min = 4
Max = 6
AncientMax = 7
Category = Offensive, Defensive
```

## Run locally

Open `index.html` directly in a browser. The data file uses JavaScript so it can load without a localhost server. No build step is required.

## Deploy to GitHub Pages

1. Push these files to a GitHub repository.
2. Open **Settings → Pages** in the repository.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select your default branch and the `/ (root)` folder, then save.

The site uses relative file paths and will work from both a repository subpath and a custom domain.
