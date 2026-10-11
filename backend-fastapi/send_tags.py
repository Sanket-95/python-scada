"""Publish tags to the running backend — the FastAPI replacement for the old
.NET server's interactive "SCADA>" console.

  python send_tags.py "Tank_1_Temp: 42.5, Tank_2_Temp = 39"     one-shot
  python send_tags.py                                            interactive
"""

import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("SCADA_URL", "http://127.0.0.1:50054")


def _call(path: str, body: bytes | None = None, content_type: str = "text/plain"):
    req = urllib.request.Request(
        BASE + path, data=body, headers={"Content-Type": content_type},
        method="POST" if body is not None else "GET",
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read())


def send(line: str) -> None:
    result = _call("/api/tags/text", line.encode("utf-8"))
    for seg in result["errors"]:
        print(f"  can't parse: '{seg}'  (expected  key: value)")
    if result["count"]:
        print(f"  {result['count']} tag(s) written")


def list_tags() -> None:
    tags = _call("/api/tags")
    if not tags:
        print("  (no tags)")
        return
    for t in tags:
        print(f"  {t['name']:<32} = {t['value']} {t['unit']}".rstrip())
    print(f"\n  {len(tags)} tag(s)")


def main() -> None:
    try:
        if len(sys.argv) > 1:
            send(" ".join(sys.argv[1:]))
            return

        print("SCADA tag sender —  key: value, key2 = value2   |  list  |  exit")
        while True:
            line = input("SCADA> ").strip()
            if not line:
                continue
            if line.lower() in ("exit", "quit", "q"):
                return
            if line.lower() in ("list", "ls"):
                list_tags()
            else:
                send(line)
    except (urllib.error.URLError, ConnectionError) as e:
        sys.exit(f"Can't reach the backend at {BASE}: {e}")
    except (EOFError, KeyboardInterrupt):
        pass


if __name__ == "__main__":
    main()
