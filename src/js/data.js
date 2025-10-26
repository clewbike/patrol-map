// @ts-check

/**
 * data.json を取得
 * @returns {Promise<{items: any[]}>}
 */
export async function loadData() {
  const res = await fetch(`./data.json?_=${Date.now()}`);
  if (!res.ok) throw new Error('data.json fetch failed');
  return res.json();
}

/**
 * 差分監視し、変化したら callback にテキストを渡す
 * @param {(text:string)=>void} onDiff
 * @param {number} intervalMs
 */
export function startPolling(onDiff, intervalMs = 300000) { // 5分
  let last = '';
  setInterval(async () => {
    try {
      const res = await fetch(`./data.json?_=${Date.now()}`);
      if (!res.ok) return;
      const txt = await res.text();
      if (txt && txt !== last) {
        last = txt;
        onDiff(txt);
      }
    } catch {}
  }, intervalMs);
}

/** items から最終更新文字列を取り出す */
export function latestUpdate(items) {
  const latest = (items || []).map(v => v.updated).filter(Boolean).sort().reverse()[0] || '-';
  return latest;
}
