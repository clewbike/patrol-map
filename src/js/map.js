// @ts-check
import { colorByStatus, radiusByCount } from './status.js';

let MAP;
let markersLayer;
const markerByKey = new Map();

/** Map生成 */
// ★ Jawg Sunny（ラスタ）＋ 京都だけ見える設定
const KYOTO_BOUNDS = L.latLngBounds([34.85,135.60],[35.15,135.90]);

// ← ダッシュボードのトークンを文字列で入れる
const JAWG_ACCESS_TOKEN = 'blVUDBogpZ9OqWEruBlliLabQ5aRC2lhIqEblqr6syJyybrzR5W9IJOdfV60Ct3I';

const jawgSunnyUrl =
  'https://tile.jawg.io/jawg-sunny/{z}/{x}/{y}{r}.png?access-token={accessToken}';

const jawgOpts = {
  minZoom: 12,
  maxZoom: 17,
  // ← ここは上で定義したトークン変数を使う
  accessToken: JAWG_ACCESS_TOKEN,
  attribution:
    '<a href="https://jawg.io" target="_blank" rel="noopener">© <b>Jawg</b> Maps</a> ' +
    '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'
};

export function initMap() {
  MAP = L.map('map', {
    zoomControl:false,
    maxBounds: KYOTO_BOUNDS,
    maxBoundsViscosity: 0.8
  }).setView([35.0116,135.7681], 13);

  L.tileLayer(jawgSunnyUrl, jawgOpts).addTo(MAP);
  markersLayer = L.layerGroup().addTo(MAP);
  return MAP;
}

export function getMap() { return MAP; }
export function markerKey(it){ return `${it.lat},${it.lng},${it.name}`; }

/**
 * 状態 → ポップアップ用クラス名
 * 'urgent' | 'watch-yellow' | 'watch-green'
 */
function popupClassByStatus(s){
  return s === 'urgent' ? 'popup-urgent'
       : s === 'watch-yellow' ? 'popup-yellow'
       : 'popup-green';
}

export function drawMarkers(classifiedItems, { showYellow, showGreen }) {
  markerByKey.clear();
  markersLayer.clearLayers();

  for (const it of classifiedItems) {
    const s = it.s; if (!s) continue;
    if (s==='watch-yellow' && !showYellow) continue;
    if (s==='watch-green'  && !showGreen)  continue;

    // ポップアップ内容（背景は付けず、wrapper側を色替え）
    const html = `
      <div style="padding:8px 10px; font-size:13px; max-width:230px;">
        <div style="font-weight:600; font-size:14px; margin-bottom:3px;">
          ${it.name}
        </div>
        <div style="color:#333; margin-bottom:10px;">
          ${it.address || ''}
        </div>
        <div style="text-align:left;">
          <a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(it.address || `${it.lat},${it.lng}`)}&travelmode=driving"
             target="_blank" rel="noopener"
             style="display:inline-block;background:#fff;color:#000;padding:6px 10px;border-radius:6px;
                    border:1px solid #ccc;text-decoration:none;font-size:12.5px;font-weight:600;">
            GoogleMAP
          </a>
        </div>
      </div>`;

    const m = L.circleMarker([it.lat, it.lng], {
      radius: radiusByCount(it.count),
      color:'#fff',
      weight:1.4,
      fillColor: colorByStatus(s),
      fillOpacity:.92
    })
    .bindPopup(html, {
      autoPan: true,
      closeButton: true,
      // 状態に応じて .leaflet-popup にクラスを付与
      className: popupClassByStatus(s)
    })
    .addTo(markersLayer);

    markerByKey.set(markerKey(it), m);
  }
}

export function panToAndOpen(lat,lng,name){
  const m = markerByKey.get(`${lat},${lng},${name}`);
  if (MAP){ MAP.panTo([lat,lng], { animate:true }); if (m) m.openPopup(); }
}
export function getCenterZoom(){ return { center: MAP.getCenter(), zoom: MAP.getZoom() }; }
export function setCenterZoom(center, zoom){ MAP.setView(center, zoom, { animate:false }); }

/*───────────────────────────────────────────────
  状態別の吹き出し背景を Leaflet 側に適用（CSSを使わずJSで注入）
───────────────────────────────────────────────*/
(function injectPopupStyles(){
  const style = document.createElement('style');
  style.textContent = `
    /* 交換必須 → 淡い赤 */
    .leaflet-popup.popup-urgent .leaflet-popup-content-wrapper,
    .leaflet-popup.popup-urgent .leaflet-popup-tip {
      background-color: #ffe5e5;
    }

    /* 交換可能 → 淡い黄 */
    .leaflet-popup.popup-yellow .leaflet-popup-content-wrapper,
    .leaflet-popup.popup-yellow .leaflet-popup-tip {
      background-color: #fff6d9;
    }

    /* 経過観測 → 淡い緑 */
    .leaflet-popup.popup-green .leaflet-popup-content-wrapper,
    .leaflet-popup.popup-green .leaflet-popup-tip {
      background-color: #e8f5e9;
    }

    /* 全体の見た目（角丸・影）は軽く統一）*/
    .leaflet-popup-content-wrapper {
      border-radius: 12px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.20);
    }
  `;
  document.head.appendChild(style);
})();
