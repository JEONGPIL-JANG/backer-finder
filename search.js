// 후원자 명단 검색 규칙 (기획서 v1.2.1 4.3)
// 브라우저(window.BackerSearch)와 node(require) 양쪽에서 쓴다.
(function (root) {
  'use strict';

  // 초성 19자 (유니코드 한글 음절 조합 순서)
  var CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  var CHO_SET = {};
  CHO.forEach(function (c, i) { CHO_SET[c] = i; });

  function isCompatJamo(cp) { return cp >= 0x3131 && cp <= 0x318E; }
  function isSyllable(cp) { return cp >= 0xAC00 && cp <= 0xD7A3; }
  function isHanja(cp) {
    return (cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0x3400 && cp <= 0x4DBF) || (cp >= 0xF900 && cp <= 0xFAFF);
  }

  // 4.3-1 정리: 한 글자씩. 호환 자모는 그대로, 나머지는 NFKC → 소문자 → 남길 글자만.
  function normalize(s) {
    var out = '';
    for (var ch of String(s == null ? '' : s)) {
      var cp = ch.codePointAt(0);
      if (isCompatJamo(cp)) { out += ch; continue; }
      var n = ch.normalize('NFKC').toLowerCase();
      for (var c2 of n) {
        var p = c2.codePointAt(0);
        if (isSyllable(p) || isCompatJamo(p) || isHanja(p) ||
            (p >= 0x61 && p <= 0x7A) || (p >= 0x30 && p <= 0x39)) {
          out += c2;
        }
      }
    }
    return out;
  }

  // 음절의 초성 자모(없으면 null)
  function choOf(ch) {
    var cp = ch.codePointAt(0);
    if (!isSyllable(cp)) return null;
    return CHO[Math.floor((cp - 0xAC00) / 588)];
  }

  // 패턴 글자 p가 칸 글자 t와 맞는지. 반환: 0 안 맞음, 1 똑같은 글자, 2 초성으로 맞음
  function matchChar(p, t) {
    if (p === t) return 1;
    if (CHO_SET.hasOwnProperty(p) && choOf(t) === p) return 2;
    return 0;
  }

  // 한 칸 norm(배열) 안에서 q(배열)의 가장 높은 순위. 0이면 안 맞음.
  // 순위: 1 정확, 2 시작, 3 포함, 4 초성
  function rankIn(q, t) {
    var best = 0;
    for (var i = 0; i + q.length <= t.length; i++) {
      var ok = true, usedCho = false;
      for (var j = 0; j < q.length; j++) {
        var m = matchChar(q[j], t[i + j]);
        if (!m) { ok = false; break; }
        if (m === 2) usedCho = true;
      }
      if (!ok) continue;
      var r;
      if (usedCho) r = 4;
      else if (i === 0 && q.length === t.length) r = 1;
      else if (i === 0) r = 2;
      else r = 3;
      if (!best || r < best) best = r;
      if (best === 1) break;
    }
    return best;
  }

  function cmpPos(a, b) {
    return (a.page - b.page) || (a.line - b.line) || (a.col - b.col);
  }

  // 칸 목록 준비: norm을 배열로 미리 쪼개 둔다.
  function prepare(cells) {
    return cells.map(function (c) {
      var norm = c.norm != null ? c.norm : normalize(c.text);
      return { cell: c, chars: Array.from(norm) };
    });
  }

  // 4.3-5 q와 t의 어떤 연속 부분과의 최소 편집 거리 (부분 문자열 근사 검색)
  function substringDistance(q, t, limit) {
    var m = q.length, n = t.length;
    var prev = new Array(n + 1).fill(0); // 첫 줄 0: 칸 어디서든 시작 가능
    for (var i = 1; i <= m; i++) {
      var cur = new Array(n + 1);
      cur[0] = i;
      var rowMin = cur[0];
      for (var j = 1; j <= n; j++) {
        var cost = q[i - 1] === t[j - 1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (rowMin > limit) return limit + 1;
      prev = cur;
    }
    var best = Infinity;
    for (var k = 0; k <= n; k++) if (prev[k] < best) best = prev[k];
    return best;
  }

  function hasChoJamo(qChars) {
    return qChars.some(function (c) { return CHO_SET.hasOwnProperty(c); });
  }

  // 검색. 반환 {query, results:[{cell, rank}], similar:[{cell, distance}]}
  function search(prepared, input) {
    var q = Array.from(normalize(input));
    var res = { query: q.join(''), results: [], similar: [] };
    if (!q.length) return res; // 4.3-2 빈 입력
    for (var i = 0; i < prepared.length; i++) {
      var r = rankIn(q, prepared[i].chars);
      if (r) res.results.push({ cell: prepared[i].cell, rank: r });
    }
    res.results.sort(function (a, b) { return (a.rank - b.rank) || cmpPos(a.cell, b.cell); });
    if (!res.results.length) res.similar = similar(prepared, q);
    return res;
  }

  function similar(prepared, q) {
    if (q.length < 3 || hasChoJamo(q)) return [];
    var limit = q.length >= 5 ? 2 : 1;
    var found = [];
    for (var i = 0; i < prepared.length; i++) {
      var t = prepared[i].chars;
      var d = substringDistance(q, t, limit);
      if (d <= limit) found.push({ cell: prepared[i].cell, distance: d, lenDiff: Math.abs(t.length - q.length) });
    }
    found.sort(function (a, b) {
      return (a.distance - b.distance) || (a.lenDiff - b.lenDiff) || cmpPos(a.cell, b.cell);
    });
    return found.slice(0, 5).map(function (f) { return { cell: f.cell, distance: f.distance }; });
  }

  // 화면에서 굵게 칠할 부분: 원문 text 안에서 맞은 글자 위치 목록(원문 글자 번호)
  function highlightRanges(text, input) {
    var q = Array.from(normalize(input));
    if (!q.length) return [];
    var orig = Array.from(String(text));
    var map = [], chars = [];
    orig.forEach(function (ch, idx) {
      Array.from(normalize(ch)).forEach(function (c) { chars.push(c); map.push(idx); });
    });
    var bestStart = -1, bestRank = 0;
    for (var i = 0; i + q.length <= chars.length; i++) {
      var ok = true, usedCho = false;
      for (var j = 0; j < q.length; j++) {
        var m = matchChar(q[j], chars[i + j]);
        if (!m) { ok = false; break; }
        if (m === 2) usedCho = true;
      }
      if (!ok) continue;
      var r = usedCho ? 4 : (i === 0 ? (q.length === chars.length ? 1 : 2) : 3);
      if (!bestRank || r < bestRank) { bestRank = r; bestStart = i; }
    }
    if (bestStart < 0) return [];
    return [map[bestStart], map[bestStart + q.length - 1]];
  }

  var api = { normalize: normalize, prepare: prepare, search: search, rankIn: rankIn,
    substringDistance: substringDistance, highlightRanges: highlightRanges, CHO: CHO };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BackerSearch = api;
})(typeof window !== 'undefined' ? window : this);
