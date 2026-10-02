# D-I Hoops Lab

An interactive report and dashboard about recent NCAA Division I men’s basketball team performance.

## Pages

- `index.html` is the report page. It has ten evidence-based findings, headline numbers, and interactive visual forms including trend lines, a four-factor radar, winner-loss dumbbells, and efficiency lollipops.
- `dashboard.html` is the browser-side dashboard. It has filters for season, multiple teams, conference, venue, and result; Scout, March, and Fan modes; March-focused measures for effective FG%, turnover rate, offensive-rebound rate, and free-throw rate plus context measures; hoverable and clickable charts; school-color team identities and ESPN logos with text fallbacks; a two-team head-to-head line graph; color-coded four-factor difference bars; click-to-learn concept cards with floor visuals and embedded teaching videos for shot quality and offensive rebounding; Team DNA profiles; four-factor matchup edges; a multi-team season race; a what-if title-path simulator; four changing summary numbers; a conference-only head-to-head matchup history with scores and a game table; a breakdown switch; a reset button; and an aggregation table.
- `assets/` contains local historical basketball photographs; the remote championship and game-winning celebration backgrounds are credited in `assets/README.md`.

The dashboard’s conference head-to-head history defines a conference meeting as a regular-season game where both selected teams appear as opponents and both rows carry the same conference. Postseason and conference-tournament games are excluded.

## Reproducible postseason title-path proxy

The report’s main takeaway is a historical postseason win-likelihood model. It builds regular-season team-season profiles from four possession-level factors, standardizes each factor against team-seasons that reached the postseason, and applies coefficients generated from the 2022–2026 postseason rows. Run `python scripts/fit-march-model.py` after rebuilding the CSV to regenerate `data/march_model.json`; the browser loads that JSON rather than treating the coefficients as hidden page code:

```text
logit(p) = intercept + β₁z(effective FG%) + β₂z(turnover rate)
           + β₃z(offensive-rebound rate) + β₄z(free-throw rate)
p = 1 / (1 + e^(-logit(p)))
six-game title path ≈ p^6
```

The JSON records the fitted intercept, coefficients, sample sizes, standardization rule, ridge penalty, and generation script. The six-game value is a simple average-opponent path estimate, not a sportsbook line, seed model, or literal NCAA championship probability. The dataset identifies postseason games but does not separately label NCAA tournament games or provide a bracket.

## Interactive features

- Chart marks can be hovered or keyboard-focused for exact values. Clickable dashboard bars, points, and leaderboard marks pin their group as a filter; active filters appear as removable chips.
- Dashboard charts refresh with a short fade-and-slide sequence, a subtle card stagger, and animated bars, lines, points, and radar areas. The motion is disabled automatically when a reader prefers reduced motion.
- Team DNA uses the four model factors to show each selected team’s style, standardized profile, and historical title-path proxy.
- Head-to-head scouting cards identify which team has the modeled edge in each factor and let the reader jump directly to that measure.
- The head-to-head faceoff uses each program’s school color, reports the percentage-point gap, and opens an explainer for effective field-goal percentage, turnover rate, offensive-rebound rate, or free-throw rate. The eFG and offensive-rebound explainers embed short public YouTube teaching examples; the other concepts use lightweight interactive court visuals and formulas.
- The what-if lab adjusts a selected team’s factor profile by percentage points and recalculates the model estimate in the browser.
- Mode buttons change the dashboard lens: Scout keeps full detail, March foregrounds the four model factors, and Fan starts with team scoring and rankings.
- The team picker supports multiple programs at once; the season-race chart shows up to eight selected teams with distinct lines and logo-backed identity chips.
- Team logos and primary colors are loaded from public ESPN endpoints using the dataset’s ESPN team IDs, with deterministic school-color fallbacks and abbreviation fallbacks when a logo is unavailable.

## Data

