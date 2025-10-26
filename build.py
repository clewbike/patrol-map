#!/usr/bin/env python3
"""
build.py — patrol-map のデータビルド
- Google Sheets からデータを取得し、フロントの data.json に変換
- ヘッダ名のズレ・空行・型変換の失敗に強い
- （任意）docs/data.schema.json があれば JSON Schema で検証
- 同一内容なら data.json を上書きしない（CIの無駄コミット防止）
必要な環境変数:
  - SHEET_ID           ... 参照するスプレッドシートID
  - RANGE (任意)       ... シート範囲。デフォルト "GoogleMAPプロット用!A:E"
  - GOOGLE_CREDENTIALS ... サービスアカウントJSONの中身（文字列）
出力:
  - ./data.json
"""

from __future__ import annotations
import json
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from google.oauth2 import service_account
from googleapiclient.discovery import build

# ---- 設定 ----
SHEET_ID = os.environ["SHEET_ID"]
RANGE = os.environ.get("RANGE", "GoogleMAPプロット用!A:E")
OUTPUT = Path("data.json")
SCHEMA_PATH = Path("docs/data.schema.json")  # あれば検証、なければスキップ

# ---- 任意: jsonschema（無ければ検証スキップ） ----
try:
    from jsonschema import Draft202012Validator  # type: ignore
    _HAS_JSONSCHEMA = True
except Exception:
    _HAS_JSONSCHEMA = False


def now_jst_str() -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=9)).strftime("%Y-%m-%d %H:%M:%S")


@dataclass(frozen=True)
class Item:
    name: str
    lat: float
    lng: float
    weight: int
    count: int
    updated: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "lat": self.lat,
            "lng": self.lng,
            "weight": self.weight,
            "count": self.count,
            "updated": self.updated,
        }


# ---- ヘッダ名の許容ゆらぎ（日本語名の微妙な差異を吸収） ----
HEADER_ALIASES = {
    "latlng": {"プロット用緯度経度", "緯度経度", "latlng", "座標"},
    "name": {"ポート名", "名称", "name"},
    "updated": {"更新日時", "更新日", "updated"},
    "weight": {"電池交換比重", "比重", "weight"},
    "count": {"目安交換台数(電池4以下)", "目安交換台数", "台数", "count"},
}


def _normalize_header(s: str) -> str:
    return re.sub(r"\s+", "", s.strip())


def _header_indices(header_row: List[str]) -> Dict[str, int]:
    """ヘッダ行から必要列のインデックスを引く。足りない列があれば例外。"""
    normed = [_normalize_header(h) for h in header_row]
    idx: Dict[str, int] = {}

    def find_index(keys: set[str]) -> Optional[int]:
        for k in keys:
            k_norm = _normalize_header(k)
            if k_norm in normed:
                return normed.index(k_norm)
        return None

    for logical, aliases in HEADER_ALIASES.items():
        pos = find_index(aliases)
        if pos is None:
            raise KeyError(f"ヘッダに {aliases} のいずれかが見つかりません（header={header_row}）")
        idx[logical] = pos
    return idx


def _parse_latlng(s: str) -> Tuple[float, float]:
    """
    緯度経度の文字列を robust にパース:
      - 区切り: カンマ(,)、全角カンマ(，)、空白/タブ などを許容
      - "lat,lng" / "lat lng" / "lat  ,  lng"
    """
    if s is None:
        raise ValueError("latlng is None")
    # 区切りをカンマに正規化
    s = str(s).replace("，", ",")
    parts = [p.strip() for p in re.split(r"[,\s]+", s) if p.strip()]
    if len(parts) != 2:
        raise ValueError(f"latlng 形式エラー: {s!r}")
    lat = float(parts[0])
    lng = float(parts[1])
    return lat, lng


def _to_int(x: Any, default: int = 0) -> int:
    try:
        if x in ("", None):
            return default
        return int(float(x))
    except Exception:
        return default


