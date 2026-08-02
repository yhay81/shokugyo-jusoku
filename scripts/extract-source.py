"""Extract nationwide MHLW occupation openings and placements for 2023–2025."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

import openpyxl

YEARS = [2023, 2024, 2025]
OPENINGS_URL = "https://www.mhlw.go.jp/toukei/list/xls/114-1d-06.xlsx"
PLACEMENTS_URL = "https://www.mhlw.go.jp/toukei/list/xls/114-1d-08.xlsx"
SHEETS = {1: "a", 3: "f", 5: "t"}
PREFECTURES = [
    ("JP-01", "北海道"),
    ("JP-02", "青森"),
    ("JP-03", "岩手"),
    ("JP-04", "宮城"),
    ("JP-05", "秋田"),
    ("JP-06", "山形"),
    ("JP-07", "福島"),
    ("JP-08", "茨城"),
    ("JP-09", "栃木"),
    ("JP-10", "群馬"),
    ("JP-11", "埼玉"),
    ("JP-12", "千葉"),
    ("JP-13", "東京"),
    ("JP-14", "神奈川"),
    ("JP-15", "新潟"),
    ("JP-16", "富山"),
    ("JP-17", "石川"),
    ("JP-18", "福井"),
    ("JP-19", "山梨"),
    ("JP-20", "長野"),
    ("JP-21", "岐阜"),
    ("JP-22", "静岡"),
    ("JP-23", "愛知"),
    ("JP-24", "三重"),
    ("JP-25", "滋賀"),
    ("JP-26", "京都"),
    ("JP-27", "大阪"),
    ("JP-28", "兵庫"),
    ("JP-29", "奈良"),
    ("JP-30", "和歌山"),
    ("JP-31", "鳥取"),
    ("JP-32", "島根"),
    ("JP-33", "岡山"),
    ("JP-34", "広島"),
    ("JP-35", "山口"),
    ("JP-36", "徳島"),
    ("JP-37", "香川"),
    ("JP-38", "愛媛"),
    ("JP-39", "高知"),
    ("JP-40", "福岡"),
    ("JP-41", "佐賀"),
    ("JP-42", "長崎"),
    ("JP-43", "熊本"),
    ("JP-44", "大分"),
    ("JP-45", "宮崎"),
    ("JP-46", "鹿児島"),
    ("JP-47", "沖縄"),
]


def numeric(value: object) -> int | None:
    return int(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def load_table(
    path: Path,
    place_ids: dict[str, str],
    expected_occupations: dict[str, dict[str, str]] | None = None,
) -> tuple[dict, dict, dict]:
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    values: dict[tuple[str, str, str], list[int | None]] = {}
    occupations: dict[str, dict[str, str]] = {}
    group_names: dict[str, str] = {}
    try:
        for sheet_index, employment in SHEETS.items():
            sheet = workbook.worksheets[sheet_index]
            current_place: str | None = None
            current_group: str | None = None
            for row in sheet.iter_rows(min_row=3, max_col=5, values_only=True):
                if row[0] in place_ids:
                    current_place = place_ids[str(row[0])]
                label = str(row[1] or "").strip()
                group_match = re.match(r"^([Ａ-Ｋ])(.+)$", label)
                if group_match:
                    current_group = group_match.group(1)
                    group_names.setdefault(current_group, group_match.group(2))
                    continue
                occupation_match = re.match(r"^(\d{2})(.+)$", label)
                if current_place is None or current_group is None or not occupation_match:
                    continue
                occupation_id, occupation_name = occupation_match.groups()
                item = {"id": occupation_id, "name": occupation_name, "group": current_group}
                if expected_occupations is not None and expected_occupations.get(occupation_id) != item:
                    raise ValueError(f"occupation differs between sources: {label}")
                if occupations.setdefault(occupation_id, item) != item:
                    raise ValueError(f"occupation changed across sheets: {label}")
                key = (current_place, occupation_id, employment)
                if key in values:
                    raise ValueError(f"duplicate series: {key}")
                values[key] = [numeric(value) for value in row[2:5]]
    finally:
        workbook.close()
    return values, occupations, group_names


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("usage: extract-source.py OPENINGS.xlsx PLACEMENTS.xlsx OUTPUT_DIRECTORY")
    openings_path = Path(sys.argv[1])
    placements_path = Path(sys.argv[2])
    output_directory = Path(sys.argv[3])
    place_ids = {"全国計": "JP-00"} | {
        f"{name}労働局": item_id for item_id, name in PREFECTURES
    }
    openings, occupations, group_names = load_table(openings_path, place_ids)
    placements, placement_occupations, placement_groups = load_table(
        placements_path, place_ids, occupations
    )
    if occupations != placement_occupations or group_names != placement_groups:
        raise ValueError("occupation catalogue differs between sources")
    if len(occupations) != 73 or len(group_names) != 11:
        raise ValueError(
            f"unexpected catalogue: {len(occupations)} occupations, {len(group_names)} groups"
        )
    expected_series = 48 * len(occupations) * len(SHEETS)
    if len(openings) != expected_series or len(placements) != expected_series:
        raise ValueError(
            f"unexpected source dimensions: openings={len(openings)} placements={len(placements)}"
        )

    identity_checked = {"openings": 0, "placements": 0}
    national_sum_checked = {"openings": 0, "placements": 0}
    prefecture_ids = [item_id for item_id, _name in PREFECTURES]
    for label, source in (("openings", openings), ("placements", placements)):
        for place_id in place_ids.values():
            for occupation_id in occupations:
                for year_index, year in enumerate(YEARS):
                    all_value = source[(place_id, occupation_id, "a")][year_index]
                    full_value = source[(place_id, occupation_id, "f")][year_index]
                    part_value = source[(place_id, occupation_id, "t")][year_index]
                    if None not in (all_value, full_value, part_value):
                        identity_checked[label] += 1
                        if all_value != full_value + part_value:
                            raise ValueError(
                                f"employment identity mismatch: {label} {place_id} {occupation_id} {year}"
                            )
        for employment in SHEETS.values():
            for occupation_id in occupations:
                for year_index, year in enumerate(YEARS):
                    national = source[("JP-00", occupation_id, employment)][year_index]
                    parts = [
                        source[(place_id, occupation_id, employment)][year_index]
                        for place_id in prefecture_ids
                    ]
                    if national is not None and all(value is not None for value in parts):
                        national_sum_checked[label] += 1
                        if national != sum(parts):
                            raise ValueError(
                                f"national sum mismatch: {label} {employment} {occupation_id} {year}"
                            )

    records = []
    calculable_rates = 0
    unavailable_pairs = 0
    zero_denominators = 0
    over_100 = 0
    maximum_rate = 0.0
    available_values = 0
    for occupation_id in sorted(occupations):
        record: dict[str, object] = {"o": occupation_id}
        for employment in SHEETS.values():
            series = []
            for opening, placement in zip(
                openings[("JP-00", occupation_id, employment)],
                placements[("JP-00", occupation_id, employment)],
                strict=True,
            ):
                series.append([opening, placement])
                available_values += int(opening is not None) + int(placement is not None)
                if opening is None or placement is None:
                    unavailable_pairs += 1
                elif opening == 0:
                    zero_denominators += 1
                else:
                    rate = placement / opening * 100
                    calculable_rates += 1
                    over_100 += int(rate > 100)
                    maximum_rate = max(maximum_rate, rate)
            record[employment] = series
        records.append(record)

    pair_count = len(records) * len(SHEETS) * len(YEARS)
    index = {
        "schemaVersion": 1,
        "asOf": "2026-08-02",
        "edition": "2023〜2025年度（現行表・全国計）",
        "years": YEARS,
        "employmentCount": len(SHEETS),
        "groupCount": len(group_names),
        "occupationCount": len(occupations),
        "recordCount": len(records),
        "pairCount": pair_count,
        "sourceValueCount": pair_count * 2,
        "availableSourceValueCount": available_values,
        "unavailableSourceValueCount": pair_count * 2 - available_values,
        "calculableRateCount": calculable_rates,
        "unavailablePairCount": unavailable_pairs,
        "zeroDenominatorCount": zero_denominators,
        "over100Count": over_100,
        "maxRate": round(maximum_rate, 6),
        "employmentIdentityChecked": identity_checked,
        "nationalSumChecked": national_sum_checked,
        "groups": [
            {"id": group_id, "name": group_names[group_id]}
            for group_id in sorted(group_names)
        ],
        "occupations": [occupations[key] for key in sorted(occupations)],
        "sources": [
            {
                "kind": "openings",
                "url": OPENINGS_URL,
                "bytes": openings_path.stat().st_size,
                "sha256": hashlib.sha256(openings_path.read_bytes()).hexdigest(),
            },
            {
                "kind": "placements",
                "url": PLACEMENTS_URL,
                "bytes": placements_path.stat().st_size,
                "sha256": hashlib.sha256(placements_path.read_bytes()).hexdigest(),
            },
        ],
    }
    output_directory.mkdir(parents=True, exist_ok=True)
    (output_directory / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    (output_directory / "rates.json").write_text(
        json.dumps(records, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "calculable_rates": calculable_rates,
                "occupations": len(occupations),
                "pairs": pair_count,
                "source_values": pair_count * 2,
                "zero_denominators": zero_denominators,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
