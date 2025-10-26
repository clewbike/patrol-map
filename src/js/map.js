// @ts-check
import { colorByStatus, radiusByCount } from './status.js';

let MAP;
let markersLayer;
const markerByKey = new Map();

/** Map生成 */
export function initMap() {
  MAP = L.map('map', { zoomControl:false }).setView([35.0116,135.7681], 12);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    { maxZoom:19, subdomains:'abcd' }).addTo(MAP);
  markersLayer = L.layerGroup().addTo(MAP);
  return MAP;
}

export function getMap() { return MAP; }

/** 一意キー */
export function markerKey(it) { return `${it.lat},${it.lng},${it.name}`; }

/** マーカー＆ポップアップ描画（チェック状態に従う） */
export function drawMarkers(classifiedItems, { showYellow, showGreen }) {
  markerByKey.clear();
  markersLayer.clearLayers();

  for (const it of classifiedItems) {
    const s = it.s; if (!s) continue;
    if (s === 'watch-yellow' && !showYellow) continue;
    if (s === 'watch-green'  && !showGreen)  continue;

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

    const m = L.circleMarker([it.lat, it.lng], {
      radius: radiusByCount(it.count),
      color:'#fff', weight:1.4, fillColor: colorByStatus(s), fillOpacity:.92
    }).bindPopup(html, { autoPan:true, closeButton:true }).addTo(markersLayer);

    markerByKey.set(markerKey(it), m);
  }
}

/** 行クリック時：パン＆ポップアップ */
export function panToAndOpen(lat, lng, name) {
  const key = `${lat},${lng},${name}`;
  const m = markerByKey.get(key);
  if (MAP) {
    MAP.panTo([lat, lng], { animate:true });
    if (m) m.openPopup();
  }
}

/** センター＆ズームを取得・復元用 */
export function getCenterZoom(){ return { center: MAP.getCenter(), zoom: MAP.getZoom() }; }
export function setCenterZoom(center, zoom){ MAP.setView(center, zoom, { animate:false }); }
