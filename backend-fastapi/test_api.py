import json

import pytest
from fastapi.testclient import TestClient

import main
import tag_parser
from tag_store import TagStore


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("SCADA_CONFIG_DIR", str(tmp_path))  # never touch the real frontend/src/config
    main.store = TagStore()
    with TestClient(main.app) as c:  # context manager => one shared event loop
        yield c


# ── publishing ────────────────────────────────────────────────────────────────

def test_post_list_of_tags(client):
    r = client.post("/api/tags", json=[{"name": "A", "value": 1, "unit": "bar"}, {"name": "B", "value": "x"}])
    assert r.json() == {"success": True, "count": 2}
    tags = {t["name"]: t for t in client.get("/api/tags").json()}
    assert tags["A"]["value"] == "1" and tags["A"]["unit"] == "bar"
    assert tags["B"]["unit"] == ""


def test_post_dict_and_wrapped_forms(client):
    assert client.post("/api/tags", json={"A": 1, "B": 2}).json()["count"] == 2
    assert client.post("/api/tags", json={"tags": [{"name": "C", "value": 3}]}).json()["count"] == 1


def test_bad_payload_is_400(client):
    assert client.post("/api/tags", json=[{"value": 1}]).status_code == 400
    assert client.post("/api/tags", json="nope").status_code == 400


def test_names_are_case_insensitive_latest_wins(client):
    client.post("/api/tags", json={"Tank_1": 10})
    client.post("/api/tags", json={"TANK_1": 20})
    tags = client.get("/api/tags").json()
    assert len(tags) == 1 and tags[0]["value"] == "20" and tags[0]["name"] == "TANK_1"


def test_text_endpoint_formats(client):
    r = client.post("/api/tags/text", content="{ a: 1, b = 2 , c: 3 }").json()
    assert r["count"] == 3 and r["success"]
    r = client.post("/api/tags/text", content="good: 1, garbage").json()
    assert r["count"] == 1 and r["errors"] == ["garbage"] and not r["success"]


def test_parser_keeps_colon_in_value_when_equals_comes_first():
    items, errors = tag_parser.parse_line("t = 12:30")
    assert items == [("t", "12:30", "")] and not errors


# ── websocket stream ──────────────────────────────────────────────────────────

def test_ws_replays_only_last_batch_on_connect(client):
    client.post("/api/tags", json={"old": 1})
    client.post("/api/tags", json={"new1": 2, "new2": 3})
    with client.websocket_connect("/") as ws:
        got = {json.loads(ws.receive_text())["name"] for _ in range(2)}
    assert got == {"new1", "new2"}  # 'old' belongs to an earlier batch and is not replayed


def test_ws_message_shape_matches_frontend_contract(client):
    client.post("/api/tags", json=[{"name": "T", "value": 5, "unit": "°C"}])
    with client.websocket_connect("/") as ws:
        msg = json.loads(ws.receive_text())
    assert set(msg) == {"name", "value", "unit", "timestamp"}
    assert msg["unit"] == "°C" and msg["timestamp"].endswith("Z")


def test_ws_receives_live_updates_after_connect(client):
    with client.websocket_connect("/") as ws:
        client.post("/api/tags", json={"live": 42})
        assert json.loads(ws.receive_text())["value"] == "42"


def test_ws_alias_path_and_multiple_clients(client):
    with client.websocket_connect("/") as a, client.websocket_connect("/ws") as b:
        client.post("/api/tags", json={"x": 1})
        assert json.loads(a.receive_text())["name"] == "x"
        assert json.loads(b.receive_text())["name"] == "x"


def test_disconnected_client_is_unsubscribed(client):
    with client.websocket_connect("/"):
        pass
    client.post("/api/tags", json={"x": 1})  # would raise if a dead queue were still subscribed
    assert main.store._subscribers == set()


# ── saved config ──────────────────────────────────────────────────────────────

@pytest.mark.parametrize("route", ["/api/scada-config", "/api/header-config"])
def test_config_null_then_roundtrip(client, route):
    assert client.get(route).json() is None
    body = {"lines": [{"id": 1, "tanks": 5}], "note": "°"}
    assert client.post(route, json=body).json() == {"ok": True}
    assert client.get(route).json() == body


def test_config_rejects_invalid_json(client):
    r = client.post("/api/scada-config", content="{not json", headers={"Content-Type": "application/json"})
    assert r.status_code == 400
