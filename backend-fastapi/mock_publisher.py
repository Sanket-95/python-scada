"""Optional mock data source (enable with SCADA_MOCK=1).

Stands in for a real PLC feed while the plant isn't connected: publishes a
gently drifting Tank_<id>_Temp for every configured tank, using the same tag
names the frontend's Tag Monitor already uses for its own simulation values
(so live values simply take over those rows). Real data would come in through
POST /api/tags instead — the store doesn't care where a batch originates.
"""

import asyncio
import random

import config_store
from tag_store import TagStore

INTERVAL_S = 2.0


def _tank_ids() -> list[int]:
    cfg = config_store.load_json("savedUserConfig.json") or {}
    lines = cfg.get("lines") or [{"tanks": 39}, {"tanks": 27}]
    ids = []
    base = 1
    for line in lines:
        tanks = int(line.get("tanks", 0))
        ids += [base + i for i in range(tanks)]
        base += tanks
    return ids


async def run(store: TagStore) -> None:
    temps = {tid: random.uniform(30, 70) for tid in _tank_ids()}
    while True:
        for tid in temps:
            temps[tid] = min(90.0, max(20.0, temps[tid] + random.uniform(-0.6, 0.6)))
        store.set_many((f"Tank_{tid}_Temp", f"{t:.1f}", "°C") for tid, t in temps.items())
        await asyncio.sleep(INTERVAL_S)
