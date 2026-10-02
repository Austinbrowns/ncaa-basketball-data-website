"""Fit the report's reproducible postseason title-path proxy.

The browser uses the JSON written by this script. The model is intentionally
small and inspectable: regular-season team-season profiles are standardized
against team-seasons with postseason games, then a ridge-regularized weighted
logistic regression is fit to postseason wins / postseason games.
"""

from __future__ import annotations

import csv
import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "team_box_2022_2026.csv"
OUTPUT_PATH = ROOT / "data" / "march_model.json"
FEATURES = [
    {"key": "efg", "label": "Effective FG%", "shortLabel": "Shot quality", "definition": "(FGM + 0.5 × 3PM) ÷ FGA"},
    {"key": "turnoverRate", "label": "Turnover rate", "shortLabel": "Ball security", "definition": "Turnovers ÷ estimated possessions"},
    {"key": "orbRate", "label": "Offensive-rebound rate", "shortLabel": "Second chances", "definition": "ORB ÷ (ORB + opponent DRB)"},
    {"key": "freeThrowRate", "label": "Free-throw rate", "shortLabel": "Pressure at the line", "definition": "FTA ÷ FGA"},
]
RIDGE = 0.001
MIN_REGULAR_GAMES = 10


def as_number(value: str | None) -> float | None:
    if value is None or value == "":
        return None
    try:
        parsed = float(value)
    except ValueError:
        return None
    return parsed if math.isfinite(parsed) else None


def mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def standard_deviation(values: list[float], average: float) -> float:
    if not values:
        return 1.0
    deviation = math.sqrt(sum((value - average) ** 2 for value in values) / len(values))
    return deviation or 1.0


def row_metrics(row: dict[str, str], opponent: dict[str, str] | None) -> dict[str, float] | None:
    fga = as_number(row.get("field_goals_attempted"))
    fta = as_number(row.get("free_throws_attempted"))
    offensive_rebounds = as_number(row.get("offensive_rebounds"))
    efg = as_number(row.get("effective_fg_pct"))
    turnover_rate = as_number(row.get("turnover_rate_pct"))
    opponent_defensive_rebounds = as_number(opponent.get("defensive_rebounds")) if opponent else None
    if fga is None or fga == 0 or fta is None or offensive_rebounds is None or efg is None or turnover_rate is None:
        return None
    orb_denominator = offensive_rebounds + (opponent_defensive_rebounds or 0)
    if orb_denominator == 0:
        return None
    return {
        "efg": efg,
        "turnoverRate": turnover_rate,
        "orbRate": 100 * offensive_rebounds / orb_denominator,
        "freeThrowRate": 100 * fta / fga,
    }


def solve_linear_system(matrix: list[list[float]], vector: list[float]) -> list[float]:
    """Solve a small dense system with Gaussian elimination and pivoting."""
    size = len(vector)
    augmented = [row[:] + [vector[index]] for index, row in enumerate(matrix)]
    for column in range(size):
        pivot = max(range(column, size), key=lambda row: abs(augmented[row][column]))
        if abs(augmented[pivot][column]) < 1e-12:
            raise ValueError("Model matrix is singular")
        augmented[column], augmented[pivot] = augmented[pivot], augmented[column]
        pivot_value = augmented[column][column]
        augmented[column] = [value / pivot_value for value in augmented[column]]
        for row in range(size):
            if row == column:
                continue
            multiplier = augmented[row][column]
            if multiplier:
                augmented[row] = [left - multiplier * right for left, right in zip(augmented[row], augmented[column])]
    return [augmented[index][-1] for index in range(size)]


def logistic_probability(value: float) -> float:
    value = max(-40.0, min(40.0, value))
    return 1 / (1 + math.exp(-value))


def fit_weighted_logistic(profiles: list[dict[str, object]]) -> list[float]:
    """Fit aggregate binomial outcomes with Newton-Raphson and a tiny ridge."""
    dimension = 1 + len(FEATURES)
    coefficients = [0.0] * dimension

    def objective(values: list[float]) -> float:
        total = 0.0
        for profile in profiles:
            linear = values[0] + sum(values[index + 1] * float(profile["z"][feature["key"]]) for index, feature in enumerate(FEATURES))
            probability = logistic_probability(linear)
            wins = float(profile["postseasonWins"])
            games = float(profile["postseasonGames"])
            total += wins * math.log(probability) + (games - wins) * math.log(1 - probability)
        return total - 0.5 * RIDGE * sum(value * value for value in values[1:])

    for _ in range(100):
        gradient = [0.0] * dimension
        information = [[0.0 for _ in range(dimension)] for _ in range(dimension)]
        for profile in profiles:
            features = [1.0] + [float(profile["z"][feature["key"]]) for feature in FEATURES]
            linear = sum(left * right for left, right in zip(coefficients, features))
            probability = logistic_probability(linear)
            residual = float(profile["postseasonWins"]) - float(profile["postseasonGames"]) * probability
            weight = float(profile["postseasonGames"]) * probability * (1 - probability)
            for row in range(dimension):
                gradient[row] += features[row] * residual
                for column in range(dimension):
                    information[row][column] += features[row] * weight * features[column]
        for index in range(1, dimension):
            gradient[index] -= RIDGE * coefficients[index]
            information[index][index] += RIDGE

        step = solve_linear_system(information, gradient)
        current_objective = objective(coefficients)
        step_size = 1.0
        while step_size > 1e-8:
            candidate = [value + step_size * change for value, change in zip(coefficients, step)]
            if objective(candidate) >= current_objective:
                coefficients = candidate
                break
            step_size *= 0.5
        if max(abs(step_size * change) for change in step) < 1e-9:
            break
    return coefficients


