/*! premium.js — 유료 등급 전용 콘텐츠
 *   · VIP: 특별 10조합(고정수·제외수 필터) / 1:1 오행 심층 리포트(용신·희신·기신) / 명당 기운 길일
 *   · 연간: 1년 대운 · 월별 재물운 캘린더
 *  모든 잠금 판단은 window.Membership.has(...) 하나만 봅니다. */
(function (global) {
  "use strict";

  var S = global.Saju;
  var M = global.Membership;

  var GEN = { 목: "화", 화: "토", 토: "금", 금: "수", 수: "목" };     // 내가 생하는(식상)
  var GEN_BY = { 화: "목", 토: "화", 금: "토", 수: "금", 목: "수" };  // 나를 생하는(인성)
  var CON = { 목: "토", 토: "수", 수: "화", 화: "금", 금: "목" };     // 내가 극하는(재성)
  var CON_BY = { 토: "목", 수: "토", 화: "수", 금: "화", 목: "금" };  // 나를 극하는(관성)
  var H = S.ELEM_H;
  var LAST = { 수: [1, 6], 화: [2, 7], 목: [3, 8], 금: [4, 9], 토: [5, 0] };
  var COLOR_TXT = { 목: "청록색", 화: "붉은색", 토: "노란색", 금: "흰색·금색", 수: "검정·남색" };
  var DIR_TXT = { 목: "동쪽", 화: "남쪽", 토: "중앙·집 안", 금: "서쪽", 수: "북쪽" };
  var TIME_TXT = { 목: "03:30~07:30 (인·묘시)", 화: "09:30~13:30 (사·오시)", 토: "07:30~09:30·13:30~15:30", 금: "15:30~19:30 (신·유시)", 수: "21:30~01:30 (해·자시)" };
  var ACT_TXT = { 목: "새 제안·기획·시작", 화: "홍보·발표·사람 만나기", 토: "계약·저축·정리", 금: "결제·마무리·품질 점검", 수: "이동·거래·정보 수집" };
  var EL_SHORT = { 목: "성장과 시작", 화: "열정과 표현", 토: "안정과 축적", 금: "결단과 마무리", 수: "지혜와 흐름" };

  var TODAY = new Date();
  var state = { fixed: [], excluded: [], round: 0, err: "" };

  function $(s, root) { return (root || document).querySelector(s); }
  function $$(s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); }
  function pad2(n) { return String(n).padStart(2, "0"); }
  function dkey(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function hash(s) { return S.hash(s); }

  function analysis() { return global.Unmyeong ? global.Unmyeong.analysis() : null; }
  function draws() { return global.Unmyeong ? global.Unmyeong.draws() : []; }
  function birthKey() { return global.Unmyeong ? global.Unmyeong.birthKey() : ""; }

  var TODAY_DS = dkey(TODAY);   // 앱을 연 날 기준
  var TODAY_GZ = S.dayGanzi(TODAY);

  /* ───────── 오행 판정 (억부법 간이) ─────────
     신강 → 식상·재성·관성 중 모자란 것부터 용신/희신, 인성·비겁이 기신
     신약 → 인성·비겁 중 모자란 것부터 용신/희신, 식상·재성·관성이 기신 */
  function ohaeng(a) {
    var me = a.dayEl, c = a.counts, total = a.total || 6;
    var support = c[me] + c[GEN_BY[me]];
    var strong = support * 2 > total;
    var useful, oppose;
    if (strong) {
      useful = [GEN[me], CON[me], CON_BY[me]];      // 식상 · 재성 · 관성
      oppose = [GEN_BY[me], me];                     // 인성 · 비겁
    } else {
      useful = [GEN_BY[me], me];                     // 인성 · 비겁
      oppose = [GEN[me], CON[me], CON_BY[me]];       // 식상 · 재성 · 관성
    }
    var byCount = function (arr) {
      return arr.slice().sort(function (x, y) { return c[x] - c[y] || arr.indexOf(x) - arr.indexOf(y); });
    };
    var u = byCount(useful), op = byCount(oppose);
    var yong = u[0], hee = u[1] || u[0];
    var gi = op[op.length - 1];
    return {
      me: me, strong: strong, support: support, total: total,
      yong: yong, hee: hee, gi: gi, counts: c
    };
  }

  /* 월/일 기운이 나에게 하는 역할 */
  function relTo(myEl, el) {
    if (el === myEl) return "same";
    if (GEN[myEl] === el) return "gives";
    if (GEN[el] === myEl) return "receives";
    if (CON[myEl] === el) return "controls";
    if (CON[el] === myEl) return "controlled";
    return "neutral";
  }
  var REL_BONUS = { receives: 14, gives: 4, controls: 6, controlled: -9, same: 8, neutral: 0 };
  var REL_LINE = {
    receives: "기운이 나를 밀어주는 달", gives: "에너지가 밖으로 나가는 달",
    controls: "재물을 직접 쥐는 달", controlled: "눌리는 달, 지출 주의",
    same: "기운이 겹쳐 강해지는 달", neutral: "잔잔하게 흐르는 달"
  };

  function smallBalls(nums) {
    return nums.map(function (n) {
      var cls = n <= 10 ? "b1" : n <= 20 ? "b2" : n <= 30 ? "b3" : n <= 40 ? "b4" : "b5";
      return '<span class="ball small ' + cls + '">' + n + "</span>";
    }).join("");
  }

  /* ───────── 잠금 화면 ───────── */
  function ghostRow() {
    var out = "";
    for (var i = 0; i < 3; i++) {
      out += '<div class="ghost-row">' + new Array(7).join('<span class="ball small ghost">?</span>') + "</div>";
    }
    return out;
  }
  function gateHtml(feat, msg) {
    var need = (M && M.TIER_GATE[feat]) || "VIP";
    return '<div class="lock-soft">' +
      '<div class="lock-ico" aria-hidden="true">🔒</div>' +
      '<h3>' + need + " 회원 전용</h3>" +
      "<p>" + msg + "</p>" +
      ghostRow() +
      '<button type="button" class="btn btn-gold" data-open-plans style="margin-top:12px">멤버십 보고 열기</button>' +
      '<p class="tiny">베타 테스트 모드에서는 ‘체험 결제’를 누르면 바로 열립니다. 실제 청구는 없습니다.</p>' +
      "</div>";
  }
  function needSaju(where) {
    return '<div class="lock-soft">' +
      '<div class="lock-ico" aria-hidden="true">🀄</div>' +
      '<h3>사주를 먼저 입력해 주세요</h3>' +
      "<p>생년월일을 넣으면 " + where + "를 계산합니다. 이 기기 안에서만 계산되고 저장됩니다.</p>" +
      '<button type="button" class="btn btn-ghost" data-goto="saju">내 사주 입력하러 가기</button>' +
      "</div>";
  }
  function tagUpdate(id, feat, label) {
    var el = document.getElementById(id);
    if (!el) return;
    var on = M && M.has(feat);
    el.textContent = on ? "이용 중" : label;
    el.classList.toggle("on", !!on);
  }

  /* ───────── 1) 특별 10조합 ───────── */
  function parseNums(str) {
    if (!str) return [];
    var seen = {}, out = [];
    String(str).split(/[^0-9]+/).forEach(function (t) {
      var n = parseInt(t, 10);
      if (n >= 1 && n <= 45 && !seen[n]) { seen[n] = 1; out.push(n); }
    });
    out.sort(function (a, b) { return a - b; });
    return out;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function tenCombos(a, fixed, excluded, round) {
    var o = ohaeng(a);
    var st10 = S.statsFrom(draws(), 10);
    var pool = [];
    for (var n = 1; n <= 45; n++) {
      if (excluded.indexOf(n) >= 0 || fixed.indexOf(n) >= 0) continue;
      var el = S.numElem(n), w = 1;
      if (el === o.yong) w = 6;
      else if (el === o.hee) w = 4.5;
      else if (o.counts[el] === 0) w = 3;
      if (el === o.gi) w = 0.5;
      if (el === TODAY_GZ.branchEl) w += 1.2;
      if (st10.seen[n] === 999) w += 0.8;
      pool.push({ n: n, w: w, el: el });
    }
    var rnd = mulberry32(hash(birthKey() + "|ten|" + TODAY_DS + "|" + round + "|" + fixed.join("-") + "|" + excluded.join("-")));
    var out = [], used = {};
    var need = Math.max(1, 6 - fixed.length);

    for (var k = 0; k < 10; k++) {
      var best = null;
      for (var tryN = 0; tryN < 90; tryN++) {
        var nums = fixed.slice();
        var guard = 0;
        while (nums.length < 6 && guard++ < 900) {
          var totalW = 0, i;
          for (i = 0; i < pool.length; i++) totalW += pool[i].w;
          if (totalW <= 0) break;
          var t = rnd() * totalW, acc = 0, pick = null;
          for (i = 0; i < pool.length; i++) {
            acc += pool[i].w;
            if (t <= acc) { pick = pool[i].n; break; }
          }
          if (pick == null) pick = pool[pool.length - 1].n;
          if (nums.indexOf(pick) < 0) nums.push(pick);
        }
        if (nums.length < 6) continue;
        nums.sort(function (x, y) { return x - y; });
        var q = S.quality(nums);
        var key = nums.join(",");
        if (used[key]) continue;
        var bonus = 0;
        nums.forEach(function (x) { var e = S.numElem(x); if (e === o.yong) bonus += 2; else if (e === o.hee) bonus += 1; });
        var sc = q.score + bonus + (q.ok ? 12 : 0);
        if (!best || sc > best.sc) best = { nums: nums, q: q, sc: sc, key: key };
        if (q.ok && tryN > 6) break;
      }
      if (!best) break;
      used[best.key] = 1;
      out.push(best);
    }
    return { list: out, o: o, need: need };
  }

  function whyLine(combo, o) {
    var y = 0, h = 0, g = 0, d = 0;
    combo.nums.forEach(function (n) {
      var e = S.numElem(n);
      if (e === o.yong) y++;
      else if (e === o.hee) h++;
      else if (e === o.gi) g++;
      if (e === TODAY_GZ.branchEl) d++;
    });
    var parts = [];
    if (y) parts.push("용신 " + H[o.yong] + " " + y + "수");
    if (h) parts.push("희신 " + H[o.hee] + " " + h + "수");
    if (d) parts.push("오늘 기운 " + d + "수");
    if (g) parts.push("기신 " + H[o.gi] + " " + g + "수(주의)");
    return parts.length ? parts.join(" · ") : "균형 배치";
  }

  function renderTen() {
    var box = $("#tenBody");
    if (!box) return;
    tagUpdate("tenTag", "tenCombos", "VIP");
    var a = analysis();
    if (!a) { box.innerHTML = needSaju("특별 10조합"); bindCommon(box); return; }
    if (!(M && M.has("tenCombos"))) {
      box.innerHTML = gateHtml("tenCombos", "고정수·제외수 필터로 <b>특별 10조합</b>을 만들고, 용신·희신 수리로 가중치를 줍니다.");
      bindCommon(box);
      return;
    }

    var o = ohaeng(a);
    var res = tenCombos(a, state.fixed, state.excluded, state.round);
    var err = state.err ? '<p class="form-err" style="display:block">' + state.err + "</p>" : "";

    box.innerHTML =
      '<p class="hint" style="margin:0 0 10px">용신 <b class="el-' + o.yong + '">' + H[o.yong] + "(" + o.yong + ")</b> · 희신 <b class=\"el-" + o.hee + '">' + H[o.hee] + "(" + o.hee + ")</b> 수리에 가중치를 두고, 고정수는 반드시 포함·제외수는 전부 뺍니다.</p>" +
      '<div class="filter-grid">' +
        '<label class="filter">고정수 <span>꼭 넣을 번호</span>' +
          '<input type="text" id="tenFixed" inputmode="numeric" placeholder="예) 7, 21" value="' + state.fixed.join(", ") + '" />' +
        "</label>" +
        '<label class="filter">제외수 <span>빼고 싶은 번호</span>' +
          '<input type="text" id="tenExclude" inputmode="numeric" placeholder="예) 13, 34" value="' + state.excluded.join(", ") + '" />' +
        "</label>" +
      "</div>" +
      err +
      '<div class="btn-row" style="margin:0 0 12px">' +
        '<button type="button" class="btn btn-primary" id="tenApply">필터 적용</button>' +
        '<button type="button" class="btn btn-ghost" id="tenShuffle">다른 10조합</button>' +
      "</div>" +
      '<div class="ten-list">' + res.list.map(function (c, i) {
        return '<div class="ten-item">' +
          '<span class="ten-idx">' + (i + 1) + "</span>" +
          '<span class="ten-balls">' + smallBalls(c.nums) + "</span>" +
          '<button type="button" class="icon-btn ten-save" data-ten-save="' + i + '">저장</button>' +
          '<span class="ten-why">' + whyLine(c, o) + " · 합 " + c.q.sum + " · 홀짝 " + c.q.odd + ":" + c.q.even + "</span>" +
          "</div>";
      }).join("") + "</div>" +
      '<p class="hint">같은 날·같은 필터에는 같은 조합이 나옵니다(사주 씨앗 고정). ‘다른 10조합’을 누르면 새로 뽑습니다.</p>' +
      '<p class="tiny">10조합은 사주 수리·오늘 일진·최근 회차 통계를 결합한 참고용이며 당첨을 보장하지 않습니다.</p>';

    $("#tenApply").addEventListener("click", function () {
      var fx = parseNums($("#tenFixed").value).slice(0, 5);
      var ex = parseNums($("#tenExclude").value);
      var conflict = ex.filter(function (n) { return fx.indexOf(n) >= 0; });
      state.fixed = fx;
      state.excluded = ex.filter(function (n) { return fx.indexOf(n) < 0; });
      state.err = conflict.length ? "고정수와 제외수가 겹쳐 제외수에서 " + conflict.join(", ") + "을 뺐습니다." : "";
      state.round = 0;
      renderTen();
    });
    $("#tenShuffle").addEventListener("click", function () {
      state.round += 1;
      state.err = "";
      renderTen();
    });
    $$("[data-ten-save]", box).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var c = res.list[parseInt(btn.getAttribute("data-ten-save"), 10)];
        document.dispatchEvent(new CustomEvent("unmyeong:savecombo", { detail: { nums: c.nums, title: "VIP 10조합 " + (parseInt(btn.getAttribute("data-ten-save"), 10) + 1) } }));
        btn.textContent = "저장됨";
        btn.classList.add("saved");
      });
    });
    bindCommon(box);
  }

  /* ───────── 2) 오행 심층 리포트 ───────── */
  function renderDeep() {
    var box = $("#deepBody");
    if (!box) return;
    tagUpdate("deepTag", "deepReport", "VIP");
    var a = analysis();
    if (!a) { box.innerHTML = needSaju("심층 리포트"); bindCommon(box); return; }
    if (!(M && M.has("deepReport"))) {
      box.innerHTML = gateHtml("deepReport", "내 사주의 <b>용신·희신</b>과 <b>피해야 할 숫자</b>를 1:1로 풀어 드립니다. 용신을 채우는 색·방위·시간까지 안내합니다.");
      bindCommon(box);
      return;
    }

    var o = ohaeng(a);
    var meName = a.dayStemName;
    var max = Math.max.apply(null, S.ELEMS.map(function (e) { return a.counts[e]; })) || 1;

    var bars = S.ELEMS.map(function (e) {
      var c = a.counts[e];
      return '<div class="bal-row' + (e === o.yong ? " key" : "") + '"><div class="lbl">' + H[e] + "</div>" +
        '<div class="bal-bar"><i style="width:' + Math.round(c / max * 100) + "%;background:" + S.ELEM_COLOR[e] + '"></i></div>' +
        '<div class="num">' + c + "</div></div>";
    }).join("");

    function cell(kind, label, el, cls) {
      return '<div class="el-card ' + cls + '">' +
        '<span class="el-kind">' + label + "</span>" +
        '<span class="el-big el-' + el + '">' + H[el] + "</span>" +
        '<span class="el-name">' + el + " · " + EL_SHORT[el] + "</span>" +
        '<span class="el-nums">끝수 ' + LAST[el].join("·") + "</span>" +
        "</div>";
    }

    box.innerHTML =
      '<div class="deep-head">' +
        "<b>일간 " + meName + "</b> · " + (o.strong ? "신강(身强)" : "신약(身弱)") + " · " + a.yinyang +
        "<br><span class='tiny'>기운을 받쳐 주는 힘 " + o.support + "/" + o.total + "자 · 부족 " + a.lacking.map(function (e) { return H[e]; }).join("·") + "</span>" +
      "</div>" +
      '<div class="el-cards">' +
        cell("yong", "용신 用神", o.yong, "yong") +
        cell("hee", "희신 喜神", o.hee, "hee") +
        cell("gi", "기신 忌神", o.gi, "gi") +
      "</div>" +
      '<div class="balance" style="margin-top:14px">' + bars + "</div>" +
      '<div class="deep-body">' +
        "<p><b>용신 " + H[o.yong] + "(" + o.yong + ")</b> — " + (o.strong
          ? "기운이 강한 편이라 " + H[o.yong] + "으로 흘려보내고 " + H[o.hee] + "으로 결실을 챙기는 흐름이 좋습니다."
          : "기운이 약한 편이라 " + H[o.yong] + "으로 나를 받쳐 주고 " + H[o.hee] + "으로 힘을 보태는 흐름이 좋습니다.") +
          " 색은 " + COLOR_TXT[o.yong] + ", 방위는 " + DIR_TXT[o.yong] + ", 시간은 " + TIME_TXT[o.yong] + "입니다.</p>" +
        "<p><b>재물 습관</b> — " + H[o.yong] + "의 기운이 도는 때에 " + ACT_TXT[o.yong] + "를 하면 흐름이 붙습니다. 구매·계약처럼 되돌리기 어려운 일은 " + H[o.gi] + "의 기운이 강한 날을 피하세요.</p>" +
        "<p><b>번호 활용</b> — 끝수 <b>" + LAST[o.yong].join("·") + "</b>(" + H[o.yong] + ")와 <b>" + LAST[o.hee].join("·") + "</b>(" + H[o.hee] + ")를 중심으로, 오늘 일진 끝수 " + LAST[TODAY_GZ.branchEl].join("·") + "를 1~2개 섞는 구성이 내 사주와 가장 잘 맞습니다.</p>" +
        "<p><b>피해야 할 숫자</b> — 끝수 <b class='el-" + o.gi + "'>" + LAST[o.gi].join("·") + "</b> (" + H[o.gi] + " · 기신). 이 끝수 번호는 10조합에서 자동으로 가중치를 낮춥니다.</p>" +
      "</div>" +
      '<div class="chip-line">' +
        '<span class="chip">용신 숫자 <b>' + S.ELEM_NUMS[o.yong].join(" · ") + "</b></span>" +
        '<span class="chip">희신 숫자 <b>' + S.ELEM_NUMS[o.hee].join(" · ") + "</b></span>" +
      "</div>" +
      '<p class="tiny">억부법(抑扶法) 기준 간이 판정입니다. 같은 사주라도 태어난 시각과 대운에 따라 달라질 수 있으니 재미와 참고로만 봐 주세요.</p>';
    bindCommon(box);
  }

  /* ───────── 3) 1년 대운 · 월별 재물운 ───────── */
  function monthCells(a, o) {
    var me = a.dayEl;
    var cells = [];
    for (var i = 0; i < 12; i++) {
      var d = new Date(TODAY.getFullYear(), TODAY.getMonth() + i, 15);
      var p = S.pillars(d.getFullYear(), d.getMonth() + 1, 15, null, 0);
      var mp = p.pillars[2];
      var bel = S.BRANCH_EL[mp.branch];
      var sel = S.STEM_EL[mp.stem];
      var rel = relTo(me, bel);
      var score = 58 + REL_BONUS[rel];
      if (a.lacking.indexOf(bel) >= 0) score += 10;
      if (a.strongest.indexOf(bel) >= 0 && a.counts[bel] >= 3) score -= 4;
      if (bel === CON[me]) score += 6;          // 재성의 달
      if (bel === CON_BY[me]) score -= 5;       // 관성의 달
      if (bel === o.yong) score += 5;
      score += (hash(d.getFullYear() + "-" + (d.getMonth() + 1) + "|m") % 11) - 5;
      score = Math.max(41, Math.min(97, score));
      cells.push({
        y: d.getFullYear(), m: d.getMonth() + 1,
        hanja: S.STEMS_H[mp.stem] + S.BRANCHES_H[mp.branch],
        name: S.STEMS[mp.stem] + S.BRANCHES[mp.branch],
        el: bel, rel: rel, score: score
      });
    }
    return cells;
  }

  function renderCal() {
    var box = $("#calBody");
    if (!box) return;
    tagUpdate("calTag", "annualReport", "연간");
    var a = analysis();
    if (!a) { box.innerHTML = needSaju("1년 재물운 캘린더"); bindCommon(box); return; }
    if (!(M && M.has("annualReport"))) {
      box.innerHTML = gateHtml("annualReport", "앞으로 12개월의 <b>월별 재물운</b>을 달력으로 정리해 드립니다. 돈이 붙는 달과 눌리는 달을 미리 알고 계획하세요.");
      bindCommon(box);
      return;
    }

    var o = ohaeng(a);
    var cells = monthCells(a, o);
    var best = cells.slice().sort(function (x, y) { return y.score - x.score; })[0];
    var worst = cells.slice().sort(function (x, y) { return x.score - y.score; })[0];
    var avg = Math.round(cells.reduce(function (s, c) { return s + c.score; }, 0) / cells.length);

    box.innerHTML =
      '<div class="cal-summary">' +
        '<div><span>앞으로 1년 평균 재물운</span><b>' + avg + "점</b></div>" +
        '<div><span>가장 좋은 달</span><b>' + best.y + ". " + best.m + ". · " + best.score + "점</b></div>" +
        '<div><span>조심할 달</span><b>' + worst.y + ". " + worst.m + ". · " + worst.score + "점</b></div>" +
      "</div>" +
      '<div class="cal-grid">' +
      cells.map(function (c) {
        var tone = c.score >= 78 ? "hot" : c.score >= 62 ? "mid" : "low";
        return '<div class="cal-cell ' + tone + '">' +
          '<span class="cm">' + c.m + "월" + (c.m === 1 ? " · " + c.y : "") + "</span>" +
          '<span class="cg">' + c.hanja + "</span>" +
          '<span class="cs">' + c.score + "</span>" +
          '<span class="cl">' + REL_LINE[c.rel] + "</span>" +
          "</div>";
      }).join("") +
      "</div>" +
      '<p class="hint" style="margin-top:10px">' + best.y + ". " + best.m + "월(가장 좋은 달)에는 매출·정산·계약처럼 돈이 남는 일을 몰아 두고, " +
      worst.y + ". " + worst.m + "월에는 큰 지출과 확장을 미루는 편이 좋습니다.</p>" +
      '<p class="tiny">월주(節氣 기준)와 세운으로 계산한 간이 리포트입니다. 정식 대운수(생시·성별 기준)는 제공하지 않습니다.</p>';
    bindCommon(box);
  }

  /* ───────── 4) 명당 기운 길일 (VIP) ───────── */
  function luckyDays(a) {
    var out = [];
    for (var i = 1; i <= 60; i++) {
      var d = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + i);
      var f = S.fortune(a, birthKey(), d);
      if (f.wealth >= 76) out.push({ date: d, wealth: f.wealth, rel: f.relation, gz: f.gz.name, time: f.luckyTime, dir: f.luckyDir });
    }
    out.sort(function (x, y) { return y.wealth - x.wealth || x.date - y.date; });
    return out.slice(0, 6).sort(function (x, y) { return x.date - y.date; });
  }

  function renderLucky() {
    var box = $("#luckyBody");
    if (!box) return;
    tagUpdate("luckyTag", "luckyDay", "VIP");
    var a = analysis();
    if (!a) { box.innerHTML = needSaju("명당 기운 길일"); bindCommon(box); return; }
    if (!(M && M.has("luckyDay"))) {
      box.innerHTML = gateHtml("luckyDay", "앞으로 60일 중 <b>재물운이 높은 날</b>을 골라 알려 드립니다. 행운 시간·방위까지 함께 표시합니다.");
      bindCommon(box);
      return;
    }
    var days = luckyDays(a);
    var prefOn = !!(M && M.pref("luckyDay"));
    var wd = ["일", "월", "화", "수", "목", "금", "토"];
    box.innerHTML =
      (days.length
        ? '<div class="lucky-list">' + days.map(function (d) {
            return '<div class="lucky-row">' +
              '<span class="lk-date">' + (d.date.getMonth() + 1) + "." + d.date.getDate() + '<small>' + wd[d.date.getDay()] + "</small></span>" +
              '<span class="lk-body"><b>' + d.gz + "일 · 재물운 " + d.wealth + "</b><small>행운 시간 " + d.time + " · " + d.dir + "</small></span>" +
              '<span class="lk-score">' + d.wealth + "</span>" +
              "</div>";
          }).join("") + "</div>"
        : '<p class="hint">앞으로 60일 안에 재물운 76점 이상인 날이 없습니다. 평소 루틴을 지키는 편이 좋습니다.</p>') +
      '<div class="lucky-cta">' +
        '<span>길일 알림 ' + (prefOn ? "<b>켜짐</b>" : "꺼짐") + ' <small>· 앱 출시 후 푸시로 알려 드립니다</small></span>' +
        '<button type="button" class="btn btn-ghost" id="luckyToggle" style="width:auto">' + (prefOn ? "끄기" : "켜기") + "</button>" +
      "</div>";
    var tog = $("#luckyToggle");
    if (tog) tog.addEventListener("click", function () {
      M.setPref("luckyDay", !prefOn);
      renderLucky();
    });
    bindCommon(box);
  }

  /* 공통 바인딩(사주 입력 이동 등) */
  function bindCommon(root) {
    $$("[data-goto]", root).forEach(function (b) {
      b.addEventListener("click", function () {
        var target = document.getElementById(b.getAttribute("data-goto"));
        if (!target) return;
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        if (b.getAttribute("data-goto") === "saju") {
          var f = $("#sajuForm");
          if (f && !f.hidden) { var d = $("#birthDate"); if (d) d.focus(); }
        }
      });
    });
  }

  function render() {
    TODAY = new Date();
    TODAY_DS = dkey(TODAY);
    TODAY_GZ = S.dayGanzi(TODAY);
    renderTen();
    renderDeep();
    renderCal();
    renderLucky();
  }

  global.Premium = { render: render, ohaeng: ohaeng };

  document.addEventListener("unmyeong:tier", function () {
    state.round = 0;
    render();
  });
})(window);
