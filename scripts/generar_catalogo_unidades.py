import csv
import re
import unicodedata
from collections import Counter
from pathlib import Path

import pandas as pd


SOURCE = Path(r"C:\Users\user\Downloads\Data Servicios (15).xlsx")
OUTPUT_DIR = Path(r"C:\Users\user\Documents\ChatGPT\Mochelab 2-0\database\seeds")


CATALOG = {
    "BOOLEANO": ("1/0", "Valor binario"),
    "NUMERO": ("Número", "Cantidad sin unidad específica"),
    "PORCENTAJE": ("%", "Porcentaje"),
    "PUNTOS_PORCENTUALES": ("pp", "Puntos porcentuales"),
    "USD": ("USD", "Dólares estadounidenses"),
    "MILES_USD": ("Miles USD", "Miles de dólares estadounidenses"),
    "MILLONES_USD": ("Millones USD", "Millones de dólares estadounidenses"),
    "USD_KG": ("USD/kg", "Dólares por kilogramo"),
    "USD_KG_DW": ("USD/kg DW", "Dólares por kilogramo de peso seco"),
    "USD_KG_MMPP": ("USD/kg MMPP", "Dólares por kilogramo de materia prima"),
    "USD_HA": ("USD/ha", "Dólares por hectárea"),
    "MILES_USD_HA": ("Miles USD/ha", "Miles de dólares por hectárea"),
    "MILLONES_USD_HA": ("Millones USD/ha", "Millones de dólares por hectárea"),
    "TONELADA": ("t", "Toneladas"),
    "TONELADA_HA": ("t/ha", "Toneladas por hectárea"),
    "TONELADA_SEMANA": ("t/semana", "Toneladas por semana"),
    "TONELADA_DIA": ("t/día", "Toneladas por día"),
    "TONELADA_EXPORTADA": ("t exportada", "Toneladas exportadas"),
    "KILOGRAMO": ("kg", "Kilogramos"),
    "KILOGRAMO_HA": ("kg/ha", "Kilogramos por hectárea"),
    "KILOGRAMO_JORNAL": ("kg/jornal", "Kilogramos por jornal"),
    "MILES_KILOGRAMOS": ("Miles kg", "Miles de kilogramos"),
    "MILLONES_KILOGRAMOS": ("Millones kg", "Millones de kilogramos"),
    "MILLONES_KG_MMPP": ("Millones kg MMPP", "Millones de kilogramos de materia prima"),
    "MILLONES_KG_EXPORTADOS": ("Millones kg exportados", "Millones de kilogramos exportados"),
    "GRAMO": ("g", "Gramos"),
    "HECTAREA": ("ha", "Hectáreas"),
    "METRO_CUADRADO": ("m²", "Metros cuadrados"),
    "MILES_METROS_CUBICOS": ("Miles m³", "Miles de metros cúbicos"),
    "FCL": ("FCL", "Contenedores de carga completa"),
    "LITROS_SEGUNDO": ("L/s", "Litros por segundo"),
    "UNIDAD": ("Unidad", "Unidades"),
    "MILLAR": ("Millar", "Millares"),
    "MILES": ("Miles", "Miles sin magnitud especificada"),
    "MILLONES": ("Millones", "Millones sin magnitud especificada"),
    "PERSONA": ("Persona", "Cantidad de personas"),
    "SKU": ("SKU", "Cantidad de SKU"),
    "INICIATIVA": ("Iniciativa", "Cantidad de iniciativas"),
    "NIVEL": ("Nivel", "Nivel ordinal"),
    "DIA": ("Día", "Días"),
    "HORA": ("Hora", "Horas"),
    "HORA_DIA": ("h/día", "Horas por día"),
    "HORA_SEMANA": ("h/semana", "Horas por semana"),
    "MINUTO": ("min", "Minutos"),
    "MINUTO_COSECHADOR": ("min/cosechador", "Minutos por cosechador"),
    "RACIMOS_PLANTA": ("Racimos/planta", "Racimos por planta"),
    "CARGADORES_PLANTA": ("Cargadores/planta", "Cargadores por planta"),
    "FRUTOS_PLANTA": ("Frutos/planta", "Frutos por planta"),
    "OTRO": ("Otro", "Unidad histórica sin clasificación"),
    "SIN_UNIDAD": ("Sin unidad", "Registro sin unidad aplicable"),
}


def normalized(value):
    text = str(value).strip().replace("\n", " ")
    text = text.replace("�", "")
    text = unicodedata.normalize("NFKD", text)
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = re.sub(r"\s+", " ", text).lower()
    return text


