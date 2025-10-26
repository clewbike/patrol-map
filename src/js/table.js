// @ts-check

// DOM参照
const qGlobal = document.getElementById('qGlobal');
const tbody   = document.getElementById('portsTbody');

// ソート状態（文字列で分かりやすく）
let sortKey = /** @type {'name'|'weight'|'count'} */('weight');
let sortDir = /** @type {'asc'|'desc'} */('desc');
/** @type {Array<{name:string, lat:number, lng:number, weight:number, count:number, s?:string|null}>} */
let tableRows = [];

/** 数値比較（方向つき） */
const cmpNum = (a, b) => sortDir === 'asc' ? (a - b) : (b - a);

/** ソートインジケータ更新 */
function updateIndicators() {
  document.getElementById('sort-name'  ).textContent   = sortKey==='name'   ? (sortDir==='asc'?'↑':'↓') : '⇅';
  document.getElementById('sort-weight').textContent = sortKey==='weight' ? (sortDir==='asc'?'↑':'↓') : '⇅';
  document.getElementById('sort-count' ).textContent  = sortKey==='count'  ? (sortDir==='asc'?'↑':'↓') : '⇅';
}

/**
 * JSON→テーブル用にセット（初期は weight→count の降順）
 * @param {any[]} items
 */
export function setTableData(items){
  tableRows = (items || []).map(r => ({
    name:r.name, weight:Number(r.weight)||0, count:Number(r.count)||0, lat:r.lat, lng:r.lng, s:r.s ?? null
  }));
  sortKey = 'weight'; sortDir = 'desc';
  updateIndicators();
  renderTable();
}

/** 現在の条件で tbody を再描画（検索はポート名のみ） */
export function renderTable(onRowClick){
  const q = qGlobal.value.trim().toLowerCase();
  let rows = tableRows.filter(r => !q || r.name.toLowerCase().includes(q));

  rows.sort((a,b)=>{
    if (sortKey === 'weight') { const p = cmpNum(a.weight, b.weight); return p || cmpNum(a.count, b.count); }
    if (sortKey === 'count')  { const p = cmpNum(a.count , b.count ); return p || cmpNum(a.weight, b.weight); }
    return sortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
  });

  tbody.innerHTML = rows.map(r => `
    <tr data-lat="${r.lat}" data-lng="${r.lng}" data-name="${r.name}">
      <td>${r.name}</td><td>${r.weight}</td><td>${r.count}</td>
    </tr>`).join('');

  Array.from(tbody.querySelectorAll('tr')).forEach(tr=>{
    tr.addEventListener('click', ()=>{
      const lat = parseFloat(tr.dataset.lat), lng = parseFloat(tr.dataset.lng), name = tr.dataset.name;
      onRowClick?.(lat, lng, name);
    });
  });
}

/** 列ヘッダークリックでソート切替 */
export function bindSortHeaders() {
  const setSort = (k) => {
    if (sortKey !== k) { sortKey = k; sortDir = 'desc'; }
    else { sortDir = (sortDir === 'asc') ? 'desc' : 'asc'; }
    updateIndicators();
    renderTable(window.__onRowClick); // main.js から登録されたハンドラを使用
  };
  document.getElementById('th-name'  ).addEventListener('click', ()=>setSort('name'));
  document.getElementById('th-weight').addEventListener('click', ()=>setSort('weight'));
  document.getElementById('th-count' ).addEventListener('click', ()=>setSort('count'));
}

/** 入力リアルタイム検索 */
export function bindSearch() {
  qGlobal.addEventListener('input', ()=>renderTable(window.__onRowClick));
}
