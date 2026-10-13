"""FastAPI routes for the dairy reports (mounted under /api/reports)."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from . import service as S
from .export import to_csv, to_pdf

router = APIRouter(prefix="/api/reports", tags=["dairy reports"])


def _filters(mode, start, end, shift, milk_type, batch, center, equipment, status, q, page, page_size, sort_by, sort_dir):
    try:
        return S.make_filters(mode, start, end, shift, milk_type, batch, center, equipment, status, q,
                              page, page_size, sort_by, sort_dir)
    except S.FilterError as e:
        raise HTTPException(status_code=422, detail=str(e))


def common(
    mode: str = Query("seeded", description="seeded (repeatable) or dynamic (follows the clock)"),
    start: Optional[str] = Query(None, description="YYYY-MM-DD (default: last day of the demo window)"),
    end: Optional[str] = Query(None, description="YYYY-MM-DD (default: start)"),
    shift: Optional[str] = Query(None, description="Morning | Afternoon | Night"),
    milk_type: Optional[str] = Query(None, description="Cow | Buffalo | All"),
    batch: Optional[str] = None, center: Optional[str] = Query(None, description="collection centre or supplier id"),
    equipment: Optional[str] = None, status: Optional[str] = None, q: Optional[str] = Query(None, description="free-text search"),
    page: int = 1, page_size: int = 50, sort_by: Optional[str] = None, sort_dir: str = "asc",
):
    return dict(mode=mode, start=start, end=end, shift=shift, milk_type=milk_type, batch=batch, center=center,
                equipment=equipment, status=status, q=q, page=page, page_size=page_size, sort_by=sort_by, sort_dir=sort_dir)


def _run(fn, params, *args):
    f = _filters(**params)
    try:
        return fn(f, *args)
    except S.FilterError as e:
        raise HTTPException(status_code=404 if "not found" in str(e).lower() or "nothing found" in str(e).lower() else 422, detail=str(e))


@router.get("/meta")
def reports_meta(mode: str = "seeded"):
    if mode not in ("seeded", "dynamic"):
        raise HTTPException(status_code=422, detail="mode must be 'seeded' or 'dynamic'")
    return S.meta(mode)


def _register(name: str):
    fn = S.REPORTS[name]

    def view(mode: str = "seeded", start: Optional[str] = None, end: Optional[str] = None, shift: Optional[str] = None,
             milk_type: Optional[str] = None, batch: Optional[str] = None, center: Optional[str] = None,
             equipment: Optional[str] = None, status: Optional[str] = None, q: Optional[str] = None,
             page: int = 1, page_size: int = 50, sort_by: Optional[str] = None, sort_dir: str = "asc"):
        return _run(fn, common(mode, start, end, shift, milk_type, batch, center, equipment, status, q, page, page_size, sort_by, sort_dir))

    def export(format: str = "csv", mode: str = "seeded", start: Optional[str] = None, end: Optional[str] = None,
               shift: Optional[str] = None, milk_type: Optional[str] = None, batch: Optional[str] = None,
               center: Optional[str] = None, equipment: Optional[str] = None, status: Optional[str] = None,
               q: Optional[str] = None, sort_by: Optional[str] = None, sort_dir: str = "asc"):
        env = _run(fn, common(mode, start, end, shift, milk_type, batch, center, equipment, status, q, 1, 10000, sort_by, sort_dir))
        return _export(env, format)

    router.add_api_route(f"/{name}", view, methods=["GET"], name=f"report_{name}")
    router.add_api_route(f"/{name}/export", export, methods=["GET"], name=f"export_{name}")


def _export(env, fmt: str):
    fname = f"{env['report_id']}.{fmt}"
    if fmt == "csv":
        return Response(to_csv(env), media_type="text/csv; charset=utf-8",
                        headers={"Content-Disposition": f'attachment; filename="{fname}"'})
    if fmt == "pdf":
        return Response(to_pdf(env), media_type="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="{fname}"'})
    raise HTTPException(status_code=422, detail="format must be csv or pdf")


@router.get("/processing/{batch_id}")
def processing_detail(batch_id: str, mode: str = "seeded", start: Optional[str] = None, end: Optional[str] = None):
    return _run(S.report_batch_detail, common(mode, start, end, None, None, None, None, None, None, None, 1, 50, None, "asc"), batch_id)


@router.get("/tanks/{tank_id}/transfers")
def tank_transfers(tank_id: str, mode: str = "seeded", start: Optional[str] = None, end: Optional[str] = None,
                   shift: Optional[str] = None, q: Optional[str] = None, page: int = 1, page_size: int = 50,
                   sort_by: Optional[str] = None, sort_dir: str = "asc"):
    return _run(S.report_tank_transfers, common(mode, start, end, shift, None, None, None, None, None, q, page, page_size, sort_by, sort_dir), tank_id)


@router.get("/traceability/{batch_id}")
def traceability(batch_id: str, mode: str = "seeded", start: Optional[str] = None, end: Optional[str] = None):
    return _run(S.report_traceability, common(mode, start, end, None, None, None, None, None, None, None, 1, 50, None, "asc"), batch_id)


@router.get("/traceability/{batch_id}/export")
def traceability_export(batch_id: str, format: str = "csv", mode: str = "seeded", start: Optional[str] = None, end: Optional[str] = None):
    env = traceability(batch_id, mode, start, end)
    return _export(env, format)


for _name in S.REPORTS:
    _register(_name)
