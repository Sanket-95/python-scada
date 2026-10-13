"""Shared Pydantic schemas for the dairy reporting module.

Every record carries `is_mock: True`. Optional measurement fields are None
when not measured — the UI shows "Not tested" / "Unavailable", never 0.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class Delivery(BaseModel):
    delivery_id: str
    batch_id: str                       # raw-milk batch (one per delivery)
    report_date: str
    shift: str
    collection_time: str                # milk collected at the centre
    center_id: str
    center_name: str
    supplier_id: str
    supplier_name: str
    tanker_id: str
    arrival_time: str
    unload_start: Optional[str]         # None when the load was rejected (not unloaded)
    unload_end: Optional[str]
    milk_type: str
    gross_l: float
    sample_ml: float
    accepted_l: float
    rejected_l: float
    reject_reason: Optional[str]
    temperature_c: float
    quality_status: str
    receiving_tank: Optional[str]
    operator_id: str
    sample_id: Optional[str]            # None = sample record missing
    is_mock: bool = True


class QualitySample(BaseModel):
    sample_id: str
    batch_id: str
    delivery_id: str
    report_date: str
    shift: str
    center_id: str
    center_name: str
    supplier_id: str
    milk_type: str
    sample_time: str
    test_time: str
    fat_pct: Optional[float]
    snf_pct: Optional[float]
    density_kg_l: Optional[float]
    density_temp_c: float = 20.0
    clr: Optional[float]
    protein_pct: Optional[float]
    lactose_pct: Optional[float]
    acidity_pct_la: Optional[float]
    sample_temp_c: float
    method: str
    instrument_id: str
    screening_status: str
    result_status: str
    review_reasons: List[str] = Field(default_factory=list)
    reviewer_id: Optional[str]
    weight_l: float                     # volume the result represents (accepted litres) — used for weighted averages
    is_mock: bool = True


class TankMovement(BaseModel):
    event_id: str
    timestamp: str
    report_date: str
    shift: str
    tank_id: str
    direction: str                      # IN | OUT
    volume_l: float
    counterpart: str
    batch_ids: List[str]
    pump_id: Optional[str]
    valve_ids: List[str]
    level_after_l: float
    level_after_pct: float
    temp_c: float
    note: Optional[str] = None
    is_mock: bool = True


class TankSnapshot(BaseModel):
    timestamp: str
    volumes: Dict[str, float]
    temps: Dict[str, float]
    wip_l: float                        # milk inside the process line (running batch)


class ProcessBatch(BaseModel):
    batch_id: str
    report_date: str
    shift: str
    product_code: str
    product_name: str
    milk_type: str
    source_tanks: List[str]
    source_lots: List[Dict[str, Any]]   # [{lot, litres, tank}]
    scheduled_start: str
    start: Optional[str]
    end: Optional[str]
    incoming_l: float
    processed_l: float
    documented_loss_l: float
    inlet_temp_c: Optional[float]
    outlet_temp_min_c: Optional[float]
    outlet_temp_avg_c: Optional[float]
    hold_time_s: Optional[float]
    homogenizer_bar: Optional[float]
    cooling_outlet_c: Optional[float]
    line_id: str
    equipment_status: str
    deviations: List[str]
    alarm_ids: List[str] = Field(default_factory=list)
    state: str                          # NOT STARTED | RUNNING | COMPLETED | REVIEW REQUIRED | FAILED DEMO CRITERIA
    disposition: str
    temp_profile: List[Dict[str, Any]] = Field(default_factory=list)   # [{t, outlet_c, fdv}]
    events: List[Dict[str, str]] = Field(default_factory=list)          # [{time, text}]
    is_mock: bool = True


class PackagingRecord(BaseModel):
    fg_batch_id: str
    batch_id: str
    report_date: str
    shift: str
    product_code: str
    product_name: str
    line_id: str
    pack_size_ml: int
    planned_units: int
    produced_units: int                 # completed packs = accepted + rejected
    accepted_packs: int
    rejected_packs: int
    speed_pph: int
    operating_min: float
    downtime_min: float
    downtime_reason: Optional[str]
    finished_volume_l: float            # accepted packs × declared size
    rejected_volume_l: float
    disposition: str
    start: str
    end: str
    cold_storage_in: Optional[str]      # None = cold-storage scan missing
    dispatch_id: Optional[str]
    dispatch_time: Optional[str]
    is_mock: bool = True


class CipPhase(BaseModel):
    phase: str
    start: str
    minutes: float
    supply_temp_c: float
    return_temp_c: float
    flow_m3h: float
    pressure_bar: float
    conductivity_ms_cm: Optional[float]
    ok: bool
    note: Optional[str] = None


class CipCycle(BaseModel):
    cycle_id: str
    report_date: str
    shift: str
    circuit_id: str
    circuit_name: str
    equipment: List[str]
    start: str
    end: str
    duration_min: float
    phases: List[CipPhase]
    solution_id: str
    rinse_status: str
    completion_status: str              # COMPLETED | INCOMPLETE | FAILED DEMO CRITERIA
    deviations: List[str]
    operator_id: str
    is_mock: bool = True


class EquipmentInterval(BaseModel):
    equipment_id: str
    state: str                          # RUN | FAULT | DOWN (IDLE is derived as the remainder)
    start: str
    end: str
    reason: Optional[str] = None
    ref: Optional[str] = None           # batch / CIP / transfer id that caused it


class AlarmEvent(BaseModel):
    event_id: str
    timestamp: str
    report_date: str
    shift: str
    severity: str                       # INFO | WARNING | CRITICAL | FAULT
    equipment_id: str
    code: str
    description: str
    value: Optional[float]
    unit: Optional[str]
    threshold: Optional[str]
    ack_status: str
    ack_time: Optional[str]
    resolved_time: Optional[str]
    resolution: Optional[str]
    ref: Optional[str] = None
    is_mock: bool = True


class Pagination(BaseModel):
    page: int
    page_size: int
    total: int
    pages: int


class ReportEnvelope(BaseModel):
    report_id: str
    report: str
    title: str
    generated_at: str
    demo_notice: str
    mode: str
    period: Dict[str, Any]
    filters: Dict[str, Any]
    summary: Dict[str, Any] = Field(default_factory=dict)
    rows: List[Dict[str, Any]] = Field(default_factory=list)
    pagination: Optional[Pagination] = None
    columns: List[Dict[str, Any]] = Field(default_factory=list)   # [{key, label, unit?, kind?}]
    charts: Dict[str, Any] = Field(default_factory=dict)
    notes: List[str] = Field(default_factory=list)
