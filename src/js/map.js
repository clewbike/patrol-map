// @ts-check
import { colorByStatus, radiusByCount } from './status.js';

let MAP;
let markersLayer;
const markerByKey = new Map();
let routeLayer = null;

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
      <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
        <button class="popup-btn" data-lat="${it.lat}" data-lng="${it.lng}">JawgMAPで経路</button>
        <a class="popup-btn link" href="https://www.google.com/maps/dir/?api=1&destination=${it.lat},${it.lng}&travelmode=driving" target="_blank" rel="noopener">Googleマップ</a>
      </div>`;

    const m = L.circleMarker([it.lat,it.lng], {
      radius: radiusByCount(it.count),
      color:'#fff', weight:1.4, fillColor: colorByStatus(s), fillOpacity:.92
    }).bindPopup(html, { autoPan:true, closeButton:true }).addTo(markersLayer);

    markerByKey.set(markerKey(it), m);
  }
}


async function routeToOnMap(destLat, destLng){
  try{
    if (!('geolocation' in navigator)) { alert('この端末では位置情報が使えません'); return; }
    // 現在地を一度だけ取得
    const pos = await new Promise((resolve, reject)=>{
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy:true, timeout:10000, maximumAge:5000 });
    });
    const { latitude:origLat, longitude:origLng } = pos.coords;
    // OSRMで車ルートを取得
    const url = `https://router.project-osrm.org/route/v1/driving/${origLng},${origLat};${destLng},${destLat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    const coords = data?.routes?.[0]?.geometry?.coordinates;
    if (!coords) { alert('ルートが取得できませんでした'); return; }
    if (routeLayer) { routeLayer.remove(); routeLayer = null; }
    const latlngs = coords.map(([lng,lat]) => [lat,lng]);
    routeLayer = L.polyline(latlngs, { weight:5, opacity:0.9 }).addTo(MAP);
    MAP.fitBounds(routeLayer.getBounds(), { padding:[40,40] });
    // 経路開始 → 追従ONを司令塔に通知
    document.dispatchEvent(new Event('startFollow'));
  }catch(e){
    console.error(e);
    alert('経路の描画に失敗しました');
  }
}
export function panToAndOpen(lat,lng,name){
  const m = markerByKey.get(`${lat},${lng},${name}`);
  if (MAP){ MAP.panTo([lat,lng], { animate:true }); if (m) m.openPopup(); }
}
export function getCenterZoom(){ return { center: MAP.getCenter(), zoom: MAP.getZoom() }; }
export function setCenterZoom(center, zoom){ MAP.setView(center, zoom, { animate:false }); }
