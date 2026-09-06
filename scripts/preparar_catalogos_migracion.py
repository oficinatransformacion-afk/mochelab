"""Construye catálogos y alias canónicos desde un lote JSONL de staging."""

from __future__ import annotations

import argparse
import csv
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path


CATALOG_FIELDS = {
    "Persona": {
        "NIVEL_OCUPACIONAL": "NIVEL_OCUPACIONAL",
        "ESTADO": "ESTADO_PERSONA",
    },
    "PersonaRol": {
        "ESTADO_PERSONA_ROL": "ESTADO_ASIGNACION",
        "ESTADO_ONBOARDING": "ESTADO_ONBOARDING",
    },
    "PersonaCurso": {
        "ESTADO_PERSONA_CURSO": "ESTADO_PERSONA_CURSO",
        "FUENTE": "FUENTE_PERSONA_CURSO",
        "GRUPO": "GRUPO_PERSONA_CURSO",
    },
    "Equipo": {"ESTADO": "ESTADO_EQUIPO"},
    "Objetivos": {
        "NIVEL": "NIVEL_OBJETIVO",
        "AREA_ENFOQUE": "AREA_ENFOQUE",
        "CICLO": "CICLO",
        "INDICADOR": "DIRECCION_INDICADOR",
        "TIPO": "TIPO_OBJETIVO",
        "ESTADO": "ESTADO_RESULTADO_CLAVE",
        "ESTADO_REGISTRO": "ESTADO_REGISTRO_OBJETIVO",
    },
    "Portafolio": {
        "CICLO": "CICLO",
        "AREA_ENFOQUE": "AREA_ENFOQUE",
        "NIVEL": "NIVEL_OBJETIVO",
        "TIPO_INICIATIVA": "TIPO_INICIATIVA",
        "TALLA": "TALLA_INICIATIVA",
        "PRIORIDAD": "PRIORIDAD_INICIATIVA",
        "TIPO_GESTION": "TIPO_GESTION_INICIATIVA",
        "ESTADO_INICIATIVA": "ESTADO_INICIATIVA",
        "ESCALAMIENTO": "ESCALAMIENTO_INICIATIVA",
        "HORIZONTE_RETORNO": "HORIZONTE_RETORNO",
        "TI_CAPACITY": "CAPACIDAD_TI",
        "CATEGORIA": "CATEGORIA_INICIATIVA",
        "IMPACTO": "IMPACTO_INICIATIVA",
    },
    "Rol": {"TIPO": "TIPO_ROL", "ESTADO": "ESTADO_ROL"},
    "Curso": {"MODULO": "MODULO_CURSO", "ESTADO": "ESTADO_CURSO"},
    "MetasIndicadores": {
        "INDICADOR": "INDICADOR_META",
        "ALCANCE": "ALCANCE_META",
        "UNIDAD": "UNIDAD_META",
        "ESTADO": "ESTADO_META",
    },
    "Usuario": {"PERFIL": "PERFIL_USUARIO", "ESTADO": "ESTADO_USUARIO"},
}


def normalized_text(value: object) -> str | None:
    if value is None:
        return None
    text = re.sub(r"\s+", " ", str(value).strip())
    return text or None


def canonical_code(value: str) -> str:
    plain = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    code = re.sub(r"[^A-Za-z0-9]+", "_", plain.upper()).strip("_")
    return code[:100] or "SIN_VALOR"


def semantic_key(value: str) -> str:
    plain = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", plain).strip().casefold()


def read_sheet(batch: Path, sheet: str):
    filename = re.sub(r"[^a-z0-9]+", "_", sheet.lower()).strip("_") + ".jsonl"
    with (batch / filename).open(encoding="utf-8") as source:
        for line in source:
            yield json.loads(line)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("batch", type=Path)
    args = parser.parse_args()
    batch = args.batch.resolve(strict=True)
    destination = (batch / "prepared").resolve()
    destination.relative_to(batch)
    destination.mkdir(exist_ok=True)

    counts: Counter[tuple[str, str]] = Counter()
    labels: dict[tuple[str, str], str] = {}
    aliases: Counter[tuple[str, str, str, str]] = Counter()
    collisions: list[dict[str, str]] = []

    for sheet, fields in CATALOG_FIELDS.items():
        for record in read_sheet(batch, sheet):
            for field, catalog_code in fields.items():
                raw = normalized_text(record["data"].get(field))
                if raw is None:
                    continue
                code = canonical_code(raw)
                key = (catalog_code, code)
                previous = labels.get(key)
                if previous is not None and semantic_key(previous) != semantic_key(raw):
                    collisions.append({"catalog": catalog_code, "code": code, "first": previous, "other": raw})
                labels.setdefault(key, raw)
                counts[key] += 1
                aliases[(catalog_code, raw, code, sheet)] += 1

    with (destination / "catalog_values.csv").open("w", encoding="utf-8-sig", newline="") as output:
        writer = csv.writer(output)
        writer.writerow(["CATALOGO", "CODIGO", "NOMBRE", "CONTEO_ORIGEN", "ACTIVO"])
        for key in sorted(counts):
            writer.writerow([key[0], key[1], labels[key], counts[key], True])

    with (destination / "catalog_aliases.csv").open("w", encoding="utf-8-sig", newline="") as output:
        writer = csv.writer(output)
        writer.writerow(["CATALOGO", "VALOR_ORIGEN", "CODIGO_DESTINO", "HOJA", "CONTEO"])
        for key in sorted(aliases):
            writer.writerow([*key, aliases[key]])

    report = {
        "catalogs": len({catalog for catalog, _ in counts}),
        "canonical_values": len(counts),
        "aliases": len(aliases),
        "source_occurrences": sum(counts.values()),
        "code_collisions": collisions,
        "files": ["catalog_values.csv", "catalog_aliases.csv"],
    }
    (destination / "catalog_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
