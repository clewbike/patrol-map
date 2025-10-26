// @ts-check
import { statusOf } from './status.js';
import { loadData, startPolling, latestUpdate } from './data.js';
import { initMap, drawMarkers, panToAndOpen, getCenterZoom, setCenterZoom } from './map.js';
import { setTableData, renderTable, bindSortHeaders, bindSearch } from './table.js';

const chkYellow = document.getElementById('chk-yellow');
const chkGreen  = document.getElementById('chk-green');
const refreshBtn   = document.getElementById('refreshBtn');
const refreshBadge = document.getElementById('refreshBadge');
const updateTime   = document.getElementById('updateTime');

let userTouchedYellow=false, userTouchedGreen=false;
let lastDataJsonText = '';
let classified = [];

// 検索行クリック時の処理（table.js が呼ぶ）
window.__onRowClick = (lat,lng,name)=> panToAndOpen(lat,lng,name);

function setCounts(total){
  document.getElementById('cnt-urgent').textContent = String(total.urgent);
  document.getElementById('cnt-yellow').textContent = String(total.yellow);
  document.getElementById('cnt-green' ).textContent = String(total.green);
}

function classify(items){
  const total={urgent:0,yellow:0,green:0};
  const arr = (items||[]).map(r=>{
    const s = statusOf(r.weight, r.count, r.name);
    if(s==='urgent') total.urgent++;
    else if(s==='watch-yellow') total.yellow++;
    else if(s==='watch-green') total.green++;
    return {...r, s};
  });
  setCounts(total);

  // “赤40以上”なら、未操作時のみ黄/緑を既定OFF
  if(total.urgent>=40){
    if(!userTouchedYellow) chkYellow.checked=false;
    if(!userTouchedGreen)  chkGreen.checked=false;
  }
  return arr;
}

/** 現在のチェック状態を取得 */
function viewFilter(){
  return { showYellow: chkYellow.checked, showGreen: chkGreen.checked };
}

/** 画面全再描画（地図＋一覧） */
function redrawAll(){
  drawMarkers(classified, viewFilter());
  renderTable(window.__onRowClick);
}

