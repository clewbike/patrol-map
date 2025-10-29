// @ts-check

/** 名前に「ポート外」を含むか */
export function isAbandoned(name) {
  return typeof name === 'string' && name.includes('ポート外');
}

/**
 * ポートの状態判定
 * @param {number} weight
 * @param {number} count
 * @param {string} name
 * @returns {'urgent'|'watch-yellow'|'watch-green'|null}
 */
export function statusOf(weight, count, name) {
  const w = Number(weight) || 0, c = Number(count) || 0;
  if (w >= 10 || (c >= 3 && w >= 10) || isAbandoned(name)) return 'urgent';
  if (c >= 3 || (c >= 2 && w >= 5 && w <= 9)) return 'watch-yellow';
  if (c >= 2) return 'watch-green';
  return null;
}

/** ステータス→色 */
export function colorByStatus(s) {
  return s === 'urgent' ? '#e60026' : s === 'watch-yellow' ? '#ff8c00' : '#6fa86f';
}

/** 台数→半径(px) */
export function radiusByCount(c) {
  return Math.max(6, Math.min(22, 6 + (Number(c) || 0) * 2));
}
