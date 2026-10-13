"""Dairy reporting — plant configuration for the mock-data generator.

Everything here is FICTIONAL demonstration configuration. Thresholds are
illustrative only and must be verified against current applicable standards
before any real use. Tank and equipment IDs match the Dairy 3D screen
(frontend/src/sim/dairyPlant.js): one raw-milk reception tank feeding cow and
buffalo silos through a diverter valve, then pasteurizer → homogenizer →
cooling/storage tank → packing → cold storage.
"""

from __future__ import annotations

DEMO_NOTICE = "DEMO DATA — NOT FOR ACTUAL PRODUCTION OR QUALITY CERTIFICATION"
ILLUSTRATIVE = "Illustrative demo rule — verify against current applicable standards"

PLANT_NAME = "Sahyadri Valley Dairy (fictional demo plant)"

# ── Shifts (local plant time) ─────────────────────────────────────────────────
SHIFTS = {
    "Morning":   (6, 14),
    "Afternoon": (14, 22),
    "Night":     (22, 30),   # 22:00 → 06:00 next day
}

# ── Collection network (all names fictional) ─────────────────────────────────
COLLECTION_CENTERS = [
    {"id": "CC-01", "name": "Ambegaon Collection Centre"},
    {"id": "CC-02", "name": "Ghodnadi Chilling Point"},
    {"id": "CC-03", "name": "Pimpalwadi Milk Society"},
    {"id": "CC-04", "name": "Sonori Village Centre"},
    {"id": "CC-05", "name": "Tamhini Hills Cooperative"},
]
# supplier → (centre, main milk type)
SUPPLIERS = [
    {"id": "SUP-1001", "name": "Kavya Farms (fictional)",        "center": "CC-01", "milk": "Cow"},
    {"id": "SUP-1002", "name": "Shivneri Agro (fictional)",      "center": "CC-01", "milk": "Buffalo"},
    {"id": "SUP-1003", "name": "Ganga Dairy Group (fictional)",  "center": "CC-02", "milk": "Cow"},
    {"id": "SUP-1004", "name": "Malhar Livestock (fictional)",   "center": "CC-02", "milk": "Buffalo"},
    {"id": "SUP-1005", "name": "Riverbend Herds (fictional)",    "center": "CC-03", "milk": "Cow"},
    {"id": "SUP-1006", "name": "Sahyadri Buffalo Co. (fictional)", "center": "CC-04", "milk": "Buffalo"},
    {"id": "SUP-1007", "name": "Greenpasture Farms (fictional)", "center": "CC-04", "milk": "Cow"},
    {"id": "SUP-1008", "name": "Hilltop Cattle (fictional)",     "center": "CC-05", "milk": "Cow"},
]
TANKERS = [f"TKR-{n:03d}" for n in range(11, 19)]
OPERATORS = ["OP-21", "OP-22", "OP-23", "OP-24", "OP-25", "OP-26"]
REVIEWERS = ["QA-07", "QA-09", "QA-12"]

# ── Tanks (IDs shared with the Dairy 3D screen) ──────────────────────────────
TANKS = {
    "RT-01":     {"name": "Raw Milk Reception Tank", "milk": "Mixed (one type at a time)", "capacity": 15000, "pump": "P-101", "valves": ["V-101", "V-301"]},
    "ST-COW-01": {"name": "Cow Milk Silo",           "milk": "Cow",     "capacity": 50000, "pump": "P-201", "valves": ["V-301", "V-201"]},
    "ST-BUF-01": {"name": "Buffalo Milk Silo",       "milk": "Buffalo", "capacity": 50000, "pump": "P-202", "valves": ["V-301", "V-202"]},
    "ST-PM-01":  {"name": "Pasteurized Milk Storage / Cooling Tank", "milk": "Processed", "capacity": 30000, "pump": "P-401", "valves": ["V-302", "V-401"]},
}
TANK_HIGH_LEVEL_PCT = 90.0   # alarm thresholds (demo)
TANK_LOW_LEVEL_PCT = 8.0

EQUIPMENT = {
    "P-101":   {"name": "Reception Transfer Pump",    "kind": "Pump"},
    "P-201":   {"name": "Cow Silo Feed Pump",          "kind": "Pump"},
    "P-202":   {"name": "Buffalo Silo Feed Pump",      "kind": "Pump"},
    "P-401":   {"name": "Packing Feed Pump",           "kind": "Pump"},
    "V-301":   {"name": "Milk Diverter Valve",         "kind": "Valve"},
    "V-302":   {"name": "Flow Diversion Valve (FDV)",  "kind": "Valve"},
    "PAST-01": {"name": "HTST Pasteurizer",            "kind": "Pasteurizer"},
    "HOMO-01": {"name": "Homogenizer",                 "kind": "Homogenizer"},
    "COOL-01": {"name": "Chilled-Water Cooling Section", "kind": "Cooling"},
    "PACK-01": {"name": "Pouch Packing Machine 1",     "kind": "Packing"},
    "PACK-02": {"name": "Pouch Packing Machine 2",     "kind": "Packing"},
    "CIP-01":  {"name": "CIP Skid",                    "kind": "CIP"},
}

