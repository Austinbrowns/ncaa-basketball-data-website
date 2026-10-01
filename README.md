# D-I Hoops Lab

An interactive report and dashboard about recent NCAA Division I men’s basketball team performance.

## Pages

- `index.html` is the report page. It has ten evidence-based findings, headline numbers, and a chart for every finding.
- `dashboard.html` is the browser-side dashboard. It has filters for season, team, conference, venue, and result; four changing summary numbers; four changing charts; a two-team head-to-head comparison chart; a measure switch; a breakdown switch; a reset button; and an aggregation table.
- `assets/` contains the locally stored public-domain historical basketball photographs used as subtle page backgrounds, with credits in `assets/README.md`.

## Data

The project uses the public [ESPN men's college basketball team box-score release](https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/espn_mens_college_basketball_team_boxscores) from SportsDataverse and the public [2026 team crosswalk](https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/mbb_crosswalk).

The raw files cover seasons 2022–2026. The season number is the year the season ended, so season 2026 means 2025–26. The final analysis file is `data/team_box_2022_2026.csv`.

One row is one Division I team in one game. The final file contains 58,771 rows, 362 unique teams, and 30,946 unique games. The `conference` field comes from the 2026 crosswalk. Rows for teams absent from that Division I crosswalk are excluded; their names can still appear in the opponent columns when a Division I team played them.

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
- Team-game rows are used for averages. Unique game counts are calculated from `game_id` so the two team rows for a game are not counted as two games.

## Project files

See [`data/README.md`](data/README.md) for the data dictionary and source details. See [`submission-template.txt`](submission-template.txt) for the four-line submission file required by the project instructions.