def main() -> None:
    with DATA_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))

    games: dict[str, dict[str, dict[str, str]]] = defaultdict(dict)
    for row in rows:
        if row.get("season_phase") == "Regular season":
            games[row["game_id"]][row["team_id"]] = row

    buckets: dict[tuple[str, str], dict[str, object]] = {}
    for row in rows:
        if row.get("season_phase") != "Regular season":
            continue
        game = games.get(row["game_id"], {})
        opponent = game.get(row.get("opponent_team_id", ""))
        if opponent is None:
            opponent = next((candidate for candidate in game.values() if candidate.get("team_name") == row.get("opponent_team_name")), None)
        metrics = row_metrics(row, opponent)
        if metrics is None:
            continue
        key = (row["season_label"], row["team_id"])
        if key not in buckets:
            buckets[key] = {"key": f"{key[0]}::{key[1]}", "seasonLabel": key[0], "teamId": key[1], "team": row["team_name"], "values": []}
        buckets[key]["values"].append(metrics)

    postseason: dict[tuple[str, str], dict[str, int]] = defaultdict(lambda: {"games": 0, "wins": 0})
    for row in rows:
        if row.get("season_phase") != "Postseason":
            continue
        record = postseason[(row["season_label"], row["team_id"])]
        record["games"] += 1
        record["wins"] += 1 if row.get("result") == "Win" else 0

    profiles: list[dict[str, object]] = []
    for bucket in buckets.values():
        values = bucket["values"]
        if len(values) < MIN_REGULAR_GAMES:
            continue
        record = postseason[(bucket["seasonLabel"], bucket["teamId"])]
        profile = {key: mean([float(value[key]) for value in values]) for key in (feature["key"] for feature in FEATURES)}
        profile.update({"key": bucket["key"], "seasonLabel": bucket["seasonLabel"], "teamId": bucket["teamId"], "team": bucket["team"], "regularGames": len(values), "postseasonGames": record["games"], "postseasonWins": record["wins"]})
        profiles.append(profile)

    postseason_profiles = [profile for profile in profiles if profile["postseasonGames"] > 0]
    reference_profiles = postseason_profiles or profiles
    reference: dict[str, dict[str, float]] = {}
    for feature in FEATURES:
        key = feature["key"]
        values = [float(profile[key]) for profile in reference_profiles]
        average = mean(values)
        reference[key] = {"average": average, "deviation": standard_deviation(values, average)}

    for profile in postseason_profiles:
        profile["z"] = {feature["key"]: (float(profile[feature["key"]]) - reference[feature["key"]]["average"]) / reference[feature["key"]]["deviation"] for feature in FEATURES}
    coefficients = fit_weighted_logistic(postseason_profiles)
    for index, feature in enumerate(FEATURES, start=1):
        feature["coefficient"] = round(coefficients[index], 8)

    output = {
        "model_name": "Historical postseason title-path proxy",
        "path_length": 6,
        "intercept": round(coefficients[0], 8),
        "features": FEATURES,
        "fit": {
            "source_rows": len(rows),
            "regular_profile_count": len(profiles),
            "postseason_team_seasons": len(postseason_profiles),
            "postseason_team_game_rows": sum(int(profile["postseasonGames"]) for profile in postseason_profiles),
            "regular_profile_min_games": MIN_REGULAR_GAMES,
            "ridge": RIDGE,
            "standardization": "mean/std across team-seasons with postseason games",
            "outcome": "postseason wins out of postseason team-game rows",
            "generated_by": "scripts/fit-march-model.py",
        },
        "generated_utc": datetime.now(timezone.utc).isoformat(),
    }
    OUTPUT_PATH.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(OUTPUT_PATH), "intercept": output["intercept"], "coefficients": {feature["key"]: feature["coefficient"] for feature in FEATURES}, "postseason_team_seasons": len(postseason_profiles)}, indent=2))


if __name__ == "__main__":
    main()
