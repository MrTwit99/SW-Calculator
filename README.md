# Rune Stat Calculator

A responsive, dependency-free webpage showing the minimum, midpoint average, and maximum values for every rune stat across 1–4 rolls. Offensive and Defensive controls move the chosen category to the top while keeping the remaining stats visible below it.

## Add or update stats

`rune_info.js` is loaded and parsed whenever the page starts. Add stat blocks inside its `window.RUNE_INFO` template string and separate them with a blank line:

```text
New Stat
Min = 4%
Max = 8%
Category = Defensive
```

Both `Min` and `Max` are required. They must be valid, non-negative numbers, and `Max` must be greater than or equal to `Min`. Blocks that fail validation are ignored. A `%` in the name or either value makes it a percentage stat.

`Category` accepts `Offensive`, `Defensive`, or both separated by a comma, such as `Category = Offensive, Defensive`. It is optional; a stat with no recognized category is displayed as `Uncategorised`. An optional `Short` field can set the abbreviation shown on its card.

## Run locally

Open `index.html` directly in a browser. The data file uses JavaScript so it can load without a localhost server. No build step is required.

## Deploy to GitHub Pages

1. Push these files to a GitHub repository.
2. Open **Settings → Pages** in the repository.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select your default branch and the `/ (root)` folder, then save.

The site uses relative file paths and will work from both a repository subpath and a custom domain.
