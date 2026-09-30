Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$RawDirectory = Join-Path $ProjectRoot 'data\raw'
$OutputDirectory = Join-Path $ProjectRoot 'data'
$OutputFile = Join-Path $OutputDirectory 'team_box_2022_2026.csv'
$QualityFile = Join-Path $OutputDirectory 'quality.json'

function Get-Field {
    param(
        [Parameter(Mandatory = $true)] $Row,
        [Parameter(Mandatory = $true)] [string] $Name
    )

    $Property = $Row.PSObject.Properties[$Name]
    if ($null -eq $Property) {
        return $null
    }

    return $Property.Value
}

function Convert-ToNumber {
    param([AllowNull()] $Value)

    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) {
        return $null
    }

    return [double]::Parse([string]$Value, [Globalization.CultureInfo]::InvariantCulture)
}

function Convert-ToBooleanText {
    param([AllowNull()] $Value)

    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) {
        return $null
    }

    if ([string]$Value -match '^(?i:true|1)$') {
        return 'true'
    }

    return 'false'
}

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

$CrosswalkFile = Join-Path $RawDirectory 'mbb_team_crosswalk_2026.csv'
$D1Teams = @{}
$D1Rows = Import-Csv -LiteralPath $CrosswalkFile
foreach ($Team in $D1Rows) {
    $D1Teams[[string]$Team.espn_team_id] = $Team
}

$Records = [System.Collections.Generic.List[object]]::new()
$RawRows = 0
$DroppedRows = 0
$Files = Get-ChildItem -LiteralPath $RawDirectory -Filter 'team_box_*.csv' | Sort-Object Name

