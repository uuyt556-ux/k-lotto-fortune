/*! wish.js — 3일 소원 부적·카드 (단건 상품 · 1건 10,000원)
 *  · 소원 1가지를 사주·오행 기운과 엮어 한국 전통 무드의 부적 카드로 그립니다 (canvas 1080×1440).
 *  · 구독 요금제와 별개의 단건 상품: 미리보기(워터마크·잠금) → 계좌이체 10,000원 · 이용권 코드 등록 → 고해상도 원본 저장·공유.
 *  · 갤러리 저장: canvas PNG + <a download> / Web Share API / 길게 눌러 저장 안내
 */
(function (global) {
  "use strict";

  var S = global.Saju;
  var W = 1080, H = 1440;
  var K = { orders: "unmyeong.wish.orders.v1" };
  var FILE_NAME = "복채로또_3일소원부적.png";
  var PRICE = 10000;
  /* 플레이스토어 무료·광고형 모드: 부적 카드도 무료로 만들고 저장 */
  var PLAY = !!global.BOKCHAE_PLAY;

  var state = { wish: "", paid: false, blob: null, busy: false, credit: 0 };

  function $(s) { return document.querySelector(s); }
  function pad(n) { return String(n).padStart(2, "0"); }
  function dkey(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function dotDate(d) {
    return d.getFullYear() + ". " + pad(d.getMonth() + 1) + ". " + pad(d.getDate()) + ".";
  }
  function won(n) { return Number(n || 0).toLocaleString("ko-KR"); }
  function load(k, d) {
    try { var raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : d; } catch (e) { return d; }
  }
  function store(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 사생활 보호 모드 */ }
  }
  function toast(msg) {
    var t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }
  function analysis() { return global.Unmyeong ? global.Unmyeong.analysis() : null; }
  function birth() { return global.Unmyeong ? global.Unmyeong.birth() : null; }
  function teller() {
    var male = !global.Webtoon || !global.Webtoon.viewer || global.Webtoon.viewer() !== "female";
    return male
      ? { name: "설아", role: "미녀 점술사", line: "이 부적, 그냥 보내기엔 아깝지 않나요? 복채 만 원이면 사흘 동안 제가 곁에서 정성껏 빌어 드릴게요." }
      : { name: "하윤", role: "점집 미소년", line: "손님, 이 부적은 복채를 내야 힘이 생겨요. 만 원이면 사흘, 제가 정성껏 빌어 드릴게요." };
  }

  /* ───────── 그리기 도구 ───────── */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function wrap(ctx, text, maxW) {
    var out = [], line = "";
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === "\n") { out.push(line); line = ""; continue; }
      if (ctx.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; }
      else line += ch;
    }
    if (line) out.push(line);
    return out;
  }
  function goldGrad(ctx, x0, y0, x1, y1) {
    var g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, "#F4E3B0");
    g.addColorStop(.28, "#E0B953");
    g.addColorStop(.52, "#C9972C");
    g.addColorStop(.74, "#F0D68F");
    g.addColorStop(1, "#9A6F16");
    return g;
  }

  /* ───────── 카드 렌더 ───────── */
  function draw(canvas, opts) {
    var ctx = canvas.getContext("2d");
    var w = W, h = H, gold = !!opts.gold;
    var seed = S.hash((opts.wish || "복채") + "|" + opts.key + (gold ? "|g" : ""));
    var rnd = mulberry32(seed);

    ctx.clearRect(0, 0, w, h);
    ctx.textBaseline = "middle";

    /* 밤하늘 배경 */
    var bg = ctx.createLinearGradient(0, 0, w * .45, h);
    bg.addColorStop(0, "#05060D");
    bg.addColorStop(.42, "#101024");
    bg.addColorStop(.78, "#191026");
    bg.addColorStop(1, "#241222");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    /* 별 */
    for (var i = 0; i < 300; i++) {
      var x = rnd() * w, y = rnd() * h * .78;
      var r = .5 + rnd() * (y < h * .3 ? 2.1 : 1.4);
      var a = .18 + rnd() * .7 * (1 - y / h);
      ctx.fillStyle = "rgba(255,248,226," + a.toFixed(3) + ")";
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    /* 반짝이는 별(네 갈래) */
    for (var s = 0; s < 16; s++) {
      var sx = rnd() * w, sy = rnd() * h * .6, sr = 8 + rnd() * 22;
      ctx.strokeStyle = "rgba(240,214,143," + (.18 + rnd() * .3).toFixed(2) + ")";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(sx - sr, sy); ctx.lineTo(sx + sr, sy);
      ctx.moveTo(sx, sy - sr); ctx.lineTo(sx, sy + sr);
      ctx.stroke();
    }

    /* 달 */
    var mx = 812, my = 268, mr = 104;
    var glow = ctx.createRadialGradient(mx, my, mr * .4, mx, my, mr * 3.3);
    glow.addColorStop(0, gold ? "rgba(240,214,143,.30)" : "rgba(240,230,197,.22)");
    glow.addColorStop(1, "rgba(240,214,143,0)");
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(mx, my, mr * 3.3, 0, Math.PI * 2); ctx.fill();
    var moonFill = ctx.createRadialGradient(mx - 30, my - 34, 10, mx, my, mr);
    moonFill.addColorStop(0, "#FFF9E8");
    moonFill.addColorStop(.6, "#F4E7C4");
    moonFill.addColorStop(1, "#D9C08A");
    ctx.fillStyle = moonFill;
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(154,111,22,.10)";
    [[-26, -18, 27], [30, 16, 20], [-8, 46, 13], [52, -30, 11]].forEach(function (c) {
      ctx.beginPath(); ctx.arc(mx + c[0], my + c[1], c[2], 0, Math.PI * 2); ctx.fill();
    });

    /* 구름 (연꽃구름 느낌의 여러 겹 호) */
    function cloud(cx, cy, scale, alpha, color) {
      ctx.save();
      ctx.translate(cx, cy); ctx.scale(scale, scale);
      ctx.strokeStyle = color.replace("ALPHA", alpha.toFixed(3));
      ctx.lineWidth = 6; ctx.lineCap = "round";
      [[-150, 0, 92], [-40, -26, 120], [90, 4, 84], [190, -18, 62]].forEach(function (p) {
        ctx.beginPath();
        ctx.arc(p[0], p[1], p[2], Math.PI * 1.05, Math.PI * 1.95);
        ctx.stroke();
      });
      ctx.beginPath();
      ctx.moveTo(-240, 18); ctx.lineTo(250, 18);
      ctx.globalAlpha = .5; ctx.stroke();
      ctx.restore();
    }
    cloud(300, 1190, 1.05, .30, "rgba(43,110,108,ALPHA)");
    cloud(760, 1268, .92, .22, "rgba(184,59,42,ALPHA)");
    cloud(520, 1330, 1.25, .16, "rgba(201,151,44,ALPHA)");

    /* 비네트 */
    var vg = ctx.createRadialGradient(w / 2, h * .44, w * .28, w / 2, h / 2, w * .92);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,.62)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    /* 단청 띠 (위·아래) */
    function band(y, flip) {
      var cols = ["#2B6E6C", "#B83B2A", "#C9972C", "#2E4A6B"];
      var step = 60, n = Math.ceil(w / step) + 1;
      for (var i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.strokeStyle = cols[i % cols.length];
        ctx.globalAlpha = .5;
        ctx.lineWidth = 3;
        ctx.arc(i * step, y, 26, flip ? Math.PI : 0, flip ? Math.PI * 2 : Math.PI);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(201,151,44,.55)";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(54, flip ? y - 6 : y + 6); ctx.lineTo(w - 54, flip ? y - 6 : y + 6); ctx.stroke();
    }
    band(112, false);
    band(h - 112, true);

    /* 금박 테두리 */
    ctx.strokeStyle = gold ? goldGrad(ctx, 0, 0, w, h) : "rgba(201,151,44,.9)";
    ctx.lineWidth = gold ? 6 : 4;
    roundRect(ctx, 48, 48, w - 96, h - 96, 26); ctx.stroke();
    ctx.strokeStyle = "rgba(231,200,122,.45)";
    ctx.lineWidth = 1.4;
    roundRect(ctx, 66, 66, w - 132, h - 132, 18); ctx.stroke();

    /* 모서리 문양 */
    function corner(cx, cy, dx, dy) {
      ctx.strokeStyle = gold ? "rgba(244,227,176,.95)" : "rgba(231,200,122,.8)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx + dx * 62, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + dy * 62);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + dx * 20, cy + dy * 20, 6, 0, Math.PI * 2); ctx.fillStyle = "rgba(201,151,44,.85)"; ctx.fill();
      ctx.beginPath(); ctx.arc(cx + dx * 44, cy + dy * 44, 3, 0, Math.PI * 2); ctx.fill();
    }
    corner(96, 96, 1, 1); corner(w - 96, 96, -1, 1);
    corner(96, h - 96, 1, -1); corner(w - 96, h - 96, -1, -1);

    /* 제목 */
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(246,234,208,.62)";
    ctx.font = '600 26px "Gowun Batang", "Nanum Myeongjo", serif';
    ctx.fillText("복채로또 · 三 日 願 符", w / 2, 196);

    ctx.font = '700 108px "Nanum Myeongjo", "Gowun Batang", serif';
    ctx.fillStyle = gold ? goldGrad(ctx, 200, 230, 880, 360) : "rgba(240,214,143,.95)";
    ctx.shadowColor = gold ? "rgba(240,214,143,.45)" : "rgba(0,0,0,0)";
    ctx.shadowBlur = gold ? 26 : 0;
    var title = "三日願符";
    var spacing = 26, tw = 0, k;
    for (k = 0; k < title.length; k++) tw += ctx.measureText(title.charAt(k)).width + spacing;
    tw -= spacing;
    var tx = w / 2 - tw / 2;
    for (k = 0; k < title.length; k++) {
      var chw = ctx.measureText(title.charAt(k)).width;
      ctx.fillText(title.charAt(k), tx + chw / 2, 330);
      tx += chw + spacing;
    }
    ctx.shadowBlur = 0;

    ctx.font = '600 30px "Gowun Batang", "Nanum Myeongjo", serif';
    ctx.fillStyle = "rgba(246,234,208,.78)";
    ctx.fillText("3일 소원 부적 · 오늘의 기운을 담아", w / 2, 408);

    /* 구분선 */
    var lg = ctx.createLinearGradient(w / 2 - 190, 0, w / 2 + 190, 0);
    lg.addColorStop(0, "rgba(201,151,44,0)");
    lg.addColorStop(.5, "rgba(231,200,122,.9)");
    lg.addColorStop(1, "rgba(201,151,44,0)");
    ctx.strokeStyle = lg; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(w / 2 - 190, 456); ctx.lineTo(w / 2 + 190, 456); ctx.stroke();
    ctx.fillStyle = "rgba(231,200,122,.9)";
    ctx.save(); ctx.translate(w / 2, 456); ctx.rotate(Math.PI / 4);
    ctx.fillRect(-6, -6, 12, 12); ctx.restore();

    /* 소원 문구 */
    ctx.font = gold ? '700 62px "Nanum Myeongjo", "Gowun Batang", serif' : '700 58px "Nanum Myeongjo", "Gowun Batang", serif';
    ctx.fillStyle = "#F8F1DE";
    var lines = wrap(ctx, opts.wish, w - 300);
    if (lines.length > 4) lines = lines.slice(0, 4);
    var lh = gold ? 88 : 82;
    var startY = 620 - (lines.length - 1) * lh / 2;
    ctx.shadowColor = "rgba(240,214,143,.25)"; ctx.shadowBlur = 18;
    lines.forEach(function (ln, i) { ctx.fillText(ln, w / 2, startY + i * lh); });
    ctx.shadowBlur = 0;

    /* 사주 요약 */
    ctx.font = '500 27px "Gowun Batang", "Nanum Myeongjo", serif';
    ctx.fillStyle = "rgba(246,234,208,.66)";
    ctx.fillText(opts.sajuLine, w / 2, startY + lines.length * lh + 18);

    /* 날짜 스탬프 2개 */
    function stamp(cx, cy, label, value, accent) {
      ctx.strokeStyle = accent; ctx.lineWidth = 1.6;
      roundRect(ctx, cx - 196, cy - 44, 392, 88, 12); ctx.stroke();
      ctx.fillStyle = "rgba(246,234,208,.55)";
      ctx.font = '600 20px "Gowun Batang", "Nanum Myeongjo", serif';
      ctx.fillText(label, cx, cy - 18);
      ctx.fillStyle = accent;
      ctx.font = '700 30px "Nanum Myeongjo", "Gowun Batang", serif';
      ctx.fillText(value, cx, cy + 20);
    }
    stamp(w / 2 - 214, 1052, "발급일", dotDate(new Date()), "rgba(231,200,122,.9)");
    stamp(w / 2 + 214, 1052, "성취 기원 (3일 후)", dotDate(opts.until), "rgba(240,214,143,.75)");

    /* 낙관 인장 */
    var sx2 = 806, sy2 = 1158, sSize = 168;
    ctx.save();
    ctx.translate(sx2, sy2); ctx.rotate(7 * Math.PI / 180);
    ctx.fillStyle = gold ? "#8C1F12" : "#A5281B";
    roundRect(ctx, 0, 0, sSize, sSize, 22); ctx.fill();
    ctx.strokeStyle = gold ? goldGrad(ctx, 0, 0, sSize, sSize) : "rgba(255,243,226,.9)";
    ctx.lineWidth = gold ? 5 : 3;
    roundRect(ctx, 10, 10, sSize - 20, sSize - 20, 16); ctx.stroke();
    ctx.fillStyle = gold ? "#F4E3B0" : "#FFF3E2";
    ctx.font = '700 104px "Nanum Myeongjo", "Gowun Batang", serif';
    ctx.fillText("願", sSize / 2, sSize / 2 + 4);
    if (gold) {
      ctx.font = '600 17px "Gowun Batang", serif';
      ctx.fillStyle = "rgba(244,227,176,.92)";
      ctx.fillText("黃金印", sSize / 2, sSize - 26);
    }
    ctx.restore();

    /* 왼쪽 문장 */
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(246,234,208,.5)";
    ctx.font = '500 23px "Gowun Batang", "Nanum Myeongjo", serif';
    var motto = ["하루를 곱게 보내면", "사흘 안에 바람이 바뀝니다."];
    motto.forEach(function (t, i) { ctx.fillText(t, 128, 1150 + i * 38); });

    /* 하단 */
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(246,234,208,.42)";
    ctx.font = '600 24px "Gowun Batang", "Nanum Myeongjo", serif';
    ctx.fillText("복채로또 · 사주로 고르는 6/45", w / 2, 1300);
    ctx.fillStyle = "rgba(246,234,208,.3)";
    ctx.font = '400 19px "Gowun Batang", serif';
    ctx.fillText("재미로 보는 소원 부적입니다 · 성취나 당첨을 보장하지 않습니다", w / 2, 1344);
    if (gold) {
      ctx.fillStyle = "rgba(240,214,143,.75)";
      ctx.font = '600 20px "Gowun Batang", serif';
      ctx.fillText("황금 인장 · 복채로또 소장판", w / 2, 1382);
    }

    /* 미리보기 워터마크 (결제 전) */
    if (opts.preview) {
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(-Math.PI / 6);
      ctx.globalAlpha = .22;
      ctx.fillStyle = "#F8F1DE";
      ctx.font = '700 58px "Nanum Myeongjo", "Gowun Batang", serif';
      ctx.textAlign = "center";
      for (var yy = -h; yy < h; yy += 200) {
        for (var xx = -w; xx < w; xx += 430) {
          ctx.fillText("복채로또 미리보기", xx, yy);
        }
      }
      ctx.restore();
      /* 가운데 자물쇠 표식 */
      ctx.save();
      ctx.globalAlpha = .9;
      ctx.beginPath();
      ctx.arc(w / 2, 700, 94, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(6,6,12,.62)";
      ctx.fill();
      ctx.strokeStyle = "rgba(240,214,143,.85)";
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = "#F0D68F";
      ctx.font = '700 62px "Gowun Batang", serif';
      ctx.textAlign = "center";
      ctx.fillText("封", w / 2, 700);
      ctx.font = '600 22px "Gowun Batang", serif';
      ctx.fillStyle = "rgba(246,234,208,.9)";
      ctx.fillText("복채를 내면 열립니다", w / 2, 830);
      ctx.restore();
    }
  }

  /* ───────── 상태 · 화면 ───────── */
  function wishSajuLine() {
    var a = analysis(), b = birth();
    if (!a || !b) return "사주를 넣으면 내 일간·오행을 담아 드립니다";
    return "일간 " + a.dayStemName + " " + S.ELEM_H[a.dayEl] + "(" + a.dayEl + ") · " + a.yinyang +
      " · 부족 " + S.ELEM_H[a.lacking[0]] + "(" + a.lacking[0] + ") 보완" +
      (b.pillars && b.pillars.animal ? " · " + b.pillars.animal + "띠" : "");
  }

  function render() {
    var canvas = $("#wishCanvas");
    if (!canvas) return;
    var until = new Date();
    until.setDate(until.getDate() + 3);
    draw(canvas, {
      wish: state.wish || "복채로또와 함께 좋은 일이 이어지기를",
      gold: state.paid,
      preview: !state.paid,
      sajuLine: wishSajuLine(),
      until: until,
      key: dkey()
    });
    try {
      canvas.toBlob(function (blob) { state.blob = blob; }, "image/png");
    } catch (e) { state.blob = null; }
  }

  function lockUi() {
    var lock = $("#wishLock");
    var saveBtn = $("#wishSave");
    var share = $("#wishShare");
    var hint = $("#wishHint");
    var t = teller();
    var paid = PLAY || state.paid;
    if (lock) {
      lock.hidden = paid;
      var msg = lock.querySelector("[data-teller-line]");
      if (msg) msg.textContent = t.role + " " + t.name + " — " + t.line;
    }
    if (saveBtn) {
      saveBtn.disabled = !paid;
      saveBtn.textContent = paid ? "갤러리 저장 (PNG)" : "결제 후 저장할 수 있어요";
    }
    if (share) share.hidden = !paid;
    if (hint) {
      hint.innerHTML = paid
        ? "고해상도(1080×1440) 원본입니다 · 이미지를 길게 눌러 ‘이미지 저장’도 가능해요"
        : "미리보기에는 워터마크가 들어갑니다 · 10,000원 이용권 등록 후 원본 저장·공유가 열립니다";
    }
    var tag = $("#wishPrice");
    if (tag) tag.textContent = paid ? "소장 완료" : "1건 10,000원";
    if (PLAY && tag) tag.textContent = "무료";
  }

  function issue() {
    var input = $("#wishInput");
    var wish = (input && input.value || "").trim();
    if (!wish) { toast("소원을 한 줄 적어 주세요"); if (input) input.focus(); return; }
    if (wish.length > 40) { toast("소원은 40자까지 적을 수 있어요"); return; }
    state.wish = wish;
    /* 이용권을 먼저 등록해 둔 경우에는 첫 카드부터 열어 줍니다 (등록 1건 = 카드 1장) */
    state.paid = PLAY || !!(state.credit > 0);
    if (state.paid) state.credit = 0;
    render();
    lockUi();
    var out = $("#wishOut");
    if (out) out.hidden = false;
    toast(PLAY ? "부적 카드를 만들었어요 · 저장하거나 공유해 보세요" : "부적 카드를 만들었어요 · 미리보기를 확인해 보세요");
    if (out) setTimeout(function () { out.scrollIntoView({ behavior: "smooth", block: "center" }); }, 120);
  }

  /* ───────── 단건 상품 결제 (계좌이체 + 이용권 코드) ───────── */
  function openBuy() {
    if (PLAY) { toast("플레이스토어 버전은 소원 부적을 무료로 만들 수 있어요"); return; }
    var body = document.getElementById("payBody");
    var modal = document.getElementById("payModal");
    var M = global.Membership;
    if (!body || !modal || !M || !M.bankBox) return;
    body.innerHTML =
      '<div class="pay-head"><span class="pay-name">3일 소원 부적·카드</span>' +
        '<span class="pay-price"><b>' + won(PRICE) + "</b>원 / 1건</span></div>" +
      '<div class="kv-list">' +
        "<div class=\"kv\"><span>제공 내용</span><b>부적 카드 이미지 1080×1440 PNG 1장</b></div>" +
        "<div class=\"kv\"><span>소원 문구</span><b>" + escTxt(state.wish || "-") + "</b></div>" +
        "<div class=\"kv\"><span>이용 기간</span><b>3일 성취 기원 · 저장 후 계속 소장</b></div>" +
      "</div>" +
      M.bankBox(PRICE) +
      M.voucherBox("wish", "입금 확인 후 받은 이용권 코드", "BC-W-XXXXX") +
      '<p class="tiny" style="text-align:left;margin-top:10px">' +
        "<b>디지털 콘텐츠 고지</b> — 결제 즉시 이미지가 제공되는 디지털 콘텐츠입니다. 제공이 시작된 뒤에는 청약철회(전액 환불)가 제한될 수 있습니다(전자상거래법 제17조 제2항). " +
        "이용권은 등록한 기기에서만 유효하며, 등록 1건에 카드 1장이 열립니다." +
      "</p>" +
      '<button type="button" class="btn btn-ghost" id="wishPayCancel" style="margin-top:10px">닫기</button>';
    modal.classList.add("show");

    var cancel = document.getElementById("wishPayCancel");
    if (cancel) cancel.addEventListener("click", function () { modal.classList.remove("show"); });
    M.bindPayBox(body, "wish", function () { modal.classList.remove("show"); });
  }

  /* 이용권(W) 등록 시 account.js 가 호출 — 이 기기의 부적 카드 잠금을 풉니다 (1건 = 카드 1장) */
  function grant(code) {
    var orders = load(K.orders, []) || [];
    orders.unshift({
      orderId: "VC-" + (code || ""), product: "3일 소원 부적·카드", price: PRICE, currency: "KRW",
      wish: state.wish, mode: "voucher", at: new Date().toISOString()
    });
    store(K.orders, orders.slice(0, 50));
    var modal = document.getElementById("payModal");
    if (modal) modal.classList.remove("show");
    var out = $("#wishOut");
    if (out && !out.hidden) {
      state.paid = true;
      render();
      lockUi();
      toast("이용권이 등록되었습니다 · 원본 부적 카드를 저장할 수 있어요");
    } else {
      state.credit = (state.credit || 0) + 1;
      toast("3일 소원 부적 이용권이 등록되었습니다 · 소원을 적으면 바로 열립니다");
    }
  }

  function escTxt(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function save() {
    if (!state.paid) { openBuy(); return; }
    var canvas = $("#wishCanvas");
    if (!canvas) return;
    var done = function (blob) {
      if (!blob) { toast("이미지를 만들지 못했습니다 · 다시 시도해 주세요"); return; }
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = FILE_NAME;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 6000);
      toast("저장했어요 · 갤러리(사진첩)에서 확인해 보세요");
      var share = $("#wishShare");
      if (share && navigator.canShare) {
        try {
          var f = new File([blob], FILE_NAME, { type: "image/png" });
          if (navigator.canShare({ files: [f] })) share.hidden = false;
        } catch (e) { /* 구형 브라우저 */ }
      }
    };
    try {
      canvas.toBlob(done, "image/png");
    } catch (e) {
      try {
        var url2 = canvas.toDataURL("image/png");
        var a2 = document.createElement("a");
        a2.href = url2; a2.download = FILE_NAME;
        document.body.appendChild(a2); a2.click(); a2.remove();
        toast("저장했어요 · 갤러리에서 확인해 보세요");
      } catch (e2) { toast("이 브라우저에서는 이미지를 길게 눌러 저장해 주세요"); }
    }
  }

  function share() {
    var canvas = $("#wishCanvas");
    if (!canvas || !navigator.canShare) return;
    canvas.toBlob(function (blob) {
      if (!blob) return;
      var file = new File([blob], FILE_NAME, { type: "image/png" });
      if (!navigator.canShare({ files: [file] })) { toast("이 브라우저는 공유를 지원하지 않아요 · 저장을 이용해 주세요"); return; }
      navigator.share({
        files: [file],
        title: "복채로또 · 3일 소원 부적",
        text: state.wish ? "내 소원: " + state.wish : "복채로또 3일 소원 부적"
      }).catch(function () { /* 사용자가 취소 */ });
    }, "image/png");
  }

  /* ───────── 초기화 ───────── */
  function init() {
    var sec = $("#wish");
    if (!sec) return;
    if (PLAY) {
      var makeBtn = $("#wishMake");
      if (makeBtn) makeBtn.innerHTML = "소원 부적·카드 만들기 <small>무료</small>";
    }
    lockUi();
    var make = $("#wishMake");
    if (make) make.addEventListener("click", issue);
    var buy = $("#wishBuy");
    if (buy) buy.addEventListener("click", openBuy);
    var saveBtn = $("#wishSave");
    if (saveBtn) saveBtn.addEventListener("click", save);
    var shareBtn = $("#wishShare");
    if (shareBtn) shareBtn.addEventListener("click", share);
    var input = $("#wishInput");
    if (input) {
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); issue(); }
      });
    }
    try {
      var orders = load(K.orders, []) || [];
      var last = orders[0];
      if (last && last.at && (Date.now() - new Date(last.at).getTime()) < 1000 * 60 * 60 * 24 * 3 && input && !input.value && !PLAY) {
        /* 최근 3일 내 구매 기록이 있으면 안내만 남깁니다 (카드는 다시 만들어 결제) */
        $("#wishHint").innerHTML = "최근 소장한 부적이 있어요 · 새 소원은 새 카드로 발급됩니다 (1건 10,000원)";
      }
    } catch (e) { /* ignore */ }
  }

  global.Wish = {
    price: PRICE,
    issue: issue,
    buy: openBuy,
    draw: draw,
    grant: grant,
    isPaid: function () { return state.paid; }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window);