The project uses the public [ESPN men's college basketball team box-score release](https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/espn_mens_college_basketball_team_boxscores) from SportsDataverse and the public [2026 team crosswalk](https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/mbb_crosswalk).

The raw files cover seasons 2022–2026. The season number is the year the season ended, so season 2026 means 2025–26. The final analysis file is `data/team_box_2022_2026.csv`.

One row is one Division I team in one game. The final file contains 58,771 rows, 362 unique team IDs, 372 distinct display-name values across seasons, and 30,946 unique games. The `conference` field comes from the 2026 crosswalk. Rows for teams absent from that Division I crosswalk are excluded; their names can still appear in the opponent columns when a Division I team played them.

The data pipeline is reproducible with either script:

```text
python scripts/prepare-data.py
```

or, on Windows PowerShell:

```text
powershell -ExecutionPolicy Bypass -File scripts/prepare-data.ps1
```

The scripts read the raw season files from `data/raw/`, standardize fields that changed slightly between seasons, add `result`, `margin`, `three_point_rate_pct`, and `effective_fg_pct`, and write `data/quality.json`.

## Local preview

Because the pages fetch the CSV in the browser, use a local web server instead of opening the HTML file directly:

```text
python -m http.server 8000
```

Then open <http://localhost:8000/>.

## GitHub Pages

1. Create a public GitHub repository.
2. Upload or push the contents of this folder to the repository’s `main` branch.
3. In the repository, open **Settings → Pages**.
4. Set the source to **Deploy from a branch**, choose `main`, and choose `/ (root)`.
5. Use the generated Pages URL as the live-site URL.

The site has no build step and uses only relative file paths, so it is ready for GitHub Pages.

## Important calculations

- Win rate = winning team-game rows divided by all team-game rows.
- Three-point attempt rate = 3PA / FGA × 100.
- Effective field-goal percentage = (FGM + 0.5 × 3PM) / FGA × 100.
- Offensive-rebound rate = ORB / (ORB + opponent DRB) × 100.
- Free-throw rate = FTA / FGA × 100.
- Estimated possessions = FGA − ORB + turnovers + 0.44 × FTA.
- Turnover rate = turnovers / estimated possessions × 100.
- Points per possession = points / estimated possessions.
- Arithmetic averages use nonmissing team-game values; model profiles first average regular-season rows within each team-season.
- Team-game rows are used for averages. Unique game counts are calculated from `game_id` so the two team rows for a game are not counted as two games.

## Project file map

- `.gitignore` — ignores local/editor files that should not enter the repository.
- `README.md` — project overview, data source, methods, calculations, interactive features, and this complete file map.
- `index.html` — report page with the title treatment, author summary, ten findings, charts, model takeaway, methodology, and navigation.
- `dashboard.html` — interactive dashboard page with filters, comparison tools, charts, table, and explanatory visuals.
- `app.js` — parses and enriches the CSV, loads quality/model metadata, renders report findings, and powers all dashboard interactions.
- `styles.css` — shared typography, colors, responsive layout, chart styling, motion, report cover, and dashboard visual system.
- `data/team_box_2022_2026.csv` — normalized five-season Division I team-game panel loaded by both pages.
- `data/quality.json` — pipeline row counts, retained/dropped rows, team counts, game count, and source provenance.
- `data/march_model.json` — generated March/postseason model coefficients and fit metadata loaded by `app.js`.
- `data/README.md` — data dictionary, formulas, source links, and interpretation notes.
- `data/raw/mbb_team_crosswalk_2026.csv` — public ESPN/SportsDataverse Division I team crosswalk used to keep D-I teams and add conferences.
- `data/raw/team_box_2022.csv` — raw 2021–22 ESPN team box-score source file.
- `data/raw/team_box_2023.csv` — raw 2022–23 ESPN team box-score source file.
- `data/raw/team_box_2024.csv` — raw 2023–24 ESPN team box-score source file.
- `data/raw/team_box_2025.csv` — raw 2024–25 ESPN team box-score source file.
- `data/raw/team_box_2026.csv` — raw 2025–26 ESPN team box-score source file.
- `scripts/prepare-data.py` — normalizes raw source files, filters to Division I teams, calculates derived fields, and writes the analysis CSV/quality JSON.
- `scripts/prepare-data.ps1` — Windows PowerShell wrapper for the preparation pipeline.
- `scripts/fit-march-model.py` — fits the reproducible weighted logistic model and writes `data/march_model.json`.
- `assets/basketball-1901-purdue.jpg` — local public-domain historical basketball background image.
- `assets/basketball-1909-nara.jpg` — local public-domain historical basketball background image.
- `assets/README.md` — image source and licensing/credit notes.
- `submission-template.txt` — the exact four-line submission file requested by the project instructions.
