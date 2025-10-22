#!/usr/bin/env python3
import os, json
from google.oauth2 import service_account
from googleapiclient.discovery import build

SHEET_ID = os.environ["SHEET_ID"]
RANGE = os.environ.get("RANGE", "GoogleMAPプロット用!A:E")  # 見出しを含む範囲（タブ名が違えば変更）
OUTPUT = "data.json"

def main():
    creds_info = json.loads(os.environ["GOOGLE_CREDENTIALS"])
    creds = service_account.Credentials.from_service_account_info(
        creds_info, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"]
    )
    svc = build("sheets", "v4", credentials=creds)
    values = svc.spreadsheets().values().get(
        spreadsheetId=SHEET_ID, range=RANGE
    ).execute().get("values", [])

    if not values:
        with open(OUTPUT, "w", encoding="utf-8") as f:
            json.dump({"generated_at":"", "items":[]}, f, ensure_ascii=False, indent=2)
        return

    header = values[0]
    rows = values[1:]

    # 列名はシートの見出しと一致させてください
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
            "updated": r[i_upd],   # "YYYY-MM-DD HH:MM:SS"
            "weight": int(r[i_w] or 0),
            "count": int(r[i_cnt] or 0),
        })

    out = {"generated_at": "", "items": items}
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()
