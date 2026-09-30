"""Build the GitHub-friendly, Division I-only analysis file.

The raw files are public ESPN/SportsDataverse exports. This script keeps rows
whose team_id appears in the 2026 ESPN Division I crosswalk, normalizes the
small schema changes between seasons, and writes derived fields used by the
report and dashboard.
"""

from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUTPUT = ROOT / "data" / "team_box_2022_2026.csv"
QUALITY = ROOT / "data" / "quality.json"


def text(row: dict[str, str], key: str) -> str:
    return (row.get(key) or "").strip()


def number(row: dict[str, str], key: str) -> float | None:
    value = text(row, key)
    if not value:
        return None
    return float(value)


def bool_text(value: str) -> str:
    return "true" if value.lower() in {"true", "1", "yes"} else "false"


def clean_number(value: float | None) -> str:
    if value is None:
        return ""
    if value.is_integer():
        return str(int(value))
    return f"{value:.2f}".rstrip("0").rstrip(".")


def main() -> None:
    with (RAW / "mbb_team_crosswalk_2026.csv").open(newline="", encoding="utf-8-sig") as handle:
        crosswalk = {row["espn_team_id"]: row for row in csv.DictReader(handle)}

    fields = [
        "game_id", "season", "season_label", "season_type", "season_phase",
        "game_date", "game_date_time", "team_id", "team_name", "team_location",
        "team_abbreviation", "conference", "team_home_away", "result", "team_winner",
        "team_score", "opponent_team_id", "opponent_team_name", "opponent_team_location",
        "opponent_score", "margin", "assists", "blocks", "defensive_rebounds",
        "offensive_rebounds", "total_rebounds", "steals", "turnovers", "total_turnovers",
        "fouls", "field_goals_made", "field_goals_attempted", "field_goal_pct",
        "three_point_field_goals_made", "three_point_field_goals_attempted",
        "three_point_field_goal_pct", "three_point_rate_pct", "effective_fg_pct",
        "free_throws_made", "free_throws_attempted", "free_throw_pct", "team_turnovers",
        "points_in_paint", "possessions", "turnover_rate_pct",
    ]

    raw_rows = 0
    dropped_rows = 0
    retained = []

    for source in sorted(RAW.glob("team_box_*.csv")):
        print(f"Reading {source.name}...")
        with source.open(newline="", encoding="utf-8-sig") as handle:
            for row in csv.DictReader(handle):
                raw_rows += 1
                team_id = text(row, "team_id")
                season_text = text(row, "season")
                team_score = number(row, "team_score")
                opponent_score = number(row, "opponent_team_score")
                if team_id not in crosswalk or not season_text or team_score is None or opponent_score is None:
                    dropped_rows += 1
                    continue

                season = int(float(season_text))
                winner = bool_text(text(row, "team_winner"))
                fgm = number(row, "field_goals_made")
                fga = number(row, "field_goals_attempted")
                tpm = number(row, "three_point_field_goals_made")
                tpa = number(row, "three_point_field_goals_attempted")
                fta = number(row, "free_throws_attempted")
                orb = number(row, "offensive_rebounds")
                turnovers = number(row, "turnovers")
                three_rate = 100 * tpa / fga if fga and tpa is not None else None
                efg = 100 * (fgm + 0.5 * tpm) / fga if fga and fgm is not None and tpm is not None else None
                possessions = fga - orb + turnovers + (0.44 * fta) if all(value is not None for value in (fga, orb, turnovers, fta)) else None
                turnover_rate = 100 * turnovers / possessions if possessions and turnovers is not None else None
                phase = {"2": "Regular season", "3": "Postseason"}.get(text(row, "season_type"), "Other")

                item = {
                    "game_id": text(row, "game_id"),
                    "season": str(season),
                    "season_label": f"{season - 1}-{season % 100:02d}",
                    "season_type": text(row, "season_type"),
                    "season_phase": phase,
                    "game_date": text(row, "game_date"),
                    "game_date_time": text(row, "game_date_time"),
                    "team_id": team_id,
                    "team_name": text(row, "team_display_name"),
                    "team_location": text(row, "team_location"),
                    "team_abbreviation": text(row, "team_abbreviation"),
                    "conference": crosswalk[team_id]["espn_conference"],
                    "team_home_away": text(row, "team_home_away"),
                    "result": "Win" if winner == "true" else "Loss",
                    "team_winner": winner,
                    "team_score": clean_number(team_score),
                    "opponent_team_id": text(row, "opponent_team_id"),
                    "opponent_team_name": text(row, "opponent_team_display_name"),
                    "opponent_team_location": text(row, "opponent_team_location"),
                    "opponent_score": clean_number(opponent_score),
                    "margin": clean_number(team_score - opponent_score),
                }

                numeric_fields = [
                    "assists", "blocks", "defensive_rebounds", "offensive_rebounds", "total_rebounds",
                    "steals", "turnovers", "total_turnovers", "fouls", "field_goals_made",
                    "field_goals_attempted", "field_goal_pct", "three_point_field_goals_made",
                    "three_point_field_goals_attempted", "three_point_field_goal_pct", "free_throws_made",
                    "free_throws_attempted", "free_throw_pct", "team_turnovers",
                ]
                for field in numeric_fields:
                    item[field] = clean_number(number(row, field))
                item["three_point_rate_pct"] = clean_number(three_rate)
                item["effective_fg_pct"] = clean_number(efg)
                item["points_in_paint"] = clean_number(number(row, "points_in_paint"))
                item["possessions"] = clean_number(possessions)
                item["turnover_rate_pct"] = clean_number(turnover_rate)
                retained.append(item)

    with OUTPUT.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(retained)

    quality = {
        "source_seasons": [2022, 2023, 2024, 2025, 2026],
        "raw_rows": raw_rows,
        "retained_rows": len(retained),
        "dropped_rows": dropped_rows,
        "d1_teams_in_crosswalk": len(crosswalk),
        "unique_d1_teams_in_output": len({row["team_id"] for row in retained}),
        "unique_games_in_output": len({row["game_id"] for row in retained}),
        "source": "ESPN Men's College Basketball Team Box Scores via SportsDataverse",
        "crosswalk": "ESPN 2026 team crosswalk via SportsDataverse",
        "generated_utc": datetime.now(timezone.utc).isoformat(),
    }
    QUALITY.write_text(json.dumps(quality, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(quality, indent=2))


if __name__ == "__main__":
    main()
