"""Turns incoming tag payloads into (name, value, unit) tuples.

Two entry points:
  - parse_line(): the same free-text formats the old .NET console accepted
        { key1: value1, key2: value2 }
        key1: value1, key2: value2
        key1 = value1 , key2 = value2
  - normalize_payload(): the JSON shapes the HTTP API accepts
        [{"name": .., "value": .., "unit": ..}, ...]
        {"tags": [ ...same... ]}
        {"name1": value1, "name2": value2}
"""

from typing import Any


def parse_line(line: str) -> tuple[list[tuple[str, str, str]], list[str]]:
    """Returns (items, errors). errors lists segments that couldn't be parsed."""
    s = line.strip()
    if s.startswith("{"):
        s = s[1:]
    if s.endswith("}"):
        s = s[:-1]

    items: list[tuple[str, str, str]] = []
    errors: list[str] = []
    for segment in s.split(","):
        seg = segment.strip()
        if not seg:
            continue
        # Split on whichever of ':' / '=' comes first, so "t = 12:30" keeps its
        # value intact (the old console always preferred ':' and would split
        # that at the wrong place).
        positions = [p for p in (seg.find(":"), seg.find("=")) if p > 0]
        if not positions:
            errors.append(seg)
            continue
        sep = min(positions)
        name, value = seg[:sep].strip(), seg[sep + 1:].strip()
        if name:
            items.append((name, value, ""))
    return items, errors


def normalize_payload(payload: Any) -> list[tuple[str, str, str]]:
    if isinstance(payload, dict) and isinstance(payload.get("tags"), list):
        payload = payload["tags"]

    if isinstance(payload, list):
        items = []
        for entry in payload:
            if not isinstance(entry, dict) or not str(entry.get("name", "")).strip():
                raise ValueError("each tag needs a non-empty 'name'")
            items.append((str(entry["name"]).strip(), entry.get("value", ""), entry.get("unit", "")))
        return items

    if isinstance(payload, dict):
        return [(str(k).strip(), v, "") for k, v in payload.items() if str(k).strip()]

    raise ValueError("expected a list of tags, {'tags': [...]}, or {name: value, ...}")
