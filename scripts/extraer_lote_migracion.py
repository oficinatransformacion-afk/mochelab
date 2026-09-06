"""Extrae un Excel legado a JSONL sin transformar ni descartar filas.

La salida es un lote de staging reproducible. No escribe en PostgreSQL y no
modifica el archivo de origen. Cada registro conserva hoja y número de fila.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path
from typing import Any

import openpyxl


IMPORTER_VERSION = "1.0.0"
EXPECTED_SHEETS = (
    "Persona",
    "PersonaRol",
    "PersonaCurso",
    "Equipo",
    "Objetivos",
    "Portafolio",
    "Rol",
    "Curso",
    "MetasIndicadores",
    "RolCurso",
    "MadurezEquipo",
    "MadurezRol",
    "Auditoria",
    "VW_Academia",
    "Usuario",
)


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def json_value(value: Any) -> Any:
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return value


def safe_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")


def meaningful(value: Any) -> bool:
    return value is not None and (not isinstance(value, str) or value.strip() != "")


def extract_sheet(sheet: Any, destination: Path) -> dict[str, Any]:
    raw_headers = [cell.value for cell in sheet[1]]
    last_header = max(
        (index for index, header in enumerate(raw_headers, start=1) if meaningful(header)),
        default=0,
    )
    headers = [str(value).strip() for value in raw_headers[:last_header]]
    output_path = destination / f"{safe_name(sheet.title)}.jsonl"
    rows_written = 0

    with output_path.open("w", encoding="utf-8", newline="\n") as output:
        for row_number, cells in enumerate(
            sheet.iter_rows(min_row=2, max_col=last_header, values_only=True), start=2
        ):
            if not any(meaningful(value) for value in cells):
                continue
            record = {
                "_sheet": sheet.title,
                "_source_row": row_number,
                "data": {
                    headers[index]: json_value(value)
                    for index, value in enumerate(cells)
                },
            }
            output.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")))
            output.write("\n")
            rows_written += 1

    return {
        "sheet": sheet.title,
        "headers": headers,
        "rows": rows_written,
        "file": output_path.name,
        "role": "reference_view" if sheet.title == "VW_Academia" else "source",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("excel", type=Path)
    parser.add_argument("--mode", choices=("test", "final"), default="test")
    parser.add_argument("--output-root", type=Path, default=Path("database/staging"))
    args = parser.parse_args()

    excel = args.excel.resolve(strict=True)
    digest = file_hash(excel)
    batch_name = f"{args.mode}-{digest[:12]}"
    output_root = args.output_root.resolve()
    destination = (output_root / batch_name).resolve()
    destination.relative_to(output_root)

    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True)

    workbook = openpyxl.load_workbook(excel, read_only=True, data_only=False)
    missing = sorted(set(EXPECTED_SHEETS) - set(workbook.sheetnames))
    unexpected = sorted(set(workbook.sheetnames) - set(EXPECTED_SHEETS))
    sheets = [extract_sheet(workbook[name], destination) for name in workbook.sheetnames]
    workbook.close()

    manifest = {
        "importer_version": IMPORTER_VERSION,
        "mode": args.mode,
        "source_file": excel.name,
        "source_sha256": digest,
        "extracted_at": datetime.now().astimezone().isoformat(),
        "expected_sheets": list(EXPECTED_SHEETS),
        "missing_sheets": missing,
        "unexpected_sheets": unexpected,
        "total_rows": sum(item["rows"] for item in sheets),
        "sheets": sheets,
        "notes": [
            "Los valores se conservan sin normalización.",
            "VW_Academia se conserva como referencia y no como fuente maestra.",
            "PersonaConcientizada no forma parte del modelo ni de las hojas esperadas.",
        ],
    }
    (destination / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
