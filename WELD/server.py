import argparse
import base64
import json
import mimetypes
import os
import sqlite3
import threading
import webbrowser
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
from urllib.parse import unquote
from xml.sax.saxutils import escape


ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "lavadero.db"
STATE_KEY = "main"
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
APP_USER = os.environ.get("APP_USER", "admin")
APP_PASSWORD = os.environ.get("APP_PASSWORD", "").strip()


DEFAULT_STATE = {
    "services": [
        {"id": "svc-1", "name": "Lavado basico", "price": 25, "duration": 25},
        {"id": "svc-2", "name": "Lavado premium", "price": 45, "duration": 40},
        {"id": "svc-3", "name": "Aspirado interior", "price": 18, "duration": 18},
        {"id": "svc-4", "name": "Encerado", "price": 65, "duration": 55},
        {"id": "svc-5", "name": "Detallado completo", "price": 140, "duration": 120},
    ],
    "employees": [
        {"id": "emp-1", "name": "Carlos Rios", "role": "Operario", "commission": 8},
        {"id": "emp-2", "name": "Ana Torres", "role": "Cajera", "commission": 5},
        {"id": "emp-3", "name": "Miguel Vega", "role": "Supervisor", "commission": 10},
    ],
    "vehicles": [],
    "expenses": [],
    "inventory": [
        {"id": "inv-1", "item": "Shampoo", "stock": 7, "min": 5, "unit": "L"},
        {"id": "inv-2", "item": "Cera", "stock": 2, "min": 3, "unit": "L"},
        {"id": "inv-3", "item": "Toallas", "stock": 18, "min": 12, "unit": "und"},
        {"id": "inv-4", "item": "Ambientadores", "stock": 9, "min": 10, "unit": "und"},
    ],
    "cash": {"opening": 150, "openedAt": ""},
}


def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def using_postgres():
    return DATABASE_URL.startswith(("postgres://", "postgresql://"))


def connect_postgres():
    try:
        import psycopg
    except ImportError as exc:
        raise RuntimeError("Falta instalar psycopg. Ejecuta: pip install -r requirements.txt") from exc
    return psycopg.connect(DATABASE_URL)


