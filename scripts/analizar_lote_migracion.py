"""Diagnóstico de calidad y relaciones de un lote JSONL extraído del Excel legado."""

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
    path = batch / f"{name.lower()}.jsonl"
    with path.open(encoding="utf-8") as source:
        return [json.loads(line) for line in source]


def value(record: dict[str, Any], field: str) -> Any:
    return record["data"].get(field)


def key(raw: Any) -> str:
    if raw is None:
        return ""
    if isinstance(raw, float) and math.isfinite(raw) and raw.is_integer():
        return str(int(raw))
    return re.sub(r"\s+", " ", str(raw).strip())


def code(raw: Any) -> str:
    text = unicodedata.normalize("NFKD", key(raw)).encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Z0-9]+", "_", text.upper()).strip("_")


def duplicates(records: list[dict[str, Any]], fields: tuple[str, ...]) -> dict[str, int]:
    counts = Counter(tuple(key(value(row, field)) for field in fields) for row in records)
    repeated = [count for item, count in counts.items() if all(item) and count > 1]
    return {"keys": len(repeated), "extra_rows": sum(count - 1 for count in repeated), "rows": sum(repeated)}


def blanks(records: list[dict[str, Any]], fields: tuple[str, ...]) -> dict[str, int]:
    return {field: sum(not key(value(row, field)) for row in records) for field in fields}


