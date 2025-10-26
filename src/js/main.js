// @ts-check
import { statusOf } from './status.js';
import { loadData, startPolling, latestUpdate } from './data.js';
import { initMap, drawMarkers, panToAndOpen, getCenterZoom, setCenterZoom, getMap } from './map.js';
import { setTableData, renderTable, bindSortHeaders, bindSearch, setRowClickHandler } from './table.js';

/*───────────────────────────────────────────────
  エラー表示（ユーザー向け）
───────────────────────────────────────────────*/
function showError(msg) {
  document.body.innerHTML = `
    <div class="error-container" style="text-align:center;margin-top:20vh;font-family:Segoe UI,system-ui,sans-serif;color:#b00020;">
      <h2 style="font-size:1.6em;margin-bottom:.6em;">⚠️ データ取得のエラーが確認されました</h2>
      <p style="line-height:1.6;">${msg || "データ取得のエラーが確認されました。開発者に確認してください。"}</p>
      <p style="line-height:1.6;">開発者に確認してください。</p>
    </div>
  `;
}

/*───────────────────────────────────────────────
  error.json を見てから data.json を読む初回ロード
───────────────────────────────────────────────*/
async function loadInitialData() {
  try {
    // 1) error.json（任意）にエラー通知があるか先にチェック
    const errRes = await fetch('./error.json', { cache: 'no-store' });
    if (errRes.ok) {
      const errData = await errRes.json();
      if (errData && errData.error) {
        showError(errData.message || "データ取得のエラーが確認されました。開発者に確認してください。");
        return false;
      }
    }

    // 2) 通常データ
    const json = await loadData();
    if (json && json.error) {
      showError(json.message || "データ取得のエラーが確認されました。開発者に確認してください。");
      return false;
    }

    // 3) 初期描画（一覧 → マーカー）
    lastDataJsonText = JSON.stringify(json);
    classified = classify(json.items);
    setTableData(classified);
    renderTable(); // setRowClickHandler を別で設定済みなので引数不要
    drawMarkers(classified, viewFilter());
    updateTime.textContent = latestUpdate(json.items);

    return true;
  } catch (e) {
    console.error(e);
    showError("データの取得中にエラーが発生しました。開発者に確認してください。");
    return false;
  }
}

/*───────────────────────────────────────────────
  共通UI・状態
───────────────────────────────────────────────*/
const chkYellow   = document.getElementById('chk-yellow');
const chkGreen    = document.getElementById('chk-green');
const refreshBtn  = document.getElementById('refreshBtn');
const refreshBadge= document.getElementById('refreshBadge');
const updateTime  = document.getElementById('updateTime');

let userTouchedYellow = false;
let userTouchedGreen  = false;
let lastDataJsonText  = '';
let classified        = [];

/* 件数バッジ更新 */
function setCounts(total){
  document.getElementById('cnt-urgent').textContent = String(total.urgent);
  document.getElementById('cnt-yellow').textContent = String(total.yellow);
  document.getElementById('cnt-green' ).textContent = String(total.green);
}

/* ステータス分類＋件数集計（マップ・一覧の元データ） */
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

/* 表示フィルタ（凡例チェック） */
function viewFilter(){ return { showYellow: chkYellow.checked, showGreen: chkGreen.checked }; }

/* 再描画（マップ＋一覧） */
function redrawAll(){
  drawMarkers(classified, viewFilter());
  renderTable(); // setRowClickHandler により行クリック→panは内部でバインド済み
}

/*───────────────────────────────────────────────
  現在地マーカー＆追従（堅牢版）
───────────────────────────────────────────────*/
let meMarker = null;
let meCircle = null;
let watchId  = null;
let following= false;
const btnLocate = document.getElementById('locateBtn');

