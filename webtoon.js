/*! webtoon.js — 복채로또 '웹툰 점집'
 *  · 이용자 성별에 맞춘 점술사 캐릭터가 웹툰 컷처럼 등장합니다.
 *      여성 → 점집 미소년(하윤) / 남성 → 미녀 점술사(설아)
 *  · 오늘의 일진·재물운을 먼저 풀어 준 뒤, 결정적인 대목에서
 *    회원가입 → 무료회원 요금제 → VIP 순서로 자연스럽게 안내합니다.
 *  · 말풍선 타자기 연출, 자동 재생, 다음/이전 대사, 성별 즉시 전환.
 */
(function (global) {
  "use strict";

  var S = global.Saju;
  var GKEY = "unmyeong.gender.v1"; /* 이용자 성별: "male" | "female" */

  var CAST = {
    male: {
      id: "seola",
      img: "assets/teller-female.webp",
      name: "설아",
      role: "미녀 점술사",
      alt: "부채를 들고 미소 짓는 웹툰 미녀 점술사 설아"
    },
    female: {
      id: "hayun",
      img: "assets/teller-male.webp",
      name: "하윤",
      role: "점집 미소년",
      alt: "부채와 금빛 실을 든 웹툰 점집 미소년 점술사 하윤"
    }
  };

  /* 한 화면에 두 곳(본문 카드 / 크게 보기 컷)이 같은 대사를 공유합니다 */
  var VIEWS = [
    { stage: "wtStage", dots: "wtDotsInline", cta: "wtCtaInline", role: "wtRole", auto: "wtAutoInline" },
    { stage: "cutStage", dots: "cutDots", cta: "cutCta", role: "cutRole", auto: "cutAuto" }
  ];

  var state = {
    viewer: "male",
    i: 0,
    lines: [],
    cta: "",
    typing: false,
    auto: false,
    typeTimer: null,
    tickTimer: null,
    inited: false
  };

  /* ───────── 유틸 ───────── */
  function $(s) { return document.querySelector(s); }
  function byId(id) { return document.getElementById(id); }
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function load(k, d) { try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : d; } catch (e) { return d; } }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function reduced() {
    return !!(global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  function cast() { return CAST[state.viewer] || CAST.male; }
  function M() { return global.Membership; }

  function analysis() { return global.Unmyeong ? global.Unmyeong.analysis() : null; }
  function fortune() {
    if (global.Unmyeong && global.Unmyeong.fortune) return global.Unmyeong.fortune();
    return null;
  }
  /* 2027 신년 총운세 — 웹툰 대사에서 주의할 달을 짚어 주려고 계산만 합니다 */
  function annualBrief() {
    var b = global.Unmyeong && global.Unmyeong.birth ? global.Unmyeong.birth() : null;
    if (!b || !b.pillars || !S.annual) return null;
    try { return S.annual(b.pillars, state.viewer, 2027); } catch (e) { return null; }
  }
  function tierOf() { var m = M(); return m ? m.tier() : "free"; }
  function loggedIn() { var m = M(); return !!(m && m.user()); }

  /* ───────── 대사 만들기 ───────── */
  function buildLines() {
    return rawLines().map(function (x) {
      return typeof x === "string" ? { t: x } : x;
    });
  }

  function rawLines() {
    var f = fortune();
    var a = analysis();
    var tier = tierOf();
    var guest = !loggedIn();
    var L = [];

    var gz = f ? f.gz : null;
    var gzTxt = gz ? gz.hanja + "(" + gz.name + ")" : "오늘";
    var elH = gz ? S.ELEM_H[gz.branchEl] : "五";
    var wealth = f ? f.wealth : 0;
    var lucky = f && f.lucky && f.lucky.length ? f.lucky.join(", ") : "3, 8, 13";
    var time = f ? f.luckyTime : "09:30~13:29";
    var dir = f ? f.luckyDir : "남쪽";
    var ny = a ? annualBrief() : null;

    if (state.viewer === "female") {
      /* ── 점집 미소년 하윤 : 여성 이용자 ── */
      L.push("어서 오세요… 아, 죄송해요. 복채로또 손님이 이렇게 가까이 오시면 제가 점을 못 봐요.");

      if (!a) {
        L.push("생년월일만 살짝 알려주시면, 2027 신년 재물운과 오늘의 기운을 손님 사주에 맞춰 풀어 드릴게요. 세 글자면 충분해요.");
        L.push({ t: "부채 뒤로 번호가 벌써 두 개 보이는데… 지금은 비밀이에요. 먼저 사주를 알려 주세요.", cta: "birth" });
        return L;
      }

      L.push("오늘은 " + gzTxt + "일, " + elH + " 기운이 도는 날이에요. 손님 사주엔 그 기운이 딱 맞아떨어져서… 재물운 " + wealth + "점, 제법 설레는 숫자예요.");
      L.push("번호를 여쭐까요? …사실 제가 손님 몫까지 미리 봐 뒀거든요. " + lucky + "가 유난히 반짝여요. 나머지는… 비밀이에요.");

      if (tier === "vip") {
        L.push("손님은 다 열려 있어요. 10조합도, 심층 리포트도… 제가 더 보여 드릴 게 없을 정도예요.");
        if (ny) L.push("2027년 정미년 총운세도 펼쳐 뒀어요. 손님이 가장 흔들리는 달은 " + ny.caution[0].m + "월, 그 달만 넘기면 나머지는 손님 편이에요.");
        L.push({ t: "그래도 오늘 하나만 더. 행운의 시간은 " + time + ", 방위는 " + dir + ". 그때 움직이시면 기운이 두 배로 붙어요.", cta: ny ? "annual" : "numbers" });
        return L;
      }
      if (tier === "monthly" || tier === "annual") {
        L.push("2027 신년 총운세는 금전·사업·건강·연애 네 갈래로 다 열려 있어요.");
        if (ny) L.push({ t: "손님이 가장 흔들리는 달은 " + ny.caution[0].m + "월이에요. 그 달만 피해 가도 한 해가 달라져요.", cta: "annual" });
        L.push("그런데… 5조합은 매일 봐도, 10조합과 심층 리포트는 아직 반쪽이에요.");
        L.push({ t: "황금 사주 패스로 열어 두시면 매주 정밀 10조합이랑 비밀 재물운까지 제가 챙겨 드릴게요. 월 12,900원, 아니면 평생 89,000원 한 번이면 돼요.", cta: "plans" });
        return L;
      }
      if (guest) {
        L.push("그런데… 여기서부터는 제가 조금 욕심이 나네요. 이 기운, 그냥 지나치면 너무 아까운데… 회원가입만 하시면 오늘의 비책 조합 하나 더 귀띔해 드릴까요?");
        L.push({ t: "가입은 30초면 돼요. 단골이 되시면 매일 아침, 제가 손님 몫의 기운을 먼저 봐 둘게요.", cta: "signup" });
        return L;
      }
      L.push("오늘 대운이 딱 열렸는데, 반쪽만 보시게요? 아니면… 제가 다 열어 드릴까요?");
      if (ny) L.push({ t: "2027년 정미년, 손님이 가장 흔들리는 달은 " + ny.caution[0].m + "월이에요. 그 달만 넘기면 한 해가 달라져요.", cta: "annual" });
      L.push({ t: "복채 패스로 열어 두시면 광고 없이 5조합과 상세 리포트를 매일 바로 드리고, 2027 총운세 네 갈래도 전부 열려요. 월 6,900원이에요.", cta: "plans" });
      L.push("…손님한테만 말씀드리는 건데, 연간으로 하시면 2027 신년 재물운까지 열두 달을 미리 펼쳐 드려요. 월 4,917원꼴이에요.");
      return L;
    }

    /* ── 미녀 점술사 설아 : 남성 이용자 ── */
    L.push("어서 오세요, 손님. …후훗, 복채로또에서 오늘은 제가 손님을 기다리고 있었어요.");

    if (!a) {
      L.push("생년월일만 살짝 알려주시면, 2027 신년 재물운과 오늘의 기운을 손님 사주에 맞춰 풀어 드릴게요. 세 글자면 충분해요.");
      L.push({ t: "부채 뒤로 번호가 벌써 몇 개 보이는데… 지금은 비밀이에요. 먼저 사주를 알려 주세요.", cta: "birth" });
      return L;
    }

    L.push("오늘은 " + gzTxt + "일, " + elH + " 기운이 도는 날이에요. 손님 사주에 이 기운이 닿으면… 재물운 " + wealth + "점. 나쁘지 않아요.");
    L.push("제가 손님 번호를 몰래 봐 뒀는데요. " + lucky + "가 유난히 반짝이더라고요. 나머지는… 조금만 더 가까이 오시면 보여 드릴게요.");

    if (tier === "vip") {
      L.push("손님은 이미 제 단골 중의 단골이시네요. 10조합도, 심층 리포트도 다 열려 있어요.");
      if (ny) L.push("2027년 정미년 총운세도 다 펼쳐 뒀어요. 손님이 가장 흔들리는 달은 " + ny.caution[0].m + "월 — 그 달만 넘기면 나머지는 순해요.");
      L.push({ t: "그래도 오늘 하나만 더. 행운의 시간은 " + time + ", 방위는 " + dir + ". 그 시간에 움직이시면 기운이 두 배로 붙어요.", cta: ny ? "annual" : "numbers" });
      return L;
    }
    if (tier === "monthly" || tier === "annual") {
      L.push("2027 신년 총운세는 금전·사업·건강·연애 네 갈래로 다 열려 있어요.");
      if (ny) L.push({ t: "손님이 가장 흔들리는 달은 " + ny.caution[0].m + "월이에요. 그 달만 피해 가도 한 해가 달라져요.", cta: "annual" });
      L.push("그런데… 5조합은 매일 봐도, 10조합과 심층 리포트는 아직 반쪽이에요.");
      L.push({ t: "황금 사주 패스로 열어 두시면 매주 정밀 10조합이랑 비밀 재물운까지 제가 챙겨 드릴게요. 월 12,900원, 아니면 평생 89,000원 한 번이면 돼요.", cta: "plans" });
      return L;
    }
    if (guest) {
      L.push("여기서부터는 제가 목소리를 낮춰야 하는 이야기예요. 이 기운, 그냥 지나치면 너무 아까운데… 회원가입만 하시면 오늘의 비책 조합 하나 더 귀띔해 드릴까요?");
      L.push({ t: "가입은 30초면 돼요. 단골이 되시면 매일 아침, 제가 손님 몫의 기운을 먼저 봐 둘게요.", cta: "signup" });
      return L;
    }
    L.push("이제 제 단골이 되셨네요. …그런데 오늘, 황금 5조합이 딱 열렸는데 반쪽만 보시게요? 복채 패스면 매주 추첨용 5조합도 제가 따로 뽑아 두는데.");
    if (ny) L.push({ t: "2027년 정미년, 손님이 가장 흔들리는 달은 " + ny.caution[0].m + "월이에요. 그 달만 넘기면 한 해가 달라져요.", cta: "annual" });
    L.push({ t: "복채 패스로 열어 두시면 광고 없이 5조합과 상세 리포트를 매일 바로 드리고, 2027 총운세 네 갈래도 전부 열려요. 월 6,900원이에요.", cta: "plans" });
    L.push("연간으로 하시면 2027 신년 재물운까지 열두 달을 펼쳐 드려요. 월 4,917원꼴이고요. 손님한테만 먼저 귀띔해 드리는 거예요. 후훗.");
    return L;
  }

  /* ───────── 안내 버튼(회원가입 · 요금제) ───────── */
  function ctaHtml(kind) {
    var m = M();
    var tier = tierOf();
    var user = loggedIn();
    var rows = [];
    var note = "";

    function add(go, label, cls) { rows.push({ go: go, label: label, cls: cls || "btn-primary" }); }

    if (kind === "birth") {
      add("saju", "내 사주 입력하고 점사 듣기", "btn-gold");
      note = "생년월일은 이 기기 안에서만 계산·저장돼요";
    } else if (kind === "signup" && !user) {
      add("signup", "무료 회원가입하고 마저 듣기", "btn-gold");
      add("plans", "요금제 먼저 둘러보기", "btn-ghost");
      note = "가입 30초 · 계정 정보는 이 기기에만 저장";
    } else if (kind === "numbers") {
      add("numbers", "오늘의 5조합 보기", "btn-gold");
      add("plans", "내 요금제 보기", "btn-ghost");
    } else if (kind === "annual") {
      add("annual", "2027 신년 총운세 보기", "btn-gold");
      if (tier === "free") add("pay:monthly", "복채 패스로 전체 열기", "btn-ghost");
      else add("plans", "내 요금제 보기", "btn-ghost");
      note = tier === "free" ? "총운세 요약과 주의할 달 1곳은 무료로 볼 수 있어요" : "4운 전체 · 주의할 달 전체 공개 중";
    } else if (tier === "free") {
      add("pay:monthly", "복채 패스 6,900원으로 열기", "btn-gold");
      add("pay:annual", "1년 패스 59,000원 · 월 4,917원꼴", "btn-ghost");
      note = "체험 결제 모드 · 실제 청구는 없어요";
    } else if (tier === "monthly" || tier === "annual") {
      add("pay:vip_monthly", "황금 사주 패스 · 월 12,900원", "btn-gold");
      add("pay:vip_lifetime", "평생 89,000원 · 한 번만", "btn-ghost");
      note = "10조합 · 심층 리포트 · 1년 재물운까지";
    } else {
      add("numbers", "오늘의 번호 확인하기", "btn-gold");
      add("plans", "내 요금제 보기", "btn-ghost");
    }

    return '<div class="wt-cta-box">' +
      '<div class="wt-cta-btns">' + rows.map(function (r) {
        return '<button type="button" class="btn ' + r.cls + '" data-wt-go="' + r.go + '">' + esc(r.label) + "</button>";
      }).join("") + "</div>" +
      (note ? '<p class="wt-cta-note">' + esc(note) + "</p>" : "") +
      "</div>";
  }

  /* ───────── 화면 그리기 ───────── */
  function sparks() {
    var out = "";
    for (var i = 0; i < 14; i++) {
      var x = Math.round((i * 37 + 9) % 96);
      var d = (1.4 + (i % 7) * 0.62).toFixed(2);
      var dl = ((i * 53) % 60) / 10;
      var s = (0.55 + ((i * 7) % 5) * 0.22).toFixed(2);
      out += '<i class="wt-spark" style="left:' + x + "%;--d:" + d + "s;--dl:" + dl + "s;--s:" + s + '"></i>';
    }
    return out;
  }

  function paint(v) {
    var stage = byId(v.stage);
    if (!stage) return;
    var c = cast();
    stage.setAttribute("data-teller", state.viewer);
    stage.innerHTML =
      '<div class="wt-scene" aria-hidden="true">' +
        '<div class="wt-halo"></div>' +
        '<div class="wt-glyph">' + (state.viewer === "female" ? "少" : "女") + "</div>" +
        '<div class="wt-sparks">' + sparks() + "</div>" +
      "</div>" +
      '<div class="wt-bubbles" aria-live="polite"></div>' +
      '<div class="wt-char"><span class="wt-aura"></span><img src="' + c.img + '" alt="' + esc(c.alt) + '" decoding="async" /></div>' +
      '<div class="wt-plate"><b>' + esc(c.name) + "</b><span>" + esc(c.role) + "</span></div>";

    var img = stage.querySelector(".wt-char img");
    if (img) {
      var on = function () { img.classList.add("in"); };
      if (img.complete) on();
      else img.addEventListener("load", on);
    }
  }

  function renderBubbles() {
    var line = state.lines[state.i] || { t: "" };
    var prev = state.i > 0 ? state.lines[state.i - 1] : null;

    VIEWS.forEach(function (v) {
      var stage = byId(v.stage);
      if (!stage) return;
      var box = stage.querySelector(".wt-bubbles");
      if (!box) return;
      box.innerHTML =
        (prev ? '<div class="wt-bubble old"><p>' + esc(prev.t) + "</p></div>" : "") +
        '<div class="wt-bubble live"><p><span class="wt-txt"></span><i class="wt-caret"></i></p></div>';
      var live = box.querySelector(".wt-bubble.live");
      if (live) { live.classList.remove("pop"); void live.offsetWidth; live.classList.add("pop"); }
    });

    typeText(line.t || "");
  }

  function typeTargets() {
    var out = [];
    VIEWS.forEach(function (v) {
      var stage = byId(v.stage);
      if (stage) {
        var el = stage.querySelector(".wt-bubble.live .wt-txt");
        if (el) out.push(el);
      }
    });
    return out;
  }

  function setTyping(on) {
    VIEWS.forEach(function (v) {
      var stage = byId(v.stage);
      if (stage) stage.classList.toggle("typing", !!on);
    });
  }

  function typeText(text) {
    clearInterval(state.typeTimer);
    var targets = typeTargets();
    if (!targets.length) { state.typing = false; afterTyped(text); return; }

    if (reduced()) {
      targets.forEach(function (el) { el.textContent = text; });
      state.typing = false;
      setTyping(false);
      afterTyped(text);
      return;
    }

    var n = 0;
    state.typing = true;
    setTyping(true);
    targets.forEach(function (el) { el.textContent = ""; });

    state.typeTimer = setInterval(function () {
      n += 1;
      targets.forEach(function (el) { el.textContent = text.slice(0, n); });
      if (n >= text.length) {
        clearInterval(state.typeTimer);
        state.typing = false;
        setTyping(false);
        afterTyped(text);
      }
    }, 26);
  }

  function finishTyping() {
    if (!state.typing) return;
    clearInterval(state.typeTimer);
    var text = (state.lines[state.i] || {}).t || "";
    typeTargets().forEach(function (el) { el.textContent = text; });
    state.typing = false;
    setTyping(false);
    afterTyped(text);
  }

  function afterTyped(text) {
    clearTimeout(state.tickTimer);
    if (!state.auto) return;
    if (state.i >= state.lines.length - 1) return;
    var wait = 2400 + Math.min(2600, (text || "").length * 20);
    state.tickTimer = setTimeout(function () { next(); }, wait);
  }

  function renderCta() {
    var html = state.cta ? ctaHtml(state.cta) : "";
    VIEWS.forEach(function (v) {
      var box = byId(v.cta);
      if (!box) return;
      box.innerHTML = html;
      box.hidden = !html;
    });
  }

  function renderDots() {
    VIEWS.forEach(function (v) {
      var box = byId(v.dots);
      if (!box) return;
      box.innerHTML = state.lines.map(function (_, k) {
        return '<button type="button" class="wt-dot' + (k === state.i ? " on" : "") + '" data-wt-dot="' + k + '" aria-label="' + (k + 1) + '번째 대사"></button>';
      }).join("");
    });
  }

  function renderRoles() {
    var c = cast();
    var r1 = byId("wtRole");
    if (r1) r1.textContent = c.role + " · " + c.name;
    var r2 = byId("cutRole");
    if (r2) r2.textContent = c.role + " · " + c.name;
  }

  function syncAuto() {
    VIEWS.forEach(function (v) {
      var box = byId(v.auto);
      if (box) box.checked = !!state.auto;
    });
  }

  function syncGender() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-gender]"), function (b) {
      b.classList.toggle("on", b.getAttribute("data-gender") === state.viewer);
      b.setAttribute("aria-pressed", b.getAttribute("data-gender") === state.viewer ? "true" : "false");
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-teller]"), function (b) {
      var on = b.getAttribute("data-teller") === state.viewer;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function render() {
    /* 지금까지 지나온 대사 중 마지막 안내 요청을 계속 보여 줍니다 */
    state.cta = "";
    for (var k = 0; k <= state.i; k++) {
      if (state.lines[k] && state.lines[k].cta) state.cta = state.lines[k].cta;
    }
    renderRoles();
    renderBubbles();
    renderCta();
    renderDots();
  }

  function rebuild(keepIndex) {
    state.lines = buildLines();
    if (!state.lines.length) state.lines = [{ t: "" }];
    if (!keepIndex) state.i = 0;
    if (state.i > state.lines.length - 1) state.i = state.lines.length - 1;
    VIEWS.forEach(paint);
    render();
  }

  function next() {
    if (state.typing) { finishTyping(); return; }
    if (state.i < state.lines.length - 1) {
      state.i += 1;
      render();
    }
  }

  function prev() {
    clearInterval(state.typeTimer);
    clearTimeout(state.tickTimer);
    if (state.i > 0) { state.i -= 1; render(); }
    else { render(); }
  }

  function jump(i) {
    i = Math.max(0, Math.min(state.lines.length - 1, i | 0));
    state.i = i;
    render();
  }

  function setViewer(g) {
    g = g === "female" ? "female" : "male";
    if (g === state.viewer) { syncGender(); return; }
    state.viewer = g;
    store(GKEY, g);
    syncGender();
    rebuild(true);
  }

  /* ───────── 크게 보기(컷신) ───────── */
  function openCut() {
    var back = byId("cutModal");
    if (!back) return;
    rebuild(false);
    state.auto = true;
    syncAuto();
    back.classList.add("show");
    render();
    var sheet = back.querySelector(".cut-sheet");
    if (sheet) sheet.scrollTop = 0;
  }

  function closeCut() {
    var back = byId("cutModal");
    if (back) back.classList.remove("show");
    state.auto = false;
    syncAuto();
    clearTimeout(state.tickTimer);
  }

  function isCutOpen() {
    var back = byId("cutModal");
    return !!(back && back.classList.contains("show"));
  }

  /* 다른 창(회원가입·결제)이 위에 뜨면 자동 재생을 멈춥니다 */
  function pauseAuto() {
    clearTimeout(state.tickTimer);
    state.auto = false;
    syncAuto();
  }

  /* ───────── 이벤트 ───────── */
  function go(action) {
    var m = M();
    pauseAuto();
    if (action === "saju") {
      closeCut();
      var sec = byId("saju");
      if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
      var inp = byId("birthDate");
      if (inp) setTimeout(function () { try { inp.focus({ preventScroll: true }); } catch (e) {} }, 420);
      return;
    }
    if (action === "signup") { if (m) m.openAuth("signup"); return; }
    if (action === "plans") { closeCut(); if (m) m.openPlans(); return; }
    if (action === "numbers") {
      closeCut();
      var n = byId("numbers");
      if (n) n.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (action === "annual") {
      closeCut();
      var an = byId("annual");
      if (an) an.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (action.indexOf("pay:") === 0) {
      var plan = action.slice(4);
      if (m && m.PLANS[plan]) m.openPay(plan);
      return;
    }
  }

  function bind() {
    document.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.closest) return;

      var g = t.closest("[data-gender]");
      if (g) { setViewer(g.getAttribute("data-gender")); return; }

      var teller = t.closest("[data-teller]");
      if (teller) { setViewer(teller.getAttribute("data-teller")); return; }

      var opener = t.closest("[data-wt-open]");
      if (opener) { e.preventDefault(); openCut(); return; }

      var closer = t.closest("[data-wt-close]");
      if (closer) { closeCut(); return; }

      var goBtn = t.closest("[data-wt-go]");
      if (goBtn) { e.preventDefault(); go(goBtn.getAttribute("data-wt-go")); return; }

      var nx = t.closest("[data-wt-next]");
      if (nx) { next(); return; }

      var pv = t.closest("[data-wt-prev]");
      if (pv) { prev(); return; }

      var dot = t.closest("[data-wt-dot]");
      if (dot) { jump(parseInt(dot.getAttribute("data-wt-dot"), 10)); return; }

      var stage = t.closest(".wt-stage");
      if (stage) { next(); return; }
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-wt-auto]"), function (box) {
      box.addEventListener("change", function () {
        state.auto = box.checked;
        syncAuto();
        clearTimeout(state.tickTimer);
        if (state.auto && !state.typing) afterTyped((state.lines[state.i] || {}).t || "");
      });
    });

    document.addEventListener("keydown", function (e) {
      if (!isCutOpen()) return;
      if (e.key === "Escape") { closeCut(); return; }
      if (e.key === "ArrowRight" || e.key === " ") {
        if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        prev();
      }
    });

    document.addEventListener("unmyeong:tier", function () {
      rebuild(true);
      /* 등급이 바뀌면(가입·결제 직후) 새로 열린 안내 대사로 이동합니다 */
      var at = -1;
      for (var k = 0; k < state.lines.length; k++) if (state.lines[k].cta) { at = k; break; }
      if (at >= 0) jump(at);
    });

    document.addEventListener("unmyeong:saju", function () {
      rebuild(true);
      setTimeout(function () { openCut(); }, 620);
    });
  }

  function init() {
    if (state.inited) return;
    state.inited = true;
    var g = load(GKEY, "male");
    state.viewer = g === "female" ? "female" : "male";
    syncGender();
    rebuild(false);
    state.auto = false;
    syncAuto();
    bind();
  }

  /* 공개 API */
  global.Webtoon = {
    open: openCut,
    close: closeCut,
    refresh: function () { rebuild(true); },
    setViewer: setViewer,
    viewer: function () { return state.viewer; }
  };

  /* app.js가 먼저 초기화(Unmyeong 노출)된 뒤에 붙습니다 */
  function boot() { setTimeout(init, 0); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(window);
