/*! account.js — 회원·구독(요금제) 엔진 + 멤버십 UI
 *
 *  결제 방식: 계좌이체 → 입금 확인 → 이용권 코드 발급 → 앱에서 코드 등록 시 즉시 활성화
 *  · 계정·구독 상태는 이 기기(localStorage)에만 저장합니다. 카드·계좌 정보는 받지 않습니다.
 *  · 이용권 코드는 등급별 접두사 + 체크섬으로 검증하고, 같은 브라우저에서 두 번 쓸 수 없습니다.
 *  · 앱스토어 인앱 결제로 옮길 때의 교체 지점 (아래 어댑터만 바꾸면 UI는 그대로 씁니다)
 *      1) 인증         : Supabase Auth / Firebase Auth  → Auth.signUp, Auth.signIn, Auth.signOut
 *      2) 구독 상태     : Supabase/Firebase 테이블(entitlements) → Billing.fetchSubscription()
 *      3) 결제          : Google Play Billing → Billing.purchase(planId)
 *      4) 영수증 검증    : 서버에서 Google Play Developer API로 purchaseToken 검증 후 등급 부여
 */
(function (global) {
  "use strict";

  var K = {
    users: "unmyeong.users.v1",
    session: "unmyeong.session.v1",
    subs: "unmyeong.subs.v1",
    prefs: "unmyeong.prefs.v1",
    saved: "unmyeong.saved.v1",
    vouchers: "unmyeong.vouchers.v1"
  };

  /* ───────── 요금제 정의 (서버 상품 ID와 1:1로 맞출 것) ───────── */
  var VIP_FEATURES = [
    "1년 패스 혜택 전체 (매주 복채 5조합 자동 발급)",
    "매주 VIP 정밀 10조합 (고정수·제외수 필터)",
    "1:1 맞춤 사주 오행 심층 리포트 (용신·희신·기신)",
    "명당 기운 길일 알림 · VIP 금박 테마"
  ];

  var PLANS = {
    monthly: {
      id: "monthly", tier: "monthly", name: "복채 패스", hanja: "月",
      price: 6900, unit: "원 / 월", cycle: "1개월 이용 · 자동갱신 없음", months: 1, autoRenew: false, badge: "", 
      features: [
        "배너·보상형 광고 완전 제거",
        "2027 신년 총운세 · 금전·사업·건강·연애 4운",
        "주의할 달 이유·처방 + 길한 달 전체 공개",
        "매주 토요일 추첨 대비 복채 5조합 자동 발급",
        "회차별 보관함에서 바로 확인·저장",
        "내 번호 저장 최대 30개",
        "매주 토요일 당첨 알림 (설정)"
      ]
    },
    annual: {
      id: "annual", tier: "annual", name: "1년 패스", hanja: "年",
      price: 59000, unit: "원 / 년", cycle: "12개월 이용 · 월 4,917원꼴", months: 12, autoRenew: false, badge: "인기", 
      features: [
        "복채 패스 혜택 전체 (매주 5조합 자동 발급)",
        "2027 신년 총운세 12개월 전체 풀이",
        "내 번호 무제한 저장",
        "2027 월별 재물운 캘린더 리포트"
      ]
    },
    vip_monthly: {
      id: "vip_monthly", tier: "vip", name: "황금 사주 패스", hanja: "貴",
      price: 12900, unit: "원 / 월", cycle: "1개월 이용 · 자동갱신 없음", months: 1, autoRenew: false, badge: "VIP", 
      features: VIP_FEATURES
    },
    vip_lifetime: {
      id: "vip_lifetime", tier: "vip", name: "황금 사주 패스 평생", hanja: "永",
      price: 89000, unit: "원 / 1회", cycle: "평생 이용 · 추가 결제 없음", months: 0, autoRenew: false, badge: "VIP", 
      features: VIP_FEATURES.concat(["추가 결제·자동갱신 없음"])
    }
  };

  /* 등급별 실제 기능 권한 — 화면 잠금은 모두 이 표를 기준으로 판단합니다 */
  var FEATURES = {
    free:    { noAds: false, goldInstant: false, saveLimit: 5, weeklyAlert: false, weekly5: false, annualReport: false, deepReport: false, tenCombos: false, filters: false, vipTheme: false, luckyDay: false, newYear: false },
    monthly: { noAds: true,  goldInstant: true,  saveLimit: 30, weeklyAlert: true,  weekly5: true,  annualReport: false, deepReport: false, tenCombos: false, filters: false, vipTheme: false, luckyDay: false, newYear: true },
    annual:  { noAds: true,  goldInstant: true,  saveLimit: 0,  weeklyAlert: true,  weekly5: true,  annualReport: true,  deepReport: false, tenCombos: false, filters: false, vipTheme: false, luckyDay: false, newYear: true },
    vip:     { noAds: true,  goldInstant: true,  saveLimit: 0,  weeklyAlert: true,  weekly5: true,  annualReport: true,  deepReport: true,  tenCombos: true,  filters: true,  vipTheme: true,  luckyDay: true,  newYear: true }
  };

  var TIER_NAME = { free: "무료 회원", monthly: "복채 패스", annual: "1년 패스", vip: "황금 사주 패스" };

  /* ───────── 입금 계좌 ───────── */
  var BANK = {
    bank: "카카오뱅크",
    account: "3333-06-3329778",
    holder: "이원철",
    contact: "uuyt77@naver.com"
  };

  /* ───────── 이용권 코드 ─────────
     BC-<등급>-<페이로드 3자><체크섬 2자>   예) BC-P-K7M2Q
       P 복채 패스(월) · Y 1년 패스 · V 황금 사주 패스(월) · L 황금 사주 패스(평생) · W 3일 소원 부적
     마지막 두 자리는 페이로드·등급·비밀값으로 계산한 체크섬입니다. 아무 문자열이나 넣으면 통과하지 않습니다. */
  var VOUCHER = {
    alpha: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
    salt: "BOKCHAE-LOTTO-2026",
    prefix: {
      P: { plan: "monthly", label: "복채 패스" },
      Y: { plan: "annual", label: "1년 패스" },
      V: { plan: "vip_monthly", label: "황금 사주 패스" },
      L: { plan: "vip_lifetime", label: "황금 사주 패스 평생" },
      W: { plan: "wish", label: "3일 소원 부적" }
    }
  };
  var TIER_GATE = { noAds: "복채 패스", goldInstant: "복채 패스", weeklyAlert: "복채 패스", weekly5: "복채 패스", newYear: "복채 패스", annualReport: "1년 패스", deepReport: "황금 사주 패스", tenCombos: "황금 사주 패스", filters: "황금 사주 패스", luckyDay: "황금 사주 패스", vipTheme: "황금 사주 패스" };

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
  /* 자동갱신 구독이 만료일을 지나면 다음 주기로 넘깁니다(자동갱신 상품용) */
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

  /* ───────── 이용권 코드 검증 · 등록 ───────── */
  function vHash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }
  function vCheck(prefix, payload) {
    var h = vHash("BC|" + prefix + "|" + payload + "|" + VOUCHER.salt);
    return VOUCHER.alpha.charAt(h % 32) + VOUCHER.alpha.charAt((h >>> 5) % 32);
  }
  /* 입력값을 정리해 등급·체크섬을 확인합니다. 형식이 아니면 null, 체크섬이 틀리면 valid:false */
  function parseVoucher(raw) {
    var s = String(raw == null ? "" : raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (s.indexOf("BC") !== 0) return null;
    var prefix = s.charAt(2);
    if (!VOUCHER.prefix[prefix]) return null;
    var body = s.slice(3);
    if (body.length !== 5) return null;
    for (var i = 0; i < body.length; i++) {
      if (VOUCHER.alpha.indexOf(body.charAt(i)) < 0) return null;
    }
    var payload = body.slice(0, 3), check = body.slice(3);
    return {
      code: "BC-" + prefix + "-" + body,
      prefix: prefix,
      valid: vCheck(prefix, payload) === check,
      meta: VOUCHER.prefix[prefix]
    };
  }
  function usedCodes() { return load(K.vouchers, {}) || {}; }

  /*
   * 코드 한 개를 등록합니다.
   *  - 등급 코드(P·Y·V·L): 로그인한 계정의 구독으로 등록 (같은 등급이면 남은 기간에 이어 붙임)
   *  - 소원 부적 코드(W): 이 기기의 부적 카드 잠금을 해제
   *  - 등록한 코드는 이 브라우저에서 다시 쓸 수 없습니다.
   */
  function redeemVoucher(raw, opts) {
    opts = opts || {};
    var p = parseVoucher(raw);
    if (!p) return { ok: false, msg: "이용권 코드 형식이 올바르지 않습니다. (예: BC-P-XXXXX)" };
    if (!p.valid) return { ok: false, msg: "유효하지 않은 이용권 코드입니다. 입금 확인 후 받은 코드를 다시 확인해 주세요." };
    var used = usedCodes();
    if (used[p.code]) return { ok: false, msg: "이미 등록된 이용권 코드입니다. 새 코드를 받아 주세요." };

    var now = new Date();
    if (p.prefix === "W") {
      used[p.code] = { at: now.toISOString(), product: "wish" };
      save(K.vouchers, used);
      if (global.Wish && global.Wish.grant) global.Wish.grant(p.code);
      document.dispatchEvent(new CustomEvent("unmyeong:voucher", { detail: { kind: "wish", code: p.code } }));
      return { ok: true, kind: "wish", meta: p.meta };
    }

    var s = session();
    if (!s) return { ok: false, needLogin: true, msg: "이용권을 등록하려면 먼저 로그인해 주세요." };
    var plan = PLANS[p.meta.plan];
    if (!plan) return { ok: false, msg: "이용권 정보를 확인할 수 없습니다." };

    var prev = rawSub();
    var prevActive = !!(prev && prev.tier !== "free" && (!prev.expiresAt || new Date(prev.expiresAt).getTime() > now.getTime()));
    if (prevActive && !prev.expiresAt) {
      return { ok: false, msg: "이미 황금 사주 패스 평생 이용권을 등록하셨습니다. 이 코드는 아직 쓰지 않았으니 다른 기기에서 등록하시거나 문의해 주세요." };
    }
    if (prevActive && prev.plan !== plan.id && !opts.force) {
      var curName = (PLANS[prev.plan] && PLANS[prev.plan].name) || TIER_NAME[prev.tier];
      return {
        ok: false, confirmSwitch: true,
        msg: "지금 이용 중인 등급은 " + curName + "입니다.\n" + p.meta.label + " 이용권으로 바꾸면 남은 기간은 사라집니다. 계속할까요?"
      };
    }

    var base = now;
    if (prevActive && prev.plan === plan.id && prev.expiresAt) base = new Date(prev.expiresAt);
    var sub = {
      plan: plan.id,
      tier: plan.tier,
      name: plan.name,
      price: plan.price,
      currency: "KRW",
      startedAt: now.toISOString(),
      expiresAt: plan.months ? addMonths(base, plan.months).toISOString() : null,
      autoRenew: false,
      mode: "voucher",
      voucher: p.code,
      renewals: 0,
      orderId: "VC-" + p.code
    };
    var all = subsAll();
    all[s.email] = sub;
    save(K.subs, all);
    used[p.code] = { at: now.toISOString(), product: plan.id, email: s.email };
    save(K.vouchers, used);
    emit();
    renderMy();
    return { ok: true, kind: "plan", plan: plan, sub: sub };
  }

  /* ───────── 계좌이체 안내 · 이용권 코드 입력 UI ───────── */
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.top = "-1000px";
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, text.length);
        var ok = document.execCommand("copy");
        ta.remove();
        ok ? resolve() : reject(new Error("copy-failed"));
      } catch (e) { reject(e); }
    });
  }

  function bankBoxHtml(amount) {
    return '<div class="bank-box">' +
      '<div class="bank-title">계좌이체로 입금해 주세요</div>' +
      '<div class="bank-row"><span>은행</span><b>' + BANK.bank + '</b></div>' +
      '<div class="bank-row"><span>계좌번호</span><b class="bank-acc">' + BANK.account + '</b>' +
        '<button type="button" class="bank-copy" data-copy-acc>계좌 복사</button></div>' +
      '<div class="bank-row"><span>예금주</span><b>' + BANK.holder + '</b></div>' +
      '<div class="bank-row bank-amount"><span>입금 금액</span><b>' + won(amount) + '원</b></div>' +
      '</div>' +
      '<p class="pay-guide">입금자명에 <b>본인 성함 또는 닉네임</b>을 적어 주시고, 입금 확인 문의를 ' +
        '<a href="mailto:' + BANK.contact + '">' + BANK.contact + '</a> 로 보내주시면 <b>이용권 코드</b>를 보내드립니다. ' +
        '받은 코드를 아래에 입력하면 바로 적용됩니다.</p>';
  }

  function voucherBoxHtml(prefix, label, placeholder) {
    var p = prefix || "top";
    return '<div class="voucher-box">' +
      '<div class="voucher-title">' + (label || "이용권 코드 등록") + '</div>' +
      '<div class="voucher-row">' +
        '<input type="text" class="voucher-input" id="vc-' + p + '-in" placeholder="' + (placeholder || "BC-P-XXXXX") + '" maxlength="14" autocomplete="off" autocapitalize="characters" spellcheck="false" />' +
        '<button type="button" class="voucher-btn" id="vc-' + p + '-go">적용</button>' +
      '</div>' +
      '<p class="voucher-msg" id="vc-' + p + '-msg" hidden></p>' +
      '</div>';
  }

  function setVoucherMsg(el, text, ok) {
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || "";
    el.className = "voucher-msg" + (text ? (ok ? " ok" : " err") : "");
  }

  /* 계좌 복사 버튼만 묶습니다(멤버십 상단 요약 등) */
  function bindCopy(root) {
    $$("[data-copy-acc]", root).forEach(function (b) {
      b.addEventListener("click", function () {
        copyText(BANK.account).then(function () {
          toast(BANK.bank + " " + BANK.account + " 계좌번호를 복사했습니다");
        }).catch(function () {
          toast("계좌번호 " + BANK.account + " 를 길게 눌러 복사해 주세요");
        });
      });
    });
  }

  /* 계좌이체 안내 + 코드 입력 상자를 한 번에 묶습니다 */
  function bindPayBox(root, prefix, onDone) {
    root = root || document;
    bindCopy(root);
    var input = root.querySelector("#vc-" + prefix + "-in");
    var btn = root.querySelector("#vc-" + prefix + "-go");
    var msg = root.querySelector("#vc-" + prefix + "-msg");
    if (!input || !btn) return;

    function submit() {
      var raw = input.value;
      if (!raw.trim()) { setVoucherMsg(msg, "이용권 코드를 입력해 주세요.", false); input.focus(); return; }
      var r = redeemVoucher(raw);
      if (r.confirmSwitch) {
        if (!confirm(r.msg)) return;
        r = redeemVoucher(raw, { force: true });
      }
      if (!r.ok) {
        setVoucherMsg(msg, r.msg, false);
        if (r.needLogin) { closeModal("payModal"); openAuth("login"); }
        return;
      }
      input.value = "";
      setVoucherMsg(msg, "", false);
      if (onDone) onDone(r);
    }
    btn.addEventListener("click", submit);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); submit(); }
    });
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
      "<span>" + (t === "vip"
        ? "이번 주 복채 5조합 · 정밀 10조합 · 심층 리포트까지 모두 열려 있습니다."
        : "광고 없이 오늘의 황금 5조합과 이번 주 복채 5조합이 열려 있습니다.") + "</span>";
  }

  /* ───────── 요금제 카드 ───────── */
  var vipChoice = "vip_monthly";

  function planCard(plan, opts) {
    opts = opts || {};
    var isNow = opts.now;
    var btn;
    if (plan.id === "free") {
      btn = currentUser() && tier() !== "free"
        ? '<p class="plan-foot">이용 기간이 끝나면 자동으로 무료 회원이 됩니다</p>'
        : '<button type="button" class="btn btn-ghost" data-free="1">' + (currentUser() ? "현재 등급" : "무료로 시작") + "</button>";
    } else {
      btn = '<button type="button" class="btn ' + (plan.tier === "vip" ? "btn-gold" : "btn-primary") + '" data-buy="' + plan.id + '">' +
        (isNow ? "이용 기간 연장하기" : plan.name.replace(" 회원", "") + " 시작하기") + "</button>";
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
    var cur = rawSub();
    var forever = !!(cur && cur.tier === "vip" && !cur.expiresAt);
    return '<div class="plan plan-vip' + (isNow ? " now" : "") + '" data-plan="vip">' +
      '<div class="plan-top">' +
        '<span class="plan-name"><i aria-hidden="true">' + plan.hanja + "</i>황금 사주 패스</span>" +
        '<span class="plan-badge badge-vip">VIP</span>' +
        (isNow ? '<span class="plan-now">이용 중</span>' : "") +
      "</div>" +
      '<div class="seg seg-vip" role="group" aria-label="VIP 결제 방식 선택">' +
        '<button type="button" data-vip="vip_monthly" class="' + (vipChoice === "vip_monthly" ? "on" : "") + '">월 12,900원</button>' +
        '<button type="button" data-vip="vip_lifetime" class="' + (vipChoice === "vip_lifetime" ? "on" : "") + '">평생 89,000원</button>' +
      "</div>" +
      '<div class="plan-price"><b>' + won(plan.price) + '</b><small>' + plan.unit + "</small><em>" + plan.cycle + "</em></div>" +
      '<ul class="plan-feats">' + plan.features.map(function (f) { return "<li>" + f + "</li>"; }).join("") + "</ul>" +
      '<button type="button" class="btn btn-gold" data-buy="' + plan.id + '">' +
        (isNow ? (plan.months && !forever ? "이용 기간 연장하기" : "이용 중 (평생)") : "황금 사주 패스 시작하기") + "</button>" +
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
        "3초 복채 후 황금 5조합",
        "내 번호 저장 5개"
      ]
    };
    box.innerHTML =
      planCard(free, { now: !!currentUser() && t === "free" }) +
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

  /* 이번 주 복채 5조합 발급 상태 (app.js의 window.Weekly) */
  function weekLine() {
    if (!has("weekly5")) return "복채 패스부터 자동 발급";
    var W = global.Weekly;
    if (!W || !W.current) return "발급 준비";
    var w = W.current();
    if (w) return w.round + "회 · 5조합 발급 완료";
    var info = W.info ? W.info() : null;
    return info && info.round ? info.round + "회 · 사주 입력 후 발급" : "발급 대기";
  }

  function renderMy() {
    var body = $("#myBody");
    if (!body) return;
    var u = currentUser();

    if (!u) {
      body.innerHTML =
        '<div class="my-guest">' +
          '<p>로그인하면 요금제를 고르고 <b>이용권 코드</b>를 등록할 수 있습니다.<br />이메일로 30초면 가입됩니다.</p>' +
          '<button type="button" class="btn btn-primary" data-my="signup">회원가입</button>' +
          '<button type="button" class="btn btn-ghost" data-my="login" style="margin-top:8px">로그인</button>' +
        "</div>" +
        '<p class="tiny center">계정과 구독 정보는 이 기기에만 저장됩니다.</p>' +
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
        stateLine = '<div class="kv"><span>이용 기간</span><b>평생 이용 · 추가 결제 없음</b></div>';
      } else {
        stateLine = '<div class="kv"><span>이용 만료일</span><b>' + fmtDate(sub.expiresAt) + " · 자동갱신 없음</b></div>";
      }
      stateLine += '<div class="kv"><span>등록 방식</span><b>계좌이체 이용권 (' + (sub.voucher || "-") + ")</b></div>";
    } else {
      stateLine = '<div class="kv"><span>구독 상태</span><b>구독 없음 (무료 회원)</b></div>';
    }

    /* 계좌이체 이용권은 자동갱신이 없어 해지·철회 버튼이 필요 없습니다 */
    var actions = "";

    body.innerHTML =
      '<div class="who">' +
        '<span class="who-avatar">' + esc((displayName() || "?").slice(0, 1)) + "</span>" +
        '<span class="who-txt"><b>' + esc(displayName()) + "</b><small>" + esc(u.email) + " · 가입 " + fmtDate(u.createdAt) + "</small></span>" +
        '<span class="tier-pill tier-' + t + '">' + TIER_NAME[t] + "</span>" +
      "</div>" +
      '<div class="kv-list">' + stateLine +
        '<div class="kv"><span>내 번호 저장</span><b>' + saved.length + " / " + (limit ? limit + "개" : "무제한") + "</b></div>" +
        '<div class="kv"><span>이번 주 복채 5조합</span><b>' + weekLine() + "</b></div>" +
      "</div>" +
      (t === "free"
        ? '<button type="button" class="btn btn-primary" data-my="plans" style="margin:12px 0 4px">멤버십 보고 광고 없이 쓰기</button>'
        : '<button type="button" class="btn btn-ghost" data-my="plans" style="margin:12px 0 4px">요금제 변경 · 연장</button>') +
      (has("weekly5") ? '<button type="button" class="btn btn-primary" data-my="weekly" style="margin:0 0 4px">이번 주 복채 5조합 보기</button>' : "") +
      '<div class="card-head" style="margin:16px 0 6px"><span class="hanja">告</span><h2 style="font-size:14px">알림 설정</h2><span class="rule"></span></div>' +
      toggleRow("prefWeekly", "매주 토요일 당첨 알림", has("weeklyAlert") ? "토요일 추첨 후 내 번호 결과를 알려 드립니다 (앱 출시 후 푸시)" : "복채 패스부터 사용할 수 있습니다", !!p.weekly, !has("weeklyAlert")) +
      toggleRow("prefLucky", "명당 기운 길일 알림", has("luckyDay") ? "재물운이 높은 날을 미리 알려 드립니다 (VIP)" : "VIP 회원 전용입니다", !!p.luckyDay, !has("luckyDay")) +
      (actions ? '<div class="btn-row" style="margin-top:12px">' + actions + "</div>" : "") +
      '<div class="btn-row" style="margin-top:8px">' +
        '<button type="button" class="btn btn-ghost" data-my="signout">로그아웃</button>' +
        '<button type="button" class="btn btn-ghost" data-my="delete">회원 탈퇴</button>' +
      "</div>" +
      '<p class="tiny center" style="margin-top:12px">이용권은 등록한 기기(브라우저)에서만 유효합니다. 이용 기간이 끝나면 자동으로 무료 회원이 되고, 추가 결제는 없습니다.</p>';

    bindMy();
  }

  function bindMy() {
    $$("[data-my]").forEach(function (b) {
      b.addEventListener("click", function () {
        var act = b.getAttribute("data-my");
        if (act === "signup") { closeModal("myModal"); openAuth("signup"); }
        else if (act === "login") { closeModal("myModal"); openAuth("login"); }
        else if (act === "plans") { closeModal("myModal"); openPlans(); }
        else if (act === "weekly") {
          closeModal("myModal");
          if (global.Weekly && global.Weekly.render) global.Weekly.render();
          var wk = document.getElementById("weekly");
          if (wk) wk.scrollIntoView({ behavior: "smooth", block: "start" });
        }
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

  /* ───────── 결제창 (계좌이체 + 이용권 코드) ───────── */
  function openPay(planId) {
    var plan = PLANS[planId];
    if (!plan) return;
    if (!currentUser()) {
      toast("로그인하면 입금 안내와 이용권 코드 등록을 할 수 있습니다");
      openAuth("signup");
      return;
    }
    var u = currentUser();
    var now = new Date();
    var prev = rawSub();
    var base = now;
    if (prev && prev.tier !== "free" && prev.plan === plan.id && prev.expiresAt && new Date(prev.expiresAt).getTime() > now.getTime()) {
      base = new Date(prev.expiresAt);
    }
    var end = plan.months ? addMonths(base, plan.months) : null;
    var applyLabel = base.getTime() > now.getTime() ? "연장 시 적용" : "등록 시 적용";
    var body = $("#payBody");
    body.innerHTML =
      '<div class="pay-head"><span class="pay-name">' + plan.name + "</span>" +
        '<span class="pay-price"><b>' + won(plan.price) + "</b>원" + (plan.months === 12 ? " / 년" : plan.months === 1 ? " / 월" : " / 1회") + "</span></div>" +
      '<div class="kv-list">' +
        '<div class="kv"><span>이용 기간</span><b>' + plan.cycle + "</b></div>" +
        (end ? '<div class="kv"><span>' + applyLabel + '</span><b>' + fmtDate(base.toISOString()) + " ~ " + fmtDate(end.toISOString()) + "</b></div>"
             : '<div class="kv"><span>등록 시 적용</span><b>평생 (추가 결제 없음)</b></div>') +
        '<div class="kv"><span>계정</span><b>' + esc(displayName()) + " · " + esc(u.email) + "</b></div>" +
      "</div>" +
      bankBoxHtml(plan.price) +
      voucherBoxHtml("pay", "입금 확인 후 받은 이용권 코드") +
      '<p class="tiny" style="text-align:left;margin-top:10px">청약철회: 결제 후 7일 이내 콘텐츠를 이용하지 않았다면 전액 환불됩니다. 열람을 시작한 뒤에는 디지털 콘텐츠 특성상 환불이 제한될 수 있습니다. 이용권은 등록한 기기에서만 유효하며, 이용 기간이 끝나면 자동으로 무료 회원이 됩니다.</p>' +
      '<button type="button" class="btn btn-ghost" id="payCancel" style="margin-top:10px">닫기</button>';
    openModal("payModal");

    $("#payCancel").addEventListener("click", function () { closeModal("payModal"); });
    bindPayBox(body, "pay", function (r) {
      closeModal("payModal");
      toast(r.plan.name + " 이용권이 등록되었습니다" + (r.sub.expiresAt ? " · " + fmtDate(r.sub.expiresAt) + "까지" : " · 평생 이용"));
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
    if (u.provider && u.provider !== "email") return formErr(err, "이 계정은 이메일 로그인을 쓸 수 없습니다. 새로 가입해 주세요.");
    hashPass(pass, u.salt || "").then(function (hash) {
      if (hash !== u.pass) return formErr(err, "비밀번호가 맞지 않습니다.");
      save(K.session, { email: email, at: new Date().toISOString() });
      closeModal("authModal");
      $("#loginForm").reset();
      afterLogin(u.birth || null);
    });
  }

  /* ───────── 렌더 총괄 ───────── */
  function renderAll() {
    renderChip();
    renderMemberBar();
    renderPlans();
    var hint = $("#savedLimitHint");
    if (hint) hint.textContent = "내 번호 저장 " + limitText() + (saveLimit() ? " · 멤버십에서 늘릴 수 있어요" : "");
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

    /* 멤버십·내 정보 탭 상단의 이용권 코드 상자 */
    var topBox = $("#voucherTop");
    if (topBox) {
      topBox.innerHTML = voucherBoxHtml("top", "이용권 코드 등록");
      bindPayBox(topBox, "top", function (r) {
        if (r.kind === "wish") { toast("3일 소원 부적 이용권이 등록되었습니다"); return; }
        toast(r.plan.name + " 이용권이 등록되었습니다" + (r.sub.expiresAt ? " · " + fmtDate(r.sub.expiresAt) + "까지" : " · 평생 이용"));
      });
    }
    bindCopy(document);

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
    BANK: BANK,
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
    /* 계좌이체·이용권 코드 (wish.js 등 다른 화면과 공유) */
    bankBox: bankBoxHtml,
    voucherBox: voucherBoxHtml,
    bindPayBox: bindPayBox,
    bindCopy: bindCopy,
    redeem: redeemVoucher,
    parseVoucher: parseVoucher,
    usedCodes: usedCodes,
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
