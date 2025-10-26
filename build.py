#!/usr/bin/env python3
import os, json
from datetime import datetime, timezone, timedelta
from google.oauth2 import service_account
from googleapiclient.discovery import build

SHEET_ID = os.environ["SHEET_ID"]
RANGE = os.environ.get("RANGE", "GoogleMAPプロット用!A:E")
OUTPUT = "data.json"
ERROR_FILE = "error.json"

def now_jst():
    return (datetime.now(timezone.utc) + timedelta(hours=9)).strftime("%Y-%m-%d %H:%M:%S")

def write_error_file(error=False, message=""):
    data = {
        "generated_at": now_jst(),
        "error": error,
    }
    if error:
        data["message"] = message or "データ取得のエラーが確認されました。開発者に確認してください。"
    with open(ERROR_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

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
        required = ["プロット用緯度経度", "ポート名", "更新日時", "電池交換比重", "目安交換台数(電池4以下)"]
        for r in required:
            if r not in header:
                write_error_file(True, f"スプレッドシートに必須列「{r}」が見つかりません。")
                return

        i_latlng = header.index("プロット用緯度経度")
        i_name   = header.index("ポート名")
        i_upd    = header.index("更新日時")
        i_w      = header.index("電池交換比重")
        i_cnt    = header.index("目安交換台数(電池4以下)")

        items = []
        for r in rows:
            if not any(r): 
                continue
            lat_str, lng_str = [s.strip() for s in str(r[i_latlng]).split(",")]
            items.append({
                "lat": float(lat_str),
                "lng": float(lng_str),
                "name": r[i_name],
                "updated": r[i_upd],
                "weight": int(r[i_w] or 0),
                "count": int(r[i_cnt] or 0),
            })

        out = {"generated_at": now_jst(), "items": items}
        with open(OUTPUT, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=2)

        # ✅ 成功時にも error.json を正常内容で出力
        write_error_file(False)

    except Exception as e:
        write_error_file(True, f"スクリプト実行中にエラーが発生しました: {e}")
        raise

if __name__ == "__main__":
    main()
