(function () {
  'use strict';
  var S = window.BackerSearch;
  var PAGES = [468, 469, 470, 471, 472, 473, 474, 475, 476, 477, 478, 479];
  var MAX_LIST = 200;
  var $ = function (id) { return document.getElementById(id); };
  var q = $('q'), results = $('results'), similarEl = $('similar'), home = $('home'), count = $('count');
  var viewer = $('viewer'), stage = $('stage'), canvas = $('canvas'), img = $('pageImg'), boxesEl = $('boxes');
  var cells = [], prepared = [], current = { list: [], idx: -1, page: null, query: '' };
  var view = { scale: 1, x: 0, y: 0, w: 0, h: 0 };
  var wide = window.matchMedia('(min-width: 900px)');

  // ---------- 데이터 ----------
  // 압축 파일을 내려받아 바로 열 때(file://)는 fetch가 막혀서, data/names.js(window.BACKER_DATA)를 먼저 쓴다.
  (window.BACKER_DATA ? Promise.resolve(window.BACKER_DATA) : fetch('data/names.json').then(function (r) { return r.json(); })).then(function (data) {
    cells = data.cells || data;
    prepared = S.prepare(cells);
    $('loading').hidden = true;
    if (q.value) runSearch(); else showHome();
    if (wide.matches) openPage(PAGES[0], null, false);
  }).catch(function () {
    $('loading').textContent = '명단을 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.';
  });

  PAGES.forEach(function (p) {
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = p + '쪽';
    b.addEventListener('click', function () { current.list = []; current.idx = -1; openPage(p, null, true); });
    $('pageButtons').appendChild(b);
  });

  // ---------- 검색 ----------
  var composingTimer = null;
  q.addEventListener('input', runSearch);
  q.addEventListener('compositionend', function () { clearTimeout(composingTimer); composingTimer = setTimeout(runSearch, 0); });
  $('clear').addEventListener('click', function () { q.value = ''; runSearch(); q.focus(); });
  q.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && current.list.length) { e.preventDefault(); select(0, true); q.blur(); }
  });

  function runSearch() {
    if (!prepared.length) return;
    var text = q.value;
    $('clear').hidden = !text;
    var r = S.search(prepared, text);
    current.query = text;
    current.list = r.results.map(function (x) { return x.cell; });
    current.idx = -1;
    if (!r.query) { showHome(); return; }
    home.hidden = true;
    renderList(r);
    if (wide.matches && current.list.length) select(0, false);
    else { updateNav(); if (wide.matches) drawBoxes(); }
  }

  function showHome() {
    home.hidden = false; results.hidden = true; similarEl.hidden = true;
    count.textContent = cells.length ? '전체 ' + cells.length.toLocaleString() + '칸' : '';
    current.list = []; current.idx = -1;
    updateNav();
    if (wide.matches && current.page) drawBoxes();
  }

  function renderList(r) {
    results.innerHTML = '';
    similarEl.innerHTML = '';
    var n = r.results.length;
    count.textContent = n ? n.toLocaleString() + '개 찾았어요' : '정확히 맞는 이름이 없어요';
    var frag = document.createDocumentFragment();
    r.results.slice(0, MAX_LIST).forEach(function (x, i) { frag.appendChild(item(x.cell, i)); });
    results.appendChild(frag);
    if (n > MAX_LIST) {
      var more = document.createElement('li'); more.className = 'more';
      more.textContent = '결과가 많아요. 더 입력해 주세요 (앞 ' + MAX_LIST + '개만 보여요)';
      results.appendChild(more);
    }
    results.hidden = !n;
    if (!n) {
      if (r.similar.length) {
        var p = document.createElement('p'); p.textContent = '비슷한 이름:'; similarEl.appendChild(p);
        var ol = document.createElement('ol'); ol.className = 'results';
        r.similar.forEach(function (s) {
          var li = item(s.cell, -1);
          li.addEventListener('click', function () { current.list = [s.cell]; select(0, true); });
          ol.appendChild(li);
        });
        similarEl.appendChild(ol);
      } else {
        similarEl.innerHTML = '<p>비슷한 이름도 없어요. 다른 글자로 찾아보세요.</p>';
      }
      similarEl.hidden = false;
    } else similarEl.hidden = true;
  }

  function item(cell, i) {
    var li = document.createElement('li');
    var pg = document.createElement('span'); pg.className = 'pg'; pg.textContent = cell.page + '쪽';
    var tx = document.createElement('span'); tx.className = 'tx';
    var chars = Array.from(cell.text), hl = S.highlightRanges(cell.text, current.query);
    if (hl.length) {
      tx.appendChild(document.createTextNode(chars.slice(0, hl[0]).join('')));
      var b = document.createElement('b'); b.textContent = chars.slice(hl[0], hl[1] + 1).join(''); tx.appendChild(b);
      tx.appendChild(document.createTextNode(chars.slice(hl[1] + 1).join('')));
    } else tx.textContent = cell.text;
    li.appendChild(pg); li.appendChild(tx);
    if (i >= 0) { li.dataset.i = i; li.addEventListener('click', function () { select(i, true); }); }
    return li;
  }

  function select(i, push) {
    if (i < 0 || i >= current.list.length) return;
    current.idx = i;
    Array.prototype.forEach.call(results.querySelectorAll('li.active'), function (el) { el.classList.remove('active'); });
    var li = results.querySelector('li[data-i="' + i + '"]');
    if (li) { li.classList.add('active'); if (wide.matches) li.scrollIntoView({ block: 'nearest' }); }
    var cell = current.list[i];
    openPage(cell.page, cell, push);
  }

  // ---------- 사진 보기 ----------
  function openPage(page, cell, push) {
    var wasHidden = viewer.hidden;
    viewer.hidden = false;
    if (push && wasHidden && !wide.matches) history.pushState({ viewer: true }, '');
    $('pageLabel').textContent = page + '쪽';
    var same = current.page === page && img.complete && img.naturalWidth;
    current.page = page;
    updateNav();
    if (same) { drawBoxes(); if (cell) focusCell(cell, true); else fitPage(); return; }
    img.onload = function () {
      view.w = img.naturalWidth; view.h = img.naturalHeight;
      img.style.width = view.w + 'px'; img.style.height = view.h + 'px';
      canvas.style.width = view.w + 'px'; canvas.style.height = view.h + 'px';
      drawBoxes();
      if (cell) focusCell(cell, true); else fitPage();
    };
    img.alt = page + '쪽 후원자 명단 사진';
    img.src = 'pages/' + page + '.jpg';
  }

  // 검색 결과를 보고 있으면 이전/다음 = 결과, 아니면(쪽 넘겨 보기) 이전/다음 = 앞쪽/뒤쪽
  function byResult() { return current.list.length > 0 && current.idx >= 0; }
  function updateNav() {
    var n = current.list.length, i = current.idx, pi = PAGES.indexOf(current.page);
    if (byResult()) {
      $('prev').disabled = !(i > 0);
      $('next').disabled = !(i < n - 1);
      $('prev').textContent = '◀ 이전'; $('next').textContent = '다음 ▶';
      $('prev').setAttribute('aria-label', '이전 결과'); $('next').setAttribute('aria-label', '다음 결과');
    } else {
      $('prev').disabled = !(pi > 0);
      $('next').disabled = !(pi >= 0 && pi < PAGES.length - 1);
      $('prev').textContent = '◀ 앞쪽'; $('next').textContent = '뒤쪽 ▶';
      $('prev').setAttribute('aria-label', '앞쪽'); $('next').setAttribute('aria-label', '뒤쪽');
    }
    $('pos').textContent = byResult() ? (i + 1) + '/' + n : '';
    $('cellText').textContent = byResult() ? current.list[i].text : '';
    $('focus').disabled = !byResult();
  }

  function drawBoxes() {
    boxesEl.innerHTML = '';
    if (!view.w) return;
    var main = current.idx >= 0 ? current.list[current.idx] : null;
    current.list.forEach(function (c) {
      if (c.page !== current.page || !c.box) return;
      var d = document.createElement('div');
      d.className = 'box' + (c === main ? ' main blink' : '');
      d.style.left = (c.box[0] * view.w) + 'px'; d.style.top = (c.box[1] * view.h) + 'px';
      d.style.width = (c.box[2] * view.w) + 'px'; d.style.height = (c.box[3] * view.h) + 'px';
      boxesEl.appendChild(d);
    });
  }

  function apply() {
    canvas.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.scale + ')';
  }
  function minScale() { var r = stage.getBoundingClientRect(); return Math.min(r.width / view.w, r.height / view.h); }
  function clampView() {
    var r = stage.getBoundingClientRect(), sw = view.w * view.scale, sh = view.h * view.scale;
    view.x = sw <= r.width ? (r.width - sw) / 2 : Math.min(0, Math.max(r.width - sw, view.x));
    view.y = sh <= r.height ? (r.height - sh) / 2 : Math.min(0, Math.max(r.height - sh, view.y));
  }
  function fitPage() {
    var r = stage.getBoundingClientRect();
    view.scale = r.width / view.w; // 가로 맞춤
    view.x = 0; view.y = 0; clampView(); apply();
  }
  function focusCell(cell, blink) {
    if (!cell.box) { fitPage(); return; }
    var r = stage.getBoundingClientRect();
    var bw = cell.box[2] * view.w, cx = (cell.box[0] + cell.box[2] / 2) * view.w, cy = (cell.box[1] + cell.box[3] / 2) * view.h;
    // 상자가 화면 폭의 40%쯤 되게, 다만 사진 원래 크기의 0.9배까지만(더 키우면 흐려짐)
    var s = Math.min(Math.max(r.width / view.w * 1.6, r.width * 0.4 / bw), 0.9);
    s = Math.max(s, minScale());
    view.scale = s; view.x = r.width / 2 - cx * s; view.y = r.height / 2 - cy * s;
    clampView(); apply();
    if (blink) {
      var m = boxesEl.querySelector('.box.main');
      if (m) { m.classList.remove('blink'); void m.offsetWidth; m.classList.add('blink'); }
    }
  }
  function zoomAt(f, px, py) {
    var ns = Math.min(4, Math.max(minScale(), view.scale * f));
    view.x = px - (px - view.x) * ns / view.scale; view.y = py - (py - view.y) * ns / view.scale;
    view.scale = ns; clampView(); apply();
  }

  function stepPage(d) {
    var pi = PAGES.indexOf(current.page) + d;
    if (pi >= 0 && pi < PAGES.length) openPage(PAGES[pi], null, false);
  }
  $('prev').addEventListener('click', function () { if (byResult()) select(current.idx - 1, false); else stepPage(-1); });
  $('next').addEventListener('click', function () { if (byResult()) select(current.idx + 1, false); else stepPage(1); });
  $('focus').addEventListener('click', function () { if (current.idx >= 0) focusCell(current.list[current.idx], true); });
  $('zoomIn').addEventListener('click', function () { var r = stage.getBoundingClientRect(); zoomAt(1.4, r.width / 2, r.height / 2); });
  $('zoomOut').addEventListener('click', function () { var r = stage.getBoundingClientRect(); zoomAt(1 / 1.4, r.width / 2, r.height / 2); });
  $('close').addEventListener('click', function () { if (history.state && history.state.viewer) history.back(); else closeViewer(); });
  window.addEventListener('popstate', function () { if (!wide.matches) closeViewer(); });
  function closeViewer() { if (!wide.matches) viewer.hidden = true; }
  window.addEventListener('resize', function () { if (view.w) { clampView(); apply(); } });

  // 끌기·두 손가락 확대·휠
  var pts = new Map(), last = null;
  stage.addEventListener('pointerdown', function (e) { e.preventDefault(); stage.classList.add('dragging'); stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); last = null; });
  stage.addEventListener('pointermove', function (e) {
    if (!pts.has(e.pointerId)) return;
    var prev = pts.get(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    var r = stage.getBoundingClientRect();
    if (pts.size === 1) { view.x += e.clientX - prev.x; view.y += e.clientY - prev.y; clampView(); apply(); }
    else if (pts.size === 2) {
      var a = Array.from(pts.values()), d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
      var mx = (a[0].x + a[1].x) / 2 - r.left, my = (a[0].y + a[1].y) / 2 - r.top;
      if (last) zoomAt(d / last, mx, my);
      last = d;
    }
  });
  function up(e) { pts.delete(e.pointerId); last = null; if (!pts.size) stage.classList.remove('dragging'); }
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  stage.addEventListener('wheel', function (e) {
    e.preventDefault(); var r = stage.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  // 오프라인 저장
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