function uiGeoNotice(msg){
  const id = 'geo-notice';
  if (document.getElementById(id)) return;
  const div = document.createElement('div');
  div.id = id;
  div.style.cssText = 'position:absolute;left:8px;bottom:8px;background:#fff;padding:6px 8px;border:1px solid #ddd;border-radius:6px;font:12px/1.4 system-ui;box-shadow:0 2px 6px rgba(0,0,0,.12);z-index:1500;';
  div.textContent = msg;
  document.body.appendChild(div);
  setTimeout(()=> div.remove(), 5000);
}
function updateFollowIcon(){
  btnLocate.classList.toggle('following', following);
  btnLocate.classList.toggle('idle', !following);
}
function stopWatch(){
  if (watchId){ navigator.geolocation.clearWatch(watchId); watchId = null; }
}
function showOrUpdateMe(lat,lng,acc){
  const MAP = getMap();
  if(!MAP) return;
  if(!meMarker){
    const div = L.divIcon({ className:'', html:'<div class="me-dot"></div>', iconSize:[16,16], iconAnchor:[8,8] });
    meMarker = L.marker([lat,lng], { icon:div, interactive:false }).addTo(MAP);
    meCircle = L.circle([lat,lng], {
      radius:acc||30, color:'#2c7be5', weight:1,
      fillColor:'#2c7be5', fillOpacity:0.12, interactive:false
    }).addTo(MAP);
  }else{
    meMarker.setLatLng([lat,lng]);
    meCircle.setLatLng([lat,lng]).setRadius(acc||30);
  }
}
function isSecureOrigin(){
  return location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
}
/* 起動時：一度だけ現在地をセンタリング */
async function showMyLocationOnce({ center=true, gentleZoom=false, zoomStep=1 } = {}){
  try{
    if(!('geolocation' in navigator)){
      uiGeoNotice('端末の位置情報に非対応です'); return;
    }
    if(!isSecureOrigin()){
      uiGeoNotice('位置情報はHTTPSでのみ利用できます'); return;
    }
    try{
      if (navigator.permissions?.query){
        const st = await navigator.permissions.query({ name: 'geolocation' });
        if (st.state === 'denied'){
          uiGeoNotice('位置情報の許可が必要です（ブラウザ設定を確認）');
          return;
        }
      }
    }catch{ /* Permission API非対応は無視 */ }

    const MAP = getMap();
    if (!MAP) return;

    navigator.geolocation.getCurrentPosition(
      pos=>{
        const { latitude, longitude, accuracy } = pos.coords;
        showOrUpdateMe(latitude, longitude, accuracy);
        if (center){
          MAP.panTo([latitude, longitude], { animate:true });
          if (gentleZoom){
            const target = Math.min(MAP.getZoom() + Math.max(1, zoomStep), 19);
            setTimeout(()=> MAP.setZoom(target, { animate:true }), 200);
          }
        }
      },
      _err=> uiGeoNotice('現在地を取得できませんでした'),
      { enableHighAccuracy:true, timeout:10000, maximumAge:5000 }
    );
  }catch(e){
    console.error('[geo] unexpected error', e);
    uiGeoNotice('現在地の取得中にエラーが発生しました');
  }
}
/* 追従開始（ボタン） */
function startFollow(){
  if(!('geolocation' in navigator)){ uiGeoNotice('端末の位置情報に非対応です'); return; }
  if(!isSecureOrigin()){ uiGeoNotice('位置情報はHTTPSでのみ利用できます'); return; }

  following = true; updateFollowIcon();
  stopWatch();
  watchId = navigator.geolocation.watchPosition(
    p=>{
      const { latitude, longitude, accuracy } = p.coords;
      showOrUpdateMe(latitude, longitude, accuracy);
      if (following){
        const MAP = getMap();
        if (MAP) MAP.panTo([latitude, longitude], { animate:true });
      }
    },
    _err=>{
      uiGeoNotice('現在地の追従に失敗しました');
      following = false; updateFollowIcon(); stopWatch();
    },
    { enableHighAccuracy:true, maximumAge:5000 }
  );
}
btnLocate.addEventListener('click', startFollow);
/* マップ操作で追従解除 */
function bindMapStopFollow(){
  const MAP = getMap();
  if (!MAP) return;
  MAP.on('dragstart', ()=>{ if (following){ following=false; updateFollowIcon(); stopWatch(); }});
  MAP.on('zoomstart', ()=>{ if (following){ following=false; updateFollowIcon(); stopWatch(); }});
}

