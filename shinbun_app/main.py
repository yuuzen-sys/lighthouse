from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
from pathlib import Path
import io
import datetime
import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
try:
    from database import get_conn, init_db
except ModuleNotFoundError:
    from shinbun_app.database import get_conn, init_db

app = FastAPI()
init_db()

def _prev_month(y: int, m: int):
    return (y - 1, 12) if m == 1 else (y, m - 1)

def _mval(y: int, m: int) -> int:
    return y * 12 + m

FRONTEND_DIR = Path(__file__).parent / "frontend"

# ── Models ────────────────────────────────────────────────────────────────────

class ReaderIn(BaseModel):
    name: str
    address: str = ""
    note: str = ""

class SubscriptionIn(BaseModel):
    newspaper_id: int
    quantity: int = 1
    status: str = "active"
    payment_method: str = "cash"
    start_year: Optional[int] = None
    start_month: Optional[int] = None
    start_day: Optional[int] = None
    end_year: Optional[int] = None
    end_month: Optional[int] = None
    end_day: Optional[int] = None
    plan_note: str = ""

class StaffIn(BaseModel):
    name: str
    contact: str = ""
    note: str = ""
    is_deliverer: int = 0
    is_collector: int = 0

class NewspaperIn(BaseModel):
    name: str
    short_name: str = ""
    newspaper_type: Optional[str] = None
    is_print: int = 1
    sort_order: int = 0

class NewspaperPriceIn(BaseModel):
    start_year: int
    start_month: int
    end_year: Optional[int] = None
    end_month: Optional[int] = None
    subscription_price: Optional[int] = None
    delivery_price: Optional[int] = None
    unit_price: Optional[int] = None
    note: str = ""

class CourseIn(BaseModel):
    name: str
    short_name: str = ""
    staff_id: int
    newspaper_type: str = "H"
    note: str = ""

class CoursePriceIn(BaseModel):
    start_year: int
    start_month: int
    end_year: Optional[int] = None
    end_month: Optional[int] = None
    amount: int
    note: str = ""

class CourseReaderIn(BaseModel):
    reader_id: int

class CollectionAssignmentsIn(BaseModel):
    reader_ids: List[int]
    start_year: int
    start_month: int

class UnitPriceIn(BaseModel):
    category: str
    start_year: int
    start_month: int
    end_year: Optional[int] = None
    end_month: Optional[int] = None
    amount: int
    note: str = ""

class AdjustmentIn(BaseModel):
    year: int
    month: int
    staff_id: int
    role: str = "other"
    amount: int
    note: str = ""

# ── Newspapers ────────────────────────────────────────────────────────────────

def _np_price_at(conn, nid: int, year: int, month: int) -> dict:
    row = conn.execute("""
        SELECT subscription_price, delivery_price, unit_price
        FROM newspaper_price_history
        WHERE newspaper_id=?
          AND (start_year * 12 + start_month) <= (? * 12 + ?)
          AND (end_year IS NULL OR (end_year * 12 + end_month) >= (? * 12 + ?))
        ORDER BY start_year DESC, start_month DESC LIMIT 1
    """, (nid, year, month, year, month)).fetchone()
    if row:
        return {"subscription_price": row["subscription_price"],
                "delivery_price": row["delivery_price"],
                "unit_price": row["unit_price"]}
    return {"subscription_price": None, "delivery_price": None, "unit_price": None}

@app.get("/api/newspapers")
def list_newspapers():
    now = datetime.date.today()
    cy, cm = now.year, now.month
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM newspapers ORDER BY sort_order, id").fetchall()
        result = []
        for np_ in rows:
            prices = conn.execute(
                "SELECT * FROM newspaper_price_history WHERE newspaper_id=? ORDER BY start_year, start_month",
                (np_["id"],)
            ).fetchall()
            cur = _np_price_at(conn, np_["id"], cy, cm)
            result.append({**dict(np_), "prices": [dict(p) for p in prices], **cur})
        return result

@app.post("/api/newspapers", status_code=201)
def create_newspaper(body: NewspaperIn):
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO newspapers (name, short_name, newspaper_type, is_print, sort_order) VALUES (?,?,?,?,?)",
            (body.name, body.short_name, body.newspaper_type, body.is_print, body.sort_order)
        )
        return {"id": cur.lastrowid}

@app.put("/api/newspapers/{nid}")
def update_newspaper(nid: int, body: NewspaperIn):
    with get_conn() as conn:
        conn.execute(
            "UPDATE newspapers SET name=?, short_name=?, newspaper_type=?, is_print=?, sort_order=? WHERE id=?",
            (body.name, body.short_name, body.newspaper_type, body.is_print, body.sort_order, nid)
        )
    return {"ok": True}

