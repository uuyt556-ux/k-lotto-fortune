/*! saju.js — K-사주 로또 엔진
 *  · 절기(입춘·경칩…) 기준 사주 네 기둥 계산
 *  · 오행 분포 / 부족 오행 / 오늘의 일진·재물운
 *  · 사주 + 일진 + 최근 회차 통계를 결합한 6/45 번호 추천과 근거 태그
 *  외부 라이브러리 없이 동작합니다. */
(function (global) {
  "use strict";

  /* ───────── 기본 상수 ───────── */
  var STEMS = ["갑", "을", "병", "정", "무", "기", "경", "신", "임", "계"];
  var STEMS_H = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
  var BRANCHES = ["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"];
  var BRANCHES_H = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
  var ANIMALS = ["쥐", "소", "호랑이", "토끼", "용", "뱀", "말", "양", "원숭이", "닭", "개", "돼지"];
  var STEM_EL = ["목", "목", "화", "화", "토", "토", "금", "금", "수", "수"];
  var BRANCH_EL = ["수", "토", "목", "목", "토", "화", "화", "토", "금", "금", "토", "수"];
  var ELEMS = ["목", "화", "토", "금", "수"];
  var ELEM_H = { 목: "木", 화: "火", 토: "土", 금: "金", 수: "水" };
  var ELEM_COLOR = { 목: "#2B6E6C", 화: "#B83B2A", 토: "#A97B33", 금: "#8C8676", 수: "#2E4A6B" };
  var ELEM_DIR = { 목: "동쪽", 화: "남쪽", 토: "중앙·집", 금: "서쪽", 수: "북쪽" };
  var ELEM_COLORNAME = { 목: "청록색", 화: "붉은색", 토: "노란색", 금: "흰색·금색", 수: "검정·남색" };
  var ELEM_TIME = { 목: "인시·묘시(03:30~07:30)", 화: "사시·오시(09:30~13:30)", 토: "진시·미시·술시·축시", 금: "신시·유시(15:30~19:30)", 수: "자시·해시(21:30~01:30)" };
  var ELEM_JOB = { 목: "새로운 제안·기획", 화: "홍보·발표·소통", 토: "계약·저축·정리", 금: "결제·품질·마무리", 수: "이동·거래·정보" };
  var ELEM_ADVICE = {
    목: "새로운 일을 벌이기 좋은 기운입니다. 미뤄둔 제안 하나를 오늘 꺼내 보세요.",
    화: "사람을 만나고 알리는 일에 기운이 붙습니다. 먼저 말을 거는 쪽이 이깁니다.",
    토: "기반을 다지는 날입니다. 지출을 정리하고 숫자를 확인하면 재물이 새지 않습니다.",
    금: "마무리와 결제에 강한 날입니다. 미룬 정산을 끝내면 다음 흐름이 열립니다.",
    수: "정보와 이동에서 기회가 옵니다. 낯선 곳·새로운 채널을 살펴보세요."
  };
  var ELEM_LACK_LINE = {
    목: "결정을 미루지 말고 방향을 먼저 정하면", 화: "혼자보다 함께 움직이면", 토: "욕심을 조금 덜어내면",
    금: "기준을 분명히 하면", 수: "생각을 오래 붙들지 않으면"
  };

  /* ───────── 태양 황경과 24절기 ───────── */
  var TERM_DEG = [315, 345, 15, 45, 75, 105, 135, 165, 195, 225, 255, 285];
  var TERM_NAME = { 315: "입춘", 345: "경칩", 15: "청명", 45: "입하", 75: "망종", 105: "소서", 135: "입추", 165: "백로", 195: "한로", 225: "입동", 255: "대설", 285: "소한" };
  var TERM_MD = { 315: [2, 4], 345: [3, 6], 15: [4, 5], 45: [5, 6], 75: [6, 6], 105: [7, 7], 135: [8, 8], 165: [9, 8], 195: [10, 8], 225: [11, 7], 255: [12, 7], 285: [1, 6] };
  var DEG_BRANCH = { 315: 2, 345: 3, 15: 4, 45: 5, 75: 6, 105: 7, 135: 8, 165: 9, 195: 10, 225: 11, 255: 0, 285: 1 };

  function jdFromKST(y, m, d, h, mi) {
    var Y = y, M = m;
    if (M <= 2) { Y -= 1; M += 12; }
    var A = Math.floor(Y / 100), B = 2 - A + Math.floor(A / 4);
    var frac = (d + ((h || 0) + (mi || 0) / 60) / 24 - 9 / 24); // KST → UT
    return Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1)) + B - 1524.5 + frac;
  }

  function sunLongitude(jd) {
    var T = (jd - 2451545.0) / 36525.0;
    var L0 = (280.46646 + 36000.76983 * T + 0.0003032 * T * T) % 360;
    var M = ((357.52911 + 35999.05029 * T - 0.0001537 * T * T) % 360) * Math.PI / 180;
    var C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M)
      + (0.019993 - 0.000101 * T) * Math.sin(2 * M)
      + 0.000289 * Math.sin(3 * M);
    var om = (125.04 - 1934.136 * T) * Math.PI / 180;
    var lam = L0 + C - 0.00569 - 0.00478 * Math.sin(om);
    return (lam % 360 + 360) % 360;
  }

  var termCache = {};
  /* 절기 시각을 KST 기준 epoch(ms)로 돌려준다 */
  function termKST(year, deg) {
    var key = year + ":" + deg;
    if (termCache[key]) return termCache[key];
    var md = TERM_MD[deg];
    var jd = jdFromKST(year, md[0], md[1], 12, 0);
    var lo = jd - 6, hi = jd + 6;
    var diff = function (j) { return ((sunLongitude(j) - deg + 540) % 360) - 180; };
    var dlo = diff(lo);
    for (var i = 0; i < 54; i++) {
      var mid = (lo + hi) / 2, dm = diff(mid);
      if ((dlo <= 0 && dm >= 0) || (dlo >= 0 && dm <= 0)) { hi = mid; }
      else { lo = mid; dlo = dm; }
    }
    var ms = ((lo + hi) / 2 - 2440587.5) * 86400000 + 9 * 3600000;
    termCache[key] = ms;
    return ms;
  }

  function kstParts(ms) {
    var d = new Date(ms); // ms는 이미 KST 벽시계 기준
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
  }

  function fmtTerm(year, deg) {
    var p = kstParts(termKST(year, deg));
    return TERM_NAME[deg] + " " + p.m + "월 " + p.d + "일 " + String(p.h).padStart(2, "0") + ":" + String(p.mi).padStart(2, "0");
  }

  /* ───────── 사주 네 기둥 ───────── */
  var HOUR_LABEL = ["자시", "축시", "인시", "묘시", "진시", "사시", "오시", "미시", "신시", "유시", "술시", "해시"];

  function pillars(solarY, solarM, solarD, hour, minute) {
    var hasTime = hour !== null && hour !== undefined;
    var t = Date.UTC(solarY, solarM - 1, solarD, hasTime ? hour : 12, hasTime ? (minute || 0) : 0);

    /* 년주: 입춘 기준 */
    var ipchun = termKST(solarY, 315);
    var yYear = t >= ipchun ? solarY : solarY - 1;
    var yStem = ((yYear - 4) % 10 + 10) % 10;
    var yBranch = ((yYear - 4) % 12 + 12) % 12;

    /* 월주: 절기 기준 */
    var best = null;
    for (var yy = solarY - 1; yy <= solarY + 1; yy++) {
      for (var i = 0; i < TERM_DEG.length; i++) {
        var deg = TERM_DEG[i], tm = termKST(yy, deg);
        if (tm <= t && (!best || tm > best.t)) best = { deg: deg, t: tm };
      }
    }
    var mBranch = DEG_BRANCH[best.deg];
    var inStem = ((yStem % 5) * 2 + 2) % 10; // 인월 천간
    var mStem = (inStem + ((mBranch - 2 + 12) % 12)) % 10;

    /* 일주: 율리우스일 기반 60갑자 */
    var jdn = Math.floor(jdFromKST(solarY, solarM, solarD, 12, 0) + 0.5);
    var dayIdx = ((jdn + 49) % 60 + 60) % 60;
    var dStem = dayIdx % 10, dBranch = dayIdx % 12;

    /* 시주 */
    var hStem = null, hBranch = null;
    if (hasTime) {
      var mins = hour * 60 + (minute || 0);
      hBranch = Math.floor(((mins + 30) % 1440) / 120);
      var jaStem = (dStem % 5) * 2;
      hStem = (jaStem + hBranch) % 10;
    }

    var p = [
      { key: "hour", label: "시주", stem: hStem, branch: hBranch },
      { key: "day", label: "일주", stem: dStem, branch: dBranch },
      { key: "month", label: "월주", stem: mStem, branch: mBranch },
      { key: "year", label: "년주", stem: yStem, branch: yBranch }
    ];
    return {
      pillars: p,
      hasTime: hasTime,
      yearPillar: yYear,
      animal: ANIMALS[yBranch],
      hanja: p.map(function (x) {
        return (x.stem === null ? "??" : STEMS_H[x.stem] + BRANCHES_H[x.branch]);
      }).join(" "),
      text: p.map(function (x) {
        return (x.stem === null ? "모름" : STEMS[x.stem] + BRANCHES[x.branch]);
      }).join(" "),
      term: TERM_NAME[best.deg],
      yearBoundary: fmtTerm(solarY, 315)
    };
  }

  /* ───────── 오행 분석 ───────── */
  function analyze(s) {
    var counts = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
    var chars = [];
    s.pillars.forEach(function (p) {
      if (p.stem === null) return;
      counts[STEM_EL[p.stem]] += 1;
      counts[BRANCH_EL[p.branch]] += 1;
      chars.push({ ch: STEMS[p.stem], el: STEM_EL[p.stem], kind: "천간", pillar: p.label });
      chars.push({ ch: BRANCHES[p.branch], el: BRANCH_EL[p.branch], kind: "지지", pillar: p.label });
    });
    var total = 0;
    ELEMS.forEach(function (e) { total += counts[e]; });
    var avg = total / 5;
    var lacking = ELEMS.filter(function (e) { return counts[e] === 0; });
    if (!lacking.length) {
      var min = Math.min.apply(null, ELEMS.map(function (e) { return counts[e]; }));
      lacking = ELEMS.filter(function (e) { return counts[e] === min; });
    }
    var max = Math.max.apply(null, ELEMS.map(function (e) { return counts[e]; }));
    var strongest = ELEMS.filter(function (e) { return counts[e] === max; });
    var dayStem = s.pillars[1].stem;
    var dayEl = STEM_EL[dayStem];
    return {
      counts: counts, lacking: lacking, strongest: strongest, total: total,
      dayEl: dayEl, dayStem: dayStem,
      dayStemName: STEMS[dayStem] + "(" + STEMS_H[dayStem] + ")",
      yinyang: dayStem % 2 === 0 ? "양(陽)" : "음(陰)",
      chars: chars,
      balance: ELEMS.map(function (e) {
        return { el: e, count: counts[e], pct: total ? Math.round(counts[e] / total * 100) : 0 };
      })
    };
  }

  /* ───────── 오늘의 일진과 운세 ───────── */
  var GEN = { 목: "화", 화: "토", 토: "금", 금: "수", 수: "목" };   // 상생
  var CON = { 목: "토", 토: "수", 수: "화", 화: "금", 금: "목" };   // 상극

  function dayGanzi(date) {
    var jdn = Math.floor(jdFromKST(date.getFullYear(), date.getMonth() + 1, date.getDate(), 12, 0) + 0.5);
    var idx = ((jdn + 49) % 60 + 60) % 60;
    var st = idx % 10, br = idx % 12;
    return {
      idx: idx, stem: st, branch: br,
      name: STEMS[st] + BRANCHES[br],
      hanja: STEMS_H[st] + BRANCHES_H[br],
      stemEl: STEM_EL[st], branchEl: BRANCH_EL[br],
      animal: ANIMALS[br]
    };
  }

  function hash(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }

  function relation(a, b) {
    if (a === b) return "same";
    if (GEN[a] === b) return "gives";     // 내가 생해줌
    if (GEN[b] === a) return "receives";  // 나를 생해줌
    if (CON[a] === b) return "controls";  // 내가 극함(재물)
    if (CON[b] === a) return "controlled";
    return "neutral";
  }

  var REL_TEXT = {
    receives: "오늘의 기운이 나를 살리는 날",
    gives: "기운을 나눠주며 쓰이는 날",
    controls: "내가 재물을 쥐는 날",
    controlled: "기운이 눌리는 날, 서두르지 않기",
    same: "내 기운이 두 배로 커지는 날",
    neutral: "무난하게 흐르는 날"
  };

  function fortune(saju, birthKey, date) {
    var gz = dayGanzi(date);
    var key = date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate();
    var jitter = (hash(key + "|" + (birthKey || "guest")) % 19) - 9;
    var score = 58 + jitter;
    var rel = "neutral", myEl = null, lackHit = false, overHit = false;

    if (saju) {
      myEl = saju.dayEl;
      rel = relation(gz.branchEl, myEl);
      score += { receives: 14, gives: 4, controls: 6, controlled: -9, same: 8, neutral: 0 }[rel];
      if (saju.lacking.indexOf(gz.branchEl) >= 0) { score += 10; lackHit = true; }
      if (saju.strongest.indexOf(gz.branchEl) >= 0 && saju.counts[gz.branchEl] >= 3) { score -= 4; overHit = true; }
      if (STEM_EL[gz.stem] === myEl) score += 3;
    } else {
      score += 4;
    }
    score = Math.max(41, Math.min(97, score));
    var wealth = Math.max(38, Math.min(98, score + ((hash(key + "w") % 11) - 5)));

    var todayEl = gz.branchEl;
    var guide = saju ? cheer(saju, gz, rel) : "생년월일을 넣으면 오늘 기운과 내 사주를 함께 읽어 더 정확한 조합을 만듭니다.";

    var luckyPool = ELEM_NUMS[todayEl].slice();
    if (saju) ELEM_NUMS[saju.lacking[0]].forEach(function (n) { if (luckyPool.indexOf(n) < 0) luckyPool.push(n); });
    var lucky = [];
    for (var i = 0; i < 3; i++) lucky.push(luckyPool[(hash(key + "l" + i) % luckyPool.length)]);
    lucky = Array.from(new Set(lucky)).sort(function (a, b) { return a - b; });

    var caution = {
      receives: "기회가 들어오는 날이지만 두 곳에 마음을 나누면 힘이 빠집니다. 하나만 고르세요.",
      gives: "남을 챙기다 내 몫을 놓치기 쉽습니다. 지출 전에 한 번 더 확인하세요.",
      controls: "재물을 쥘 수 있는 날이지만 과한 베팅은 금물입니다. 걸 수 있는 만큼만.",
      controlled: "큰 결정과 큰 지출은 내일로 미루는 편이 좋습니다.",
      same: "기운이 강해 고집이 세지기 쉽습니다. 말을 한 번 고르세요.",
      neutral: "특별한 변수 없는 하루. 루틴을 지키는 것이 가장 좋습니다."
    }[rel];

    return {
      gz: gz, dateKey: key, score: score, wealth: wealth, relation: rel,
      relText: REL_TEXT[rel], todayEl: todayEl, lucky: lucky,
      luckyTime: ELEM_TIME[todayEl], luckyDir: ELEM_DIR[todayEl], luckyColor: ELEM_COLORNAME[todayEl],
      guide: guide, caution: caution, lackHit: lackHit, overHit: overHit,
      myEl: myEl
    };
  }

  function cheer(saju, gz, rel) {
    var e = gz.branchEl, me = saju.dayEl;
    if (rel === "receives") return "오늘은 " + ELEM_H[e] + "(" + e + ") 기운이 " + ELEM_H[me] + "(" + me + ")인 당신을 밝혀주는 날입니다. " + ELEM_ADVICE[e];
    if (rel === "same") return "내 기운과 같은 " + ELEM_H[e] + "(" + e + ")의 날이 겹쳤습니다. " + ELEM_ADVICE[e];
    if (rel === "controls") return "오늘 " + ELEM_H[e] + "(" + e + ")의 기운은 당신이 다스릴 수 있는 재물의 자리입니다. " + ELEM_ADVICE[e] + " 다만 한 번에 크게 걸지 마세요.";
    if (rel === "controlled") return ELEM_H[e] + "(" + e + ") 기운이 당신을 누르는 날입니다. " + ELEM_LACK_LINE[saju.lacking[0]] + " 흐름이 부드러워집니다.";
    if (rel === "gives") return "당신의 " + ELEM_H[me] + "(" + me + ") 기운이 오늘 " + ELEM_H[e] + "(" + e + ")로 흘러나가는 날입니다. " + ELEM_ADVICE[e];
    return "오늘은 " + ELEM_H[e] + "(" + e + ")의 기운이 도는 날입니다. " + ELEM_ADVICE[e];
  }

  /* ───────── 로또 번호 풀 ───────── */
  var ELEM_NUMS = {
    수: [1, 6, 11, 16, 21, 26, 31, 36, 41],
    화: [2, 7, 12, 17, 22, 27, 32, 37, 42],
    목: [3, 8, 13, 18, 23, 28, 33, 38, 43],
    금: [4, 9, 14, 19, 24, 29, 34, 39, 44],
    토: [5, 10, 15, 20, 25, 30, 35, 40, 45]
  };
  var ALL_NUMS = []; for (var n = 1; n <= 45; n++) ALL_NUMS.push(n);
  var LAST_EL = { 1: "수", 6: "수", 2: "화", 7: "화", 3: "목", 8: "목", 4: "금", 9: "금", 5: "토", 0: "토" };
  function numElem(n) { return LAST_EL[n % 10]; }

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function statsFrom(draws, window) {
    var freq = {}, seen = {};
    ALL_NUMS.forEach(function (n) { freq[n] = 0; seen[n] = 999; });
    var list = draws.slice(0, window || draws.length);
    list.forEach(function (d, i) {
      d.n.forEach(function (n) { freq[n] += 1; if (seen[n] === 999) seen[n] = i; });
    });
    return { freq: freq, seen: seen, rounds: list.length };
  }

  function pickValid(seed, pools, mustTags, avoid) {
    /* pools: [{nums:[], tag, weight}]  mustTags 로 각 풀에서 최소 몇 개를 뽑을지 지정
       avoid: {번호: 이미 쓰인 횟수} — 두 조합에 겹치지 않도록 2회 이상 쓴 번호는 피한다 */
    var rnd = mulberry32(seed);
    var best = null;
    for (var attempt = 0; attempt < 420; attempt++) {
      var chosen = [], tags = {};
      pools.forEach(function (p, pi) {
        var need = (mustTags[pi] || 0), pool = p.nums.filter(function (n) { return !tags[n] && !(avoid && avoid[n] >= 2); });
        if (pool.length < need) pool = p.nums.filter(function (n) { return !tags[n]; });
        for (var k = 0; k < need && pool.length; k++) {
          var idx = Math.floor(rnd() * pool.length);
          var num = pool.splice(idx, 1)[0];
          chosen.push(num); tags[num] = p.tag;
        }
      });
      /* 남은 자리는 가중치 순서대로 */
      while (chosen.length < 6) {
        var bag = [];
        pools.forEach(function (p) {
          p.nums.forEach(function (n) { if (!tags[n] && !(avoid && avoid[n] >= 2)) { for (var w = 0; w < (p.weight || 1); w++) bag.push({ n: n, tag: p.tag }); } });
        });
        if (!bag.length) break;
        var pick = bag[Math.floor(rnd() * bag.length)];
        chosen.push(pick.n); tags[pick.n] = pick.tag;
      }
      chosen = Array.from(new Set(chosen));
      while (chosen.length < 6) {
        var rest = ALL_NUMS.filter(function (n) { return chosen.indexOf(n) < 0; });
        var x = rest[Math.floor(rnd() * rest.length)];
        chosen.push(x); tags[x] = "균형 보정";
      }
      chosen.sort(function (a, b) { return a - b; });
      var q = quality(chosen);
      if (q.ok) return { nums: chosen, tags: tags, q: q };
      if (!best || q.score > best.q.score) best = { nums: chosen, tags: tags, q: q };
    }
    return best;
  }

  function quality(nums) {
    var sum = nums.reduce(function (a, b) { return a + b; }, 0);
    var odd = nums.filter(function (n) { return n % 2; }).length;
    var consec = 0, run = 1;
    for (var i = 1; i < 6; i++) { if (nums[i] === nums[i - 1] + 1) { run++; consec = Math.max(consec, run); } else run = 1; }
    var bands = {};
    nums.forEach(function (n) { bands[Math.min(3, Math.floor((n - 1) / 10))] = 1; });
    var bandCount = Object.keys(bands).length;
    var score = 0;
    if (sum >= 100 && sum <= 175) score += 3;
    if (sum >= 115 && sum <= 155) score += 2;
    if (odd >= 2 && odd <= 4) score += 2;
    if (consec <= 2) score += 2;
    if (bandCount >= 4) score += 2; else if (bandCount === 3) score += 1;
    var ok = sum >= 95 && sum <= 180 && odd >= 2 && odd <= 4 && consec <= 2 && bandCount >= 3;
    return { ok: ok, sum: sum, odd: odd, even: 6 - odd, consec: consec, bands: bandCount, score: score };
  }

  var STYLE_TITLE = ["부족 오행 보완형", "오늘 일진 집중형", "미출현 보완형", "사주 수리형", "균형 조합형"];

  function recommend(saju, birthKey, date, draws) {
    var f = fortune(saju, birthKey, date);
    var today = dayGanzi(date);
    var st10 = statsFrom(draws || [], 10);
    var st30 = statsFrom(draws || [], 30);
    var lackingList = saju ? saju.lacking.slice(0, 2) : [today.branchEl];
    if (lackingList.length < 2) {
      var second = ELEMS.filter(function (e) { return e !== lackingList[0]; })
        .sort(function (a, b) { return (saju ? saju.counts[a] : 0) - (saju ? saju.counts[b] : 0); })[0];
      lackingList.push(second);
    }
    var lacking = lackingList[0], lacking2 = lackingList[1];
    var isGuest = !saju;
    var lackingPool = [];
    lackingList.forEach(function (e) { ELEM_NUMS[e].forEach(function (n) { if (lackingPool.indexOf(n) < 0) lackingPool.push(n); }); });
    var lackTag = isGuest ? "오늘 " + ELEM_H[lacking] + " 기운" : "부족 " + ELEM_H[lacking] + " 보완";
    var dayEl = today.branchEl;
    var myEl = saju ? saju.dayEl : dayEl;

    var cold = ALL_NUMS.filter(function (n) { return st10.seen[n] === 999; }).sort(function (a, b) { return (st30.freq[a] || 0) - (st30.freq[b] || 0) || a - b; });
    var hot = ALL_NUMS.slice().sort(function (a, b) { return st30.freq[b] - st30.freq[a] || a - b; });

    var seedBase = hash((birthKey || "guest") + "|" + f.dateKey);
    var defs = [
      { pools: [{ nums: lackingPool, tag: lackTag, weight: 3 }, { nums: ELEM_NUMS[dayEl], tag: "오늘 " + ELEM_H[dayEl] + " 기운", weight: 2 }, { nums: hot.slice(0, 12), tag: "최근 다출", weight: 1 }], need: [3, 2, 1] },
      { pools: [{ nums: ELEM_NUMS[dayEl], tag: "오늘 " + ELEM_H[dayEl] + " 기운", weight: 3 }, { nums: lackingPool, tag: lackTag, weight: 2 }, { nums: cold.slice(0, 12), tag: "미출현 보완", weight: 1 }], need: [3, 2, 1] },
      { pools: [{ nums: cold.slice(0, 15), tag: "최근 10회 미출현", weight: 3 }, { nums: ELEM_NUMS[lacking], tag: "부족 " + ELEM_H[lacking] + " 보완", weight: 2 }, { nums: ELEM_NUMS[lacking2], tag: "부족 " + ELEM_H[lacking2] + " 보완", weight: 1 }], need: [3, 2, 1] },
      { pools: [{ nums: ELEM_NUMS[myEl], tag: "일간 " + ELEM_H[myEl] + " 수리", weight: 3 }, { nums: lackingPool, tag: lackTag, weight: 2 }, { nums: hot.slice(0, 15), tag: "최근 다출", weight: 1 }], need: [2, 2, 2] },
      { pools: [{ nums: ALL_NUMS, tag: "균형 배치", weight: 4 }], need: [6] }
    ];

    /* 무료 기본 조합 */
    var free = pickValid(seedBase, defs[0].pools, defs[0].need, null);
    free = { id: 0, title: (isGuest ? "오늘 일진 기본형" : "부족 " + ELEM_H[lacking] + " 보완형"), nums: free.nums, tags: free.tags, q: free.q, desc: comboDesc(0, lacking, dayEl, isGuest) };

    /* 황금 5조합 — 무료 조합과 겹치지 않게, 조합끼리도 2번 이상 겹치지 않게 */
    var avoid = {};
    free.nums.forEach(function (n) { avoid[n] = 2; });
    var out = [];
    defs.forEach(function (d, i) {
      var r = pickValid(seedBase + 50021 + i * 7919, d.pools, d.need, avoid);
      r.nums.forEach(function (n) { avoid[n] = (avoid[n] || 0) + 1; });
      out.push({ id: i, title: STYLE_TITLE[i], nums: r.nums, tags: r.tags, q: r.q, desc: comboDesc(i, lacking, dayEl, isGuest) });
    });

    /* 혹시 같은 조합이 나오면 한 번 더 */
    for (var pass = 0; pass < 2; pass++) {
      for (var i = 0; i < out.length; i++) {
        for (var j = 0; j < i; j++) {
          if (out[i].nums.join(",") === out[j].nums.join(",")) {
            var r2 = pickValid(seedBase + 90001 + i * 31 + pass * 7, defs[i].pools, defs[i].need, avoid);
            out[i].nums = r2.nums; out[i].tags = r2.tags; out[i].q = r2.q;
          }
        }
      }
    }

    return { fortune: f, combos: out, free: free, stats: { hot: hot.slice(0, 6), cold: cold.slice(0, 6), s10: st10, s30: st30 } };
  }

  function comboDesc(i, lacking, dayEl, isGuest) {
    var a = ELEM_H[lacking] + " 기운을 채우는 수리";
    if (i === 0 && isGuest) return "오늘 일진 " + ELEM_H[dayEl] + "의 기운과 최근 회차의 흐름을 섞었습니다.";
    if (i === 0) return a + "를 중심으로, 오늘 " + ELEM_H[dayEl] + " 기운과 최근 흐름을 섞었습니다.";
    if (i === 1) return "오늘 일진 " + ELEM_H[dayEl] + "의 기운을 앞세우고 부족한 " + ELEM_H[lacking] + "를 뒤에서 받쳐 주는 조합입니다.";
    if (i === 2) return "최근 10회 동안 나오지 않은 번호로 때를 기다린 자리를 채웠습니다.";
    if (i === 3) return "내 일간의 수리와 부족 오행을 함께 놓은 조합입니다.";
    return "합계·홀짝·구간이 고르게 퍼진 기본형입니다. 초보자에게 무난합니다.";
  }

  /* ───────── 태그를 사람 말로 ───────── */
  function reasonText(tag, n) {
    var last = n % 10, el = numElem(n), H = ELEM_H[el];
    if (tag.indexOf("보완") >= 0) return "끝수 " + last + " · " + H + "(" + el + ") 수리로 " + el + " 기운을 채웁니다";
    if (tag.indexOf("오늘") >= 0) return "끝수 " + last + " · 오늘 일진의 " + H + "(" + el + ") 기운을 그대로 받습니다";
    if (tag.indexOf("미출현") >= 0) return "최근 10회 동안 나오지 않은 번호 — 때를 기다리던 자리입니다";
    if (tag.indexOf("다출") >= 0) return "최근 회차에서 여러 번 나온 번호 — 지금의 흐름을 따릅니다";
    if (tag.indexOf("일간") >= 0) return "일간(나)의 " + H + "(" + el + ") 수리와 끝수가 맞습니다";
    return "합계·홀짝·구간의 균형을 맞춘 자리입니다";
  }

  function reasonLines(combo, saju) {
    return combo.nums.map(function (n) {
      var tag = combo.tags[n] || "균형 보정";
      return { n: n, el: numElem(n), last: n % 10, tag: tag, text: reasonText(tag, n) };
    });
  }

  function winRank(combo, draw) {
    if (!draw) return null;
    var hit = combo.filter(function (n) { return draw.n.indexOf(n) >= 0; }).length;
    var bonus = combo.indexOf(draw.b) >= 0;
    if (hit === 6) return { rank: 1, label: "1등", prize: draw.p1, hit: hit };
    if (hit === 5 && bonus) return { rank: 2, label: "2등", prize: 0, hit: hit };
    if (hit === 5) return { rank: 3, label: "3등", prize: 0, hit: hit };
    if (hit === 4) return { rank: 4, label: "4등", prize: 50000, hit: hit };
    if (hit === 3) return { rank: 5, label: "5등", prize: 5000, hit: hit };
    return { rank: 0, label: "낙첨", prize: 0, hit: hit };
  }

  global.Saju = {
    pillars: pillars, analyze: analyze, dayGanzi: dayGanzi, fortune: fortune,
    recommend: recommend, reasonLines: reasonLines, winRank: winRank,
    ELEMS: ELEMS, ELEM_H: ELEM_H, ELEM_COLOR: ELEM_COLOR, ELEM_NUMS: ELEM_NUMS,
    STEMS: STEMS, STEMS_H: STEMS_H, BRANCHES: BRANCHES, BRANCHES_H: BRANCHES_H,
    BRANCH_EL: BRANCH_EL, STEM_EL: STEM_EL, ANIMALS: ANIMALS, HOUR_LABEL: HOUR_LABEL,
    numElem: numElem, fmtTerm: fmtTerm, statsFrom: statsFrom, quality: quality, hash: hash
  };
})(window);
