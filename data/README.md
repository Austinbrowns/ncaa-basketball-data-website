# Data files

## Source files

The files in `raw/` are downloaded from the public SportsDataverse GitHub release:

<https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/espn_mens_college_basketball_team_boxscores>

The Division I team crosswalk is from:

<https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/mbb_crosswalk>

The source documentation describes the team-box dataset as one row per team per game and provides the season-by-season row counts and column definitions:

<https://github.com/sportsdataverse/hoopR-mbb-data/blob/main/docs/datasets/team_box.md>

## Analysis file

`team_box_2022_2026.csv` is the normalized file loaded by the website. It contains five seasons, 58,771 retained rows, 362 unique D-I team IDs, 372 distinct display-name values across seasons, and 30,946 unique games. `march_model.json` is generated from this CSV by `scripts/fit-march-model.py` and supplies the report's fitted postseason coefficients.

The most important fields are:

| Field | Meaning |
| --- | --- |
| `season` / `season_label` | Season ending year and readable season label |
| `game_date` | Date of the game |
| `team_id` / `team_name` | Division I team identifier and display name |
| `conference` | Team’s conference from the 2026 crosswalk |
| `team_home_away` | Home or away status |
| `result` / `team_winner` | Win/loss result |
| `team_score` / `opponent_score` | Team and opponent final scores |
| `margin` | Team score minus opponent score |
| `field_goals_made`, `field_goals_attempted` | Field-goal totals |
| `three_point_field_goals_made`, `three_point_field_goals_attempted` | Three-point totals |
| `three_point_rate_pct` | 3PA divided by FGA, multiplied by 100 |
| `effective_fg_pct` | (FGM + 0.5 × 3PM) divided by FGA, multiplied by 100 |
| `free_throws_attempted` | Free-throw attempts |
| `points_in_paint` | Source points-in-paint total; used as a transparent proxy for shots around the rim and available in 2024–2026 |
| `total_rebounds`, `assists`, `steals`, `blocks`, `turnovers` | Team box-score totals |
| `possessions` | Estimated possessions = FGA − offensive rebounds + turnovers + 0.44 × FTA |
| `turnover_rate_pct` | Turnovers divided by estimated possessions, multiplied by 100 |

The website reports arithmetic means of nonmissing team-game values. Its other derived formulas are: offensive-rebound rate = ORB / (ORB + opponent DRB) × 100; free-throw rate = FTA / FGA × 100; points per possession = points / estimated possessions; win rate = wins / team-game rows × 100; and margin = team score − opponent score. Unique game totals count each `game_id` once, rather than counting both team rows. `points_in_paint` is the source's transparent proxy for shots around the rim; it is available for only part of the panel, so it is kept as context rather than used in the core model.

`quality.json` records the row counts and filtering performed by the preparation script.