def canonical(value):
    n = normalized(value)
    compact = re.sub(r"\s+", "", n)

    exact = {
        "1/0": "BOOLEANO", "1": "NUMERO", "%": "PORCENTAJE", "pp": "PUNTOS_PORCENTUALES",
        "usd": "USD", "$": "USD", "us$": "USD",
        "tn": "TONELADA", "t": "TONELADA", "kg": "KILOGRAMO", "g": "GRAMO",
        "ha": "HECTAREA", "has": "HECTAREA", "m2": "METRO_CUADRADO",
        "l/s": "LITROS_SEGUNDO", "nivel": "NIVEL", "sku": "SKU",
        "unidad": "UNIDAD", "und": "UNIDAD", "personas": "PERSONA", "trabajadores": "PERSONA",
        "mujeres": "PERSONA", "nios": "PERSONA", "ninos": "PERSONA",
        "dias": "DIA", "daas": "DIA", "h": "HORA", "hrs": "HORA", "min": "MINUTO",
        "miles": "MILES", "millar": "MILLAR", "mm": "MILLONES", "mll": "MILLONES",
        "otros": "OTRO", "-": "SIN_UNIDAD", "iniciativas": "INICIATIVA",
        "racimos/planta": "RACIMOS_PLANTA", "cargadores/planta": "CARGADORES_PLANTA",
        "frutos/planta": "FRUTOS_PLANTA", "mil m3": "MILES_METROS_CUBICOS",
    }
    if n in exact:
        return exact[n], "NORMALIZADO", ""
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}.*", n):
        return "", "REVISAR", "Fecha registrada como unidad"
    if compact in {"mm$", "$mm", "mmusd", "usd(m)", "usdm"}:
        return "MILLONES_USD", "NORMALIZADO", ""
    if compact in {"$k", "k$", "miles$", "usd(k)", "milusd", "kusd"}:
        return "MILES_USD", "NORMALIZADO", ""
    if compact in {"$/kg", "usd/kg"}:
        return "USD_KG", "NORMALIZADO", ""
    if compact in {"$/kgdw", "$/kgdrw", "$/kg/dw", "usd/kgdw"}:
        return "USD_KG_DW", "NORMALIZADO", ""
    if compact in {"$/kgmp", "$/kgmmpp"}:
        return "USD_KG_MMPP", "NORMALIZADO", ""
    if compact == "$/ha":
        return "USD_HA", "NORMALIZADO", ""
    if compact == "m$/ha":
        return "MILES_USD_HA", "NORMALIZADO", ""
    if compact in {"tn/ha", "t/ha"}:
        return "TONELADA_HA", "NORMALIZADO", ""
    if compact in {"tn/sem", "ton/sem", "t/sem"}:
        return "TONELADA_SEMANA", "NORMALIZADO", ""
    if compact in {"t/dia", "tn/dia"}:
        return "TONELADA_DIA", "NORMALIZADO", ""
    if compact in {"tnexp", "texp"}:
        return "TONELADA_EXPORTADA", "NORMALIZADO", ""
    if compact == "kg/ha":
        return "KILOGRAMO_HA", "NORMALIZADO", ""
    if compact in {"kg/jr", "kg/jornal"}:
        return "KILOGRAMO_JORNAL", "NORMALIZADO", ""
    if compact == "kkg":
        return "MILES_KILOGRAMOS", "NORMALIZADO", ""
    if compact in {"mmkg"}:
        return "MILLONES_KILOGRAMOS", "NORMALIZADO", ""
    if compact in {"mmkgmmpp"}:
        return "MILLONES_KG_MMPP", "NORMALIZADO", ""
    if compact in {"mmkgexp"}:
        return "MILLONES_KG_EXPORTADOS", "NORMALIZADO", ""
    if compact in {"fcl", "fcls", "flc"}:
        note = "FLC interpretado como FCL" if compact == "flc" else ""
        return "FCL", "NORMALIZADO", note
    if compact == "h/dia":
        return "HORA_DIA", "NORMALIZADO", ""
    if compact == "h/sem":
        return "HORA_SEMANA", "NORMALIZADO", ""
    if compact in {"min/cosech", "min/cosechador"}:
        return "MINUTO_COSECHADOR", "NORMALIZADO", ""
    return "", "REVISAR", "Unidad no reconocida"


units = pd.read_excel(SOURCE, sheet_name="Objetivos", dtype=object)["UNIDAD_KR"]
counts = Counter(str(value).strip() for value in units.dropna() if str(value).strip())

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

with (OUTPUT_DIR / "unidad_kr_catalogo.csv").open("w", newline="", encoding="utf-8-sig") as file:
    writer = csv.writer(file)
    writer.writerow(["CODIGO", "NOMBRE", "DESCRIPCION", "ORDEN", "ESTADO"])
    for order, (code, (name, description)) in enumerate(CATALOG.items(), start=1):
        writer.writerow([code, name, description, order, "ACTIVO"])

review_count = 0
with (OUTPUT_DIR / "unidad_kr_alias.csv").open("w", newline="", encoding="utf-8-sig") as file:
    writer = csv.writer(file)
    writer.writerow(["VALOR_ORIGEN", "CODIGO_DESTINO", "CONTEO", "RESULTADO", "OBSERVACION"])
    for value, count in sorted(counts.items(), key=lambda item: (-item[1], item[0].lower())):
        code, result, note = canonical(value)
        if result == "REVISAR":
            review_count += 1
        writer.writerow([value, code, count, result, note])

print(f"Valores históricos: {len(counts)}")
print(f"Unidades canónicas: {len(CATALOG)}")
print(f"Valores por revisar: {review_count}")
