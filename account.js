/*! account.js — 회원·구독(요금제) 엔진 + 멤버십 UI
 *
 *  ⚠ 베타/테스트 결제 모드
 *  · 지금은 서버 없이 이 기기(localStorage)에만 계정·구독 상태를 저장합니다. 실제 금액은 청구되지 않습니다.
 *  · 정식 출시 시 교체 지점 (아래 어댑터만 바꾸면 UI는 그대로 씁니다)
 *      1) 인증         : Supabase Auth / Firebase Auth  → Auth.signUp, Auth.signIn, Auth.signOut
 *      2) 구독 상태     : Supabase/Firebase 테이블(entitlements) → Billing.fetchSubscription()
 *      3) 결제          : Google Play Billing (앱) / 스토어 웹 결제 → Billing.purchase(planId)
 *      4) 영수증 검증    : 서버에서 Google Play Developer API로 purchaseToken 검증 후 등급 부여
 */
(function (global) {
  "use strict";

  var K = {
    users: "unmyeong.users.v1",
    session: "unmyeong.session.v1",
    subs: "unmyeong.subs.v1",
    prefs: "unmyeong.prefs.v1",
    saved: "unmyeong.saved.v1"
  };

  /* ───────── 요금제 정의 (서버 상품 ID와 1:1로 맞출 것) ───────── */
  var PLANS = {
    monthly: {
      id: "monthly", tier: "monthly", name: "월간 회원", hanja: "月",
      price: 2900, unit: "원 / 월", cycle: "1개월 자동갱신", months: 1, autoRenew: true, badge: "",
      features: [
        "배너·보상형 광고 완전 제거",
        "매일 사주 황금 5조합 무제한 즉시 확인",
        "내 번호 저장 최대 30개",
        "매주 토요일 당첨 알림 (설정)"
      ]
    },
    annual: {
      id: "annual", tier: "annual", name: "연간 회원", hanja: "年",
      price: 24900, unit: "원 / 년", cycle: "월 2,075원꼴 · 약 28% 할인", months: 12, autoRenew: true, badge: "인기",
      features: [
        "월간 혜택 전체",
        "내 번호 무제한 저장",
        "1년 대운·월별 재물운 캘린더 리포트"
      ]
    },
    vip_monthly: {
      id: "vip_monthly", tier: "vip", name: "VIP 회원", hanja: "貴",
      price: 4900, unit: "원 / 월", cycle: "1개월 자동갱신", months: 1, autoRenew: true, badge: "VIP",
      features: [
        "연간 혜택 전체",
        "1:1 맞춤 사주 오행 심층 리포트 (용신·희신)",
        "특별 10조합 생성 (고정수·제외수 필터)",
        "명당 기운 길일 알림 · VIP 금박 테마"
      ]
    },
    vip_lifetime: {
      id: "vip_lifetime", tier: "vip", name: "VIP 평생", hanja: "永",
      price: 49000, unit: "원 / 1회", cycle: "평생 이용 · 자동갱신 없음", months: 0, autoRenew: false, badge: "VIP",
      features: [
        "VIP 혜택 전체를 평생 이용",
        "추가 결제·자동갱신 없음",
        "1회 결제로 영구 사용"
      ]
    }
  };

  /* 등급별 실제 기능 권한 — 화면 잠금은 모두 이 표를 기준으로 판단합니다 */
  var FEATURES = {
    free:    { noAds: false, goldInstant: false, saveLimit: 5, weeklyAlert: false, annualReport: false, deepReport: false, tenCombos: false, filters: false, vipTheme: false, luckyDay: false },
    monthly: { noAds: true,  goldInstant: true,  saveLimit: 30, weeklyAlert: true, annualReport: false, deepReport: false, tenCombos: false, filters: false, vipTheme: false, luckyDay: false },
    annual:  { noAds: true,  goldInstant: true,  saveLimit: 0,  weeklyAlert: true, annualReport: true,  deepReport: false, tenCombos: false, filters: false, vipTheme: false, luckyDay: false },
    vip:     { noAds: true,  goldInstant: true,  saveLimit: 0,  weeklyAlert: true, annualReport: true,  deepReport: true,  tenCombos: true,  filters: true,  vipTheme: true,  luckyDay: true }
  };

  var TIER_NAME = { free: "무료 회원", monthly: "월간 회원", annual: "연간 회원", vip: "VIP 회원" };
  var TIER_GATE = { noAds: "월간", goldInstant: "월간", weeklyAlert: "월간", annualReport: "연간", deepReport: "VIP", tenCombos: "VIP", filters: "VIP", luckyDay: "VIP", vipTheme: "VIP" };

  /* ───────── 저장소 ───────── */
  function load(k, d) {
    try {
      var raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : d;
    } catch (e) { return d; }
  }
  function save(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 사생활 보호 모드 */ }
  }
  function $(s, root) { return (root || document).querySelector(s); }
  function $$(s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function won(n) { return Number(n || 0).toLocaleString("ko-KR"); }
  function fmtDate(v) {
    if (!v) return "—";
    var d = new Date(v);
    return d.getFullYear() + ". " + (d.getMonth() + 1) + ". " + d.getDate() + ".";
  }
  function addMonths(date, n) {
    var d = new Date(date.getTime());
    var day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return d;
  }
  function randId(n) {
    var a = "abcdefghijklmnopqrstuvwxyz0123456789", s = "";
    for (var i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)];
    return s;
  }
  function toast(msg) {
    var t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }

  /* 비밀번호는 평문으로 저장하지 않고 기기 안에서 소금+SHA-256으로만 저장합니다 */
  function hashPass(pass, salt) {
    var text = salt + "::" + pass;
    if (global.crypto && global.crypto.subtle && global.TextEncoder) {
      return global.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) {
          return ("0" + b.toString(16)).slice(-2);
        }).join("");
      });
    }
    var h = 2166136261 >>> 0;
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return Promise.resolve("fallback-" + (h >>> 0).toString(16));
  }

  /* ───────── 계정 ───────── */
  function users() { return load(K.users, {}) || {}; }
  function session() { return load(K.session, null); }
  function currentUser() {
    var s = session();
    if (!s) return null;
    return users()[s.email] || null;
  }
  function displayName() {
    var u = currentUser();
    if (!u) return "";
    return u.nick || String(u.email).split("@")[0];
  }
  function prefsAll() { return load(K.prefs, {}) || {}; }
  function prefs() {
    var s = session();
    if (!s) return {};
    return prefsAll()[s.email] || {};
  }
  function setPref(key, val) {
    var s = session();
    if (!s) return;
    var all = prefsAll();
    all[s.email] = all[s.email] || {};
    all[s.email][key] = val;
    save(K.prefs, all);
  }

  /* ───────── 구독 ───────── */
  function subsAll() { return load(K.subs, {}) || {}; }
  function rawSub() {
    var s = session();
    if (!s) return null;
    return subsAll()[s.email] || null;
  }
  /* 자동갱신 구독이 만료일을 지나면 다음 주기로 넘깁니다(테스트 모드 시뮬레이션) */
  function rollRenewals() {
    var s = session();
    if (!s) return;
    var all = subsAll(), sub = all[s.email];
    if (!sub || !sub.autoRenew || !sub.expiresAt) return;
    var plan = PLANS[sub.plan];
    if (!plan || !plan.months) return;
    var guard = 0, changed = false;
    while (new Date(sub.expiresAt).getTime() < Date.now() && guard++ < 36) {
      sub.expiresAt = addMonths(new Date(sub.expiresAt), plan.months).toISOString();
      sub.renewals = (sub.renewals || 0) + 1;
      sub.lastRenewedAt = new Date().toISOString();
      changed = true;
    }
    if (changed) { all[s.email] = sub; save(K.subs, all); }
  }
  function activeSub() {
    var sub = rawSub();
    if (!sub) return null;
    if (sub.expiresAt && new Date(sub.expiresAt).getTime() < Date.now()) return null;
    return sub;
  }
  function tier() {
    var sub = activeSub();
    return sub ? sub.tier : "free";
  }
  function has(feature) {
    var f = FEATURES[tier()] || FEATURES.free;
    return !!f[feature];
  }
  function saveLimit() {
    var f = FEATURES[tier()] || FEATURES.free;
    return f.saveLimit; // 0 = 무제한
  }
  function limitText() {
    var n = saveLimit();
    return n ? n + "개" : "무제한";
  }

  /* ───────── 결제 어댑터 ─────────
     ↓↓ 정식 출시 시 이 객체만 스토어/서버 호출로 바꾸면 됩니다. */
  var Billing = {
    mode: "test",
    /* 실제 구현 예: playBilling.purchase(productId) → purchaseToken → 서버 검증 → entitlement 반환 */
    purchase: function (plan) {
      var s = session();
      if (!s) return Promise.reject(new Error("no-session"));
      var now = new Date();
      var sub = {
        plan: plan.id,
        tier: plan.tier,
        name: plan.name,
        price: plan.price,
        currency: "KRW",
        startedAt: now.toISOString(),
        expiresAt: plan.months ? addMonths(now, plan.months).toISOString() : null,
        autoRenew: !!plan.autoRenew,
        mode: "test",
        renewals: 0,
        orderId: "TEST-" + randId(10).toUpperCase()
      };
      var all = subsAll();
      all[s.email] = sub;
      save(K.subs, all);
      return Promise.resolve(sub);
    },
    cancel: function () {
      var s = session();
      if (!s) return false;
      var all = subsAll(), sub = all[s.email];
      if (!sub) return false;
      sub.autoRenew = false;
      sub.canceledAt = new Date().toISOString();
      all[s.email] = sub;
      save(K.subs, all);
      return true;
    },
    resume: function () {
      var s = session();
      if (!s) return false;
      var all = subsAll(), sub = all[s.email];
      if (!sub || !PLANS[sub.plan] || !PLANS[sub.plan].autoRenew) return false;
      sub.autoRenew = true;
      delete sub.canceledAt;
      all[s.email] = sub;
      save(K.subs, all);
      return true;
    },
    reset: function () {
      var s = session();
      if (!s) return;
      var all = subsAll();
      delete all[s.email];
      save(K.subs, all);
    }
  };

  /* ───────── 모달 제어 ───────── */
  function openModal(id) {
    var m = document.getElementById(id);
    if (m) m.classList.add("show");
  }
  function closeModal(id) {
    var m = document.getElementById(id);
    if (m) m.classList.remove("show");
  }
  function closeAll() {
    $$(".modal-back.show").forEach(function (m) { m.classList.remove("show"); });
  }

  /* ───────── 상단 계정 칩 ───────── */
  function renderChip() {
    var label = $("#acctLabel"), dot = $("#acctDot");
    var u = currentUser(), t = tier();
    if (!label) return;
    label.textContent = u ? displayName() : "로그인";
    if (dot) {
      dot.className = "acct-dot" + (t === "free" ? "" : " paid tier-" + t);
    }
    var btn = $("#acctBtn");
    if (btn) {
      btn.classList.toggle("on", !!u);
      btn.setAttribute("aria-label", u ? displayName() + " · " + TIER_NAME[t] + " · 내 정보 열기" : "로그인 · 회원가입");
    }
    document.body.classList.toggle("is-member", t !== "free");
    document.body.classList.toggle("vip-theme", has("vipTheme"));
  }

  /* ───────── 번호 카드 위 등급 표시 ───────── */
  function renderMemberBar() {
    var el = $("#memberBar");
    if (!el) return;
    var t = tier();
    if (t === "free") { el.hidden = true; el.innerHTML = ""; return; }
    el.hidden = false;
    el.className = "member-bar tier-" + t;
    el.innerHTML =
      '<span class="mb-badge">' + TIER_NAME[t] + "</span>" +
      "<span>" + (t === "vip" ? "광고 없이 10조합·심층 리포트까지 모두 열려 있습니다." : "광고 없이 오늘의 황금 5조합과 리포트가 바로 열립니다.") + "</span>";
  }

  /* ───────── 요금제 카드 ───────── */
  var vipChoice = "vip_monthly";

  function planCard(plan, opts) {
    opts = opts || {};
    var isNow = opts.now;
    var btn;
    if (plan.id === "free") {
      btn = currentUser() && tier() !== "free"
        ? '<button type="button" class="btn btn-ghost" data-downgrade="1">무료로 전환 (테스트)</button>'
        : '<button type="button" class="btn btn-ghost" data-free="1">' + (currentUser() ? "현재 등급" : "무료로 시작") + "</button>";
    } else {
      btn = '<button type="button" class="btn ' + (plan.tier === "vip" ? "btn-gold" : "btn-primary") + '" data-buy="' + plan.id + '">' +
        (isNow ? "이용 중 · 기간 연장 (테스트)" : plan.name.replace(" 회원", "") + " 체험 결제 (테스트)") + "</button>";
    }
    return '<div class="plan plan-' + plan.tier + (isNow ? " now" : "") + '" data-plan="' + plan.id + '">' +
      '<div class="plan-top">' +
        '<span class="plan-name"><i aria-hidden="true">' + plan.hanja + "</i>" + plan.name + "</span>" +
        (plan.badge ? '<span class="plan-badge badge-' + (plan.tier === "vip" ? "vip" : "popular") + '">' + plan.badge + "</span>" : "") +
        (isNow ? '<span class="plan-now">이용 중</span>' : "") +
      "</div>" +
      '<div class="plan-price"><b>' + won(plan.price) + "</b><small>" + plan.unit + "</small><em>" + plan.cycle + "</em></div>" +
      '<ul class="plan-feats">' + plan.features.map(function (f) { return "<li>" + f + "</li>"; }).join("") + "</ul>" +
      btn +
      "</div>";
  }

  function vipCard() {
    var plan = PLANS[vipChoice];
    var isNow = tier() === "vip";
    return '<div class="plan plan-vip' + (isNow ? " now" : "") + '" data-plan="vip">' +
      '<div class="plan-top">' +
        '<span class="plan-name"><i aria-hidden="true">' + plan.hanja + "</i>VIP 회원</span>" +
        '<span class="plan-badge badge-vip">VIP</span>' +
        (isNow ? '<span class="plan-now">이용 중</span>' : "") +
      "</div>" +
      '<div class="seg seg-vip" role="group" aria-label="VIP 결제 방식 선택">' +
        '<button type="button" data-vip="vip_monthly" class="' + (vipChoice === "vip_monthly" ? "on" : "") + '">월 4,900원</button>' +
        '<button type="button" data-vip="vip_lifetime" class="' + (vipChoice === "vip_lifetime" ? "on" : "") + '">평생 49,000원</button>' +
      "</div>" +
      '<div class="plan-price"><b>' + won(plan.price) + '</b><small>' + plan.unit + "</small><em>" + plan.cycle + "</em></div>" +
      '<ul class="plan-feats">' + plan.features.map(function (f) { return "<li>" + f + "</li>"; }).join("") + "</ul>" +
      '<button type="button" class="btn btn-gold" data-buy="' + plan.id + '">' +
        (isNow ? (plan.months ? "이용 중 · 기간 연장 (테스트)" : "이용 중 (평생)") : "VIP 체험 결제 (테스트)") + "</button>" +
      "</div>";
  }

  function renderPlans() {
    var box = $("#planList");
    if (!box) return;
    var t = tier();
    var free = {
      id: "free", tier: "free", name: "무료 회원", hanja: "無",
      price: 0, unit: "원", cycle: "평생 무료 · 광고 포함", badge: "",
      features: [
        "오늘의 재물운 요약 · 행운 숫자",
        "사주 추천 1조합",
        "보상형 광고(3초) 보고 황금 5조합",
        "내 번호 저장 5개 · 배너 광고 노출"
      ]
    };
    box.innerHTML =
      planCard(free, { now: t === "free" }) +
      planCard(PLANS.monthly, { now: rawSub() && rawSub().plan === "monthly" }) +
      planCard(PLANS.annual, { now: rawSub() && rawSub().plan === "annual" }) +
      vipCard();

    var tierNow = $("#tierNow");
    if (tierNow) tierNow.textContent = TIER_NAME[t] + (t === "free" ? "" : " · 이용 중");

    $$("[data-vip]", box).forEach(function (b) {
      b.addEventListener("click", function () {
        vipChoice = b.getAttribute("data-vip");
        renderPlans();
      });
    });
    $$("[data-buy]", box).forEach(function (b) {
      b.addEventListener("click", function () { openPay(b.getAttribute("data-buy")); });
    });
    var dg = $("[data-downgrade]", box);
    if (dg) dg.addEventListener("click", function () {
      if (!confirm("테스트 모드에서 구독을 취소하고 무료 회원으로 돌아갑니다.\n저장한 번호는 그대로 남습니다. 계속할까요?")) return;
      Billing.reset();
      emit();
      toast("무료 회원으로 전환했습니다");
    });
    var fb = $("[data-free]", box);
    if (fb) fb.addEventListener("click", function () {
      if (!currentUser()) { openAuth("signup"); return; }
      toast("이미 무료 회원입니다. 마음에 드는 요금제를 골라 주세요");
    });
  }

  /* ───────── 내 정보(마이페이지) ───────── */
  function toggleRow(id, label, desc, checked, disabled) {
    return '<label class="set-row' + (disabled ? " off" : "") + '">' +
      '<span class="set-txt"><b>' + label + "</b><small>" + desc + "</small></span>" +
      '<span class="switch"><input type="checkbox" id="' + id + '"' + (checked ? " checked" : "") + (disabled ? " disabled" : "") + ' /><i></i></span>' +
      "</label>";
  }

  function renderMy() {
    var body = $("#myBody");
    if (!body) return;
    var u = currentUser();

    if (!u) {
      body.innerHTML =
        '<div class="my-guest">' +
          '<p>로그인하면 요금제를 고르고 구독을 관리할 수 있습니다.<br />가입은 이메일 또는 소셜 테스트 계정으로 30초면 됩니다.</p>' +
          '<button type="button" class="btn btn-primary" data-my="signup">회원가입</button>' +
          '<button type="button" class="btn btn-ghost" data-my="login" style="margin-top:8px">로그인</button>' +
        "</div>" +
        '<p class="tiny center">베타 테스트 모드 · 계정과 구독 정보는 이 기기에만 저장됩니다.</p>' +
        '<div class="btn-row" style="margin-top:10px"><button type="button" class="btn btn-ghost" data-my="plans">요금제 보기</button></div>';
      bindMy();
      return;
    }

    var sub = rawSub(), t = tier();
    var saved = load(K.saved, []) || [];
    var limit = saveLimit();
    var p = prefs();

    var stateLine = "";
    if (sub && t !== "free") {
      if (!sub.expiresAt) {
        stateLine = '<div class="kv"><span>이용 기간</span><b>평생 이용 · 자동갱신 없음</b></div>';
      } else if (sub.autoRenew) {
        stateLine = '<div class="kv"><span>다음 결제 예정</span><b>' + fmtDate(sub.expiresAt) + " · " + won(sub.price) + "원</b></div>";
      } else {
        stateLine = '<div class="kv"><span>이용 만료일</span><b>' + fmtDate(sub.expiresAt) + " · 자동갱신 해지됨</b></div>";
      }
      stateLine += '<div class="kv"><span>결제 방식</span><b>테스트 결제 (' + (sub.orderId || "-") + ")</b></div>";
    } else {
      stateLine = '<div class="kv"><span>구독 상태</span><b>구독 없음 (무료 회원)</b></div>';
    }

    var actions = "";
    var renewing = !!(sub && PLANS[sub.plan] && PLANS[sub.plan].months);
    if (sub && t !== "free" && renewing) {
      if (sub.autoRenew) {
        actions = '<button type="button" class="btn btn-ghost" data-my="cancel">구독 해지</button>';
      } else {
        actions = '<button type="button" class="btn btn-ghost" data-my="resume">해지 철회</button>';
      }
    }

    body.innerHTML =
      '<div class="who">' +
        '<span class="who-avatar">' + esc((displayName() || "?").slice(0, 1)) + "</span>" +
        '<span class="who-txt"><b>' + esc(displayName()) + "</b><small>" + esc(u.email) + " · 가입 " + fmtDate(u.createdAt) + "</small></span>" +
        '<span class="tier-pill tier-' + t + '">' + TIER_NAME[t] + "</span>" +
      "</div>" +
      '<div class="kv-list">' + stateLine +
        '<div class="kv"><span>내 번호 저장</span><b>' + saved.length + " / " + (limit ? limit + "개" : "무제한") + "</b></div>" +
      "</div>" +
      (t === "free"
        ? '<button type="button" class="btn btn-primary" data-my="plans" style="margin:12px 0 4px">멤버십 보고 광고 없이 쓰기</button>'
        : '<button type="button" class="btn btn-ghost" data-my="plans" style="margin:12px 0 4px">요금제 변경 · 연장</button>') +
      '<div class="card-head" style="margin:16px 0 6px"><span class="hanja">告</span><h2 style="font-size:14px">알림 설정</h2><span class="rule"></span></div>' +
      toggleRow("prefWeekly", "매주 토요일 당첨 알림", has("weeklyAlert") ? "토요일 추첨 후 내 번호 결과를 알려 드립니다 (앱 출시 후 푸시)" : "월간 회원부터 사용할 수 있습니다", !!p.weekly, !has("weeklyAlert")) +
      toggleRow("prefLucky", "명당 기운 길일 알림", has("luckyDay") ? "재물운이 높은 날을 미리 알려 드립니다 (VIP)" : "VIP 회원 전용입니다", !!p.luckyDay, !has("luckyDay")) +
      (actions ? '<div class="btn-row" style="margin-top:12px">' + actions + "</div>" : "") +
      '<div class="btn-row" style="margin-top:8px">' +
        '<button type="button" class="btn btn-ghost" data-my="signout">로그아웃</button>' +
        '<button type="button" class="btn btn-ghost" data-my="delete">회원 탈퇴</button>' +
      "</div>" +
      '<p class="tiny center" style="margin-top:12px">베타 테스트 모드 · 실제 결제·본인인증 없음. 구독 해지 시 현재 기간 만료일까지 그대로 이용됩니다.</p>';

    bindMy();
  }

  function bindMy() {
    $$("[data-my]").forEach(function (b) {
      b.addEventListener("click", function () {
        var act = b.getAttribute("data-my");
        if (act === "signup") { closeModal("myModal"); openAuth("signup"); }
        else if (act === "login") { closeModal("myModal"); openAuth("login"); }
        else if (act === "plans") { closeModal("myModal"); openPlans(); }
        else if (act === "cancel") {
          if (!confirm("자동갱신을 해지합니다.\n지금 결제한 기간의 만료일까지는 그대로 이용할 수 있고, 다음 결제는 청구되지 않습니다. 계속할까요?")) return;
          Billing.cancel();
          renderMy(); emit();
          toast("자동갱신을 해지했습니다 · 만료일까지 이용 가능");
        } else if (act === "resume") {
          Billing.resume();
          renderMy(); emit();
          toast("자동갱신을 다시 켰습니다");
        } else if (act === "signout") {
          save(K.session, null);
          closeModal("myModal");
          emit();
          toast("로그아웃했습니다");
        } else if (act === "delete") {
          if (!confirm("이 기기의 계정·구독 정보와 알림 설정을 지웁니다.\n사주와 저장한 번호는 그대로 남습니다. 계속할까요?")) return;
          var s = session();
          if (s) {
            var all = users(); delete all[s.email]; save(K.users, all);
            Billing.reset();
            var pa = prefsAll(); delete pa[s.email]; save(K.prefs, pa);
          }
          save(K.session, null);
          closeModal("myModal");
          emit();
          toast("계정을 삭제했습니다");
        }
      });
    });
    var pw = $("#prefWeekly"), pl = $("#prefLucky");
    if (pw && !pw.disabled) pw.addEventListener("change", function () { setPref("weekly", pw.checked); toast(pw.checked ? "토요일 당첨 알림을 켰습니다" : "토요일 당첨 알림을 껐습니다"); });
    if (pl && !pl.disabled) pl.addEventListener("change", function () { setPref("luckyDay", pl.checked); toast(pl.checked ? "길일 알림을 켰습니다" : "길일 알림을 껐습니다"); });
  }

  /* ───────── 체험 결제 ───────── */
  function ensureDemoAccount() {
    if (currentUser()) return currentUser();
    var all = users();
    var email = "guest-" + randId(6) + "@unmyeong.test";
    var user = {
      email: email, nick: "체험회원", provider: "demo",
      createdAt: new Date().toISOString(), birth: "", salt: null, pass: null
    };
    all[email] = user;
    save(K.users, all);
    save(K.session, { email: email, at: new Date().toISOString() });
    return user;
  }

  function openPay(planId) {
    var plan = PLANS[planId];
    if (!plan) return;
    var u = currentUser();
    var now = new Date();
    var end = plan.months ? addMonths(now, plan.months) : null;
    var body = $("#payBody");
    body.innerHTML =
      '<div class="pay-head"><span class="pay-name">' + plan.name + "</span>" +
        '<span class="pay-price"><b>' + won(plan.price) + "</b>원" + (plan.months === 12 ? " / 년" : plan.months === 1 ? " / 월" : " / 1회") + "</span></div>" +
      '<div class="kv-list">' +
        '<div class="kv"><span>결제 주기</span><b>' + plan.cycle + "</b></div>" +
        (end ? '<div class="kv"><span>이용 기간</span><b>' + fmtDate(now.toISOString()) + " ~ " + fmtDate(end.toISOString()) + "</b></div>"
             : '<div class="kv"><span>이용 기간</span><b>평생 (자동갱신 없음)</b></div>') +
        '<div class="kv"><span>계정</span><b>' + (u ? esc(displayName()) + " · " + esc(u.email) : "체험 계정 자동 생성 (기기 저장)") + "</b></div>" +
        '<div class="kv"><span>결제 수단</span><b>테스트 결제 · 실제 청구 없음</b></div>' +
      "</div>" +
      '<p class="tiny" style="text-align:left;margin-top:10px">청약철회: 결제 후 7일 이내 콘텐츠를 이용하지 않았다면 전액 환불됩니다. 열람을 시작한 뒤에는 디지털 콘텐츠 특성상 환불이 제한될 수 있습니다. 자동갱신 구독은 다음 결제 24시간 전까지 해지하면 다음 회차가 청구되지 않습니다.</p>' +
      '<button type="button" class="btn btn-gold" id="payGo" style="margin-top:10px">테스트 결제하고 시작하기</button>' +
      '<button type="button" class="btn btn-ghost" id="payCancel" style="margin-top:8px">취소</button>';
    openModal("payModal");

    $("#payCancel").addEventListener("click", function () { closeModal("payModal"); });
    $("#payGo").addEventListener("click", function () {
      var created = !currentUser();
      if (created) ensureDemoAccount();
      Billing.purchase(plan).then(function () {
        closeModal("payModal");
        emit();
        renderMy();
        toast(plan.name + " 체험 결제 완료 · 광고가 사라지고 기능이 열렸습니다" + (created ? " (체험 계정 생성)" : ""));
      });
    });
  }

  /* ───────── 회원가입 · 로그인 ───────── */
  function setAuthTab(mode) {
    $$("#authTabs button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-auth-tab") === mode); });
    var lf = $("#loginForm"), sf = $("#signupForm");
    if (lf) lf.hidden = mode !== "login";
    if (sf) sf.hidden = mode !== "signup";
    var err1 = $("#loginErr"), err2 = $("#signupErr");
    if (err1) err1.hidden = true;
    if (err2) err2.hidden = true;
  }
  function openAuth(mode) {
    setAuthTab(mode || "login");
    openModal("authModal");
    setTimeout(function () {
      var f = mode === "signup" ? $("#suNick") : $("#loginEmail");
      if (f) f.focus();
    }, 60);
  }
  function formErr(el, msg) {
    if (!el) { toast(msg); return; }
    el.textContent = msg;
    el.hidden = false;
  }
  function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }

  function afterLogin(birth) {
    emit();
    renderMy();
    var u = currentUser();
    toast((displayName() || "회원") + "님, 환영합니다");
    if (birth) linkBirth(birth);
    else if (!u || !u.birth) { /* 사주는 기존 입력값 유지 */ }
  }

  /* 가입 시 받은 생년월일을 사주 입력 폼에 연결하고 계산까지 실행 */
  function linkBirth(dateStr) {
    var input = $("#birthDate");
    var form = $("#sajuForm");
    if (!input || !form || !dateStr) return;
    input.value = dateStr;
    $$(".seg button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-cal") === "solar"); });
    var leap = $("#leapRow"); if (leap) leap.hidden = true;
    var btn = $("#sajuSubmit");
    if (form.requestSubmit) form.requestSubmit();
    else if (btn) btn.click();
    setTimeout(function () {
      var el = $("#saju");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 380);
  }

  function signUp(e) {
    e.preventDefault();
    var nick = $("#suNick").value.trim();
    var email = $("#suEmail").value.trim().toLowerCase();
    var pass = $("#suPass").value;
    var birth = $("#suBirth").value;
    var link = $("#suLink").checked && !!birth;
    var agree = $("#suAgree").checked;
    var err = $("#signupErr");
    if (nick.length < 2) return formErr(err, "닉네임을 2자 이상 입력해 주세요.");
    if (!validEmail(email)) return formErr(err, "이메일 형식을 확인해 주세요.");
    if (pass.length < 6) return formErr(err, "비밀번호는 6자 이상이어야 합니다.");
    if (!agree) return formErr(err, "이용약관·개인정보 동의가 필요합니다.");
    var all = users();
    if (all[email]) return formErr(err, "이미 가입된 이메일입니다. 로그인 탭에서 로그인해 주세요.");

    var salt = randId(16);
    hashPass(pass, salt).then(function (hash) {
      all = users();
      all[email] = {
        email: email, nick: nick, salt: salt, pass: hash, provider: "email",
        birth: birth || "", createdAt: new Date().toISOString()
      };
      save(K.users, all);
      save(K.session, { email: email, at: new Date().toISOString() });
      closeModal("authModal");
      $("#signupForm").reset();
      afterLogin(link ? birth : null);
    });
  }

  function signIn(e) {
    e.preventDefault();
    var email = $("#loginEmail").value.trim().toLowerCase();
    var pass = $("#loginPass").value;
    var err = $("#loginErr");
    var all = users();
    var u = all[email];
    if (!u) return formErr(err, "가입된 이메일이 없습니다. 회원가입 탭을 이용해 주세요.");
    if (u.provider && u.provider !== "email") return formErr(err, "이 계정은 소셜 테스트 계정입니다. 아래 소셜 버튼으로 로그인해 주세요.");
    hashPass(pass, u.salt || "").then(function (hash) {
      if (hash !== u.pass) return formErr(err, "비밀번호가 맞지 않습니다.");
      save(K.session, { email: email, at: new Date().toISOString() });
      closeModal("authModal");
      $("#loginForm").reset();
      afterLogin(u.birth || null);
    });
  }

  function socialLogin(provider) {
    var email = provider + ".demo@unmyeong.test";
    var all = users();
    if (!all[email]) {
      all[email] = {
        email: email,
        nick: provider === "kakao" ? "카카오 테스트" : "구글 테스트",
        provider: provider, salt: null, pass: null, birth: "",
        createdAt: new Date().toISOString()
      };
      save(K.users, all);
    }
    save(K.session, { email: email, at: new Date().toISOString() });
    closeModal("authModal");
    afterLogin(null);
    toast("소셜 테스트 계정으로 로그인했습니다 · 실제 OAuth 연동 예정");
  }

  /* ───────── 렌더 총괄 ───────── */
  function renderAll() {
    renderChip();
    renderMemberBar();
    renderPlans();
    var hint = $("#savedLimitHint");
    if (hint) hint.textContent = "내 번호 저장 " + limitText() + (saveLimit() ? " · 멤버십에서 늘릴 수 있어요" : " · 무제한");
  }

  function emit() {
    renderAll();
    document.dispatchEvent(new CustomEvent("unmyeong:tier", { detail: { tier: tier(), plan: rawSub() && rawSub().plan } }));
  }

  function openPlans() {
    var el = $("#membership");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ───────── 초기화 ───────── */
  function init() {
    rollRenewals();
    emit();
    renderMy();

    var acct = $("#acctBtn");
    if (acct) acct.addEventListener("click", function () { renderMy(); openModal("myModal"); });
    var myBtn = $("#myPageBtn");
    if (myBtn) myBtn.addEventListener("click", function () { renderMy(); openModal("myModal"); });

    $$("#authTabs button").forEach(function (b) {
      b.addEventListener("click", function () { setAuthTab(b.getAttribute("data-auth-tab")); });
    });
    var lf = $("#loginForm"), sf = $("#signupForm");
    if (lf) lf.addEventListener("submit", signIn);
    if (sf) sf.addEventListener("submit", signUp);
    $$("[data-social]").forEach(function (b) {
      b.addEventListener("click", function () { socialLogin(b.getAttribute("data-social")); });
    });

    $$("[data-close]").forEach(function (b) {
      b.addEventListener("click", function () { closeModal(b.getAttribute("data-close")); });
    });
    $$(".modal-back").forEach(function (m) {
      m.addEventListener("click", function (e) { if (e.target === m) m.classList.remove("show"); });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeAll();
    });

    /* 잠금 화면의 ‘열기’ 버튼 → 멤버십으로 */
    document.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest("[data-open-plans]") : null;
      if (t) { e.preventDefault(); openPlans(); }
    });
  }

  /* 공개 API */
  global.Membership = {
    PLANS: PLANS,
    FEATURES: FEATURES,
    TIER_NAME: TIER_NAME,
    TIER_GATE: TIER_GATE,
    Billing: Billing,
    tier: tier,
    has: has,
    saveLimit: saveLimit,
    limitText: limitText,
    user: currentUser,
    displayName: displayName,
    sub: rawSub,
    activeSub: activeSub,
    prefs: prefs,
    pref: function (k) { return prefs()[k]; },
    setPref: setPref,
    openAuth: openAuth,
    openMy: function () { renderMy(); openModal("myModal"); },
    openPlans: openPlans,
    openPay: openPay,
    refresh: emit,
    renderMy: renderMy,
    modal: { open: openModal, close: closeModal },
    won: won,
    fmtDate: fmtDate,
    esc: esc
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