def orphans(records: list[dict[str, Any]], field: str, parent: set[str]) -> int:
    return sum(bool(key(value(row, field))) and key(value(row, field)) not in parent for row in records)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("batch", type=Path)
    args = parser.parse_args()
    batch = args.batch.resolve(strict=True)

    people = read(batch, "persona")
    assignments = read(batch, "personarol")
    person_courses = read(batch, "personacurso")
    teams = read(batch, "equipo")
    objectives = read(batch, "objetivos")
    portfolio = read(batch, "portafolio")
    roles = read(batch, "rol")
    courses = read(batch, "curso")
    targets = read(batch, "metasindicadores")
    role_courses = read(batch, "rolcurso")
    team_maturity = read(batch, "madurezequipo")
    role_maturity = read(batch, "madurezrol")
    audits = read(batch, "auditoria")
    users = read(batch, "usuario")

    person_ids = {key(value(row, "DNI")) for row in people if key(value(row, "DNI"))}
    role_ids = {key(value(row, "ID_ROL")) for row in roles if key(value(row, "ID_ROL"))}
    team_ids = {key(value(row, "ID_TEAM")) for row in teams if key(value(row, "ID_TEAM"))}
    course_ids = {key(value(row, "ID_CURSO")) for row in courses if key(value(row, "ID_CURSO"))}
    objective_ids = {key(value(row, "ID_OKR")) for row in objectives if key(value(row, "ID_OKR"))}

    assignment_matches: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    active_assignment_matches: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in assignments:
        pair = (key(value(row, "DNI")), key(value(row, "ID_ROL")))
        assignment_matches[pair].append(row)
        if code(value(row, "ESTADO_PERSONA_ROL")) == "ACTIVO":
            active_assignment_matches[pair].append(row)

    course_no_assignment = 0
    course_ambiguous_active = 0
    course_ambiguous_all = 0
    for row in person_courses:
        pair = (key(value(row, "DNI")), key(value(row, "ID_ROL")))
        all_matches = assignment_matches.get(pair, [])
        active_matches = active_assignment_matches.get(pair, [])
        if not all_matches:
            course_no_assignment += 1
        if len(active_matches) > 1:
            course_ambiguous_active += 1
        if len(all_matches) > 1:
            course_ambiguous_all += 1

    maturity_no_assignment = 0
    maturity_ambiguous_active = 0
    maturity_ambiguous_all = 0
    for row in role_maturity:
        pair = (key(value(row, "DNI")), key(value(row, "ID_ROL")))
        all_matches = assignment_matches.get(pair, [])
        active_matches = active_assignment_matches.get(pair, [])
        if not all_matches:
            maturity_no_assignment += 1
        if len(active_matches) > 1:
            maturity_ambiguous_active += 1
        if len(all_matches) > 1:
            maturity_ambiguous_all += 1

    invalid_grades = []
    for row in person_courses:
        raw = value(row, "NOTA")
        if raw in (None, ""):
            continue
        try:
            grade = float(raw)
        except (TypeError, ValueError):
            invalid_grades.append(row["_source_row"])
            continue
        if grade < 0 or grade > 20:
            invalid_grades.append(row["_source_row"])

    internal = [row for row in portfolio if code(value(row, "TIPO_INICIATIVA")) == "GESTION_INTERNA"]
    external = [row for row in portfolio if code(value(row, "TIPO_INICIATIVA")) != "GESTION_INTERNA"]
    portfolio_headers = set(portfolio[0]["data"]) if portfolio else set()
    missing_new_columns = [
        field for field in ("AREA_EJECUCION", "INVERSION_PROYECTADA", "INVERSION_EJECUTADA")
        if field not in portfolio_headers
    ]

    email_counts = Counter(key(value(row, "CORREO")).casefold() for row in people if key(value(row, "CORREO")))
    person_emails = set(email_counts)
    user_emails = [key(value(row, "USUARIO")).casefold() for row in users]
    allowed_profiles = {"USUARIO", "ADMIN", "SYSTEM"}

    report = {
        "batch": batch.name,
        "counts": {
            "Persona": len(people), "PersonaRol": len(assignments), "PersonaCurso": len(person_courses),
            "Equipo": len(teams), "Objetivos": len(objectives), "Portafolio": len(portfolio),
            "Rol": len(roles), "Curso": len(courses), "MetasIndicadores": len(targets),
            "RolCurso": len(role_courses), "MadurezEquipo": len(team_maturity),
            "MadurezRol": len(role_maturity), "Auditoria": len(audits), "Usuario": len(users),
        },
        "duplicates": {
            "Persona.DNI": duplicates(people, ("DNI",)),
            "Persona.CORREO": duplicates(people, ("CORREO",)),
            "PersonaRol.DNI_ROL_EQUIPO": duplicates(assignments, ("DNI", "ID_ROL", "ID_TEAM")),
            "PersonaCurso.DNI_ROL_CURSO": duplicates(person_courses, ("DNI", "ID_ROL", "ID_CURSO")),
            "Equipo.ID_TEAM": duplicates(teams, ("ID_TEAM",)),
            "Objetivos.ID_OKR": duplicates(objectives, ("ID_OKR",)),
            "Portafolio.ID_INICIATIVA": duplicates(portfolio, ("ID_INICIATIVA",)),
            "Rol.ID_ROL": duplicates(roles, ("ID_ROL",)),
            "Curso.ID_CURSO": duplicates(courses, ("ID_CURSO",)),
            "RolCurso.ROL_CURSO": duplicates(role_courses, ("ID_ROL", "ID_CURSO")),
            "MadurezEquipo.EQUIPO_FECHA": duplicates(team_maturity, ("ID_TEAM", "FECHA_MADUREZ")),
            "MadurezRol.DNI_ROL_FECHA": duplicates(role_maturity, ("DNI", "ID_ROL", "FECHA_MADUREZ")),
            "Usuario.USUARIO": duplicates(users, ("USUARIO",)),
        },
        "orphans": {
            "PersonaRol.DNI": orphans(assignments, "DNI", person_ids),
            "PersonaRol.ID_ROL": orphans(assignments, "ID_ROL", role_ids),
            "PersonaRol.ID_TEAM": orphans(assignments, "ID_TEAM", team_ids),
            "PersonaCurso.DNI": orphans(person_courses, "DNI", person_ids),
            "PersonaCurso.ID_ROL": orphans(person_courses, "ID_ROL", role_ids),
            "PersonaCurso.ID_CURSO": orphans(person_courses, "ID_CURSO", course_ids),
            "Objetivos.ID_TEAM": orphans(objectives, "ID_TEAM", team_ids),
            "Objetivos.ID_OKR_PADRE": orphans(objectives, "ID_OKR_PADRE", objective_ids),
            "Portafolio.ID_TEAM": orphans(portfolio, "ID_TEAM", team_ids),
            "Portafolio.ID_OKR": orphans(portfolio, "ID_OKR", objective_ids),
            "RolCurso.ID_ROL": orphans(role_courses, "ID_ROL", role_ids),
            "RolCurso.ID_CURSO": orphans(role_courses, "ID_CURSO", course_ids),
            "MadurezEquipo.ID_TEAM": orphans(team_maturity, "ID_TEAM", team_ids),
            "MadurezRol.DNI": orphans(role_maturity, "DNI", person_ids),
            "MadurezRol.ID_ROL": orphans(role_maturity, "ID_ROL", role_ids),
        },
        "required_blanks": {
            "Persona": blanks(people, ("DNI", "NOMBRES", "CORREO", "EMPRESA", "ESTADO")),
            "PersonaRol": blanks(assignments, ("DNI", "ID_ROL", "ID_TEAM", "ESTADO_PERSONA_ROL", "ESTADO_ONBOARDING")),
            "PersonaCurso": blanks(person_courses, ("DNI", "ID_ROL", "ID_CURSO", "ESTADO_PERSONA_CURSO")),
            "Equipo": blanks(teams, ("ID_TEAM", "PROGRAMA", "ESTADO")),
            "Objetivos": blanks(objectives, ("ID_OKR", "NIVEL", "AREA_ENFOQUE", "ANIO", "CICLO", "OBJETIVO", "RESULTADO_CLAVE", "INDICADOR", "TIPO", "ESTADO_REGISTRO")),
            "Portafolio": blanks(portfolio, ("ID_INICIATIVA", "ID_TEAM", "EMPRESA", "ANIO", "CICLO", "AREA_ENFOQUE", "NIVEL", "PROGRAMA", "TIPO_INICIATIVA", "TALLA", "INICIATIVA", "TIPO_GESTION", "ESTADO_INICIATIVA", "IMPACTO", "ID_OKR")),
        },
        "assignment_mapping": {
            "PersonaCurso.sin_asignacion": course_no_assignment,
            "PersonaCurso.varias_asignaciones_activas": course_ambiguous_active,
            "PersonaCurso.varias_asignaciones_totales": course_ambiguous_all,
            "MadurezRol.sin_asignacion": maturity_no_assignment,
            "MadurezRol.varias_asignaciones_activas": maturity_ambiguous_active,
            "MadurezRol.varias_asignaciones_totales": maturity_ambiguous_all,
        },
        "portfolio_rules": {
            "gestion_interna": len(internal),
            "otros_tipos": len(external),
            "columnas_nuevas_ausentes": missing_new_columns,
            "gestion_interna_sin_id_okr": sum(not key(value(row, "ID_OKR")) for row in internal),
            "gestion_interna_sin_horizonte": sum(not key(value(row, "HORIZONTE_RETORNO")) for row in internal),
            "otros_sin_id_okr": sum(not key(value(row, "ID_OKR")) for row in external),
            "otros_sin_horizonte": sum(not key(value(row, "HORIZONTE_RETORNO")) for row in external),
        },
        "course_quality": {
            "notas_fuera_0_20_o_no_numericas": len(invalid_grades),
            "filas": invalid_grades[:100],
            "terminados_sin_fecha_fin": sum(code(value(row, "ESTADO_PERSONA_CURSO")) in {"TERMINADO", "APROBADO", "COMPLETADO"} and not key(value(row, "FECHA_FIN")) for row in person_courses),
            "terminados_sin_nota": sum(code(value(row, "ESTADO_PERSONA_CURSO")) in {"TERMINADO", "APROBADO", "COMPLETADO"} and not key(value(row, "NOTA")) for row in person_courses),
        },
        "users": {
            "sin_persona_por_correo": sum(bool(email) and email not in person_emails for email in user_emails),
            "sin_usuario": sum(not email for email in user_emails),
            "sin_password_hash": sum(not key(value(row, "PASSWORD_HASH")) for row in users),
            "perfil_no_permitido": sum(code(value(row, "PERFIL")) not in allowed_profiles for row in users),
            "correos_persona_duplicados": sum(count - 1 for count in email_counts.values() if count > 1),
        },
    }
    output = batch / "quality_report.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