# ── Quality — demonstration ranges and illustrative rules ────────────────────
# Generator ranges (what simulated samples look like) — NOT acceptance limits.
SAMPLE_RANGES = {
    "Cow":     {"fat": (3.1, 4.9), "snf": (7.9, 9.1), "protein": (2.9, 3.7), "lactose": (4.3, 5.0)},
    "Buffalo": {"fat": (5.2, 8.6), "snf": (8.4, 9.9), "protein": (3.6, 4.6), "lactose": (4.4, 5.1)},
}
# Configurable demo rules by milk category (raw milk intake).
QUALITY_RULES = {
    "Cow": {
        "fat_min": 3.2, "snf_min": 8.0, "acidity_max": 0.155, "temp_max": 8.0,
        "density_min": 1.026, "density_max": 1.034, "reject_acidity": 0.18, "reject_temp": 11.0,
        "note": ILLUSTRATIVE,
    },
    "Buffalo": {
        "fat_min": 5.5, "snf_min": 8.8, "acidity_max": 0.16, "temp_max": 8.0,
        "density_min": 1.026, "density_max": 1.036, "reject_acidity": 0.18, "reject_temp": 11.0,
        "note": ILLUSTRATIVE,
    },
}
QUALITY_METHODS = {
    "composition": "Ultrasonic milk analyser (demo method)",
    "density": "Digital density meter at 20 °C (demo)",
    "clr": "Lactometer, corrected to 27 °C reference: CLR = (ρ₂₇ − 1.000) × 1000 (illustrative convention)",
    "acidity": "Titration with 0.1 N NaOH, phenolphthalein end-point (demo method)",
}
INSTRUMENTS = ["LAB-UA-01", "LAB-UA-02", "LAB-DM-01"]
SCREENING_STATUSES = ["Not simulated", "Pending", "Screening pass", "Screening review"]

# ── Processing — demonstration HTST criteria ─────────────────────────────────
HTST_DEMO = {
    "target_temp_c": 72.0,
    "min_hold_s": 15.0,
    "note": "Demonstration setpoint only — not an instruction for operating real equipment. "
            "Applies only where the product and validated process configuration call for it.",
}
PRODUCTS = {
    "TM": {"name": "Toned Milk",        "source": ["ST-COW-01", "ST-BUF-01"], "homogenize": True,  "pack_sizes": [500, 1000]},
    "FCM": {"name": "Full Cream Milk",  "source": ["ST-BUF-01"],              "homogenize": True,  "pack_sizes": [500, 1000]},
    "CM": {"name": "Cow Milk",          "source": ["ST-COW-01"],              "homogenize": True,  "pack_sizes": [500]},
}
PROCESS_RATE_LPH = 10000      # litres / hour through PAST-01 (demo)
PACK_SPEED_PPH = {500: 7200, 1000: 4200}   # packs / hour per machine (demo)
PROCESS_LOSS_FRACTION = (0.002, 0.005)      # documented line flush / hold-up losses

# ── CIP — demonstration completion criteria (not dosing instructions) ────────
CIP_PHASES = [
    # phase, min minutes, min supply temp °C (None = no temperature criterion)
    ("Pre-rinse", 6, None),
    ("Cleaning solution circulation", 15, 70.0),
    ("Intermediate rinse", 6, None),
    ("Final rinse", 6, None),
    ("Sanitization", 8, None),
]
CIP_FINAL_RINSE_MAX_CONDUCTIVITY = 0.5   # mS/cm (demo)
CIP_MIN_FLOW_M3H = 15.0
CIP_SOLUTIONS = ["CIP-SOL-A (demo alkaline)", "CIP-SOL-B (demo acid)"]
CIP_CIRCUITS = {
    "CIRC-PAST": "Pasteurizer / homogenizer circuit",
    "CIRC-SILO-COW": "Cow silo circuit",
    "CIRC-SILO-BUF": "Buffalo silo circuit",
    "CIRC-RT": "Reception tank circuit",
}

# ── Reconciliation ───────────────────────────────────────────────────────────
DENSITY_ASSUMPTION_KG_PER_L = 1.032   # stated assumption for the mass balance (raw milk, ~20 °C)
VOLUME_BALANCE_TERMS = [
    "Opening inventory (all tanks)",
    "+ Milk received (gross)",
    "− Milk rejected at intake",
    "− Documented intake samples",
    "− Finished-product volume (accepted packs × declared size)",
    "− Rejected packs volume",
    "− Documented process losses",
    "− Closing inventory (all tanks)",
    "= Unexplained difference (not adjusted)",
]
