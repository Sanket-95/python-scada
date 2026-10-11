"""In-memory tag store + fan-out to WebSocket subscribers.

Replaces dotnet-grpc's TagStore (SetMany / GetAll / GetLastBatch / Subscribe)
with the same semantics: names are case-insensitive, the most recent batch is
kept so a client that (re)connects late immediately gets the last published
message instead of waiting for the next change.
"""

import asyncio
from datetime import datetime, timezone

QUEUE_LIMIT = 5000


def _now() -> str:
    # Same shape as .NET's DateTime.UtcNow.ToString("O"), e.g. 2026-09-21T10:15:30.123456Z
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class TagStore:
    def __init__(self) -> None:
        self._tags: dict[str, dict] = {}
        self._last_batch: list[dict] = []
        self._subscribers: set[asyncio.Queue] = set()

    def set_many(self, items) -> list[dict]:
        """items: iterable of (name, value, unit). Returns the stored tags."""
        batch = []
        for name, value, unit in items:
            tag = {"name": name, "value": str(value), "unit": unit or "", "timestamp": _now()}
            self._tags[name.lower()] = tag
            batch.append(tag)
        if batch:
            self._last_batch = batch
            for tag in batch:
                self._publish(tag)
        return batch

    def get_all(self) -> list[dict]:
        return sorted(self._tags.values(), key=lambda t: t["name"].lower())

    def last_batch(self) -> list[dict]:
        return list(self._last_batch)

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=QUEUE_LIMIT)
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._subscribers.discard(q)

    def _publish(self, tag: dict) -> None:
        for q in self._subscribers:
            if q.full():
                q.get_nowait()  # a stalled client loses its oldest update, never blocks others
            q.put_nowait(tag)