/** 初期化 */
function init(){
  // Map
  initMap();

  // チェック変更で再描画（地図のみ影響）
  chkYellow.addEventListener('change', ()=>{ userTouchedYellow=true; redrawAll(); });
  chkGreen .addEventListener('change', ()=>{ userTouchedGreen =true; redrawAll(); });

  // ドロワーの開閉
  const drawer = document.getElementById('drawer');
  document.getElementById('menuBtn').addEventListener('click', ()=>{
    drawer.classList.add('open'); drawer.setAttribute('aria-hidden','false');
    document.documentElement.classList.add('no-hscroll'); document.body.classList.add('no-hscroll');
  });
  document.getElementById('drawerClose').addEventListener('click', ()=>{
    drawer.classList.remove('open'); drawer.setAttribute('aria-hidden','true');
    document.documentElement.classList.remove('no-hscroll'); document.body.classList.remove('no-hscroll');
  });

  // Tips（省略せず移植）
  const tipBackdrop=document.getElementById('tipBackdrop');
  const tipBox=document.getElementById('tipBox');
  const tipHtml = `
    <span class="close" id="tipClose">×</span>
    <h4><span class="tag tag-urgent">交換必須</span></h4>
      <ul>
        <li>最優先の交換対象ポート！中心地の駅周辺は当日交換必須</li>
        <li>ＡＴ異常や長期電池切れ車両（ポート外含む）を厳選表示</li>
        <li>表示定義「交換比重 6以上」または「交換台数 3台以上」</li>
      </ul>
      <h4><span class="tag tag-watch-yellow">交換可能</span></h4>
      <ul>
        <li>交換可能ポートは基本的に交換必須「40件未満」で巡回</li>
        <li>但し「交換台数 4台以上」なら交換必須ポートの導線付近に限り現場判断で効率よく巡回をお願いいたします</li>
        <li>交換必須「40件以上」なら起動時に☑チェックなし</li>
        <li>表示定義「交換比重 5」または「交換台数 2台以上」</li>
      </ul>
      <h4><span class="tag tag-watch-green">経過観測</span></h4>
      <ul>
        <li>経過観測は巡回不要、起動時に標準で☑チェックなし</li>
        <li>表示定義「交換台数 2台」</li>
      </ul>`;
  document.getElementById('tipAll').addEventListener('click', ()=>{
    tipBox.innerHTML=tipHtml; tipBackdrop.style.display='block'; tipBox.style.display='block';
    document.getElementById('tipClose')?.addEventListener('click', closeTips);
  });
  function closeTips(){ tipBackdrop.style.display='none'; tipBox.style.display='none'; }
  tipBackdrop.addEventListener('click', closeTips);
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeTips(); });

  // マップ以外のピンチズーム/ctrl+wheel抑止
  document.addEventListener('gesturestart', e=>{ if(!e.target.closest('#map')) e.preventDefault(); }, {passive:false});
  document.addEventListener('wheel', e=>{ if(e.ctrlKey && !e.target.closest('#map')) e.preventDefault(); }, {passive:false});

  // 一覧：ヘッダーと検索の紐付け
  bindSortHeaders();
  bindSearch();

  // データ初回ロード
  loadData().then(json=>{
    lastDataJsonText = JSON.stringify(json);
    classified = classify(json.items);
    setTableData(classified);                 // ← 一覧（初期は weight→count の降順）
    drawMarkers(classified, viewFilter());    // ← 地図
    updateTime.textContent = latestUpdate(json.items);
  });

  // ポーリング：差分あれば更新ボタンを出す
  startPolling((txt)=>{
    if (txt !== lastDataJsonText) {
      refreshBtn.style.display='inline-block';
      refreshBadge.style.display='inline-block';
      lastDataJsonText = txt;
    }
  });

  // 更新ボタンクリックで再描画（中心とズームを維持）
  refreshBtn.addEventListener('click', async ()=>{
    try{
      const { center, zoom } = getCenterZoom();
      const data = JSON.parse(lastDataJsonText);
      classified = classify(data.items);
      setTableData(classified);
      drawMarkers(classified, viewFilter());
      setCenterZoom(center, zoom);
      updateTime.textContent = latestUpdate(data.items);
    }finally{
      refreshBadge.style.display='none';
      refreshBtn.style.display='none';
    }
  });

  // 現在地ボタン（最低限）
  let meMarker=null, meCircle=null, watchId=null, following=false;
  const btnLocate=document.getElementById('locateBtn');
  function updateFollowIcon(){ btnLocate.classList.toggle('following',following); btnLocate.classList.toggle('idle',!following); }
  function stopWatch(){ if(watchId){ navigator.geolocation.clearWatch(watchId); watchId=null; } }
  function showOrUpdateMe(lat,lng,acc){
    const MAP = window.L?.map; // 参照だけ
    if(!meMarker){
      const div=L.divIcon({className:'', html:'<div class="me-dot"></div>', iconSize:[16,16], iconAnchor:[8,8]});
      meMarker=L.marker([lat,lng],{icon:div,interactive:false}).addTo(L.map('map'));
      meCircle=L.circle([lat,lng],{radius:acc||30,color:'#2c7be5',weight:1,fillColor:'#2c7be5',fillOpacity:0.12,interactive:false}).addTo(L.map('map'));
    }else{
      meMarker.setLatLng([lat,lng]);
      meCircle.setLatLng([lat,lng]).setRadius(acc||30);
    }
  }
  btnLocate.addEventListener('click', ()=>{
    if(!('geolocation' in navigator)){ alert('位置情報が利用できません'); return; }
    following=true; updateFollowIcon();
    stopWatch();
    watchId=navigator.geolocation.watchPosition(
      p=>{ const {latitude,longitude,accuracy}=p.coords; showOrUpdateMe(latitude,longitude,accuracy); },
      err=>{ console.warn('watchPosition error:',err); },
      { enableHighAccuracy:true, maximumAge:5000 }
    );
    navigator.geolocation.getCurrentPosition(
      pos=>{ const {latitude,longitude,accuracy}=pos.coords; showOrUpdateMe(latitude,longitude,accuracy); },
      err=>{ alert('現在地を取得できません：'+err.message); },
      { enableHighAccuracy:true, timeout:10000, maximumAge:5000 }
    );
  });
}

init();
