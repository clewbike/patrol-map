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

/** 状態→表示用ラベル */
function tagInfoByStatus(s){
  return s === 'urgent'
    ? { name: '交換必須',     class: 'tag-urgent' }
    : s === 'watch-yellow'
    ? { name: '交換可能',     class: 'tag-watch-yellow' }
    : { name: '経過観測',     class: 'tag-watch-green' };
}

export function drawMarkers(classifiedItems, { showYellow, showGreen }) {
  markerByKey.clear();
  markersLayer.clearLayers();

  for (const it of classifiedItems) {
    const s = it.s; if (!s) continue;
    if (s==='watch-yellow' && !showYellow) continue;
    if (s==='watch-green'  && !showGreen)  continue;

    const { name: tagName, class: tagClass } = tagInfoByStatus(s);

    // ポップアップ内容（白い吹き出し。順序：ラベル→ポート名→住所→GoogleMAP）
    const html = `
      <div style="padding:8px 10px; font-size:13px; max-width:230px;">
        <div style="margin-bottom:6px;">
          <span class="tag ${tagClass}" style="display:inline-block;padding:2px 6px;border-radius:4px;font-weight:700;font-size:12px;">
            ${tagName}
          </span>
        </div>
        <div style="font-weight:600; font-size:14px; margin-bottom:3px;">
          ${it.name}
        </div>
        <div style="color:#333; margin-bottom:10px;">
          ${it.address || ''}
        </div>
        <div style="text-align:left;">
          <a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(it.address || `${it.lat},${it.lng}`)}&travelmode=driving"
             target="_blank" rel="noopener"
             style="display:inline-block;background:#2c7be5;color:#fff;padding:6px 10px;border-radius:6px;
                    border:1px solid #2c7be5;text-decoration:none;font-size:12.5px;font-weight:700;">
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
      autoPan: false,        // ← ポップアップで勝手にズレない
      closeButton: true
      // className は付けず（白い標準吹き出しのまま）
    })
    .addTo(markersLayer);

    markerByKey.set(markerKey(it), m);
  }
}

export function panToAndOpen(lat,lng,name){
  const m = markerByKey.get(`${lat},${lng},${name}`);
  if (!MAP) return;
  // ズームはそのまま、中心だけ移動
  MAP.setView([lat,lng], MAP.getZoom(), { animate: true });
  if (m) m.openPopup();
}

export function getCenterZoom(){ return { center: MAP.getCenter(), zoom: MAP.getZoom() }; }
export function setCenterZoom(center, zoom){ MAP.setView(center, zoom, { animate:false }); }
