import os
import sqlite3
from pathlib import Path

_data_dir = os.getenv("DATA_DIR")
_DATA_DIR = Path(_data_dir) if _data_dir else Path(__file__).parent / "data"
DB_PATH = _DATA_DIR / "ocr_app.db"


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _migrate(conn):
    cols = {row[1] for row in conn.execute("PRAGMA table_info(photos)")}
    if "parent_id" not in cols:
        conn.execute("ALTER TABLE photos ADD COLUMN parent_id INTEGER REFERENCES photos(id)")
    if "carriers" not in cols:
        conn.execute("ALTER TABLE photos ADD COLUMN carriers TEXT")
    if "contract_types" not in cols:
        conn.execute("ALTER TABLE photos ADD COLUMN contract_types TEXT")
    if "non_device_category" not in cols:
        conn.execute("ALTER TABLE photos ADD COLUMN non_device_category TEXT")
    if "deposit" not in cols:
        conn.execute("ALTER TABLE photos ADD COLUMN deposit TEXT")
    if "items_json" not in cols:
        conn.execute("ALTER TABLE photos ADD COLUMN items_json TEXT")
    if "price_unclear" not in cols:
        conn.execute("ALTER TABLE photos ADD COLUMN price_unclear INTEGER DEFAULT 0")
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_code ON stores(code)")


def init_db():
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    with get_conn() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS stores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT NOT NULL,
                name TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS photos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                store_id INTEGER REFERENCES stores(id),
                parent_id INTEGER REFERENCES photos(id),
                original_filename TEXT NOT NULL,
                stored_filename TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                device_name TEXT,
                device_category TEXT,
                price TEXT,
                note TEXT,
                renamed_filename TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS ocr_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                photo_id INTEGER REFERENCES photos(id),
                engine TEXT,
                confidence REAL,
                raw_text TEXT,
                device_candidates TEXT,
                price_candidates TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                hashed_password TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS photo_locks (
                photo_id INTEGER PRIMARY KEY REFERENCES photos(id) ON DELETE CASCADE,
                username TEXT NOT NULL,
                locked_at REAL NOT NULL
            );
        """)
        _migrate(conn)