def init_db():
    if using_postgres():
        with connect_postgres() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS app_state (
                    key TEXT PRIMARY KEY,
                    data JSONB NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            existing = conn.execute("SELECT key FROM app_state WHERE key = %s", (STATE_KEY,)).fetchone()
            if not existing:
                conn.execute(
                    "INSERT INTO app_state (key, data) VALUES (%s, %s::jsonb)",
                    (STATE_KEY, json.dumps(DEFAULT_STATE)),
                )
        return

    with connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS app_state (
                key TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        existing = conn.execute("SELECT key FROM app_state WHERE key = ?", (STATE_KEY,)).fetchone()
        if not existing:
            conn.execute(
                "INSERT INTO app_state (key, data) VALUES (?, ?)",
                (STATE_KEY, json.dumps(DEFAULT_STATE)),
            )


def read_state():
    init_db()
    if using_postgres():
        with connect_postgres() as conn:
            row = conn.execute("SELECT data FROM app_state WHERE key = %s", (STATE_KEY,)).fetchone()
        if not row:
            return DEFAULT_STATE
        return row[0] if isinstance(row[0], dict) else json.loads(row[0])

    with connect() as conn:
        row = conn.execute("SELECT data FROM app_state WHERE key = ?", (STATE_KEY,)).fetchone()
    return json.loads(row["data"]) if row else DEFAULT_STATE


def write_state(state):
    init_db()
    encoded = json.dumps(state, ensure_ascii=False)
    if using_postgres():
        with connect_postgres() as conn:
            conn.execute(
                """
                INSERT INTO app_state (key, data, updated_at)
                VALUES (%s, %s::jsonb, NOW())
                ON CONFLICT(key) DO UPDATE SET
                    data = EXCLUDED.data,
                    updated_at = NOW()
                """,
                (STATE_KEY, encoded),
            )
        return

    with connect() as conn:
        conn.execute(
            """
            INSERT INTO app_state (key, data, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET
                data = excluded.data,
                updated_at = CURRENT_TIMESTAMP
            """,
            (STATE_KEY, encoded),
        )


def money_total(rows, key):
    return sum(float(row.get(key) or 0) for row in rows)


def xlsx_cell(value, row_index, col_index):
    col = ""
    number = col_index
    while number:
        number, rem = divmod(number - 1, 26)
        col = chr(65 + rem) + col
    ref = f"{col}{row_index}"

    if value is None:
        return f'<c r="{ref}"/>'
    if isinstance(value, bool):
        return f'<c r="{ref}" t="b"><v>{1 if value else 0}</v></c>'
    if isinstance(value, (int, float)):
        return f'<c r="{ref}"><v>{value}</v></c>'

    text = escape(str(value))
    return f'<c r="{ref}" t="inlineStr"><is><t>{text}</t></is></c>'


def sheet_xml(rows):
    xml_rows = []
    for row_index, row in enumerate(rows, start=1):
        cells = "".join(xlsx_cell(value, row_index, col_index) for col_index, value in enumerate(row, start=1))
        xml_rows.append(f'<row r="{row_index}">{cells}</row>')
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<sheetViews><sheetView workbookViewId="0"/></sheetViews>'
        f'<sheetData>{"".join(xml_rows)}</sheetData>'
        '</worksheet>'
    )


def build_xlsx(state):
    vehicles = state.get("vehicles", [])
    expenses = state.get("expenses", [])
    inventory = state.get("inventory", [])
    employees = state.get("employees", [])
    services = state.get("services", [])
    business = state.get("business", {})
    paid = [vehicle for vehicle in vehicles if vehicle.get("paid")]
    active = [vehicle for vehicle in vehicles if vehicle.get("status") in ("lavado", "secado")]
    waiting = [vehicle for vehicle in vehicles if vehicle.get("status") == "espera"]
    income = money_total(paid, "price")
    expense_total = money_total(expenses, "amount")

    sheets = [
        (
            "Dashboard",
            [
                ["WELD Lavadero", "Reporte exportado"],
                ["Estado del negocio", business.get("status", "cerrado")],
                ["Ingresos", income],
                ["Egresos", expense_total],
                ["Ganancia neta", income - expense_total],
                ["Autos registrados", len(vehicles)],
                ["Autos en espera", len(waiting)],
                ["Autos en proceso", len(active)],
            ],
        ),
        (
            "Vehiculos",
            [
                ["Placa", "Cliente", "Telefono", "Vehiculo", "Color", "Servicio", "Empleado", "Pago", "Estado", "Precio", "Llegada", "Inicio", "Fin", "Pagado", "Notas"],
                *[
                    [
                        v.get("plate", ""),
                        v.get("client", ""),
                        v.get("phone", ""),
                        v.get("vehicle", ""),
                        v.get("color", ""),
                        v.get("serviceName", ""),
                        v.get("employeeId", ""),
                        v.get("payment", ""),
                        v.get("status", ""),
                        v.get("price", 0),
                        v.get("arrivedAt", ""),
                        v.get("startedAt", ""),
                        v.get("finishedAt", ""),
                        "Si" if v.get("paid") else "No",
                        v.get("notes", ""),
                    ]
                    for v in vehicles
                ],
            ],
        ),
        (
            "Egresos",
            [["Fecha", "Categoria", "Descripcion", "Monto"], *[[e.get("date", ""), e.get("category", ""), e.get("description", ""), e.get("amount", 0)] for e in expenses]],
        ),
        (
            "Inventario",
            [["Producto", "Stock", "Minimo", "Unidad", "Estado"], *[[i.get("item", ""), i.get("stock", 0), i.get("min", 0), i.get("unit", ""), "Bajo" if float(i.get("stock") or 0) <= float(i.get("min") or 0) else "OK"] for i in inventory]],
        ),
        (
            "Empleados",
            [["Empleado", "Rol", "Comision %"], *[[e.get("name", ""), e.get("role", ""), e.get("commission", 0)] for e in employees]],
        ),
        (
            "Servicios",
            [["Servicio", "Precio", "Duracion min"], *[[s.get("name", ""), s.get("price", 0), s.get("duration", 0)] for s in services]],
        ),
    ]

    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
""" + "".join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in range(1, len(sheets) + 1)) + "</Types>")
        archive.writestr("_rels/.rels", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>""")
        archive.writestr("xl/workbook.xml", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>""" + "".join(f'<sheet name="{escape(name)}" sheetId="{i}" r:id="rId{i}"/>' for i, (name, _) in enumerate(sheets, start=1)) + "</sheets></workbook>")
        archive.writestr("xl/_rels/workbook.xml.rels", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
""" + "".join(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>' for i in range(1, len(sheets) + 1)) + "</Relationships>")
        for i, (_, rows) in enumerate(sheets, start=1):
            archive.writestr(f"xl/worksheets/sheet{i}.xml", sheet_xml(rows))
    return buffer.getvalue()


class AppHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        return

    def authorized(self):
        if not APP_PASSWORD or self.path == "/health":
            return True

        header = self.headers.get("Authorization", "")
        if not header.startswith("Basic "):
            return False
        try:
            decoded = base64.b64decode(header.split(" ", 1)[1]).decode("utf-8")
        except Exception:
            return False
        user, _, password = decoded.partition(":")
        return user == APP_USER and password == APP_PASSWORD

    def require_auth(self):
        self.send_response(401)
        self.send_header("WWW-Authenticate", 'Basic realm="WELD Lavadero"')
        self.end_headers()

    def send_json(self, payload, status=200):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def send_xlsx(self, data):
        self.send_response(200)
        self.send_header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        self.send_header("Content-Disposition", 'attachment; filename="weld-lavadero.xlsx"')
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if not self.authorized():
            self.require_auth()
            return

        if self.path == "/health":
            self.send_json({"ok": True, "database": "postgres" if using_postgres() else "sqlite"})
            return

        if self.path == "/api/state":
            self.send_json(read_state())
            return

        if self.path == "/api/export.xlsx":
            self.send_xlsx(build_xlsx(read_state()))
            return

        route = unquote(self.path.split("?", 1)[0]).lstrip("/") or "index.html"
        target = (ROOT / route).resolve()
        if ROOT not in target.parents and target != ROOT:
            self.send_error(403)
            return
        if not target.exists() or not target.is_file():
            self.send_error(404)
            return

        content = target.read_bytes()
        mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_PUT(self):
        if not self.authorized():
            self.require_auth()
            return

        if self.path != "/api/state":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", 0))
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            write_state(payload)
            self.send_json({"ok": True})
        except Exception as exc:
            self.send_json({"ok": False, "error": str(exc)}, status=400)


def main():
    parser = argparse.ArgumentParser(description="Servidor local para WELD Lavadero")
    parser.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    parser.add_argument("--port", default=int(os.environ.get("PORT", "8000")), type=int)
    parser.add_argument("--open", action="store_true")
    parser.add_argument("--init-db", action="store_true")
    args = parser.parse_args()

    init_db()
    if args.init_db:
        print(f"Base de datos lista: {DB_PATH}")
        return

    url = f"http://{args.host}:{args.port}"
    if args.open:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()

    print(f"WELD Lavadero abierto en {url}")
    print(f"Base de datos: {'PostgreSQL en la nube' if using_postgres() else DB_PATH}")
    print("Deja esta ventana abierta mientras uses la aplicacion.")
    ThreadingHTTPServer((args.host, args.port), AppHandler).serve_forever()


if __name__ == "__main__":
    main()