@app.delete("/api/newspapers/{nid}")
def delete_newspaper(nid: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM newspapers WHERE id=?", (nid,))
    return {"ok": True}

@app.post("/api/newspapers/{nid}/prices", status_code=201)
def add_newspaper_price(nid: int, body: NewspaperPriceIn):
    with get_conn() as conn:
        cur = conn.execute("""
            INSERT INTO newspaper_price_history
            (newspaper_id, start_year, start_month, end_year, end_month,
             subscription_price, delivery_price, unit_price, note)
            VALUES (?,?,?,?,?,?,?,?,?)
        """, (nid, body.start_year, body.start_month, body.end_year, body.end_month,
              body.subscription_price, body.delivery_price, body.unit_price, body.note))
        return {"id": cur.lastrowid}

@app.delete("/api/newspaper-prices/{pid}")
def delete_newspaper_price(pid: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM newspaper_price_history WHERE id=?", (pid,))
    return {"ok": True}

# ── Readers ───────────────────────────────────────────────────────────────────

@app.get("/api/readers")
def list_readers():
    now = datetime.date.today()
    cy, cm = now.year, now.month
    with get_conn() as conn:
        readers = conn.execute("SELECT * FROM readers ORDER BY id").fetchall()
        result = []
        for r in readers:
            subs = conn.execute("""
                SELECT s.id, s.reader_id, s.newspaper_id, s.quantity, s.status, s.payment_method,
                       s.start_year, s.start_month, s.start_day, s.end_year, s.end_month, s.end_day, s.plan_note,
                       n.name as newspaper_name, n.short_name, n.newspaper_type, n.is_print
                FROM subscriptions s
                JOIN newspapers n ON n.id = s.newspaper_id
                WHERE s.reader_id=?
                  AND (s.start_year IS NULL OR (s.start_year * 12 + s.start_month) <= (? * 12 + ?))
                  AND (s.end_year IS NULL OR (s.end_year * 12 + s.end_month) >= (? * 12 + ?))
                ORDER BY n.sort_order, n.id
            """, (r["id"], cy, cm, cy, cm)).fetchall()
            courses = conn.execute("""
                SELECT c.id as course_id, c.name as course_name, c.short_name,
                       c.newspaper_type, s.name as staff_name
                FROM course_readers cr
                JOIN courses c ON c.id = cr.course_id
                JOIN staff s ON s.id = c.staff_id
                WHERE cr.reader_id=?
                ORDER BY c.newspaper_type, c.name
            """, (r["id"],)).fetchall()
            collection_row = conn.execute("""
                SELECT s.id, s.name
                FROM collection_assignments ca
                JOIN staff s ON s.id = ca.staff_id
                WHERE ca.reader_id=?
                  AND (ca.start_year * 12 + ca.start_month) <= (? * 12 + ?)
                  AND (ca.end_year IS NULL OR (ca.end_year * 12 + ca.end_month) >= (? * 12 + ?))
                ORDER BY ca.start_year DESC, ca.start_month DESC LIMIT 1
            """, (r["id"], cy, cm, cy, cm)).fetchone()
            delivery_rows = conn.execute("""
                SELECT da.newspaper_id, n.name as newspaper_name, n.short_name,
                       n.newspaper_type, s.id as staff_id, s.name as staff_name
                FROM delivery_assignments da
                JOIN newspapers n ON n.id = da.newspaper_id
                JOIN staff s ON s.id = da.staff_id
                WHERE da.reader_id=?
                  AND (da.start_year * 12 + da.start_month) <= (? * 12 + ?)
                  AND (da.end_year IS NULL OR (da.end_year * 12 + da.end_month) >= (? * 12 + ?))
                ORDER BY n.sort_order, n.id, da.start_year DESC, da.start_month DESC
            """, (r["id"], cy, cm, cy, cm)).fetchall()
            result.append({
                **dict(r),
                "subscriptions": [dict(s) for s in subs],
                "courses": [dict(c) for c in courses],
                "collection_staff": dict(collection_row) if collection_row else None,
                "delivery_staff": [dict(d) for d in delivery_rows],
            })
        return result

@app.post("/api/readers", status_code=201)
def create_reader(body: ReaderIn):
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO readers (name, address, note) VALUES (?,?,?)",
            (body.name, body.address, body.note)
        )
        return {"id": cur.lastrowid}

@app.put("/api/readers/{rid}")
def update_reader(rid: int, body: ReaderIn):
    with get_conn() as conn:
        conn.execute(
            "UPDATE readers SET name=?, address=?, note=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (body.name, body.address, body.note, rid)
        )
    return {"ok": True}

@app.delete("/api/readers/{rid}")
def delete_reader(rid: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM readers WHERE id=?", (rid,))
    return {"ok": True}

@app.put("/api/readers/{rid}/subscriptions")
def update_subscriptions(rid: int, body: List[SubscriptionIn]):
    now = datetime.date.today()
    cy, cm = now.year, now.month
    with get_conn() as conn:
        # 現在月以降の行（open-endedを含む）を削除。過去データ（end < 今月）は保持。
        conn.execute("""
            DELETE FROM subscriptions WHERE reader_id=?
            AND (end_year IS NULL OR (end_year * 12 + end_month) >= (? * 12 + ?))
        """, (rid, cy, cm))
        for s in body:
            qty = max(1, s.quantity) if s.quantity else 1
            conn.execute(
                """INSERT INTO subscriptions
                   (reader_id, newspaper_id, quantity, status, payment_method,
                    start_year, start_month, start_day, end_year, end_month, end_day, plan_note)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (rid, s.newspaper_id, qty, s.status, s.payment_method,
                 s.start_year, s.start_month, s.start_day, s.end_year, s.end_month, s.end_day, s.plan_note)
            )
    return {"ok": True}

@app.get("/api/readers/{rid}/subscription-history")
def get_subscription_history(rid: int):
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT s.id, s.newspaper_id, s.quantity, s.status, s.payment_method,
                   s.start_year, s.start_month, s.start_day, s.end_year, s.end_month, s.end_day, s.plan_note,
                   n.name as newspaper_name, n.short_name
            FROM subscriptions s
            JOIN newspapers n ON n.id = s.newspaper_id
            WHERE s.reader_id=?
            ORDER BY s.start_year, s.start_month, s.start_day, n.sort_order, n.id
        """, (rid,)).fetchall()
        return [dict(r) for r in rows]

@app.post("/api/readers/{rid}/subscription-history", status_code=201)
def add_subscription_history(rid: int, body: SubscriptionIn):
    with get_conn() as conn:
        qty = max(1, body.quantity) if body.quantity else 1
        cur = conn.execute("""
            INSERT INTO subscriptions (reader_id, newspaper_id, quantity, status, payment_method,
                start_year, start_month, start_day, end_year, end_month, end_day, plan_note)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        """, (rid, body.newspaper_id, qty, body.status, body.payment_method,
              body.start_year, body.start_month, body.start_day,
              body.end_year, body.end_month, body.end_day, body.plan_note))
        return {"id": cur.lastrowid}

@app.delete("/api/subscriptions/{sid}")
def delete_subscription(sid: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM subscriptions WHERE id=?", (sid,))
    return {"ok": True}

# ── Staff ─────────────────────────────────────────────────────────────────────

@app.get("/api/staff")
def list_staff():
    with get_conn() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM staff ORDER BY id").fetchall()]

@app.post("/api/staff", status_code=201)
def create_staff(body: StaffIn):
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO staff (name, contact, note, is_deliverer, is_collector) VALUES (?,?,?,?,?)",
            (body.name, body.contact, body.note, body.is_deliverer, body.is_collector)
        )
        return {"id": cur.lastrowid}

@app.put("/api/staff/{sid}")
def update_staff(sid: int, body: StaffIn):
    with get_conn() as conn:
        conn.execute(
            "UPDATE staff SET name=?, contact=?, note=?, is_deliverer=?, is_collector=? WHERE id=?",
            (body.name, body.contact, body.note, body.is_deliverer, body.is_collector, sid)
        )
    return {"ok": True}

@app.delete("/api/staff/{sid}")
def delete_staff(sid: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM staff WHERE id=?", (sid,))
    return {"ok": True}

# ── Courses ───────────────────────────────────────────────────────────────────

def _course_with_details(conn, course_id):
    c = conn.execute("""
        SELECT c.*, s.name as staff_name
        FROM courses c JOIN staff s ON s.id = c.staff_id
        WHERE c.id=?
    """, (course_id,)).fetchone()
    if not c:
        return None
    readers = conn.execute("""
        SELECT r.id, r.name, r.address
        FROM course_readers cr JOIN readers r ON r.id = cr.reader_id
        WHERE cr.course_id=? ORDER BY r.name
    """, (course_id,)).fetchall()
    prices = conn.execute(
        "SELECT * FROM course_price_history WHERE course_id=? ORDER BY start_year, start_month",
        (course_id,)
    ).fetchall()
    return {
        **dict(c),
        "readers": [dict(r) for r in readers],
        "prices": [dict(p) for p in prices],
    }

@app.get("/api/courses")
def list_courses():
    with get_conn() as conn:
        ids = [r["id"] for r in conn.execute(
            "SELECT id FROM courses ORDER BY newspaper_type, name"
        ).fetchall()]
        return [_course_with_details(conn, cid) for cid in ids]

@app.post("/api/courses", status_code=201)
def create_course(body: CourseIn):
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO courses (staff_id, name, short_name, newspaper_type, note) VALUES (?,?,?,?,?)",
            (body.staff_id, body.name, body.short_name, body.newspaper_type, body.note)
        )
        return {"id": cur.lastrowid}

@app.put("/api/courses/{cid}")
def update_course(cid: int, body: CourseIn):
    with get_conn() as conn:
        conn.execute(
            "UPDATE courses SET staff_id=?, name=?, short_name=?, newspaper_type=?, note=? WHERE id=?",
            (body.staff_id, body.name, body.short_name, body.newspaper_type, body.note, cid)
        )
    return {"ok": True}

@app.delete("/api/courses/{cid}")
def delete_course(cid: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM courses WHERE id=?", (cid,))
    return {"ok": True}

@app.post("/api/courses/{cid}/readers", status_code=201)
def add_reader_to_course(cid: int, body: CourseReaderIn):
    with get_conn() as conn:
        try:
            conn.execute(
                "INSERT INTO course_readers (course_id, reader_id) VALUES (?,?)",
                (cid, body.reader_id)
            )
        except Exception:
            raise HTTPException(400, "既に追加されています")
    return {"ok": True}

@app.delete("/api/courses/{cid}/readers/{rid}")
def remove_reader_from_course(cid: int, rid: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM course_readers WHERE course_id=? AND reader_id=?", (cid, rid))
    return {"ok": True}

@app.post("/api/courses/{cid}/prices", status_code=201)
def add_course_price(cid: int, body: CoursePriceIn):
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO course_price_history
               (course_id, start_year, start_month, end_year, end_month, amount, note)
               VALUES (?,?,?,?,?,?,?)""",
            (cid, body.start_year, body.start_month,
             body.end_year, body.end_month, body.amount, body.note)
        )
        return {"id": cur.lastrowid}

@app.delete("/api/course-prices/{pid}")
def delete_course_price(pid: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM course_price_history WHERE id=?", (pid,))
    return {"ok": True}

# ── Collection assignments (1読者:1集金担当, 期間管理) ────────────────────────

@app.get("/api/staff/{sid}/assignments")
def get_assignments(sid: int, year: Optional[int] = None, month: Optional[int] = None):
    now = datetime.date.today()
    y, m = year or now.year, month or now.month
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT r.id, r.name, r.address
            FROM collection_assignments ca
            JOIN readers r ON r.id = ca.reader_id
            WHERE ca.staff_id=?
              AND (ca.start_year * 12 + ca.start_month) <= (? * 12 + ?)
              AND (ca.end_year IS NULL OR (ca.end_year * 12 + ca.end_month) >= (? * 12 + ?))
            ORDER BY r.name
        """, (sid, y, m, y, m)).fetchall()
        return [dict(r) for r in rows]

@app.put("/api/staff/{sid}/assignments")
def set_assignments(sid: int, body: CollectionAssignmentsIn):
    sy, sm = body.start_year, body.start_month
    new_rids = set(body.reader_ids)
    with get_conn() as conn:
        # 当該開始月時点でこのスタッフが担当中の読者
        current_rows = conn.execute("""
            SELECT reader_id, start_year, start_month FROM collection_assignments
            WHERE staff_id=?
              AND (start_year * 12 + start_month) <= (? * 12 + ?)
              AND (end_year IS NULL OR (end_year * 12 + end_month) >= (? * 12 + ?))
        """, (sid, sy, sm, sy, sm)).fetchall()
        current_rids = {row["reader_id"] for row in current_rows}

        # 新リストにない読者の担当を開始月前月で終了
        for row in current_rows:
            if row["reader_id"] not in new_rids:
                ey, em = _prev_month(sy, sm)
                if _mval(ey, em) >= _mval(row["start_year"], row["start_month"]):
                    conn.execute("""
                        UPDATE collection_assignments SET end_year=?, end_month=?
                        WHERE reader_id=? AND staff_id=? AND start_year=? AND start_month=?
                    """, (ey, em, row["reader_id"], sid, row["start_year"], row["start_month"]))

        # 新規追加の読者
        for rid in new_rids:
            if rid not in current_rids:
                # 他スタッフの開中担当を終了
                other = conn.execute("""
                    SELECT staff_id, start_year, start_month FROM collection_assignments
                    WHERE reader_id=? AND staff_id!=?
                      AND (start_year * 12 + start_month) <= (? * 12 + ?)
                      AND (end_year IS NULL OR (end_year * 12 + end_month) >= (? * 12 + ?))
                    ORDER BY start_year DESC, start_month DESC LIMIT 1
                """, (rid, sid, sy, sm, sy, sm)).fetchone()
                if other:
                    ey, em = _prev_month(sy, sm)
                    if _mval(ey, em) >= _mval(other["start_year"], other["start_month"]):
                        conn.execute("""
                            UPDATE collection_assignments SET end_year=?, end_month=?
                            WHERE reader_id=? AND staff_id=? AND start_year=? AND start_month=?
                        """, (ey, em, rid, other["staff_id"], other["start_year"], other["start_month"]))
                conn.execute("""
                    INSERT OR REPLACE INTO collection_assignments
                    (reader_id, staff_id, start_year, start_month) VALUES (?,?,?,?)
                """, (rid, sid, sy, sm))
    return {"ok": True}

@app.put("/api/readers/{rid}/collection-assignment")
def set_reader_collection(rid: int, body: dict):
    staff_id = body.get("staff_id")
    sy = body.get("start_year")
    sm = body.get("start_month")
    if not sy or not sm:
        now = datetime.date.today()
        sy, sm = now.year, now.month
    with get_conn() as conn:
        # 既存の開中担当を前月で終了（同じ開始月のものは除く）
        prev = conn.execute("""
            SELECT staff_id, start_year, start_month FROM collection_assignments
            WHERE reader_id=? AND end_year IS NULL
              AND NOT (start_year=? AND start_month=?)
            ORDER BY start_year DESC, start_month DESC LIMIT 1
        """, (rid, sy, sm)).fetchone()
        if prev:
            ey, em = _prev_month(sy, sm)
            if _mval(ey, em) >= _mval(prev["start_year"], prev["start_month"]):
                conn.execute("""
                    UPDATE collection_assignments SET end_year=?, end_month=?
                    WHERE reader_id=? AND staff_id=? AND start_year=? AND start_month=?
                """, (ey, em, rid, prev["staff_id"], prev["start_year"], prev["start_month"]))
        if staff_id:
            conn.execute("""
                INSERT OR REPLACE INTO collection_assignments
                (reader_id, staff_id, start_year, start_month) VALUES (?,?,?,?)
            """, (rid, staff_id, sy, sm))
    return {"ok": True}

# ── Delivery assignments (紙版新聞1種類ごとに1配達担当, 期間管理) ─────────────

class ReaderDeliveryItem(BaseModel):
    newspaper_id: int
    staff_id: Optional[int] = None  # None = 担当解除

class ReaderDeliveryIn(BaseModel):
    assignments: List[ReaderDeliveryItem]
    start_year: int
    start_month: int

class StaffDeliveryItem(BaseModel):
    reader_id: int
    newspaper_id: int

class StaffDeliveryIn(BaseModel):
    assignments: List[StaffDeliveryItem]
    start_year: int
    start_month: int

def _close_open_delivery(conn, rid: int, nid: int, sy: int, sm: int):
    """開中の配達担当を前月で終了（同月開始のものは除く）。"""
    prev = conn.execute("""
        SELECT staff_id, start_year, start_month FROM delivery_assignments
        WHERE reader_id=? AND newspaper_id=? AND end_year IS NULL
          AND NOT (start_year=? AND start_month=?)
        ORDER BY start_year DESC, start_month DESC LIMIT 1
    """, (rid, nid, sy, sm)).fetchone()
    if prev:
        ey, em = _prev_month(sy, sm)
        if _mval(ey, em) >= _mval(prev["start_year"], prev["start_month"]):
            conn.execute("""
                UPDATE delivery_assignments SET end_year=?, end_month=?
                WHERE reader_id=? AND newspaper_id=? AND start_year=? AND start_month=? AND end_year IS NULL
            """, (ey, em, rid, nid, prev["start_year"], prev["start_month"]))

@app.get("/api/staff/{sid}/delivery-assignments")
def get_delivery_assignments(sid: int, year: Optional[int] = None, month: Optional[int] = None):
    now = datetime.date.today()
    y, m = year or now.year, month or now.month
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT da.reader_id, da.newspaper_id,
                   r.name as reader_name, r.address,
                   n.name as newspaper_name, n.short_name
            FROM delivery_assignments da
            JOIN readers r ON r.id = da.reader_id
            JOIN newspapers n ON n.id = da.newspaper_id
            WHERE da.staff_id=?
              AND (da.start_year * 12 + da.start_month) <= (? * 12 + ?)
              AND (da.end_year IS NULL OR (da.end_year * 12 + da.end_month) >= (? * 12 + ?))
            ORDER BY r.name, n.sort_order
        """, (sid, y, m, y, m)).fetchall()
        return [dict(r) for r in rows]

@app.get("/api/staff/{sid}/assignment-history")
def get_assignment_history(sid: int):
    with get_conn() as conn:
        collections = conn.execute("""
            SELECT ca.reader_id, r.name as reader_name,
                   ca.start_year, ca.start_month, ca.end_year, ca.end_month
            FROM collection_assignments ca
            JOIN readers r ON r.id = ca.reader_id
            WHERE ca.staff_id=?
            ORDER BY ca.start_year, ca.start_month, r.name
        """, (sid,)).fetchall()
        deliveries = conn.execute("""
            SELECT da.reader_id, r.name as reader_name,
                   da.newspaper_id, n.name as newspaper_name, n.short_name,
                   da.start_year, da.start_month, da.end_year, da.end_month
            FROM delivery_assignments da
            JOIN readers r ON r.id = da.reader_id
            JOIN newspapers n ON n.id = da.newspaper_id
            WHERE da.staff_id=?
            ORDER BY da.start_year, da.start_month, r.name, n.sort_order
        """, (sid,)).fetchall()
        return {
            "collections": [dict(r) for r in collections],
            "deliveries": [dict(r) for r in deliveries],
        }

@app.put("/api/staff/{sid}/delivery-assignments")
def set_delivery_assignments(sid: int, body: StaffDeliveryIn):
    sy, sm = body.start_year, body.start_month
    new_keys = {(item.reader_id, item.newspaper_id) for item in body.assignments}
    with get_conn() as conn:
        # 現在担当中のペアを取得
        current_rows = conn.execute("""
            SELECT reader_id, newspaper_id, start_year, start_month FROM delivery_assignments
            WHERE staff_id=?
              AND (start_year * 12 + start_month) <= (? * 12 + ?)
              AND (end_year IS NULL OR (end_year * 12 + end_month) >= (? * 12 + ?))
        """, (sid, sy, sm, sy, sm)).fetchall()
        current_keys = {(r["reader_id"], r["newspaper_id"]) for r in current_rows}

        # 新リストにないペアを終了
        for row in current_rows:
            key = (row["reader_id"], row["newspaper_id"])
            if key not in new_keys:
                ey, em = _prev_month(sy, sm)
                if _mval(ey, em) >= _mval(row["start_year"], row["start_month"]):
                    conn.execute("""
                        UPDATE delivery_assignments SET end_year=?, end_month=?
                        WHERE reader_id=? AND newspaper_id=? AND staff_id=? AND start_year=? AND start_month=?
                    """, (ey, em, row["reader_id"], row["newspaper_id"], sid,
                          row["start_year"], row["start_month"]))

        # 新規追加
        for item in body.assignments:
            key = (item.reader_id, item.newspaper_id)
            if key not in current_keys:
                _close_open_delivery(conn, item.reader_id, item.newspaper_id, sy, sm)
                conn.execute("""
                    INSERT OR REPLACE INTO delivery_assignments
                    (reader_id, newspaper_id, staff_id, start_year, start_month) VALUES (?,?,?,?,?)
                """, (item.reader_id, item.newspaper_id, sid, sy, sm))
    return {"ok": True}

@app.put("/api/readers/{rid}/delivery-assignments")
def set_reader_delivery(rid: int, body: ReaderDeliveryIn):
    sy, sm = body.start_year, body.start_month
    with get_conn() as conn:
        for item in body.assignments:
            _close_open_delivery(conn, rid, item.newspaper_id, sy, sm)
            if item.staff_id is not None:
                conn.execute("""
                    INSERT OR REPLACE INTO delivery_assignments
                    (reader_id, newspaper_id, staff_id, start_year, start_month) VALUES (?,?,?,?,?)
                """, (rid, item.newspaper_id, item.staff_id, sy, sm))
    return {"ok": True}

# ── Unit Prices (固定単価: 配達のみ) ──────────────────────────────────────────

FIXED_PRICE_CATS = {}  # 配達単価・集金単価は新聞マスタで管理するため固定カテゴリなし

@app.get("/api/unit-prices")
def list_unit_prices():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM unit_price_history ORDER BY category, start_year, start_month"
        ).fetchall()
        return [dict(r) for r in rows]

@app.post("/api/unit-prices", status_code=201)
def create_unit_price(body: UnitPriceIn):
    if body.category not in FIXED_PRICE_CATS:
        raise HTTPException(400, f"不明なカテゴリ: {body.category}")
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO unit_price_history
               (category, start_year, start_month, end_year, end_month, amount, note)
               VALUES (?,?,?,?,?,?,?)""",
            (body.category, body.start_year, body.start_month,
             body.end_year, body.end_month, body.amount, body.note)
        )
        return {"id": cur.lastrowid}

@app.delete("/api/unit-prices/{pid}")
def delete_unit_price(pid: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM unit_price_history WHERE id=?", (pid,))
    return {"ok": True}

def _get_price(conn, category: str, year: int, month: int) -> int:
    row = conn.execute("""
        SELECT amount FROM unit_price_history
        WHERE category=?
          AND (start_year < ? OR (start_year=? AND start_month<=?))
          AND (end_year IS NULL OR end_year > ? OR (end_year=? AND end_month>=?))
        ORDER BY start_year DESC, start_month DESC
        LIMIT 1
    """, (category, year, year, month, year, year, month)).fetchone()
    return int(row["amount"]) if row else 0

def _get_course_price(conn, course_id: int, year: int, month: int) -> int:
    row = conn.execute("""
        SELECT amount FROM course_price_history
        WHERE course_id=?
          AND (start_year < ? OR (start_year=? AND start_month<=?))
          AND (end_year IS NULL OR end_year > ? OR (end_year=? AND end_month>=?))
        ORDER BY start_year DESC, start_month DESC
        LIMIT 1
    """, (course_id, year, year, month, year, year, month)).fetchone()
    return int(row["amount"]) if row else 0

# ── Adjustments ───────────────────────────────────────────────────────────────

@app.get("/api/adjustments")
def list_adjustments(year: int, month: int):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM subsidy_adjustments WHERE year=? AND month=? ORDER BY id",
            (year, month)
        ).fetchall()
        return [dict(r) for r in rows]

@app.post("/api/adjustments", status_code=201)
def create_adjustment(body: AdjustmentIn):
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO subsidy_adjustments (year, month, staff_id, role, amount, note)
               VALUES (?,?,?,?,?,?)""",
            (body.year, body.month, body.staff_id, body.role, body.amount, body.note)
        )
        return {"id": cur.lastrowid}

@app.delete("/api/adjustments/{adj_id}")
def delete_adjustment(adj_id: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM subsidy_adjustments WHERE id=?", (adj_id,))
    return {"ok": True}

# ── Subsidies ─────────────────────────────────────────────────────────────────

def _calc_subsidies(conn, year: int, month: int):
    prices = {}

    all_adjustments = conn.execute(
        "SELECT * FROM subsidy_adjustments WHERE year=? AND month=?", (year, month)
    ).fetchall()
    adj_map = {}
    for a in all_adjustments:
        adj_map.setdefault(a["staff_id"], []).append(dict(a))

    all_staff = conn.execute("SELECT * FROM staff ORDER BY id").fetchall()
    results = []

    for s in all_staff:
        sid = s["id"]
        lines = []

        # ── 配達（コース） ──────────────────────────────────────
        if s["is_deliverer"]:
            courses = conn.execute(
                "SELECT * FROM courses WHERE staff_id=? ORDER BY newspaper_type, name", (sid,)
            ).fetchall()
            for c in courses:
                unit = _get_course_price(conn, c["id"], year, month)
                reader_count = conn.execute(
                    "SELECT COUNT(*) as n FROM course_readers WHERE course_id=?",
                    (c["id"],)
                ).fetchone()["n"]
                np_names = conn.execute(
                    "SELECT name FROM newspapers WHERE newspaper_type=? ORDER BY sort_order, id",
                    (c["newspaper_type"],)
                ).fetchall()
                np_label = "・".join(r["name"] for r in np_names) if np_names else c["newspaper_type"]
                # コースは人数に関わらず単価×1（集合住宅等へのまとめ投函）
                lines.append({
                    "label": f"配達　{np_label}　{c['name']}",
                    "count": 1, "unit": unit, "amount": unit,
                })

            # ── 個別配達（コース未所属・delivery_assignments）────────────
            indiv_rows = conn.execute("""
                SELECT n.id as nid, n.name, n.short_name,
                       SUM(sub.quantity) as total_qty
                FROM delivery_assignments da
                JOIN subscriptions sub
                  ON sub.reader_id = da.reader_id
                 AND sub.newspaper_id = da.newspaper_id
                 AND sub.status = 'active'
                 AND sub.payment_method != 'skip'
                 AND (sub.start_year IS NULL OR sub.start_year < ? OR (sub.start_year = ? AND sub.start_month <= ?))
                 AND (sub.end_year IS NULL OR sub.end_year > ? OR (sub.end_year = ? AND sub.end_month >= ?))
                JOIN newspapers n ON n.id = da.newspaper_id
                WHERE da.staff_id = ?
                  AND (da.start_year * 12 + da.start_month) <= (? * 12 + ?)
                  AND (da.end_year IS NULL OR (da.end_year * 12 + da.end_month) >= (? * 12 + ?))
                GROUP BY n.id
                ORDER BY n.sort_order, n.id
            """, (year, year, month, year, year, month,
                  sid, year, month, year, month)).fetchall()
            for row in indiv_rows:
                dp = (_np_price_at(conn, row["nid"], year, month)["delivery_price"] or 0)
                if not dp:
                    continue
                qty = row["total_qty"]
                lines.append({
                    "label": f"配達　{row['name']}",
                    "count": qty, "unit": dp, "amount": qty * dp,
                })


        # ── 集金 (price_history の unit_price × active 購読部数合計、期間フィルタあり) ──
        if s["is_collector"]:
            rows = conn.execute("""
                SELECT n.id, n.name, n.short_name, SUM(sub.quantity) as total_qty
                FROM collection_assignments ca
                JOIN subscriptions sub ON sub.reader_id = ca.reader_id
                JOIN newspapers n ON n.id = sub.newspaper_id
                WHERE ca.staff_id = ?
                  AND (ca.start_year * 12 + ca.start_month) <= (? * 12 + ?)
                  AND (ca.end_year IS NULL OR (ca.end_year * 12 + ca.end_month) >= (? * 12 + ?))
                  AND sub.payment_method = 'cash'
                  AND sub.status = 'active'
                  AND (sub.start_year IS NULL OR sub.start_year < ? OR (sub.start_year = ? AND sub.start_month <= ?))
                  AND (sub.end_year IS NULL OR sub.end_year > ? OR (sub.end_year = ? AND sub.end_month >= ?))
                GROUP BY n.id
                ORDER BY n.sort_order, n.id
            """, (sid, year, month, year, month, year, year, month, year, year, month)).fetchall()
            for row in rows:
                price = _np_price_at(conn, row["id"], year, month)
                unit = price["unit_price"] or 0
                if not unit:
                    continue
                qty = row["total_qty"]
                lines.append({
                    "label": f"集金　{row['name']}",
                    "count": qty, "unit": unit, "amount": qty * unit,
                })

        base = sum(l["amount"] for l in lines)
        adjs = adj_map.get(sid, [])
        total = base + sum(a["amount"] for a in adjs)

        results.append({
            "staff_id": sid,
            "staff_name": s["name"],
            "is_deliverer": bool(s["is_deliverer"]),
            "is_collector": bool(s["is_collector"]),
            "lines": lines,
            "base": base,
            "adjustments": adjs,
            "adj_sum": sum(a["amount"] for a in adjs),
            "total": total,
        })

    # コース未所属の部数合計（H/N 別、参考情報）
    # active + active_no_collection どちらも配達は行う
    # コース未所属の部数合計（新聞ごと・参考情報）
    period_filter = """
        AND (sub.start_year IS NULL OR sub.start_year < ? OR (sub.start_year = ? AND sub.start_month <= ?))
        AND (sub.end_year IS NULL OR sub.end_year > ? OR (sub.end_year = ? AND sub.end_month >= ?))
    """
    pargs = (year, year, month, year, year, month)
    unaffiliated_rows = conn.execute(f"""
        SELECT n.id, n.name, n.short_name, n.newspaper_type,
               COALESCE(SUM(sub.quantity), 0) as total_qty
        FROM subscriptions sub
        JOIN newspapers n ON n.id = sub.newspaper_id
        WHERE sub.status = 'active'
          {period_filter}
          AND n.is_print = 1
          AND (n.newspaper_type IS NOT NULL)
          AND sub.reader_id NOT IN (
              SELECT cr.reader_id FROM course_readers cr
              JOIN courses c ON c.id = cr.course_id
              WHERE c.newspaper_type = n.newspaper_type
          )
        GROUP BY n.id
        ORDER BY n.sort_order, n.id
    """, pargs).fetchall()

    unaffiliated = []
    for r in unaffiliated_rows:
        if r["total_qty"] <= 0:
            continue
        dp = (_np_price_at(conn, r["id"], year, month)["delivery_price"] or 0)
        unaffiliated.append({
            "newspaper_id": r["id"],
            "name": r["name"],
            "short_name": r["short_name"],
            "newspaper_type": r["newspaper_type"],
            "delivery_price": dp,
            "count": r["total_qty"],
            "amount": r["total_qty"] * dp,
        })

    # 新聞別売上サマリー
    sales_rows = conn.execute(f"""
        SELECT n.id, n.name, n.short_name, n.is_print,
               SUM(sub.quantity) as total_qty
        FROM subscriptions sub
        JOIN newspapers n ON n.id = sub.newspaper_id
        WHERE sub.status = 'active'
          {period_filter}
        GROUP BY n.id
        ORDER BY n.sort_order, n.id
    """, pargs).fetchall()
    sales = []
    for r in sales_rows:
        sp = _np_price_at(conn, r["id"], year, month)["subscription_price"]
        sales.append({
            "newspaper_id": r["id"],
            "name": r["name"],
            "short_name": r["short_name"],
            "is_print": r["is_print"],
            "subscription_price": sp,
            "total_qty": r["total_qty"],
            "revenue": r["total_qty"] * sp if sp is not None else None,
        })

    # ── 配達担当未設定の読者（紙版購読あり・コース未所属・delivery_assignment なし）──
    no_delivery = conn.execute(f"""
        SELECT DISTINCT r.id, r.name
        FROM readers r
        JOIN subscriptions sub ON sub.reader_id = r.id
        JOIN newspapers n ON n.id = sub.newspaper_id
        WHERE sub.status = 'active'
          AND n.is_print = 1
          {period_filter}
          AND NOT EXISTS (
              SELECT 1 FROM course_readers cr
              JOIN courses c ON c.id = cr.course_id
              WHERE cr.reader_id = r.id AND c.newspaper_type = n.newspaper_type
          )
          AND NOT EXISTS (
              SELECT 1 FROM delivery_assignments da
              WHERE da.reader_id = r.id AND da.newspaper_id = sub.newspaper_id
                AND (da.start_year * 12 + da.start_month) <= (? * 12 + ?)
                AND (da.end_year IS NULL OR (da.end_year * 12 + da.end_month) >= (? * 12 + ?))
          )
        ORDER BY r.id
    """, (*pargs, year, month, year, month)).fetchall()

    # ── 集金担当未設定の読者（現金払い購読あり・collection_assignment なし）──
    no_collection = conn.execute(f"""
        SELECT DISTINCT r.id, r.name
        FROM readers r
        JOIN subscriptions sub ON sub.reader_id = r.id
        WHERE sub.status = 'active'
          AND sub.payment_method = 'cash'
          {period_filter}
          AND NOT EXISTS (
              SELECT 1 FROM collection_assignments ca
              WHERE ca.reader_id = r.id
                AND (ca.start_year * 12 + ca.start_month) <= (? * 12 + ?)
                AND (ca.end_year IS NULL OR (ca.end_year * 12 + ca.end_month) >= (? * 12 + ?))
          )
        ORDER BY r.id
    """, (*pargs, year, month, year, month)).fetchall()

    return {
        "staff": results,
        "prices": prices,
        "unaffiliated": unaffiliated,
        "sales": sales,
        "no_delivery": [dict(r) for r in no_delivery],
        "no_collection": [dict(r) for r in no_collection],
    }


@app.get("/api/subsidies")
def get_subsidies(year: int, month: int):
    with get_conn() as conn:
        return _calc_subsidies(conn, year, month)


@app.get("/api/subsidies/export")
def export_subsidies(year: int, month: int):
    with get_conn() as conn:
        data = _calc_subsidies(conn, year, month)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = f"{year}年{month}月援助金明細"

    thin = Side(style="thin")
    med  = Side(style="medium")
    border_all   = Border(left=thin, right=thin, top=thin, bottom=thin)
    border_name  = Border(left=med, right=med, top=med, bottom=thin)
    border_head  = Border(left=thin, right=thin, top=thin, bottom=med)
    border_total = Border(left=med, right=med, top=med, bottom=med)

    name_fill  = PatternFill("solid", fgColor="1F4E79")
    head_fill  = PatternFill("solid", fgColor="2E75B6")
    adj_fill   = PatternFill("solid", fgColor="FFF2CC")
    total_fill = PatternFill("solid", fgColor="D6E4F0")
    alt_fill   = PatternFill("solid", fgColor="EBF3FB")

    name_font  = Font(name="Meiryo", bold=True, size=14, color="FFFFFF")
    head_font  = Font(name="Meiryo", bold=True, size=11, color="FFFFFF")
    body_font  = Font(name="Meiryo", size=12)
    total_font = Font(name="Meiryo", bold=True, size=13)

    ws.column_dimensions["A"].width = 28
    ws.column_dimensions["B"].width = 8
    ws.column_dimensions["C"].width = 10
    ws.column_dimensions["D"].width = 13

    def write_row(row, values, fonts=None, fills=None, borders=None,
                  aligns=None, heights=None):
        for ci, val in enumerate(values, 1):
            c = ws.cell(row=row, column=ci, value=val)
            c.font   = (fonts[ci-1]  if fonts  else body_font)
            c.fill   = (fills[ci-1]  if fills  else PatternFill())
            c.border = (borders[ci-1] if borders else border_all)
            al = aligns[ci-1] if aligns else "left"
            c.alignment = Alignment(horizontal=al, vertical="center")
        if heights:
            ws.row_dimensions[row].height = heights

    def write_person(start_row, person):
        r = start_row
        roles = []
        if person["is_deliverer"]: roles.append("配達")
        if person["is_collector"]: roles.append("集金")
        role_str = "・".join(roles)

        ws.merge_cells(f"A{r}:D{r}")
        c = ws.cell(row=r, column=1,
                    value=f"  {person['staff_name']}　様　　{year}年{month}月分　援助金明細　（{role_str}）")
        c.font = name_font; c.fill = name_fill; c.border = border_name
        c.alignment = Alignment(horizontal="left", vertical="center")
        for col in range(2, 5):
            ws.cell(row=r, column=col).border = border_name
            ws.cell(row=r, column=col).fill = name_fill
        ws.row_dimensions[r].height = 26
        r += 1

        write_row(r, ["　項目", "件数", "単価（円）", "金額（円）"],
                  fonts=[head_font]*4, fills=[head_fill]*4,
                  borders=[border_head]*4,
                  aligns=["left","center","right","right"], heights=18)
        r += 1

        for i, line in enumerate(person["lines"]):
            fill = alt_fill if i % 2 == 1 else PatternFill()
            write_row(r, [f"　{line['label']}", line["count"], line["unit"], line["amount"]],
                      fills=[fill]*4, aligns=["left","center","right","right"], heights=20)
            ws.cell(row=r, column=3).number_format = "#,##0"
            ws.cell(row=r, column=4).number_format = "#,##0"
            r += 1

        if not person["lines"]:
            ws.merge_cells(f"A{r}:D{r}")
            c = ws.cell(row=r, column=1, value="　（対象なし）")
            c.font = body_font; c.border = border_all
            c.alignment = Alignment(horizontal="left", vertical="center")
            for col in range(2, 5):
                ws.cell(row=r, column=col).border = border_all
            ws.row_dimensions[r].height = 18
            r += 1

        for adj in person["adjustments"]:
            ws.merge_cells(f"A{r}:C{r}")
            c = ws.cell(row=r, column=1, value=f"　【調整】{adj['note']}")
            c.font = body_font; c.fill = adj_fill; c.border = border_all
            c.alignment = Alignment(horizontal="left", vertical="center")
            for col in [2, 3]:
                ws.cell(row=r, column=col).border = border_all
                ws.cell(row=r, column=col).fill = adj_fill
            amt_cell = ws.cell(row=r, column=4, value=adj["amount"])
            amt_cell.font = body_font; amt_cell.fill = adj_fill
            amt_cell.border = border_all; amt_cell.number_format = "#,##0"
            amt_cell.alignment = Alignment(horizontal="right", vertical="center")
            ws.row_dimensions[r].height = 20
            r += 1

        ws.merge_cells(f"A{r}:C{r}")
        c = ws.cell(row=r, column=1, value="　合　計")
        c.font = total_font; c.fill = total_fill; c.border = border_total
        c.alignment = Alignment(horizontal="left", vertical="center")
        for col in [2, 3]:
            ws.cell(row=r, column=col).border = border_total
            ws.cell(row=r, column=col).fill = total_fill
        tc = ws.cell(row=r, column=4, value=person["total"])
        tc.font = total_font; tc.fill = total_fill; tc.border = border_total
        tc.number_format = "#,##0"
        tc.alignment = Alignment(horizontal="right", vertical="center")
        ws.row_dimensions[r].height = 24
        r += 1
        return r

    current_row = 1
    staff_list = data["staff"]
    for i, person in enumerate(staff_list):
        current_row = write_person(current_row, person)
        ws.row_dimensions[current_row].height = 12
        current_row += 1
        if (i + 1) % 2 == 0 and i < len(staff_list) - 1:
            ws.row_breaks.append(
                openpyxl.worksheet.pagebreak.Break(id=current_row - 1)
            )

    ws.page_setup.paperSize   = ws.PAPERSIZE_A4
    ws.page_setup.orientation = "portrait"
    ws.page_setup.fitToPage   = True
    ws.page_setup.fitToWidth  = 1
    ws.page_setup.fitToHeight = 0
    ws.page_margins.left = ws.page_margins.right = 0.5
    ws.page_margins.top = ws.page_margins.bottom = 0.75
    ws.page_margins.header = ws.page_margins.footer = 0.3
    ws.print_area = f"A1:D{current_row}"
    ws.sheet_properties.pageSetUpPr.fitToPage = True

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f"援助金明細_{year}{month:02d}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"}
    )


app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="static")
