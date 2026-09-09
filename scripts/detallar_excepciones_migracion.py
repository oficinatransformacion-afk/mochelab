"""Amplía el diagnóstico con ejemplos y posibilidades de resolución automática."""

from __future__ import annotations

import argparse
import json
import math
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


def read(batch: Path, name: str) -> list[dict[str, Any]]:
    with (batch / f"{name}.jsonl").open(encoding="utf-8") as source:
        return [json.loads(line) for line in source]


def raw(row: dict[str, Any], field: str) -> Any:
    return row["data"].get(field)


def text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and math.isfinite(value) and value.is_integer():
        return str(int(value))
    return re.sub(r"\s+", " ", str(value).strip())


def semantic(value: Any) -> str:
    plain = unicodedata.normalize("NFKD", text(value)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", plain.casefold()).strip()


def code(value: Any) -> str:
    return semantic(value).replace(" ", "_").upper()


def duplicate_examples(rows: list[dict[str, Any]], fields: tuple[str, ...]) -> list[dict[str, Any]]:
    groups: dict[tuple[str, ...], list[int]] = defaultdict(list)
    for row in rows:
        item = tuple(text(raw(row, field)) for field in fields)
        if all(item):
            groups[item].append(row["_source_row"])
    return [{"key": list(item), "rows": source_rows} for item, source_rows in groups.items() if len(source_rows) > 1]


def top_orphans(rows: list[dict[str, Any]], field: str, valid: set[str]) -> list[dict[str, Any]]:
    counter = Counter(text(raw(row, field)) for row in rows if text(raw(row, field)) and text(raw(row, field)) not in valid)
    return [{"value": item, "count": count} for item, count in counter.most_common(20)]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("batch", type=Path)
    args = parser.parse_args()
    batch = args.batch.resolve(strict=True)
    people, assignments, person_courses = read(batch, "persona"), read(batch, "personarol"), read(batch, "personacurso")
    teams, objectives, portfolio = read(batch, "equipo"), read(batch, "objetivos"), read(batch, "portafolio")
    roles, courses = read(batch, "rol"), read(batch, "curso")
    team_maturity, role_maturity, users = read(batch, "madurezequipo"), read(batch, "madurezrol"), read(batch, "usuario")

    person_ids = {text(raw(row, "DNI")) for row in people}
    role_ids = {text(raw(row, "ID_ROL")) for row in roles}
    team_ids = {text(raw(row, "ID_TEAM")) for row in teams}
    course_ids = {text(raw(row, "ID_CURSO")) for row in courses}
    objective_ids = {text(raw(row, "ID_OKR")) for row in objectives}

    objective_indexes: dict[str, dict[tuple[str, ...], list[str]]] = {
        "year_team_text": defaultdict(list), "year_text": defaultdict(list), "text": defaultdict(list)
    }
    for row in objectives:
        objective_id = text(raw(row, "ID_OKR"))
        year, team = text(raw(row, "ANIO")), text(raw(row, "ID_TEAM"))
        objective, result = semantic(raw(row, "OBJETIVO")), semantic(raw(row, "RESULTADO_CLAVE"))
        objective_indexes["year_team_text"][(year, team, objective, result)].append(objective_id)
        objective_indexes["year_text"][(year, objective, result)].append(objective_id)
        objective_indexes["text"][(objective, result)].append(objective_id)

    external_missing = [row for row in portfolio if code(raw(row, "TIPO_INICIATIVA")) != "GESTION_INTERNA" and not text(raw(row, "ID_OKR"))]
    recovery = Counter()
    recovery_examples: dict[str, list[int]] = defaultdict(list)
    for row in external_missing:
        keys = [
            ("year_team_text", (text(raw(row, "ANIO")), text(raw(row, "ID_TEAM")), semantic(raw(row, "OBJETIVO")), semantic(raw(row, "RESULTADO_CLAVE")))),
            ("year_text", (text(raw(row, "ANIO")), semantic(raw(row, "OBJETIVO")), semantic(raw(row, "RESULTADO_CLAVE")))),
            ("text", (semantic(raw(row, "OBJETIVO")), semantic(raw(row, "RESULTADO_CLAVE")))),
        ]
        outcome = "sin_coincidencia"
        for name, item in keys:
            matches = list(dict.fromkeys(objective_indexes[name].get(item, [])))
            if len(matches) == 1:
                outcome = f"unica_{name}"
                break
            if len(matches) > 1:
                outcome = f"multiple_{name}"
                break
        recovery[outcome] += 1
        if len(recovery_examples[outcome]) < 10:
            recovery_examples[outcome].append(row["_source_row"])

    assignments_by_pair: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in assignments:
        assignments_by_pair[(text(raw(row, "DNI")), text(raw(row, "ID_ROL")))].append(row)

    def mapping_examples(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        result = []
        for row in rows:
            pair = (text(raw(row, "DNI")), text(raw(row, "ID_ROL")))
            matches = assignments_by_pair.get(pair, [])
            active = [match for match in matches if code(raw(match, "ESTADO_PERSONA_ROL")) == "ACTIVO"]
            if not matches or len(active) > 1:
                result.append({
                    "row": row["_source_row"], "dni": pair[0], "role": pair[1],
                    "matches": len(matches), "active_matches": len(active),
                    "teams": sorted({text(raw(match, "ID_TEAM")) for match in matches}),
                })
            if len(result) >= 20:
                break
        return result

    invalid_profiles = Counter(code(raw(row, "PERFIL")) for row in users if code(raw(row, "PERFIL")) not in {"USUARIO", "ADMIN", "SYSTEM"})
    portfolio_by_type = Counter(code(raw(row, "TIPO_INICIATIVA")) for row in portfolio)
    blank_team_by_type = Counter(code(raw(row, "TIPO_INICIATIVA")) for row in portfolio if not text(raw(row, "ID_TEAM")))
    blank_size_by_type = Counter(code(raw(row, "TIPO_INICIATIVA")) for row in portfolio if not text(raw(row, "TALLA")))

    details = {
        "duplicates": {
            "people_dni": duplicate_examples(people, ("DNI",)),
            "people_email": duplicate_examples(people, ("CORREO",)),
            "team_maturity": duplicate_examples(team_maturity, ("ID_TEAM", "FECHA_MADUREZ")),
            "role_maturity": duplicate_examples(role_maturity, ("DNI", "ID_ROL", "FECHA_MADUREZ")),
        },
        "orphan_values": {
            "objectives_team": top_orphans(objectives, "ID_TEAM", team_ids),
            "objectives_parent": top_orphans(objectives, "ID_OKR_PADRE", objective_ids),
            "role_maturity_dni": top_orphans(role_maturity, "DNI", person_ids),
            "role_maturity_role": top_orphans(role_maturity, "ID_ROL", role_ids),
            "person_course_role": top_orphans(person_courses, "ID_ROL", role_ids),
            "person_course_course": top_orphans(person_courses, "ID_CURSO", course_ids),
        },
        "portfolio": {
            "types": portfolio_by_type,
            "blank_team_by_type": blank_team_by_type,
            "blank_size_by_type": blank_size_by_type,
            "external_missing_objective_recovery": recovery,
            "recovery_example_rows": recovery_examples,
        },
        "mapping_examples": {
            "person_course": mapping_examples(person_courses),
            "role_maturity": mapping_examples(role_maturity),
        },
        "users": {"invalid_profiles": invalid_profiles},
    }
    output = batch / "quality_details.json"
    output.write_text(json.dumps(details, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(details, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