foreach ($File in $Files) {
    Write-Host "Reading $($File.Name)..."
    $Rows = Import-Csv -LiteralPath $File.FullName
    $RawRows += $Rows.Count

    foreach ($Row in $Rows) {
        $TeamId = [string](Get-Field $Row 'team_id')
        $TeamScore = Convert-ToNumber (Get-Field $Row 'team_score')
        $OpponentScore = Convert-ToNumber (Get-Field $Row 'opponent_team_score')
        $Season = Convert-ToNumber (Get-Field $Row 'season')

        if ([string]::IsNullOrWhiteSpace($TeamId) -or
            -not $D1Teams.ContainsKey($TeamId) -or
            $null -eq $TeamScore -or
            $null -eq $OpponentScore -or
            $null -eq $Season) {
            $DroppedRows++
            continue
        }

        $Winner = Convert-ToBooleanText (Get-Field $Row 'team_winner')
        $FieldGoalsMade = Convert-ToNumber (Get-Field $Row 'field_goals_made')
        $FieldGoalsAttempted = Convert-ToNumber (Get-Field $Row 'field_goals_attempted')
        $ThreePointMade = Convert-ToNumber (Get-Field $Row 'three_point_field_goals_made')
        $ThreePointAttempted = Convert-ToNumber (Get-Field $Row 'three_point_field_goals_attempted')
        $FreeThrowsAttempted = Convert-ToNumber (Get-Field $Row 'free_throws_attempted')
        $OffensiveRebounds = Convert-ToNumber (Get-Field $Row 'offensive_rebounds')
        $Turnovers = Convert-ToNumber (Get-Field $Row 'turnovers')

        $ThreePointRate = $null
        if ($null -ne $FieldGoalsAttempted -and $FieldGoalsAttempted -gt 0 -and $null -ne $ThreePointAttempted) {
            $ThreePointRate = [math]::Round(100 * $ThreePointAttempted / $FieldGoalsAttempted, 2)
        }

        $EffectiveFieldGoalPct = $null
        if ($null -ne $FieldGoalsAttempted -and $FieldGoalsAttempted -gt 0 -and $null -ne $FieldGoalsMade -and $null -ne $ThreePointMade) {
            $EffectiveFieldGoalPct = [math]::Round(100 * ($FieldGoalsMade + (0.5 * $ThreePointMade)) / $FieldGoalsAttempted, 2)
        }

        $Possessions = $null
        if ($null -ne $FieldGoalsAttempted -and $null -ne $OffensiveRebounds -and $null -ne $Turnovers -and $null -ne $FreeThrowsAttempted) {
            $Possessions = [math]::Round($FieldGoalsAttempted - $OffensiveRebounds + $Turnovers + (0.44 * $FreeThrowsAttempted), 2)
        }

        $TurnoverRate = $null
        if ($null -ne $Possessions -and $Possessions -gt 0 -and $null -ne $Turnovers) {
            $TurnoverRate = [math]::Round(100 * $Turnovers / $Possessions, 2)
        }

        $SeasonNumber = [int]$Season
        $SeasonLabel = '{0}-{1:D2}' -f ($SeasonNumber - 1), ($SeasonNumber % 100)
        $SeasonType = [string](Get-Field $Row 'season_type')
        $SeasonPhase = switch ($SeasonType) {
            '2' { 'Regular season'; break }
            '3' { 'Postseason'; break }
            default { 'Other' }
        }
        $TeamWinner = if ($Winner -eq 'true') { 'true' } else { 'false' }
        $D1Team = $D1Teams[$TeamId]

        $Records.Add([ordered]@{
            game_id = Get-Field $Row 'game_id'
            season = $SeasonNumber
            season_label = $SeasonLabel
            season_type = $SeasonType
            season_phase = $SeasonPhase
            game_date = Get-Field $Row 'game_date'
            game_date_time = Get-Field $Row 'game_date_time'
            team_id = $TeamId
            team_name = Get-Field $Row 'team_display_name'
            team_location = Get-Field $Row 'team_location'
            team_abbreviation = Get-Field $Row 'team_abbreviation'
            conference = $D1Team.espn_conference
            team_home_away = Get-Field $Row 'team_home_away'
            result = if ($TeamWinner -eq 'true') { 'Win' } else { 'Loss' }
            team_winner = $TeamWinner
            team_score = $TeamScore
            opponent_team_id = Get-Field $Row 'opponent_team_id'
            opponent_team_name = Get-Field $Row 'opponent_team_display_name'
            opponent_team_location = Get-Field $Row 'opponent_team_location'
            opponent_score = $OpponentScore
            margin = $TeamScore - $OpponentScore
            assists = Convert-ToNumber (Get-Field $Row 'assists')
            blocks = Convert-ToNumber (Get-Field $Row 'blocks')
            defensive_rebounds = Convert-ToNumber (Get-Field $Row 'defensive_rebounds')
            offensive_rebounds = Convert-ToNumber (Get-Field $Row 'offensive_rebounds')
            total_rebounds = Convert-ToNumber (Get-Field $Row 'total_rebounds')
            steals = Convert-ToNumber (Get-Field $Row 'steals')
            turnovers = Convert-ToNumber (Get-Field $Row 'turnovers')
            total_turnovers = Convert-ToNumber (Get-Field $Row 'total_turnovers')
            fouls = Convert-ToNumber (Get-Field $Row 'fouls')
            field_goals_made = $FieldGoalsMade
            field_goals_attempted = $FieldGoalsAttempted
            field_goal_pct = Convert-ToNumber (Get-Field $Row 'field_goal_pct')
            three_point_field_goals_made = $ThreePointMade
            three_point_field_goals_attempted = $ThreePointAttempted
            three_point_field_goal_pct = Convert-ToNumber (Get-Field $Row 'three_point_field_goal_pct')
            three_point_rate_pct = $ThreePointRate
            effective_fg_pct = $EffectiveFieldGoalPct
            free_throws_made = Convert-ToNumber (Get-Field $Row 'free_throws_made')
            free_throws_attempted = Convert-ToNumber (Get-Field $Row 'free_throws_attempted')
            free_throw_pct = Convert-ToNumber (Get-Field $Row 'free_throw_pct')
            team_turnovers = Convert-ToNumber (Get-Field $Row 'team_turnovers')
            points_in_paint = Convert-ToNumber (Get-Field $Row 'points_in_paint')
            possessions = $Possessions
            turnover_rate_pct = $TurnoverRate
        })
    }
}

$Records | Export-Csv -LiteralPath $OutputFile -NoTypeInformation -Encoding UTF8

$Quality = [ordered]@{
    source_seasons = @(2022, 2023, 2024, 2025, 2026)
    raw_rows = $RawRows
    retained_rows = $Records.Count
    dropped_rows = $DroppedRows
    d1_teams_in_crosswalk = $D1Teams.Count
    unique_d1_teams_in_output = @($Records | ForEach-Object { $_.team_id } | Sort-Object -Unique).Count
    unique_games_in_output = @($Records | ForEach-Object { $_.game_id } | Sort-Object -Unique).Count
    source = 'ESPN Men''s College Basketball Team Box Scores via SportsDataverse'
    crosswalk = 'ESPN 2026 team crosswalk via SportsDataverse'
    generated_utc = [DateTime]::UtcNow.ToString('o')
}
$Quality | ConvertTo-Json | Set-Content -LiteralPath $QualityFile -Encoding UTF8

Write-Host "Wrote $($Records.Count) retained rows to $OutputFile"
Write-Host "Dropped $DroppedRows non-D-I or incomplete rows"
