import os
import sqlite3
from pathlib import Path

_data_dir = os.getenv("DATA_DIR")
_DATA_DIR = Path(_data_dir) if _data_dir else Path(__file__).parent / "data"
DB_PATH = _DATA_DIR / "shinbun.db"


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    with get_conn() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS readers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                address TEXT DEFAULT '',
                payment_method TEXT DEFAULT 'cash',
                note TEXT DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            -- 新聞マスタ: 取り扱う新聞種別の定義
            CREATE TABLE IF NOT EXISTS newspapers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                short_name TEXT NOT NULL DEFAULT '',
                newspaper_type TEXT DEFAULT NULL,  -- 'H', 'N', or NULL (コース所属の判定に使用)
                is_print INTEGER NOT NULL DEFAULT 1,     -- 1=紙版（配達あり）, 0=電子版（配達なし）
                sort_order INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            -- 新聞価格履歴: 購読単価・配達援助単価・集金援助単価を期間管理
            CREATE TABLE IF NOT EXISTS newspaper_price_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                newspaper_id INTEGER NOT NULL REFERENCES newspapers(id) ON DELETE CASCADE,
                start_year INTEGER NOT NULL,
                start_month INTEGER NOT NULL,
                end_year INTEGER,
                end_month INTEGER,
                subscription_price INTEGER,  -- 読者購読価格 (NULL=設定なし)
                delivery_price INTEGER,      -- 配達援助単価 (NULL=配達援助なし)
                unit_price INTEGER,          -- 集金援助単価 (NULL=集金なし)
                note TEXT DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reader_id INTEGER NOT NULL REFERENCES readers(id) ON DELETE CASCADE,
                newspaper_id INTEGER NOT NULL REFERENCES newspapers(id) ON DELETE CASCADE,
                quantity INTEGER NOT NULL DEFAULT 1,     -- 部数
                status TEXT DEFAULT 'active',            -- active / active_no_collection / inactive
                start_year INTEGER DEFAULT NULL,         -- 購読開始年（NULL=設定なし）
                start_month INTEGER DEFAULT NULL,        -- 購読開始月
                end_year INTEGER DEFAULT NULL,           -- 購読終了年（NULL=自動延長）
                end_month INTEGER DEFAULT NULL,          -- 購読終了月
                payment_method TEXT DEFAULT 'cash',  -- cash / transfer（振込等）
                plan_note TEXT DEFAULT '',
                UNIQUE(reader_id, newspaper_id)
            );

            CREATE TABLE IF NOT EXISTS staff (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                contact TEXT DEFAULT '',
                note TEXT DEFAULT '',
                is_deliverer INTEGER DEFAULT 0,
                is_collector INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            -- コース: 各配達コース（H or N）。それぞれ独自の単価を持つ
            CREATE TABLE IF NOT EXISTS courses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                short_name TEXT NOT NULL DEFAULT '',
                newspaper_type TEXT NOT NULL DEFAULT 'H',
                note TEXT DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            -- コース所属読者
            CREATE TABLE IF NOT EXISTS course_readers (
                course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
                reader_id INTEGER NOT NULL REFERENCES readers(id) ON DELETE CASCADE,
                PRIMARY KEY (course_id, reader_id)
            );

            -- コース単価履歴（期間ごとに金額を管理）
            CREATE TABLE IF NOT EXISTS course_price_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
                start_year INTEGER NOT NULL,
                start_month INTEGER NOT NULL,
                end_year INTEGER,
                end_month INTEGER,
                amount INTEGER NOT NULL DEFAULT 0,
                note TEXT DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            -- 集金担当：読者1人につき1人（1:1）、期間管理
            CREATE TABLE IF NOT EXISTS collection_assignments (
                reader_id INTEGER NOT NULL REFERENCES readers(id) ON DELETE CASCADE,
                staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
                start_year INTEGER NOT NULL,
                start_month INTEGER NOT NULL,
                end_year INTEGER,
                end_month INTEGER,
                PRIMARY KEY (reader_id, start_year, start_month)
            );

            -- 個別配達担当：紙版新聞1種類ごとに1人、期間管理
            CREATE TABLE IF NOT EXISTS delivery_assignments (
                reader_id INTEGER NOT NULL REFERENCES readers(id) ON DELETE CASCADE,
                newspaper_id INTEGER NOT NULL REFERENCES newspapers(id) ON DELETE CASCADE,
                staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
                start_year INTEGER NOT NULL,
                start_month INTEGER NOT NULL,
                end_year INTEGER,
                end_month INTEGER,
                PRIMARY KEY (reader_id, newspaper_id, start_year, start_month)
            );

            -- 固定単価履歴: delivery_h / delivery_n (コース未所属配達単価のみ)
            CREATE TABLE IF NOT EXISTS unit_price_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,
                start_year INTEGER NOT NULL,
                start_month INTEGER NOT NULL,
                end_year INTEGER,
                end_month INTEGER,
                amount INTEGER NOT NULL DEFAULT 0,
                note TEXT DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS subsidy_adjustments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                year INTEGER NOT NULL,
                month INTEGER NOT NULL,
                staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
                role TEXT DEFAULT 'other',
                amount INTEGER NOT NULL,
                note TEXT DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        """)
        # マイグレーション: 既存DBへのカラム追加（既に存在する場合は無視）
        # newspapers に古い価格列が残っている場合、price_history へ移行
        np_cols = {row[1] for row in conn.execute("PRAGMA table_info(newspapers)").fetchall()}
        if 'subscription_price' in np_cols:
            rows = conn.execute(
                "SELECT id, subscription_price, delivery_price, unit_price FROM newspapers "
                "WHERE subscription_price IS NOT NULL OR delivery_price IS NOT NULL OR unit_price IS NOT NULL"
            ).fetchall()
            for r in rows:
                exists = conn.execute(
                    "SELECT 1 FROM newspaper_price_history WHERE newspaper_id=?", (r["id"],)
                ).fetchone()
                if not exists:
                    conn.execute("""
                        INSERT INTO newspaper_price_history
                        (newspaper_id, start_year, start_month, subscription_price, delivery_price, unit_price)
                        VALUES (?,2020,1,?,?,?)
                    """, (r["id"], r["subscription_price"], r["delivery_price"], r["unit_price"]))

        for sql in [
            "ALTER TABLE newspapers ADD COLUMN is_print INTEGER NOT NULL DEFAULT 1",
            "ALTER TABLE subscriptions ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1",
            "ALTER TABLE subscriptions ADD COLUMN start_year INTEGER DEFAULT NULL",
            "ALTER TABLE subscriptions ADD COLUMN start_month INTEGER DEFAULT NULL",
            "ALTER TABLE subscriptions ADD COLUMN end_year INTEGER DEFAULT NULL",
            "ALTER TABLE subscriptions ADD COLUMN end_month INTEGER DEFAULT NULL",
            "ALTER TABLE subscriptions ADD COLUMN payment_method TEXT DEFAULT 'cash'",
        ]:
            try:
                conn.execute(sql)
            except Exception:
                pass

        # subscriptions の UNIQUE(reader_id, newspaper_id) 制約を外す（期間履歴対応）
        sub_idx = conn.execute("PRAGMA index_list(subscriptions)").fetchall()
        if any(row[2] for row in sub_idx):  # unique index が存在する場合
            conn.execute("ALTER TABLE subscriptions RENAME TO _subs_old")
            conn.execute("""
                CREATE TABLE subscriptions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    reader_id INTEGER NOT NULL REFERENCES readers(id) ON DELETE CASCADE,
                    newspaper_id INTEGER NOT NULL REFERENCES newspapers(id) ON DELETE CASCADE,
                    quantity INTEGER NOT NULL DEFAULT 1,
                    status TEXT DEFAULT 'active',
                    start_year INTEGER DEFAULT NULL,
                    start_month INTEGER DEFAULT NULL,
                    end_year INTEGER DEFAULT NULL,
                    end_month INTEGER DEFAULT NULL,
                    payment_method TEXT DEFAULT 'cash',
                    plan_note TEXT DEFAULT ''
                )
            """)
            conn.execute("""
                INSERT INTO subscriptions (id, reader_id, newspaper_id, quantity, status,
                    start_year, start_month, end_year, end_month, payment_method, plan_note)
                SELECT id, reader_id, newspaper_id, quantity, status,
                    start_year, start_month, end_year, end_month, payment_method, plan_note
                FROM _subs_old
            """)
            conn.execute("DROP TABLE _subs_old")

        # 担当割当テーブルに期間列がなければ再構築
        ca_cols = {row[1] for row in conn.execute("PRAGMA table_info(collection_assignments)").fetchall()}
        if 'start_year' not in ca_cols:
            conn.execute("ALTER TABLE collection_assignments RENAME TO _ca_old")
            conn.execute("""
                CREATE TABLE collection_assignments (
                    reader_id INTEGER NOT NULL REFERENCES readers(id) ON DELETE CASCADE,
                    staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
                    start_year INTEGER NOT NULL,
                    start_month INTEGER NOT NULL,
                    end_year INTEGER,
                    end_month INTEGER,
                    PRIMARY KEY (reader_id, start_year, start_month)
                )
            """)
            conn.execute("""
                INSERT INTO collection_assignments (reader_id, staff_id, start_year, start_month)
                SELECT reader_id, staff_id, 2020, 1 FROM _ca_old
            """)
            conn.execute("DROP TABLE _ca_old")

        da_cols = {row[1] for row in conn.execute("PRAGMA table_info(delivery_assignments)").fetchall()}
        if 'start_year' not in da_cols:
            conn.execute("ALTER TABLE delivery_assignments RENAME TO _da_old")
            conn.execute("""
                CREATE TABLE delivery_assignments (
                    reader_id INTEGER NOT NULL REFERENCES readers(id) ON DELETE CASCADE,
                    newspaper_id INTEGER NOT NULL REFERENCES newspapers(id) ON DELETE CASCADE,
                    staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
                    start_year INTEGER NOT NULL,
                    start_month INTEGER NOT NULL,
                    end_year INTEGER,
                    end_month INTEGER,
                    PRIMARY KEY (reader_id, newspaper_id, start_year, start_month)
                )
            """)
            conn.execute("""
                INSERT INTO delivery_assignments (reader_id, newspaper_id, staff_id, start_year, start_month)
                SELECT reader_id, newspaper_id, staff_id, 2020, 1 FROM _da_old
            """)
            conn.execute("DROP TABLE _da_old")
