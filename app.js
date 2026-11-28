/*! app.js — 복채로또 UI */
(function () {
  "use strict";

  var LS = {
    saju: "unmyeong.saju.v1",
    saved: "unmyeong.saved.v1",
    unlock: "unmyeong.unlock.v1",
    adbar: "unmyeong.adbar.v1",
    weekly: "unmyeong.weekly.v1"
  };

  /* 데이터를 못 받아도 앱이 동작하도록 넣어 둔 최소 회차 (동행복권 실제 결과) */
  var FALLBACK = {
    source: "동행복권 (내장 데이터)",
    latestEpsd: 1251,
    latestDate: "2026-11-21",
    draws: [
      { epsd: 1251, date: "2026-11-21", n: [14, 18, 19, 29, 40, 45], b: 1, p1: 2068843286, w1: 14 },
      { epsd: 1250, date: "2026-11-14", n: [1, 5, 18, 23, 27, 28], b: 8, p1: 3103164459, w1: 0 },
      { epsd: 1249, date: "2026-11-07", n: [2, 11, 16, 25, 34, 35], b: 14, p1: 2025045509, w1: 0 },
      { epsd: 1248, date: "2026-10-31", n: [16, 18, 27, 36, 38, 42], b: 22, p1: 1933658450, w1: 0 },
      { epsd: 1247, date: "2026-10-24", n: [8, 14, 21, 22, 42, 45], b: 24, p1: 3637439250, w1: 0 },
      { epsd: 1246, date: "2026-10-17", n: [16, 22, 23, 24, 27, 28], b: 6, p1: 1881025430, w1: 0 },
      { epsd: 1245, date: "2026-10-10", n: [4, 5, 25, 28, 32, 42], b: 12, p1: 3006515775, w1: 0 },
      { epsd: 1244, date: "2026-10-03", n: [1, 13, 18, 26, 34, 38], b: 25, p1: 1604686625, w1: 0 },
      { epsd: 1243, date: "2026-09-26", n: [9, 18, 24, 38, 43, 44], b: 35, p1: 2592525282, w1: 0 },
      { epsd: 1242, date: "2026-09-19", n: [2, 4, 10, 16, 31, 41], b: 9, p1: 3281029250, w1: 0 },
      { epsd: 1204, date: "2025-12-27", n: [8, 16, 28, 30, 31, 44], b: 27, p1: 1661007688, w1: 0 },
      { epsd: 1203, date: "2025-12-20", n: [3, 6, 18, 29, 35, 39], b: 24, p1: 1368060733, w1: 0 },
      { epsd: 1202, date: "2025-12-13", n: [5, 12, 21, 33, 37, 40], b: 7, p1: 1920410813, w1: 0 },
      { epsd: 1201, date: "2025-12-06", n: [7, 9, 24, 27, 35, 36], b: 37, p1: 1414555718, w1: 0 },
      { epsd: 1200, date: "2025-11-29", n: [1, 2, 4, 16, 20, 32], b: 45, p1: 2357299875, w1: 0 },
      { epsd: 1199, date: "2025-11-22", n: [16, 24, 25, 30, 31, 32], b: 7, p1: 1695609839, w1: 0 },
      { epsd: 1198, date: "2025-11-15", n: [26, 30, 33, 38, 39, 41], b: 21, p1: 2953686638, w1: 0 },
      { epsd: 1197, date: "2025-11-08", n: [1, 5, 7, 26, 28, 43], b: 30, p1: 2205089827, w1: 0 },
      { epsd: 1196, date: "2025-11-01", n: [8, 12, 15, 29, 40, 45], b: 14, p1: 2001627550, w1: 0 },
      { epsd: 1195, date: "2025-10-25", n: [3, 15, 27, 33, 34, 36], b: 37, p1: 2939186738, w1: 0 }
    ]
  };

  var state = {
    birth: null,        // {cal, y, m, d, leap, hour}
    saju: null,         // pillars
    analysis: null,
    data: FALLBACK,
    rec: null,
    saved: [],
    unlocked: false,
    todayKey: ""
  };

  /* ───── 유틸 ───── */
  function $(s, root) { return (root || document).querySelector(s); }
  function $$(s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); }
  function pad(n) { return String(n).padStart(2, "0"); }
  function todayKey(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function won(n) {
    if (!n) return "—";
    var eok = Math.floor(n / 100000000);
    var man = Math.floor((n % 100000000) / 10000);
    if (eok > 0) return eok + "억 " + (man ? man.toLocaleString() + "만" : "") + "원";
    return n.toLocaleString() + "원";
  }
  function ballClass(n) {
    if (n <= 10) return "b1";
    if (n <= 20) return "b2";
    if (n <= 30) return "b3";
    if (n <= 40) return "b4";
    return "b5";
  }
  function balls(nums, opts) {
    opts = opts || {};
    var html = nums.map(function (n, i) {
      return '<span class="ball ' + ballClass(n) + (opts.small ? " small" : "") + '" style="animation-delay:' + (i * 40) + 'ms">' + n + "</span>";
    }).join("");
    if (opts.bonus) html += '<span class="ball plus">+</span><span class="ball ' + ballClass(opts.bonus) + (opts.small ? " small" : "") + '">' + opts.bonus + "</span>";
    return html;
  }
  var toastTimer = null;
  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 1900);
  }
  function store(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 사생활 보호 모드 */ }
  }
  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  /* ───── 카테고리(탭) 화면 전환 ─────
     하단 내비 5개 화면과, 각 화면 안의 카테고리 칩을 show/hide로 전환합니다.
     다른 스크립트가 쓰는 scrollIntoView도 가로채서, 숨겨진 화면의 요소로 이동할 때
     그 화면과 카테고리를 먼저 열어 준 뒤 스크롤합니다. */
  var PANEL_IDS = { today: 1, saju: 1, numbers: 1, saved: 1, membership: 1 };
  var TABS = {};   /* group -> { key, view } */

  function syncNavUI(name) {
    $$(".nav a").forEach(function (a) {
      var on = a.getAttribute("data-target") === name;
      a.classList.toggle("on", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  }

  function showPanel(name, opts) {
    if (!PANEL_IDS[name]) return false;
    var found = false;
    $$("main > .panel").forEach(function (p) {
      var on = p.getAttribute("data-panel") === name;
      p.hidden = !on;
      if (on) found = true;
    });
    if (!found) return false;
    syncNavUI(name);
    document.documentElement.setAttribute("data-view", name);
    if (!opts || opts.scroll !== false) {
      window.scrollTo({ top: 0, behavior: (opts && opts.smooth) ? "smooth" : "auto" });
    }
    return true;
  }

  /* group 안에서 key(카테고리)와 view(세부 보기)를 화면에 반영합니다. */
  function setTab(group, key, view, opts) {
    var st = TABS[group] || (TABS[group] = { key: null, view: null });
    view = view || (key === st.key ? st.view : null) || null;
    if (key === "year") view = view || "total";
    st.key = key;
    if (view) st.view = view;

    var bar = $('[data-tabgroup="' + group + '"]');
    if (bar) {
      $$("[data-tab]", bar).forEach(function (b) {
        var bv = b.getAttribute("data-view");
        var on = b.getAttribute("data-tab") === key && (!bv || bv === view);
        b.classList.toggle("on", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
    }
    $$("[data-tabpane]").forEach(function (p) {
      var ref = String(p.getAttribute("data-tabpane")).split(":");
      if (ref[0] !== group) return;
      p.hidden = ref[1] !== key;
    });

    if (group === "saju" && key === "year" && window.Premium && window.Premium.setView) {
      window.Premium.setView(view || "total");
    }
    if (!opts || opts.scroll !== false) window.scrollTo({ top: 0, behavior: "auto" });
  }

  /* 요소가 숨은 화면·카테고리에 있으면 먼저 열어 줍니다. */
  function reveal(el) {
    if (!el || el.nodeType !== 1) return;
    var node = el, pane = null, panel = null, guard = 0;
    while (node && node.nodeType === 1 && guard++ < 24) {
      if (!pane && node.hasAttribute("data-tabpane")) pane = node;
      if (!panel && node.hasAttribute("data-panel")) panel = node;
      node = node.parentElement;
    }
    if (pane) {
      var ref = String(pane.getAttribute("data-tabpane")).split(":");
      var view = pane.getAttribute("data-tabview") || null;
      if (ref[1] === "year" && !view) view = (TABS.saju && TABS.saju.view) || "total";
      setTab(ref[0], ref[1], view, { scroll: false });
    }
    if (panel) showPanel(panel.getAttribute("data-panel"), { scroll: false });
  }

  /* 기존 코드의 el.scrollIntoView(...) 호출을 그대로 살리면서 화면도 함께 전환 */
  var nativeScrollIntoView = Element.prototype.scrollIntoView;
  if (nativeScrollIntoView) {
    Element.prototype.scrollIntoView = function (arg) {
      try { reveal(this); } catch (e) { /* 무시 */ }
      return nativeScrollIntoView.call(this, arg);
    };
  }

  function goHash() {
    var id = String(location.hash || "").replace(/^#/, "");
    if (!id) return false;
    var el = document.getElementById(id);
    if (!el) return false;
    reveal(el);
    el.scrollIntoView({ behavior: "auto", block: "start" });
    return true;
  }

  function bindNav() {
    $$(".nav a").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        var name = a.getAttribute("data-target");
        showPanel(name, { smooth: false });
        if (history.replaceState) history.replaceState(null, "", a.getAttribute("href") || ("#" + name));
      });
    });
    $$("[data-tabgroup]").forEach(function (bar) {
      var group = bar.getAttribute("data-tabgroup");
      $$("[data-tab]", bar).forEach(function (b) {
        b.addEventListener("click", function () {
          setTab(group, b.getAttribute("data-tab"), b.getAttribute("data-view") || null, { scroll: false });
          var panel = bar.parentElement;
          if (panel && panel.classList.contains("panel")) {
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
        });
      });
    });
    var top = $('.foot a[href="#today"]');
    if (top) top.addEventListener("click", function (e) { e.preventDefault(); showPanel("today"); });
    window.addEventListener("hashchange", goHash);
  }

  /* ───── 오늘의 기운 ───── */
  function renderToday() {
    var now = new Date();
    var days = ["일", "월", "화", "수", "목", "금", "토"];
    var lunar = window.LunarCal ? window.LunarCal.solarToLunar(now.getFullYear(), now.getMonth() + 1, now.getDate()) : null;
    var lunarTxt = lunar ? "음력 " + lunar.month + "월 " + lunar.day + "일" + (lunar.leap ? "(윤)" : "") : "";
    $("#todayDate").textContent = now.getFullYear() + "년 " + (now.getMonth() + 1) + "월 " + now.getDate() + "일 " + days[now.getDay()] + "요일" + (lunarTxt ? " · " + lunarTxt : "");

    var f = Saju.fortune(state.analysis, state.birth ? state.birth.key : "", now);
    state.f = f;
    $("#todayGz").innerHTML = f.gz.hanja + "<small>" + f.gz.name + "일 · " + f.gz.animal + "날</small>";
    $("#todayElLine").innerHTML = "오늘의 기운 <b class='el-" + f.gz.branchEl + "'>" + Saju.ELEM_H[f.gz.branchEl] + " · " + Saju.ELEM_H[f.gz.stemEl] + "</b> · " + f.relText;
    $("#gaugeVal").textContent = f.wealth;
    var arc = $("#gaugeArc");
    var len = 264;
    arc.setAttribute("stroke-dashoffset", len);
    requestAnimationFrame(function () {
      arc.style.transition = "stroke-dashoffset .9s cubic-bezier(.2,.7,.3,1)";
      arc.setAttribute("stroke-dashoffset", String(Math.round(len - len * f.wealth / 100)));
    });
    $("#todayNote").innerHTML = f.guide;

    var chips = [
      "<span class='chip'><span class='dot'></span>행운 숫자 <b>" + f.lucky.join(" · ") + "</b></span>",
      "<span class='chip'>행운 시간 <b>" + f.luckyTime + "</b></span>",
      "<span class='chip'>행운 방위 <b>" + f.luckyDir + "</b></span>"
    ];
    if (state.analysis) {
      chips.push("<span class='chip'>부족 오행 <b class='el-" + state.analysis.lacking[0] + "'>" + Saju.ELEM_H[state.analysis.lacking[0]] + " " + state.analysis.lacking[0] + "</b> 보완</span>");
    }
    $("#todayChips").innerHTML = chips.join("");
  }

  /* ───── 사주 ───── */
  function buildBirth(cal, y, m, d, leap, hour) {
    var solarY = y, solarM = m, solarD = d;
    if (cal === "lunar" && window.LunarCal) {
      var dt = window.LunarCal.lunarToSolar(y, m, d, leap);
      if (!dt) return null;
      solarY = dt.getFullYear(); solarM = dt.getMonth() + 1; solarD = dt.getDate();
    }
    var p = Saju.pillars(solarY, solarM, solarD, hour, 0);
    var key = solarY + "-" + pad(solarM) + "-" + pad(solarD) + "-" + (hour === null ? "x" : hour);
    return {
      cal: cal, y: y, m: m, d: d, leap: !!leap, hour: hour,
      solarY: solarY, solarM: solarM, solarD: solarD,
      pillars: p, key: key
    };
  }

  function renderSaju() {
    if (!state.birth) {
      $("#sajuForm").hidden = false;
      $("#sajuResult").hidden = true;
      $("#numbersFor").textContent = "사주 미입력";
      return;
    }
    var b = state.birth, p = b.pillars, a = state.analysis;
    $("#sajuForm").hidden = true;
    $("#sajuResult").hidden = false;
    $("#numbersFor").textContent = b.solarM + "월 " + b.solarD + "일생";

    $("#pillars").innerHTML = p.pillars.map(function (pl) {
      if (pl.stem === null) {
        return '<div class="pillar unknown"><div class="pl">' + pl.label + '</div><div class="ch">모름</div><div class="el">시주 제외</div></div>';
      }
      var se = Saju.STEM_EL[pl.stem], be = Saju.BRANCH_EL[pl.branch];
      return '<div class="pillar">' +
        '<div class="pl">' + pl.label + "</div>" +
        '<div class="ch"><span class="el-' + se + '">' + Saju.STEMS[pl.stem] + '</span><span class="el-' + be + '">' + Saju.BRANCHES[pl.branch] + "</span>" +
        '<span class="h">' + Saju.STEMS_H[pl.stem] + Saju.BRANCHES_H[pl.branch] + "</span></div>" +
        '<div class="el el-' + be + '">' + Saju.ELEM_H[se] + "·" + Saju.ELEM_H[be] + "</div></div>";
    }).join("");

    var solarTxt = b.cal === "lunar" ? "음력 " + b.m + "월 " + b.d + "일" + (b.leap ? "(윤)" : "") + " → 양력 " + b.solarY + "." + b.solarM + "." + b.solarD : b.solarY + "년 " + b.solarM + "월 " + b.solarD + "일";
    $("#sajuSummary").innerHTML = "<b>" + solarTxt + "</b> · " + (b.hour === null ? "시간 모름" : Saju.HOUR_LABEL[Math.floor(((b.hour * 60 + 30) % 1440) / 120)]) + "생<br>" +
      "일간은 <b class='el-" + a.dayEl + "'>" + a.dayStemName + " " + Saju.ELEM_H[a.dayEl] + "(" + a.dayEl + ")</b>, " + a.yinyang + "의 기운입니다. " + p.animal + "띠 · " + p.term + " 절기생.";

    var badges = [
      "<span class='chip'>부족 <b class='el-" + a.lacking[0] + "'>" + Saju.ELEM_H[a.lacking[0]] + " " + a.lacking[0] + "</b></span>",
      "<span class='chip'>강한 <b class='el-" + a.strongest[0] + "'>" + Saju.ELEM_H[a.strongest[0]] + " " + a.strongest[0] + "</b></span>",
      "<span class='chip'>보완색 <b>" + (Saju.ELEM_COLOR ? "" : "") + ({ 목: "청록", 화: "붉은색", 토: "노란색", 금: "흰·금색", 수: "검정·남색" })[a.lacking[0]] + "</b></span>",
      "<span class='chip'>보완 방위 <b>" + ({ 목: "동쪽", 화: "남쪽", 토: "중앙", 금: "서쪽", 수: "북쪽" })[a.lacking[0]] + "</b></span>"
    ];
    $("#sajuBadges").innerHTML = badges.join("");

    var max = Math.max.apply(null, Saju.ELEMS.map(function (e) { return a.counts[e]; })) || 1;
    $("#sajuBalance").innerHTML = Saju.ELEMS.map(function (e) {
      var c = a.counts[e];
      var lack = a.lacking.indexOf(e) >= 0;
      return '<div class="bal-row ' + (lack ? "lack" : "") + '">' +
        '<div class="lbl">' + Saju.ELEM_H[e] + "</div>" +
        '<div class="bal-bar"><i style="width:' + Math.round(c / max * 100) + "%;background:" + Saju.ELEM_COLOR[e] + '"></i></div>' +
        '<div class="num">' + c + "/" + a.total + "</div></div>";
    }).join("");
  }

  /* ───── 번호 카드 ───── */
  function saveCombo(combo) {
    var limit = window.Membership ? window.Membership.saveLimit() : 0;
    if (limit && state.saved.length >= limit) {
      toast("내 번호는 " + limit + "개까지 저장됩니다 · 멤버십에서 늘릴 수 있어요");
      return false;
    }
    var nums = combo.nums.slice();
    var exists = state.saved.some(function (s) { return s.nums.join(",") === nums.join(","); });
    if (exists) { toast("이미 저장한 조합입니다"); return false; }
    state.saved.unshift({ id: Date.now() + "-" + Math.floor(Math.random() * 999), nums: nums, title: combo.title, at: new Date().toISOString() });
    store(LS.saved, state.saved);
    renderSaved();
    toast("내 번호에 저장했습니다");
    return true;
  }

  function comboCard(combo, i, gold) {
    var q = combo.q;
    var reasons = Saju.reasonLines(combo, state.analysis);
    var id = "why-" + (gold ? "g" : "f") + i;
    return '<div class="combo ' + (gold ? "gold" : "") + '">' +
      '<div class="combo-head">' +
      '<span class="idx">' + (gold ? (i + 1) + "호" : "기본") + "</span>" +
      '<span class="name">' + combo.title + "</span>" +
      '<span class="save"><button type="button" class="icon-btn" data-save="' + (gold ? "g" : "f") + i + '">저장</button></span>' +
      "</div>" +
      '<div class="balls">' + balls(combo.nums) + "</div>" +
      '<div class="combo-meta"><span>합계 <b>' + q.sum + "</b></span><span>홀:짝 <b>" + q.odd + ":" + q.even + "</b></span><span>구간 <b>" + q.bands + "/5</b></span></div>" +
      '<details class="why" id="' + id + '"><summary>왜 이 번호일까?</summary><ul>' +
      reasons.map(function (r) { return "<li><b>" + pad(r.n) + "</b> — " + r.text + "</li>"; }).join("") +
      "</ul><p class='hint' style='margin-top:6px'>" + combo.desc + "</p></details>" +
      "</div>";
  }

  function renderNumbers() {
    var now = new Date();
    var rec = Saju.recommend(state.analysis, state.birth ? state.birth.key : "", now, state.data.draws);
    state.rec = rec;
    $("#comboFree").innerHTML = comboCard(rec.free, 0, false);

    /* 월간 이상이면 광고 없이 즉시 열립니다 */
    var paid = !!(window.Membership && window.Membership.has("goldInstant"));
    var unlocked = paid || state.unlocked;
    $("#comboLock").hidden = unlocked;
    $("#comboPaid").hidden = !unlocked;
    if (unlocked) {
      $("#comboPaid").innerHTML = reportHtml(rec) +
        '<div class="card-head" style="margin:18px 0 10px"><span class="hanja">五</span><h2 style="font-size:15px">황금 5조합</h2><span class="rule"></span></div>' +
        rec.combos.map(function (c, i) { return comboCard(c, i, true); }).join("");
    }
    bindSaveButtons();
    renderWeekly();
  }

  function reportHtml(rec) {
    var f = rec.fortune, a = state.analysis;
    var h = Saju.hash(f.dateKey + "|rep");
    var work = Math.max(40, Math.min(97, f.score + (h % 13) - 6));
    var love = Math.max(40, Math.min(97, f.score + ((h >> 5) % 15) - 8));
    var lack = a ? a.lacking[0] : f.todayEl;
    var lackH = Saju.ELEM_H[lack];
    var relLine = {
      receives: "오늘의 기운이 내 편에 서는 날입니다. 먼저 움직이는 쪽이 이깁니다.",
      gives: "내 기운이 밖으로 흐르는 날입니다. 베푼 만큼 늦게 돌아오니 아끼지 마세요.",
      controls: "재물의 자리를 내가 쥐는 날입니다. 다만 판을 키우기보다 한 번에 확실히 챙기세요.",
      controlled: "기운이 눌리는 날입니다. 큰 결정은 미루고 정리와 확인에 집중하세요.",
      same: "기운이 겹쳐 강해지는 날입니다. 자신감은 좋지만 독단은 금물입니다.",
      neutral: "잔잔하게 흐르는 날입니다. 하던 일을 이어가기에 좋습니다."
    }[f.relation];

    var moneyLine = {
      receives: "들어오는 자리가 열려 있습니다. 미뤄둔 정산·청구를 오늘 처리하면 좋습니다.",
      gives: "나가는 지출이 늘기 쉬운 날입니다. 결제 전 장바구니를 하루 묵혀 두세요.",
      controls: "재물운이 가장 좋은 흐름입니다. 판매·계약처럼 이익이 남는 일을 오전에 배치하세요.",
      controlled: "큰 지출과 투자는 피하세요. 현금 흐름을 확인하는 것으로 만족하는 게 좋습니다.",
      same: "벌이와 씀씀이가 같이 커집니다. 수입의 10%는 먼저 떼어 두세요.",
      neutral: "무난한 흐름입니다. 고정 지출을 점검하기 좋은 날입니다."
    }[f.relation];

    var scores = [
      { k: "총운", v: f.score }, { k: "재물운", v: f.wealth },
      { k: "일·사업운", v: work }, { k: "관계운", v: love }
    ];

    return '<div class="combo gold" style="padding:15px 14px">' +
      '<div class="combo-head"><span class="idx">리포트</span><span class="name">오늘의 상세 사주 풀이</span></div>' +
      '<div style="font-size:12.5px;color:var(--meok-2);line-height:1.75">' +
      "<p style='margin:0 0 8px'>오늘은 <b>" + f.gz.hanja + "(" + f.gz.name + ")</b>일, <b class='el-" + f.todayEl + "'>" + Saju.ELEM_H[f.todayEl] + "(" + f.todayEl + ")</b> 기운이 도는 날입니다. " + relLine + "</p>" +
      "<p style='margin:0 0 8px'><b>재물</b> — " + moneyLine + "</p>" +
      "<p style='margin:0 0 8px'><b>보완</b> — 부족한 <b class='el-" + lack + "'>" + lackH + "(" + lack + ")</b> 기운을 채우면 흐름이 부드러워집니다. " + (a ? ({ 목: "아침에 창을 열고 새 일을 먼저 꺼내세요.", 화: "사람을 만나 이야기하고 알리세요.", 토: "숫자를 정리하고 저축·계약을 확인하세요.", 금: "미룬 결제와 마무리를 끝내세요.", 수: "이동하고 묻고 살펴보세요." })[lack] : "생년월일을 넣으면 더 정확해집니다.") + "</p>" +
      "<p style='margin:0'><b>주의</b> — " + f.caution + "</p></div>" +
      '<div class="balance" style="margin-top:13px">' + scores.map(function (s) {
        return '<div class="bal-row"><div class="lbl" style="width:56px">' + s.k + "</div>" +
          '<div class="bal-bar"><i style="width:' + s.v + '%;background:linear-gradient(90deg,#E7C87A,#C9972C)"></i></div>' +
          '<div class="num">' + s.v + "</div></div>";
      }).join("") + "</div>" +
      '<div class="combo-meta" style="margin-top:10px"><span>행운 시간 <b>' + f.luckyTime + "</b></span><span>방위 <b>" + f.luckyDir + "</b></span><span>색 <b>" + f.luckyColor + "</b></span><span>숫자 <b>" + f.lucky.join("·") + "</b></span></div>" +
      "</div>";
  }

  function bindSaveButtons() {
    $$("[data-save]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-save");
        var combo;
        if (id.charAt(0) === "f") combo = state.rec.free;
        else combo = state.rec.combos[parseInt(id.slice(1), 10)];
        if (saveCombo(combo)) {
          btn.classList.add("saved");
          btn.textContent = "저장됨";
        }
      });
    });
  }


  /* ───── 이번 주 내 복채 5조합 (복채 패스 이상 자동 발급) ───── */
  function nextDrawDate(now) {
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var add = (6 - d.getDay() + 7) % 7;                 // 이번 주 토요일까지 남은 날
    if (add === 0 && now.getHours() >= 20) add = 7;      // 토요일 20시 추첨 이후면 다음 주
    d.setDate(d.getDate() + add);
    return d;
  }

  function weekInfo() {
    var now = new Date();
    var target = nextDrawDate(now);
    var latest = (state.data && state.data.draws && state.data.draws[0]) || null;
    var round = latest ? latest.epsd : 0;
    if (latest) {
      var base = new Date(latest.date + "T00:00:00");
      var weeks = Math.round((target.getTime() - base.getTime()) / 604800000);
      round = latest.epsd + Math.max(1, weeks);
    }
    var midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var dday = Math.round((target.getTime() - midnight.getTime()) / 86400000);
    return { round: round, date: target, key: todayKey(target), dday: dday, latest: latest };
  }

  function weekOwner() {
    var M = window.Membership;
    var u = M && M.user ? M.user() : null;
    return u && u.email ? u.email : "guest";
  }

  /* 회차별로 한 번 만든 조합을 그대로 보관합니다 (같은 주에는 같은 조합 · 사주를 바꾸면 새로 발급) */
  function weekRecord() {
    if (!state.birth || !state.analysis) return null;
    var info = weekInfo();
    if (!info.round) return null;
    var bag = load(LS.weekly, {}) || {};
    var ownerBag = bag[weekOwner()] || {};
    var wkKey = state.birth.key + "|weekly";   /* 일일 황금 5조합과 겹치지 않는 주간 전용 씨앗 */
    var rec = ownerBag[info.round];
    if (rec && rec.birthKey === wkKey && rec.combos && rec.combos.length === 5) return rec;

    var seedDate = new Date(info.date.getTime());
    seedDate.setHours(12, 0, 0, 0);
    var gen = Saju.recommend(state.analysis, wkKey, seedDate, (state.data && state.data.draws) || []);
    rec = {
      round: info.round,
      date: info.key,
      birthKey: wkKey,
      combos: gen.combos.slice(0, 5).map(function (c) {
        return { id: c.id, title: c.title, nums: c.nums, tags: c.tags, q: c.q, desc: c.desc };
      }),
      issuedAt: new Date().toISOString()
    };
    ownerBag[info.round] = rec;
    /* 최근 20회차만 남깁니다 */
    Object.keys(ownerBag).map(Number).sort(function (a, b) { return b - a; })
      .slice(20).forEach(function (r) { delete ownerBag[r]; });
    bag[weekOwner()] = ownerBag;
    store(LS.weekly, bag);
    return rec;
  }

  function weekCard(combo, i) {
    var q = combo.q || Saju.quality(combo.nums);
    var reasons = Saju.reasonLines(combo, state.analysis);
    return '<div class="combo gold week-combo">' +
      '<div class="combo-head">' +
        '<span class="idx">' + (i + 1) + "호</span>" +
        '<span class="name">' + combo.title + "</span>" +
        '<span class="save"><button type="button" class="icon-btn" data-week="' + i + '">저장</button></span>' +
      "</div>" +
      '<div class="balls">' + balls(combo.nums) + "</div>" +
      '<div class="combo-meta"><span>합계 <b>' + q.sum + "</b></span><span>홀:짝 <b>" + q.odd + ":" + q.even + "</b></span><span>구간 <b>" + q.bands + "/5</b></span></div>" +
      '<details class="why"><summary>왜 이 번호일까?</summary><ul>' +
        reasons.map(function (r) { return "<li><b>" + pad(r.n) + "</b> — " + r.text + "</li>"; }).join("") +
      "</ul><p class='hint' style='margin-top:6px'>" + (combo.desc || "") + "</p></details>" +
      "</div>";
  }

  function bindWeek(root) {
    $$("[data-week]", root).forEach(function (btn) {
      if (btn._weekBound) return;
      btn._weekBound = true;
      btn.addEventListener("click", function () {
        var rec = weekRecord();
        if (!rec) return;
        var i = parseInt(btn.getAttribute("data-week"), 10);
        var c = rec.combos[i];
        if (c && saveCombo({ nums: c.nums.slice(), title: "이번 주 복채 " + (i + 1) + "호" })) {
          btn.classList.add("saved");
          btn.textContent = "저장됨";
        }
      });
    });
    var toSaju = $("[data-week-saju]", root);
    if (toSaju) toSaju.addEventListener("click", function () {
      var el = $("#saju");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    var toTen = $("[data-week-ten]", root);
    if (toTen) toTen.addEventListener("click", function () {
      var el = $("#tencombos");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function renderWeekly() {
    var body = $("#weeklyBody");
    if (!body) return;
    var M = window.Membership;
    var paid = !!(M && M.has("weekly5"));
    var t = M ? M.tier() : "free";
    var info = weekInfo();
    var tag = $("#weeklyRound");
    if (tag) tag.textContent = paid ? ((M && M.TIER_NAME && M.TIER_NAME[t]) || "복채 패스") : "복채 패스";

    if (!paid) {
      body.innerHTML =
        '<div class="lock-soft">' +
          '<div class="lock-ico" aria-hidden="true">🧧</div>' +
          "<h3>복채 패스 회원 전용</h3>" +
          "<p>월 6,900원 <b>복채 패스</b>부터 매주 토요일 추첨 회차 기준 <b>복채 5조합</b>이 자동으로 발급됩니다. 회차별 보관함에 그대로 남아 다음 주에도 다시 열어 볼 수 있습니다.</p>" +
          '<div class="ghost-row">' + new Array(7).join('<span class="ball small ghost">?</span>') + "</div>" +
          '<button type="button" class="btn btn-gold" data-open-plans style="margin-top:12px">복채 패스 보고 열기</button>' +
          '<p class="tiny">베타 테스트 모드에서는 ‘체험 결제’를 누르면 바로 발급됩니다. 실제 청구는 없습니다.</p>' +
        "</div>";
      return;
    }

    if (!state.birth) {
      body.innerHTML =
        '<div class="lock-soft">' +
          '<div class="lock-ico" aria-hidden="true">🀄</div>' +
          "<h3>사주를 먼저 입력해 주세요</h3>" +
          "<p>생년월일을 넣으면 이번 주 " + (info.round ? info.round + "회" : "") + " 추첨용 복채 5조합을 내 사주·오행으로 만들어 드립니다.</p>" +
          '<button type="button" class="btn btn-ghost" data-week-saju>내 사주 입력하러 가기</button>' +
        "</div>";
      bindWeek(body);
      return;
    }

    var rec = weekRecord();
    if (!rec) { body.innerHTML = '<div class="empty">이번 주 조합을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.</div>'; return; }

    var when = info.date.getFullYear() + ". " + (info.date.getMonth() + 1) + ". " + info.date.getDate() + ". 토요일 추첨";
    var dd = info.dday <= 0 ? "오늘 추첨" : "D-" + info.dday;
    var issued = new Date(rec.issuedAt);
    var issuedTxt = issued.getFullYear() + ". " + pad(issued.getMonth() + 1) + ". " + pad(issued.getDate()) + " 발급";

    body.innerHTML =
      '<div class="week-top">' +
        '<div class="week-round"><b>' + rec.round + "회</b><span>" + when + " · " + dd + "</span></div>" +
        '<span class="week-badge">매주 자동 발급</span>' +
      "</div>" +
      '<p class="hint" style="margin:0 0 10px">내 사주·오행과 최근 회차 통계로 <b>이번 회차용</b>으로 만든 복채 5조합입니다. 회차마다 고정 보관되어 다시 열어도 같은 조합이 나옵니다.</p>' +
      '<div class="week-list">' + rec.combos.map(function (c, i) { return weekCard(c, i); }).join("") + "</div>" +
      '<p class="week-note">' + issuedTxt + " · 저장한 조합은 추첨 후 자동으로 대조합니다. 당첨을 보장하지 않습니다.</p>" +
      (t === "vip"
        ? '<div class="week-vip"><b>황금 사주 패스</b>는 이번 주 <b>정밀 10조합</b>(고정수·제외수 필터)도 매주 열립니다.<button type="button" class="btn btn-ghost" data-week-ten>이번 주 정밀 10조합 보기</button></div>'
        : "");
    bindWeek(body);
  }

  /* ───── 최신 회차 ───── */
  function renderLatest() {
    var d = state.data;
    var latest = d.draws[0];
    if (!latest) { $("#latestDraw").innerHTML = '<div class="empty">회차 정보가 없습니다.</div>'; return; }
    $("#latestDraw").innerHTML =
      '<div class="draw-head"><div class="epsd">' + latest.epsd + '회<small>당첨번호</small></div><div class="date">' + latest.date.replace(/-/g, ".") + "</div></div>" +
      '<div class="balls draw-balls">' + balls(latest.n, { bonus: latest.b }) + "</div>" +
      '<div class="prize"><div><span>1등 당첨금</span><b>' + won(latest.p1) + "</b></div>" +
      "<div><span>1등 당첨자</span><b>" + (latest.w1 ? latest.w1 + "명" : "집계 전") + "</b></div></div>";

    $("#pastList").innerHTML = d.draws.slice(1, 11).map(function (r) {
      return '<div class="past-row"><span class="r">' + r.epsd + "회</span><span class='b'>" + r.n.map(pad).join(" · ") + '</span><span class="bb">+' + pad(r.b) + "</span></div>";
    }).join("");

    var upd = d.updatedAt ? new Date(d.updatedAt) : null;
    $("#dataMeta").textContent = "출처: " + (d.source || "동행복권") + " · 최근 " + d.draws.length + "회" + (upd ? " · 갱신 " + upd.getFullYear() + "." + pad(upd.getMonth() + 1) + "." + pad(upd.getDate()) : "") + " · 매주 토요일 자동 갱신";
  }

  /* ───── 저장한 번호 ───── */
  function savedDate(item) {
    var d = new Date(item.at);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  /* 저장한 날 이후에 추첨된 회차와만 대조한다 (그 전 회차는 내 번호가 아니다) */
  function drawsAfter(item) {
    var from = savedDate(item);
    return state.data.draws.filter(function (d) { return d.date > from; });
  }
  function bestRank(item) {
    var best = null;
    drawsAfter(item).forEach(function (draw) {
      var r = Saju.winRank(item.nums, draw);
      if (r && r.rank > 0 && (!best || r.rank < best.rank)) best = Object.assign({}, r, { epsd: draw.epsd });
    });
    return best;
  }

  function renderSaved() {
    $("#savedCount").textContent = state.saved.length + "조합";
    if (!state.saved.length) {
      $("#savedList").innerHTML = '<div class="empty">마음에 드는 조합을 저장해 보세요. 저장한 번호는 최신 회차와 자동으로 대조합니다.</div>';
      return;
    }
    $("#savedList").innerHTML = state.saved.map(function (s) {
      var br = bestRank(s);
      var dt = new Date(s.at);
      var when = pad(dt.getMonth() + 1) + "." + pad(dt.getDate());
      var checked = drawsAfter(s).length > 0;
      var badge = br ? '<span class="rank win">' + br.epsd + "회 " + br.label + "</span>"
        : '<span class="rank">' + (checked ? "낙첨" : "발표 전") + "</span>";
      return '<div class="saved-item"><span class="when">' + when + "</span>" +
        '<span class="nums">' + s.nums.map(pad).join(" · ") + "</span>" + badge +
        '<button class="del" data-del="' + s.id + '" aria-label="삭제">×</button></div>';
    }).join("");
    $$("[data-del]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-del");
        state.saved = state.saved.filter(function (s) { return s.id !== id; });
        store(LS.saved, state.saved);
        renderSaved();
        toast("삭제했습니다");
      });
    });
  }

  /* ───── 보상형 광고(모의) ───── */
  var adTimer = null;
  function openAd() {
    var modal = $("#adModal");
    modal.classList.add("show");
    var sec = 3, total = 3;
    $("#adSec").textContent = sec;
    $("#adDone").disabled = true;
    $("#adDone").textContent = "광고 시청 중…";
    var arc = $("#adArc");
    arc.setAttribute("stroke-dashoffset", "0");
    clearInterval(adTimer);
    adTimer = setInterval(function () {
      sec -= 1;
      arc.style.transition = "stroke-dashoffset 1s linear";
      arc.setAttribute("stroke-dashoffset", String(258 * (1 - sec / total)));
      if (sec <= 0) {
        clearInterval(adTimer);
        $("#adDone").disabled = false;
        $("#adDone").textContent = "5조합 · 리포트 열기";
        $("#adSec").textContent = "✓";
        $("#adTitle").textContent = "복채를 받았습니다";
        $("#adDesc").textContent = "오늘의 황금 5조합과 상세 사주 리포트가 열렸습니다.";
      } else {
        $("#adSec").textContent = sec;
      }
    }, 1000);
  }
  function closeAd() {
    clearInterval(adTimer);
    $("#adModal").classList.remove("show");
    $("#adTitle").textContent = "복채를 받는 중";
    $("#adDesc").textContent = "짧은 광고가 끝나면 오늘의 황금 5조합과 상세 사주 리포트가 열립니다.";
  }
  function unlock() {
    state.unlocked = true;
    store(LS.unlock, { date: state.todayKey });
    renderNumbers();
    document.dispatchEvent(new CustomEvent("unmyeong:unlocked"));
    toast("5조합과 리포트가 열렸습니다");
    var el = $("#numbers");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ───── 초기화 ───── */
  function initHourSelect() {
    var sel = $("#birthHour");
    var ranges = ["23:30~01:29", "01:30~03:29", "03:30~05:29", "05:30~07:29", "07:30~09:29", "09:30~11:29", "11:30~13:29", "13:30~15:29", "15:30~17:29", "17:30~19:29", "19:30~21:29", "21:30~23:29"];
    var html = '<option value="">모름</option>';
    Saju.HOUR_LABEL.forEach(function (h, i) {
      html += '<option value="' + (i * 2) + '">' + h + " (" + ranges[i] + ")</option>";
    });
    sel.innerHTML = html;
  }

  function readForm() {
    var dateVal = $("#birthDate").value;
    if (!dateVal) { toast("생년월일을 선택해 주세요"); return; }
    var parts = dateVal.split("-").map(Number);
    var cal = $(".seg button.on").getAttribute("data-cal");
    var leap = cal === "lunar" && $("#leapChk") && $("#leapChk").checked;
    var hourVal = $("#birthHour").value;
    var hour = hourVal === "" ? null : parseInt(hourVal, 10);
    var birth = buildBirth(cal, parts[0], parts[1], parts[2], leap, hour);
    if (!birth) { toast("음력 날짜를 확인해 주세요 (윤달 여부 포함)"); return; }

    state.birth = birth;
    state.saju = birth.pillars;
    state.analysis = Saju.analyze(birth.pillars);
    store(LS.saju, {
      cal: cal, y: parts[0], m: parts[1], d: parts[2], leap: leap, hour: hour
    });
    renderSaju();
    renderToday();
    renderNumbers();
    if (window.Premium) window.Premium.render();
    $("#sajuResult").scrollIntoView({ behavior: "smooth", block: "center" });
    document.dispatchEvent(new CustomEvent("unmyeong:saju"));
  }

  function restoreSaju(saved) {
    if (!saved) return;
    var birth = buildBirth(saved.cal, saved.y, saved.m, saved.d, saved.leap, saved.hour);
    if (!birth) return;
    state.birth = birth;
    state.saju = birth.pillars;
    state.analysis = Saju.analyze(birth.pillars);
    $("#birthDate").value = saved.y + "-" + pad(saved.m) + "-" + pad(saved.d);
    $("#birthHour").value = saved.hour === null ? "" : String(saved.hour);
    if (saved.cal === "lunar") {
      $$(".seg button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-cal") === "lunar"); });
      if ($("#leapChk")) $("#leapChk").checked = !!saved.leap;
    }
  }

  function bind() {
    $$(".seg button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        $$(".seg button").forEach(function (b) { b.classList.remove("on"); });
        btn.classList.add("on");
        var lunar = btn.getAttribute("data-cal") === "lunar";
        $("#leapRow").hidden = !lunar;
        $("#calHint").textContent = lunar ? "음력으로 입력합니다. 윤달생이면 ‘윤달’에 체크하세요." : "양력(현재 달력) 기준으로 입력합니다.";
      });
    });

    $("#sajuForm").addEventListener("submit", function (e) {
      e.preventDefault();
      readForm();
    });

    $("#sajuEdit").addEventListener("click", function () {
      $("#sajuForm").hidden = false;
      $("#sajuResult").hidden = true;
      $("#sajuForm").scrollIntoView({ behavior: "smooth", block: "center" });
    });

    $("#unlockBtn").addEventListener("click", openAd);
    $("#adDone").addEventListener("click", function () {
      closeAd();
      unlock();
    });
    $("#adCancel").addEventListener("click", closeAd);
    $("#adModal").addEventListener("click", function (e) {
      if (e.target === $("#adModal")) closeAd();
    });

    $("#checkBtn").addEventListener("click", function () {
      var latest = state.data.draws[0];
      if (!state.saved.length) { toast("먼저 번호를 저장해 주세요"); return; }
      if (!latest) return;
      var pending = state.saved.filter(function (s) { return !drawsAfter(s).length; });
      var checked = state.saved.filter(function (s) { return drawsAfter(s).length; });
      var winners = checked.filter(function (s) { return Saju.winRank(s.nums, latest).rank > 0; });
      if (!checked.length) toast("저장한 번호는 다음 추첨(토요일) 후에 확인할 수 있습니다");
      else if (winners.length) toast(latest.epsd + "회 기준 " + winners.length + "조합 당첨!");
      else toast(latest.epsd + "회 기준 당첨 조합이 없습니다" + (pending.length ? " · 발표 전 " + pending.length + "조합" : ""));
      renderSaved();
    });

    $("#clearBtn").addEventListener("click", function () {
      if (!state.saved.length) { toast("저장한 번호가 없습니다"); return; }
      if (!confirm("저장한 번호를 모두 지울까요?")) return;
      state.saved = [];
      store(LS.saved, state.saved);
      renderSaved();
      toast("모두 삭제했습니다");
    });

    $("#adClose").addEventListener("click", function () {
      $("#adbar").style.display = "none";
      try { sessionStorage.setItem(LS.adbar, "1"); } catch (e) {}
    });

    bindNav();
  }

  function loadData() {
    return fetch("lotto.json", { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (d) {
        if (!d || !d.draws || !d.draws.length) throw new Error("empty");
        state.data = d;
      })
      .catch(function () {
        state.data = FALLBACK;
        $("#dataMeta").textContent = "출처: 내장 데이터 (동행복권 최근 회차) · 서버 데이터를 불러오지 못했습니다";
      });
  }

  /* ───── 등급(멤버십) 연동 ───── */
  function renderTierUI() {
    var paid = !!(window.Membership && window.Membership.has("noAds"));
    var bar = $("#adbar");
    if (bar) {
      if (paid) {
        bar.style.display = "none";
      } else {
        var closed = false;
        try { closed = sessionStorage.getItem(LS.adbar) === "1"; } catch (e) {}
        bar.style.display = closed ? "none" : "";
      }
    }
    document.body.classList.toggle("vip-theme", !!(window.Membership && window.Membership.has("vipTheme")));
  }

  document.addEventListener("unmyeong:tier", function () {
    renderTierUI();
    renderNumbers();
    renderWeekly();
    renderSaved();
    if (window.Premium) window.Premium.render();
  });

  document.addEventListener("unmyeong:savecombo", function (e) {
    var d = e.detail || {};
    if (d.nums && d.nums.length === 6) saveCombo({ nums: d.nums.slice(), title: d.title || "VIP 10조합" });
  });

  /* 다른 스크립트(멤버십·프리미엄)가 사주 결과를 읽을 수 있게 노출 */
  window.Unmyeong = {
    analysis: function () { return state.analysis; },
    draws: function () { return (state.data && state.data.draws) || []; },
    birthKey: function () { return state.birth ? state.birth.key : ""; },
    birth: function () { return state.birth; },
    fortune: function () { return state.f || null; }
  };

  /* 다른 스크립트(VIP 10조합 등)가 이번 주 회차를 같은 씨앗으로 쓸 수 있게 노출 */
  window.Weekly = {
    info: function () { var i = weekInfo(); return { round: i.round, date: i.key, dday: i.dday }; },
    roundKey: function () { return weekInfo().key; },
    current: function () { return (window.Membership && window.Membership.has("weekly5")) ? weekRecord() : null; },
    render: renderWeekly
  };

  document.addEventListener("DOMContentLoaded", function () {
    state.todayKey = todayKey();
    initHourSelect();

    state.saved = load(LS.saved, []) || [];
    var savedSaju = load(LS.saju, null);
    var unlockRec = load(LS.unlock, null);
    state.unlocked = !!(unlockRec && unlockRec.date === state.todayKey);

    if (savedSaju) restoreSaju(savedSaju);

    renderToday();
    renderSaju();
    renderSaved();
    renderLatest();
    renderNumbers();
    bind();

    /* 첫 화면: 주소에 섹션 해시가 있으면 그 화면을, 없으면 오늘의 기운 */
    showPanel("today", { scroll: false });
    if (location.hash) goHash();

    try {
      if (sessionStorage.getItem(LS.adbar) === "1") $("#adbar").style.display = "none";
    } catch (e) {}

    renderTierUI();
    if (window.Premium) window.Premium.render();

    loadData().then(function () {
      renderLatest();
      renderNumbers();
      renderSaved();
      if (window.Premium) window.Premium.render();
    });

    if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
      navigator.serviceWorker.register("./sw.js").catch(function () {});
    }
  });
})();
