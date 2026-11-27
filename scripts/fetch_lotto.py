#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""동행복권 로또 6/45 최근 회차 수집 (2026 개편 JSON API 대응)

사용법:
    python3 scripts/fetch_lotto.py                 # 최근 100회 → lotto.json
    python3 scripts/fetch_lotto.py --rounds 50 --out lotto.json

동작:
  · 저장소의 lotto.json 에서 마지막 회차를 읽고, 그 뒤 회차부터 새로 받아 옵니다.
  · https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do?srchDir=center&srchLtEpsd=<회차>
      → 기준 회차 앞뒤 10회
    ?srchDir=older&srchCursorLtEpsd=<가장 오래된 회차> → 10회씩 과거로
  · 서버가 응답하지 않거나 형식이 바뀌면 기존 lotto.json 을 그대로 두고 종료 코드 1로 끝납니다.
    (앱은 내장 폴백 데이터로 계속 동작)
"""
import argparse, json, os, sys, time, urllib.request
from datetime import datetime, timedelta, timezone

BASE_OLD = "https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do"
BASE_NEW = "https://www.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
KST = timezone(timedelta(hours=9))


def http_json(url, retries=3):
    """API 호출 → list. 실패하면 빈 리스트."""
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA,
                "Accept": "application/json, text/javascript, */*; q=0.01",
                "X-Requested-With": "XMLHttpRequest",
                "Referer": "https://www.dhlottery.co.kr/lt645/result",
            })
            with urllib.request.urlopen(req, timeout=20) as r:
                raw = r.read().decode("utf-8", "replace")
            return json.loads(raw).get("data", {}).get("list", []) or []
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.5 * (i + 1))
    print("[warn] 요청 실패:", url, "-", last, file=sys.stderr)
    return []


def norm(r):
    d = r["ltRflYmd"]
    return {
        "epsd": int(r["ltEpsd"]),
        "date": d[:4] + "-" + d[4:6] + "-" + d[6:],
        "n": [int(r["tm%dWnNo" % i]) for i in range(1, 7)],
        "b": int(r["bnsWnNo"]),
        "p1": int(r.get("rnk1WnAmt") or 0),
        "w1": int(r.get("rnk1WnNope") or 0),
    }


def read_existing(path):
    try:
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        return {int(x["epsd"]): x for x in d.get("draws", [])}
    except Exception:  # noqa: BLE001
        return {}


def fetch_seed(last_epsd):
    """최신 회차 묶음(10건)을 받아 온다."""
    tries = [last_epsd + 5, last_epsd + 1, 9999]
    for epsd in tries:
        for base in (BASE_OLD, BASE_NEW):
            batch = http_json("%s?srchDir=center&srchLtEpsd=%d" % (base, epsd))
            if batch:
                return batch
    return []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rounds", type=int, default=100)
    ap.add_argument("--out", default="lotto.json")
    args = ap.parse_args()

    existing = read_existing(args.out)
    last_epsd = max(existing) if existing else 0

    seed = fetch_seed(last_epsd)
    if not seed:
        print("[error] 동행복권 API 응답이 없습니다. 기존 데이터를 유지합니다.", file=sys.stderr)
        return 1

    draws = {d["epsd"]: d for d in map(norm, seed)}
    cursor = min(draws)
    guard = 0
    while len(draws) < args.rounds and guard < 60:
        guard += 1
        batch = (http_json("%s?srchDir=older&srchCursorLtEpsd=%d" % (BASE_NEW, cursor))
                 or http_json("%s?srchDir=older&srchCursorLtEpsd=%d" % (BASE_OLD, cursor)))
        if not batch:
            break
        new = [norm(r) for r in batch if int(r["ltEpsd"]) not in draws]
        for d in new:
            draws[d["epsd"]] = d
        if not new:
            break
        cursor = min(d["epsd"] for d in new)

    if len(draws) < 5:
        print("[error] 수집된 회차가 너무 적습니다. 기존 데이터를 유지합니다.", file=sys.stderr)
        return 1

    ordered = [draws[k] for k in sorted(draws, reverse=True)][: args.rounds]
    payload = {
        "updatedAt": datetime.now(KST).isoformat(timespec="seconds"),
        "source": "동행복권 lt645 API (selectPstLt645Info.do)",
        "latestEpsd": ordered[0]["epsd"],
        "latestDate": ordered[0]["date"],
        "draws": ordered,
    }
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print("[ok] %d회 저장 -> %s (최신 %d회 %s)" % (
        len(ordered), args.out, ordered[0]["epsd"], ordered[0]["date"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