/*───────────────────────────────────────────────
  初期化（順序厳守）
───────────────────────────────────────────────*/
async function init(){
  try {
    // 1) 地図初期化
    initMap();

    // 2) マップ操作で追従解除のバインド
    bindMapStopFollow();

    // 3) 起動時に現在地を一度だけセンタリング（ズームは+1段だけ任意）
    showMyLocationOnce({ center:true, gentleZoom:false });

    // 一覧の行クリック → 地図パン＆ポップアップ
    setRowClickHandler((lat,lng,name)=> panToAndOpen(lat,lng,name));

    // フィルタチェック変更で再描画
    chkYellow.addEventListener('change', ()=>{ userTouchedYellow = true; redrawAll(); });
    chkGreen .addEventListener('change', ()=>{ userTouchedGreen  = true; redrawAll(); });

    // ドロワー開閉
    const drawer = document.getElementById('drawer');
    document.getElementById('menuBtn').addEventListener('click', ()=>{
      drawer.classList.add('open'); drawer.setAttribute('aria-hidden','false');
      document.documentElement.classList.add('no-hscroll'); document.body.classList.add('no-hscroll');
    });
    document.getElementById('drawerClose').addEventListener('click', ()=>{
      drawer.classList.remove('open'); drawer.setAttribute('aria-hidden','true');
      document.documentElement.classList.remove('no-hscroll'); document.body.classList.remove('no-hscroll');
    });

    // Tips
    const tipBackdrop=document.getElementById('tipBackdrop');
    const tipBox=document.getElementById('tipBox');
    const tipHtml = `
      <span class="close" id="tipClose">×</span>
      <h4><span class="tag tag-urgent">交換必須</span></h4>
      <ul>
        <li>最優先の交換対象ポート！中心地の駅周辺は当日交換必須</li>
        <li>ＡＴ異常や長期電池切れ車両（ポート外含む）を厳選表示</li>
        <li>表示定義「電池比重 6以上」または「交換目安 3台以上」</li>
      </ul>
      <h4><span class="tag tag-watch-yellow">交換可能</span></h4>
      <ul>
        <li>交換可能ポートは基本的に交換必須「40件未満」で巡回</li>
        <li>但し交換必須ポートの導線付近に限り現場判断で効率よく巡回をお願いいたします</li>
        <li>交換必須「40件以上」なら起動時に☑チェックなし</li>
        <li>表示定義「電池比重 5」または「交換目安 2台以上」</li>
      </ul>
      <h4><span class="tag tag-watch-green">経過観測</span></h4>
      <ul>
        <li>経過観測は巡回不要、起動時に標準で☑チェックなし</li>
        <li>表示定義「交換目安 2台」</li>
      </ul>`;
    document.getElementById('tipAll').addEventListener('click', ()=>{
      tipBox.innerHTML=tipHtml; tipBackdrop.style.display='block'; tipBox.style.display='block';
      document.getElementById('tipClose')?.addEventListener('click', closeTips);
    });
    function closeTips(){ tipBackdrop.style.display='none'; tipBox.style.display='none'; }
    tipBackdrop.addEventListener('click', closeTips);
    document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeTips(); });

    // ズーム抑止（マップ以外）
    document.addEventListener('gesturestart', e=>{ if(!e.target.closest('#map')) e.preventDefault(); }, {passive:false});
    document.addEventListener('wheel', e=>{ if(e.ctrlKey && !e.target.closest('#map')) e.preventDefault(); }, {passive:false});

    // 一覧のソート・検索
    bindSortHeaders();
    bindSearch();

    // 初回ロード（エラーハンドリング込み）
    await loadInitialData();

    // ポーリング（差分があれば更新ボタンを出す）
    startPolling((txt)=>{
      if (txt !== lastDataJsonText) {
        refreshBtn.style.display='inline-block';
        refreshBadge.style.display='inline-block';
        lastDataJsonText = txt;
      }
    });

    // 更新ボタン：中心/ズーム維持で再描画
    refreshBtn.addEventListener('click', async ()=>{
      try{
        const { center, zoom } = getCenterZoom();
        const data = JSON.parse(lastDataJsonText);
        classified = classify(data.items);
        setTableData(classified);
        renderTable();
        drawMarkers(classified, viewFilter());
        setCenterZoom(center, zoom);
        updateTime.textContent = latestUpdate(data.items);
      }finally{
        refreshBadge.style.display='none';
        refreshBtn.style.display='none';
      }
    });

  } catch (e) {
    console.error("init中のエラー:", e);
    showError("初期化中に問題が発生しました。開発者に確認してください。");
  }
}

/*───────────────────────────────────────────────*/
init();