def _to_str(x: Any, default: str = "") -> str:
    s = "" if x is None else str(x).strip()
    return s or default


def fetch_values() -> List[List[Any]]:
    """Sheets API から 2次元配列（values）を取得。"""
    creds_info = json.loads(os.environ["GOOGLE_CREDENTIALS"])
    creds = service_account.Credentials.from_service_account_info(
        creds_info, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"]
    )
    svc = build("sheets", "v4", credentials=creds)
    resp = (
        svc.spreadsheets()
        .values()
        .get(spreadsheetId=SHEET_ID, range=RANGE)
        .execute()
    )
    return resp.get("values", [])


def transform(values: List[List[Any]]) -> List[Item]:
    """Sheet の values から Item の配列に変換。空行・不正行はスキップ。"""
    if not values:
        return []
    header, *rows = values
    idx = _header_indices(header)

    items: List[Item] = []
    for r in rows:
        if not any(cell not in ("", None) for cell in r):
            continue  # 完全な空行はスキップ

        try:
            lat, lng = _parse_latlng(_to_str(r[idx["latlng"]]))
            name = _to_str(r[idx["name"]])
            if not name:
                continue  # 名前が空なら除外

            updated = _to_str(r[idx["updated"]], now_jst_str())
            weight = _to_int(r[idx["weight"]], 0)
            count = _to_int(r[idx["count"]], 0)

            items.append(Item(name=name, lat=lat, lng=lng, weight=weight, count=count, updated=updated))
        except Exception as e:
            print(f"[WARN] 行スキップ: {e}  row={r}")

    # 重複排除（lat,lng,name が同じものは最後を優先）
    seen = set()
    uniq: List[Item] = []
    for it in items:
        key = (round(it.lat, 7), round(it.lng, 7), it.name)
        if key in seen:
            continue
        seen.add(key)
        uniq.append(it)

    # 並べ替え: weight desc → count desc → name asc
    uniq.sort(key=lambda x: (-x.weight, -x.count, x.name))
    return uniq


def validate_schema(payload: Dict[str, Any]) -> None:
    """docs/data.schema.json があれば JSON Schema で検証。"""
    if not _HAS_JSONSCHEMA or not SCHEMA_PATH.exists():
        return
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    Draft202012Validator(schema).validate(payload)


def write_if_changed(path: Path, data: Dict[str, Any]) -> bool:
    """内容が同じなら書き込まない。返り値: 書いたら True。"""
    new_text = json.dumps(data, ensure_ascii=False, indent=2)
    if path.exists():
        old_text = path.read_text(encoding="utf-8")
        if old_text == new_text:
            print("data.json unchanged. skip write.")
            return False
    path.write_text(new_text, encoding="utf-8")
    return True

def main() -> None:
    try:
        values = fetch_values()
        items = [it.to_dict() for it in transform(values)]
        out = {"generated_at": now_jst_str(), "items": items}

        # ✅ JSON Schema 検証
        try:
            validate_schema(out)
        except Exception as e:
            # スキーマ異常 → error.json 出力
            err_payload = {
                "error": True,
                "message": f"データ検証エラー: {str(e)}",
                "generated_at": now_jst_str()
            }
            Path("error.json").write_text(json.dumps(err_payload, ensure_ascii=False, indent=2), encoding="utf-8")
            print("❌ JSON Schema validation failed. error.json を出力しました。")
            return  # data.json は更新しない

        if write_if_changed(OUTPUT, out):
            print(f"Wrote {OUTPUT} ({len(items)} items)")
    except Exception as e:
        # その他の例外
        err_payload = {
            "error": True,
            "message": f"ビルド失敗: {str(e)}",
            "generated_at": now_jst_str()
        }
        Path("error.json").write_text(json.dumps(err_payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print("❌ Build failed. error.json を出力しました。")

if __name__ == "__main__":
    main()
