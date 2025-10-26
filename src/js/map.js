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
  minZoom: 11,
  maxZoom: 18,
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

export function drawMarkers(classifiedItems, { showYellow, showGreen }) {
  markerByKey.clear();
  markersLayer.clearLayers();
  for (const it of classifiedItems) {
    const s = it.s; if (!s) continue;
    if (s==='watch-yellow' && !showYellow) continue;
    if (s==='watch-green'  && !showGreen)  continue;

    const tagName  = s==='urgent'?'交換必須' : s==='watch-yellow'?'交換可能':'経過観測';
    const tagClass = s==='urgent'?'tag-urgent': s==='watch-yellow'?'tag-watch-yellow':'tag-watch-green';

    const html = `
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <strong>${it.name}</strong>
        <span class="tag ${tagClass}">${tagName}</span>
      </div>
      <div style="margin-top:10px">
        <a href="https://www.google.com/maps/dir/?api=1&destination=${it.lat},${it.lng}&travelmode=driving" target="_blank" rel="noopener">車経路（GoogleMAP）</a>
      </div>`;

    const m = L.circleMarker([it.lat,it.lng], {
      radius: radiusByCount(it.count),
      color:'#fff', weight:1.4, fillColor: colorByStatus(s), fillOpacity:.92
    }).bindPopup(html, { autoPan:true, closeButton:true }).addTo(markersLayer);

    markerByKey.set(markerKey(it), m);
  }
}

export function panToAndOpen(lat,lng,name){
  const m = markerByKey.get(`${lat},${lng},${name}`);
  if (MAP){ MAP.panTo([lat,lng], { animate:true }); if (m) m.openPopup(); }
}
export function getCenterZoom(){ return { center: MAP.getCenter(), zoom: MAP.getZoom() }; }
export function setCenterZoom(center, zoom){ MAP.setView(center, zoom, { animate:false }); }
