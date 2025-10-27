#!/usr/bin/env python3
import os, json
from datetime import datetime, timezone, timedelta
from google.oauth2 import service_account
from googleapiclient.discovery import build

SHEET_ID = os.environ["SHEET_ID"]
RANGE = os.environ.get("RANGE", "GoogleMAPプロット用!A:F")
OUTPUT = "data.json"
ERROR_FILE = "error.json"

def now_jst():
    return (datetime.now(timezone.utc) + timedelta(hours=9)).strftime("%Y-%m-%d %H:%M:%S")

def write_error_file(error=False, message=""):
    out = {"generated_at": now_jst(), "error": error}
    if error:
        out["message"] = message or "データ取得のエラーが確認されました。開発者に確認してください。"
    with open(ERROR_FILE, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

# 正常系の既定
write_error_file(False)

def main():
    try:
        creds_info = json.loads(os.environ["GOOGLE_CREDENTIALS"])
        creds = service_account.Credentials.from_service_account_info(
            creds_info, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"]
        )
        svc = build("sheets", "v4", credentials=creds)
        values = svc.spreadsheets().values().get(
            spreadsheetId=SHEET_ID, range=RANGE
        ).execute().get("values", [])

        if not values:
            write_error_file(True, "スプレッドシートにデータが存在しません。")
            return

        header = values[0]
        rows = values[1:]

        required = [
            "プロット用緯度経度",
            "ポート名",
            "住所",
            "更新日時",
            "電池交換比重",
            "目安交換台数",
        ]
        for r in required:
            if r not in header:
                write_error_file(True, f"スプレッドシートに必須列「{r}」が見つかりません。")
                return

        i_latlng = header.index("プロット用緯度経度")
        i_name   = header.index("ポート名")
        i_addr   = header.index("住所")
        i_upd    = header.index("更新日時")
        i_w      = header.index("電池交換比重")
        i_cnt    = header.index("目安交換台数")

        items = []
        for r in rows:
            if not any(r):
                continue
            # 行が短い場合に備え、足りない分は空文字で埋める
            if len(r) < len(header):
                r = r + [""] * (len(header) - len(r))

            lat, lng = None, None
            latlng_raw = str(r[i_latlng]).strip()
            try:
                lat_str, lng_str = [s.strip() for s in latlng_raw.split(",", 1)]
                lat = float(lat_str) if lat_str else None
                lng = float(lng_str) if lng_str else None
            except Exception:
                # 緯度経度が不正な行はスキップ
                continue

            def to_int_safe(x):
                try:
                    return int(str(x).strip()) if str(x).strip() != "" else 0
                except Exception:
                    return 0

            item = {
                "lat": lat,
                "lng": lng,
                "name": r[i_name],
                "address": r[i_addr],
                "updated": r[i_upd],
                "weight": to_int_safe(r[i_w]),
                "count": to_int_safe(r[i_cnt]),
            }
            items.append(item)

        out = {"generated_at": now_jst(), "items": items}
        with open(OUTPUT, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=2)

        write_error_file(False)

    except Exception as e:
        write_error_file(True, f"スクリプト実行中にエラーが発生しました: {e}")
        raise

if __name__ == "__main__":
    main()
