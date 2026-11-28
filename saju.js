/*! saju.js — 복채로또 사주·번호 엔진
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
    /* 한 오행(끝수)에 번호가 몰리지 않게: 4개 이상이면 감점 */
    var elCount = {};
    nums.forEach(function (n) { var e = numElem(n); elCount[e] = (elCount[e] || 0) + 1; });
    var maxEl = 0;
    ELEMS.forEach(function (e) { maxEl = Math.max(maxEl, elCount[e] || 0); });
    var score = 0;
    if (maxEl <= 3) score += 2; else score -= 2;
    if (sum >= 100 && sum <= 175) score += 3;
    if (sum >= 115 && sum <= 155) score += 2;
    if (odd >= 2 && odd <= 4) score += 2;
    if (consec <= 2) score += 2;
    if (bandCount >= 4) score += 2; else if (bandCount === 3) score += 1;
    var ok = sum >= 95 && sum <= 180 && odd >= 2 && odd <= 4 && consec <= 2 && bandCount >= 3 && maxEl <= 3;
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

  /* ═════════ 2027 세운(丁未) 총운세 · 분야별 운 · 주의할 달 ═════════
     일간·오행 분포·억부(용신/희신/기신)·일지 충합을 세운과 월지에 대조해
     사람마다 다른 풀이가 나오도록 계산합니다. */
  var GEN_BY = { 화: "목", 토: "화", 금: "토", 수: "금", 목: "수" };  // 나를 생하는(인성)
  var CON_BY = { 토: "목", 수: "토", 화: "수", 금: "화", 목: "금" };  // 나를 극하는(관성)
  var CHONG = [6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5];   // 자축인묘진사오미신유술해 → 충
  var HE6 = [1, 0, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];    // 육합(子丑·寅亥·卯戌·辰酉·巳申·午未)

  function relTo(me, el) {
    if (el === me) return "same";
    if (GEN[me] === el) return "gives";
    if (GEN[el] === me) return "receives";
    if (CON[me] === el) return "controls";
    if (CON[el] === me) return "controlled";
    return "neutral";
  }
  function roleOf(me, el) {
    if (el === me) return "비겁";
    if (GEN[me] === el) return "식상";
    if (CON[me] === el) return "재성";
    if (CON_BY[me] === el) return "관성";
    return "인성";
  }
  function clampNum(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* 억부법 간이 판정 — 신강/신약 → 용신·희신·기신 */
  function ohaeng(a) {
    var me = a.dayEl, c = a.counts, total = a.total || 6;
    var support = c[me] + c[GEN_BY[me]];
    var strong = support * 2 > total;
    var useful, oppose;
    if (strong) {
      useful = [GEN[me], CON[me], CON_BY[me]];
      oppose = [GEN_BY[me], me];
    } else {
      useful = [GEN_BY[me], me];
      oppose = [GEN[me], CON[me], CON_BY[me]];
    }
    var byCount = function (arr) {
      return arr.slice().sort(function (x, y) { return c[x] - c[y] || arr.indexOf(x) - arr.indexOf(y); });
    };
    var u = byCount(useful), op = byCount(oppose);
    return {
      me: me, strong: strong, support: support, total: total,
      yong: u[0], hee: u[1] || u[0], gi: op[op.length - 1], counts: c
    };
  }

  function yearGanzi(y) {
    var st = ((y - 4) % 10 + 10) % 10, br = ((y - 4) % 12 + 12) % 12;
    return {
      year: y, stem: st, branch: br,
      name: STEMS[st] + BRANCHES[br], hanja: STEMS_H[st] + BRANCHES_H[br],
      stemEl: STEM_EL[st], branchEl: BRANCH_EL[br]
    };
  }

  var BODY_PART = {
    목: "간·담·눈과 힘줄", 화: "심장·혈압·수면", 토: "위·소화·체중", 금: "폐·기관지·피부", 수: "신장·방광·허리"
  };
  var BODY_TIP = {
    목: "눈을 자주 쉬게 하고 스트레칭으로 옆구리를 펴 주세요.",
    화: "카페인과 늦은 술을 줄이고 잠드는 시간을 고정하세요.",
    토: "저녁은 가볍게, 식사 시간은 일정하게 두세요.",
    금: "환기를 자주 하고, 목이 칼칼하면 바로 물을 마시세요.",
    수: "물을 챙겨 마시고 허리와 무릎을 차게 두지 마세요."
  };
  var ROLE_MONTH = { 비겁: "경쟁·지출", 식상: "표현·새 일", 재성: "재물", 관성: "계약·책임", 인성: "문서·준비" };
  var ROLE_USE = {
    비겁: "모임·동업 논의를", 식상: "홍보·출시·새 채널을", 재성: "정산·계약·가격 조정을",
    관성: "지원·심사·면접을", 인성: "공부·자격·서류 정리를"
  };
  var YEAR_ROLE_LINE = {
    목: "두 기운이 모두 내 손에서 나가는 자리(식상·재성)에 놓입니다. 만들고 알리고 파는 일이 그대로 재물이 되는 해입니다.",
    화: "불이 겹치고 흙이 따라오는 해입니다(비겁·식상). 내 기운이 두 배가 되는 만큼 나눠 줄 자리도 넓어집니다.",
    토: "불이 나를 살리고 흙이 나를 보태는 해입니다(인성·비겁). 버티던 일이 뿌리를 내리고 사람이 남습니다.",
    금: "불이 나를 단련하고 흙이 나를 감싸는 해입니다(관성·인성). 맡은 자리가 무거워지는 대신 실력이 값이 됩니다.",
    수: "불이 재물이 되고 흙이 책임이 되는 해입니다(재성·관성). 돈이 보이는 만큼 책임도 함께 따라옵니다."
  };
  var KEYWORDS = {
    목: { strong: ["말과 실행", "현금 흐름", "새 채널"], weak: ["속도 조절", "체력 관리", "기반 정비"] },
    화: { strong: ["주도권", "사람과 협업", "새 수입원"], weak: ["분산", "동업 주의", "안쪽 정비"] },
    토: { strong: ["공부·자격", "사람 관리", "고집 주의"], weak: ["회복", "후원", "뿌리내리기"] },
    금: { strong: ["계약·직책", "자격", "책임"], weak: ["버티기", "문서·자격", "건강"] },
    수: { strong: ["재물 기회", "계약", "확장"], weak: ["지출 통제", "무리 금지", "몸 챙기기"] }
  };
  var GI_KEY = { 목: "지출 통제", 화: "말 아끼기", 토: "결정 미루기", 금: "관계 정리", 수: "통장 나누기" };

  function gradeOf(score) {
    if (score >= 86) return { t: "크게 트이는 해", d: "밀어 둔 일이 결과로 굳는 흐름" };
    if (score >= 76) return { t: "밀면 열리는 해", d: "준비한 만큼 돌아오는 흐름" };
    if (score >= 66) return { t: "고르게 가는 해", d: "크게 벌이지 않으면 크게 잃지도 않는 흐름" };
    return { t: "속도를 줄여야 하는 해", d: "지키는 쪽이 이기는 흐름" };
  }

  function elementRx(el) {
    if (el === "화") return "열이 오르는 달이라 카페인·야식·늦은 술을 줄이세요.";
    if (el === "토") return "소화가 무거워지는 달이라 저녁은 가볍게, 야식은 끊으세요.";
    if (el === "수") return "수(水)가 모자라는 달이라 물·국물을 챙기고 밤 시간을 아끼세요.";
    if (el === "목") return "목(木)이 약해지는 달이라 눈과 목을 자주 쉬게 하세요.";
    return "금(金)이 약해지는 달이라 환기와 목 관리에 신경 쓰세요.";
  }

  /* ═════════ 2027 심층 총운 — 5개 섹션 ═════════
     일간·신강약·오행 과부족·용신/희신/기신·일지 충합·12개월 점수를 모두 문장에 반영합니다. */
  var ROLE_HEAD = {
    비겁: "동료·경쟁의 자리", 식상: "표현·생산의 자리", 재성: "재물·거래의 자리",
    관성: "책임·계약의 자리", 인성: "문서·후원의 자리"
  };
  var ROLE_MEAN = {
    비겁: "내 힘이 겹치는 자리라 사람과 돈이 함께 움직이고, 나눠야 커집니다",
    식상: "내가 만들어 밖으로 내보내는 자리라 말·상품·콘텐츠가 그대로 값이 됩니다",
    재성: "내가 직접 쥐는 돈의 자리라 거래·정산·가격이 결과를 가릅니다",
    관성: "나를 누르는 책임의 자리라 계약·직책·심사에서 실력이 값이 됩니다",
    인성: "나를 채워 주는 후원의 자리라 배움·서류·보증이 힘이 됩니다"
  };
  var EL_PERSON = {
    목: "기획·교육·콘텐츠로 사람을 키우는 사람",
    화: "홍보·영업·말로 사람을 모으는 사람",
    토: "계약·회계·유통·부동산을 다루는 사람",
    금: "품질·심사·결제·법무를 쥔 사람",
    수: "정보·물류·플랫폼을 다루는 사람"
  };
  var MONEY_PATH = {
    목: "새 제안과 기획을 문서로 만들어 파는 일",
    화: "알리고 설명해 사람을 모으는 일",
    토: "축적·계약·재고를 다루는 일",
    금: "결제·품질·마무리를 확실히 하는 일",
    수: "정보·거래·이동에서 기회를 잡는 일"
  };
  var EL_FRICTION = {
    목: "말이 앞서고 결정을 재촉하는 순간",
    화: "감정이 먼저 올라와 말이 세지는 순간",
    토: "고집이 올라와 남의 말을 끊는 순간",
    금: "기준을 따지다 관계를 서먹하게 만드는 말투",
    수: "생각이 많아 답이 늦어 오해를 사는 순간"
  };

  function elP(el, a, b) { return el + ((el === "목" || el === "금") ? a : b); }
  /* 한자(한글) 뒤에 알맞은 조사를 붙입니다. */
  function hj(el) { return ELEM_H[el] + "(" + el + ")" + ((el === "목" || el === "금") ? "이" : "가"); }
  function hjObj(el) { return ELEM_H[el] + "(" + el + ")" + ((el === "목" || el === "금") ? "을" : "를"); }
  var BR_BAT = { 축: 1, 인: 1, 진: 1, 신: 1, 술: 1 };   /* 받침이 있는 지지 */
  function bJ(name, a, b) { return name + (BR_BAT[name.charAt(0)] ? a : b); }
  function avgScore(arr) {
    var t = 0;
    arr.forEach(function (x) { t += x.score; });
    return Math.round(t / arr.length);
  }
  function bestOf(arr) { var b = arr[0]; arr.forEach(function (x) { if (x.score > b.score) b = x; }); return b; }
  function worstOf(arr) { var b = arr[0]; arr.forEach(function (x) { if (x.score < b.score) b = x; }); return b; }
  function mList(arr) {
    return arr.slice().sort(function (x, y) { return x.m - y.m; })
      .map(function (m) { return m.m + "월"; }).join("·");
  }

  function deepAnnual(c, base) {
    var a = c.a, o = c.o, me = c.me, H = ELEM_H, yg = c.yg;
    var months = base.months, good = base.good, caution = base.caution;
    var stemR = c.roles.stem, brR = c.roles.branch;
    var cnt = a.counts;
    var jaeEl = CON[me], gwanEl = CON_BY[me], inEl = GEN_BY[me], sikEl = GEN[me];
    var rc = { 비겁: cnt[me], 식상: cnt[sikEl], 재성: cnt[jaeEl], 관성: cnt[gwanEl], 인성: cnt[inEl] };
    var jaeIn = stemR === "재성" || brR === "재성";
    var sikIn = stemR === "식상" || brR === "식상";
    var biIn = stemR === "비겁" || brR === "비겁";
    var yearYong = yg.stemEl === o.yong || yg.branchEl === o.yong;
    var yearHee = yg.stemEl === o.hee || yg.branchEl === o.hee;
    var yearGi = yg.stemEl === o.gi || yg.branchEl === o.gi;
    var jaeGi = jaeEl === o.gi;
    var strong = o.strong;

    /* ─ 1) 총평 ─ */
    var p1 = "2027년은 정미(丁未)년, 하늘의 정(丁)은 촛불의 화(火), 땅의 미(未)는 여름 끝 마른 흙(土)입니다. "
      + "일간 " + a.dayStemName + " " + H[me] + "인 내 사주에는 정(丁)이 " + stemR + "(" + ROLE_HEAD[stemR] + ")으로, "
      + "미(未)가 " + brR + "(" + ROLE_HEAD[brR] + ")으로 들어옵니다. "
      + ROLE_MEAN[stemR] + ". " + (brR === stemR ? "" : ROLE_MEAN[brR] + ". ");
    var p1b = yearGi
      ? "다만 " + hj(yg.stemEl === o.gi ? yg.stemEl : yg.branchEl) + " 내 기신(忌神)이라, 벌인 만큼 거두는 절차를 따로 두어야 합니다."
      : yearYong
        ? "그 기운이 내 용신과 맞물려, 올해 벌인 일이 2028년까지 남습니다."
        : yearHee
          ? "희신이 받쳐 주어, 벌인 일이 남의 입을 통해 알려지며 커집니다."
          : "용신·희신과 정면으로 부딪히지는 않아, 크게 트이기보다 내가 만든 만큼 쌓이는 해입니다.";
    var p2 = (strong
      ? "받쳐 주는 힘이 " + o.support + "/" + o.total + "자로 두터운 신강(身强)입니다. 힘이 남는 해에는 버는 만큼 새는 곳도 커지니, 늘리기보다 하나를 깊게 파세요. "
      : "받쳐 주는 힘이 " + o.support + "/" + o.total + "자로 얇은 신약(身弱)입니다. 정미년의 화·토는 나를 쓰게 만드는 기운이라, 벌이기 전에 회복의 리듬부터 세워야 합니다. ")
      + (cnt[a.strongest[0]] >= 3
        ? hj(a.strongest[0]) + " " + cnt[a.strongest[0]] + "자로 넘쳐, 같은 기운이 겹치는 달엔 고집과 과속으로 드러납니다. "
        : "사주에서 가장 얇은 " + hjObj(a.lacking[0]) + " 채우는 선택이 곧 개운입니다. ");
    var p3 = c.dayClash
      ? "일지 " + bJ(c.dayBrName, "이", "가") + " 세운 미(未)와 정면으로 부딪치는 충(沖)입니다. 사는 곳·다니는 곳·가까운 사람 중 하나가 바뀌는 해라, 바뀌는 것보다 바뀌는 시기를 내가 고르는 게 중요합니다."
      : c.harmony
        ? "일지 " + bJ(c.dayBrName, "이", "가") + " 세운 미(未)와 육합(六合)을 이룹니다. 막혀 있던 것이 풀리는 해라, 미뤄 둔 인연·거래·연락을 먼저 꺼내면 그대로 이어집니다."
        : "일지 " + bJ(c.dayBrName, "은", "는") + " 세운 미(未)와 충도 합도 되지 않아, 판이 크게 뒤집히기보다 내가 만든 만큼 쌓이는 해입니다.";

    var facts = [
      "일간 " + a.dayStemName + " " + H[me] + " · " + (strong ? "신강" : "신약") + " " + o.support + "/" + o.total,
      "용신 " + H[o.yong] + " · 희신 " + H[o.hee] + " · 기신 " + H[o.gi],
      c.dayClash ? "일지 " + c.dayBrName + " ↔ 세운 未 충" : (c.harmony ? "일지 " + c.dayBrName + " ↔ 세운 未 합" : "일지 무충무합"),
      "정미년 " + stemR + "·" + brR
    ];

    /* ─ 2) 상반기 vs 하반기 ─ */
    var h1 = months.slice(0, 6), h2 = months.slice(6);
    var a1 = avgScore(h1), a2 = avgScore(h2);
    var upFirst = a1 >= a2;
    var better = upFirst ? h1 : h2, weaker = upFirst ? h2 : h1;
    var bm = bestOf(better), wm = worstOf(weaker);
    var sameYearMo = null;
    months.forEach(function (m) { if (m.factors.indexOf("sameYear") >= 0) sameYearMo = m; });
    var piv = [];
    for (var pi = 1; pi < months.length; pi++) {
      piv.push({ m: months[pi].m, d: months[pi].score - months[pi - 1].score, from: months[pi - 1].score, to: months[pi].score, gz: months[pi].ganzi });
    }
    piv.sort(function (x, y) { return Math.abs(y.d) - Math.abs(x.d); });
    var pv = piv[0];

    var upText = "가장 힘이 붙는 " + bm.m + "월(" + bm.ganzi + "월 · " + bm.score + "점)에 " + ROLE_USE[bm.role] + " 몰아 두세요. "
      + (strong ? "힘이 남는 구간이라 벌인 만큼 굴러갑니다." : "체력이 남는 구간이라 회복과 실행을 같이 가져가야 합니다.");
    var downText = "가장 눌리는 " + wm.m + "월(" + wm.ganzi + "월 · " + wm.score + "점)에는 새 일을 벌이지 말고 정산·서류·휴식으로 쓰세요. 이 구간의 큰 결정은 앞뒤 달로 피해 잡으세요.";
    var halves = upFirst
      ? [{ label: "1~6월", tone: "up", avg: a1, tag: "먼저 치는 구간", text: upText },
         { label: "7~12월", tone: "low", avg: a2, tag: "숨 고르는 구간", text: downText }]
      : [{ label: "1~6월", tone: "low", avg: a1, tag: "준비하는 구간", text: downText },
         { label: "7~12월", tone: "up", avg: a2, tag: "밀어붙이는 구간", text: upText }];
    var pivotLine = "가장 크게 꺾이는 달은 " + pv.m + "월(" + pv.gz + "월), " + pv.from + "점에서 " + pv.to + "점으로 " + (pv.d > 0 ? "올라" : "내려") + "갑니다. "
      + (pv.d > 0
        ? "이 달 전에 자금과 서류를 미리 준비해 두면 흐름을 그대로 탑니다. "
        : "이 달에 걸린 큰일(계약·이사·큰 지출)은 앞이나 뒤 달로 옮기세요. ")
      + "상반기 평균 " + a1 + "점, 하반기 평균 " + a2 + "점으로 " + (upFirst ? "상반기에 밀고 하반기에 거두는" : "상반기에 준비하고 하반기에 밀어붙이는") + " 해입니다. "
      + (sameYearMo ? sameYearMo.m + "월(" + sameYearMo.ganzi + "월)은 세운 未가 그대로 겹치는 달이라 한 해 기운이 가장 진하게 드러나니, 큰 결정은 그 전 달에 끝내 두세요." : "");

    /* ─ 3) 돈이 붙는 길 vs 새는 구멍 ─ */
    var mLead = "내 사주에서 돈은 내가 누르는 " + H[jaeEl] + "(" + jaeEl + ") 기운이라, " + MONEY_PATH[jaeEl] + "에서 붙습니다. "
      + (jaeIn
        ? "정미년에 그 기운이 " + (stemR === "재성" && brR === "재성" ? "천간·지지 양쪽" : "세운 한쪽") + "으로 들어와, 벌이는 일이 바로 돈으로 이어집니다."
        : "올해는 그 기운이 세운에 직접 오지 않아, 기다리기보다 만들어 내보내야 돈이 됩니다.");
    var earn = [];
    earn.push(jaeIn
      ? "재성이 세운에 들어온 해라, 값이 붙은 일을 그대로 챙기면 통장이 두꺼워집니다. 쥔 손을 벌리면 같이 나갑니다."
      : "세운에 재성이 없으니 큰돈이 굴러들어 오는 해는 아닙니다. 새는 구멍을 막는 것만으로 1년 성과가 달라집니다.");
    earn.push(sikIn || rc["식상"] >= 2
      ? "내가 낳는 " + H[sikEl] + "(" + sikEl + ") 기운이 " + rc["식상"] + "자" + (sikIn ? "에 세운까지 더해져" : "로") + ", 만들어 알리는 만큼 값이 붙습니다. 상품·콘텐츠·설명을 늘리는 쪽이 남는 장사입니다."
      : "표현(식상)이 얇아 새로 알리기보다, 이미 있는 상품의 가격·재고·상세를 다듬는 쪽이 돈이 됩니다.");
    earn.push(strong
      ? "신강한 힘을 밖으로 쓰는 구조라, 결정을 붙들고 있으면 재물이 아니라 피로가 쌓입니다. 정한 일은 그 주에 결제와 정산까지 끝내세요."
      : "혼자 다 벌려 들면 체력에서 끊깁니다. 반복 업무는 넘기고 결정에만 힘을 쓰세요.");
    var leak = [];
    if (c.dayClash) leak.push("일지 " + bJ(c.dayBrName, "과", "와") + " 세운의 충 — 보증, 공동명의, 구두 약속. 종이에 남기지 않은 돈은 올해 돌아오지 않습니다.");
    if (rc["비겁"] >= 2) leak.push("비겁 " + rc["비겁"] + "자 — 지인 거래·동업 분배. 시작할 때 지분과 정산일을 정하지 않으면 끝에서 갈라집니다.");
    if (jaeGi) leak.push("재성 " + H[jaeEl] + "이 기신 — 들어온 돈이 그대로 나가기 쉬워, 수익금 30%는 손대지 않는 계좌로 먼저 옮기세요.");
    if (rc["인성"] >= 2 && leak.length < 3) leak.push("인성 " + rc["인성"] + "자 — 구독·교육·자격에 새는 고정비. 끝내지 않은 강의와 안 쓰는 구독이 그대로 지출입니다.");
    if (rc["식상"] >= 3 && leak.length < 3) leak.push("식상 " + rc["식상"] + "자 — 벌이려는 마음이 앞서 새 채널·새 기기에 먼저 돈이 나갑니다. 결제 전 하루만 두세요.");
    if (leak.length < 3) leak.push("무리한 확장 — 매출이 오른 달에 지출을 먼저 늘리는 패턴. 늘릴 것은 사람이 아니라 재고 회전입니다.");
    if (leak.length < 3) leak.push("충동 지출 — 새 기기·새 강의·새 채널. 하루만 미루면 절반은 사라집니다.");
    leak = leak.slice(0, 3);

    /* ─ 4) 귀인과 대인·문서 ─ */
    var gM = months.filter(function (m) { return m.role === "관성" && m.score >= 66; });
    var goodM = gM.length ? mList(gM) : mList(good.slice(0, 2));
    var badM = mList(caution.slice(0, 2));
    var q1 = "올해 나를 살리는 기운은 나를 생하는 " + H[inEl] + "(" + inEl + ")입니다. 귀인은 " + EL_PERSON[inEl] + " — 이런 사람의 말을 한 번 더 듣고, 소개는 받아 두세요. "
      + (inEl === o.yong || inEl === o.hee ? "그 기운이 용신·희신과 맞아 실제 도움이 됩니다." : inEl === o.gi ? "다만 그 기운이 기신 쪽이라 조언은 한 번 걸러 쓰세요." : "결정적인 순간에 이 사람이 다리를 놓아 줍니다.");
    var q2 = (biIn || rc["비겁"] >= 2)
      ? "마찰은 가까운 사람에게서 옵니다. 비겁이 겹치는 해라 친구·형제·동업자와 돈 이야기에서 틀어지기 쉽고, " + EL_FRICTION[o.gi] + "에 말이 날카로워집니다."
      : "마찰은 윗사람·거래처에서 옵니다. " + EL_FRICTION[o.gi] + "이 문제라, 같은 말도 근거를 붙여 하면 통하고 감정으로 하면 남습니다.";
    var q3 = "큰 계약·이직·서명은 기운이 받쳐 주는 " + goodM + "에 잡고, " + badM + "에는 서명을 다음 달로 미루세요. "
      + (c.dayClash ? "일지가 흔들리는 해라 배우자·가족과의 약속은 날짜를 미리 확정해 두면 싸움이 줄어듭니다." : "가족과의 약속을 지키는 것만으로 신뢰가 쌓이는 해입니다.");
    if (c.monthClash) q3 += " 월지 " + bJ(c.monBrName, "이", "가") + " 흔들려 가족 쪽 일정이 겹치니, 돈과 시간을 미리 말해 두세요.";

    /* ─ 5) 개운 처방 ─ */
    var r1 = "용신 " + H[o.yong] + "(" + o.yong + ")의 색은 " + ELEM_COLORNAME[o.yong] + ", 방위는 " + ELEM_DIR[o.yong] + ", 시간은 " + ELEM_TIME[o.yong] + "입니다. 희신 " + H[o.hee] + "(" + o.hee + ")까지 겹치면 " + ELEM_COLORNAME[o.hee] + " 소품 하나를 더하세요.";
    var acts = [];
    acts.push(c.dayClash
      ? "돈이 오가는 일은 문자·계약서로 남기고, 보증과 공동명의는 이 해에 서지 마세요."
      : jaeGi
        ? "수익금 30%는 손대지 않는 계좌로 먼저 옮기고, 남은 돈으로만 판단하세요."
        : "큰 지출은 용신 " + H[o.yong] + "의 수리(" + ELEM_NUMS[o.yong].slice(0, 3).join("·") + ")가 붙는 날로 미루고, 결제 전 하루를 두세요.");
    acts.push("결제·서명·정산 같은 결정은 용신 " + H[o.yong] + "의 시간(" + ELEM_TIME[o.yong] + ")에 몰아넣고, 통화는 " + ELEM_DIR[o.yong] + " 자리에서 하세요.");
    acts.push(caution[0].m + "월(가장 흔들리는 달)에는 새 계약·큰 지출을 잡지 말고, 그 전 달에 미리 끝내 두세요.");

    var secs = [
      {
        key: "overview", icon: "🧭", title: "2027년 정미년 한 해 판세", sub: "총평",
        paras: [p1 + p1b, p2 + p3], facts: facts
      },
      {
        key: "flow", icon: "📈", title: "상반기 vs 하반기 흐름", sub: "1~6월 · 7~12월",
        halves: halves, pivot: pivotLine,
        teaser: "1~6월 " + a1 + "점 vs 7~12월 " + a2 + "점 — 변곡점은 " + pv.m + "월."
      },
      {
        key: "money", icon: "💰", title: "돈이 붙는 길 vs 새는 구멍", sub: "재물 팩트",
        lead: mLead, earn: earn, leak: leak,
        teaser: "돈은 " + H[jaeEl] + "(" + jaeEl + ")에서 붙고, 새는 곳은 " + (c.dayClash ? "보증·구두 약속" : (rc["비겁"] >= 2 ? "지인 거래·동업 분배" : "고정비·무리한 확장")) + "입니다."
      },
      {
        key: "people", icon: "🤝", title: "귀인과 대인·문서 주의", sub: "사람·계약",
        paras: [q1, q2, q3], windows: { good: goodM, bad: badM },
        teaser: "귀인은 " + H[inEl] + " 기운의 사람, 서명은 " + badM + "을 피하세요."
      },
      {
        key: "remedy", icon: "🔑", title: "2027년 내 사주 맞춤 개운 처방", sub: "색·방위·시간",
        paras: [r1], actions: acts,
        rx: [
          { label: ELEM_COLORNAME[o.yong], color: ELEM_COLOR[o.yong] },
          { label: ELEM_DIR[o.yong], color: "" },
          { label: ELEM_TIME[o.yong], color: "" }
        ],
        teaser: ELEM_COLORNAME[o.yong] + " · " + ELEM_DIR[o.yong] + " · 매일 지킬 행동 3가지."
      }
    ];

    var plain = [];
    secs.forEach(function (s) {
      if (s.paras) plain = plain.concat(s.paras);
      if (s.halves) s.halves.forEach(function (h) { plain.push(h.text); });
      if (s.pivot) plain.push(s.pivot);
      if (s.lead) plain.push(s.lead);
      if (s.earn) plain = plain.concat(s.earn);
      if (s.leak) plain = plain.concat(s.leak);
      if (s.actions) plain = plain.concat(s.actions);
    });
    var chars = plain.join(" ").replace(/\s+/g, "").length;

    return { sections: secs, chars: chars };
  }

  /* ── 한 해 총운세 ── */
  function annual(s, gender, year) {
    year = year || 2027;
    var a = analyze(s);
    var o = ohaeng(a);
    var yg = yearGanzi(year);
    var me = a.dayEl;
    var H = ELEM_H;
    var dayBr = s.pillars[1].branch;
    var monBr = s.pillars[2].branch;
    var dayBrName = BRANCHES[dayBr] + "(" + BRANCHES_H[dayBr] + ")";
    var monBrName = BRANCHES[monBr] + "(" + BRANCHES_H[monBr] + ")";
    var dayClash = CHONG[dayBr] === yg.branch;
    var harmony = HE6[dayBr] === yg.branch;
    var monthClash = CHONG[monBr] === yg.branch;
    var roles = { stem: roleOf(me, yg.stemEl), branch: roleOf(me, yg.branchEl) };

    function elBonus(el, w) {
      var b = 0;
      if (el === o.yong) b += 13 * w;
      else if (el === o.hee) b += 7 * w;
      else if (el === o.gi) b -= 10 * w;
      if (a.lacking.indexOf(el) >= 0) b += 6 * w;
      if (a.strongest.indexOf(el) >= 0 && a.counts[el] >= 3) b -= 6 * w;
      return b;
    }
    var score = 78 + elBonus(yg.stemEl, 0.55) + elBonus(yg.branchEl, 1);
    if (dayClash) score -= 7;
    if (harmony) score += 6;
    score = Math.round(clampNum(score, 45, 95));

    var kw = (KEYWORDS[me][o.strong ? "strong" : "weak"] || []).slice();
    if (yg.stemEl === o.gi || yg.branchEl === o.gi) kw[2] = GI_KEY[me];

    var ctx = {
      a: a, o: o, me: me, yg: yg, gender: gender || "male",
      roles: roles, dayClash: dayClash, harmony: harmony, monthClash: monthClash,
      dayIdx: dayBr, monIdx: monBr,
      dayBrName: dayBrName, monBrName: monBrName, elBonus: elBonus
    };

    var yearLine = YEAR_ROLE_LINE[me];
    if (yg.stemEl === o.gi || yg.branchEl === o.gi) {
      yearLine += " 다만 그 기운이 내 사주에는 버거운 쪽(기신)이라, 벌인 만큼 거두는 절차가 필요합니다.";
    } else if (yg.stemEl === o.yong || yg.branchEl === o.yong || yg.stemEl === o.hee || yg.branchEl === o.hee) {
      yearLine += " 게다가 그 기운이 내 용신·희신과 맞아, 올해 벌인 일이 오래 남습니다.";
    }

    var summary = {
      year: yearLine,
      strength: (o.strong
        ? "받쳐 주는 힘이 " + o.support + "/" + o.total + "자로 두터운 편입니다. 2027년에는 이 힘을 밖으로 흘려보내야 재물과 성과로 남습니다. 안으로 움켜쥐면 고집만 커집니다."
        : "받쳐 주는 힘이 " + o.support + "/" + o.total + "자로 얇은 편입니다. 2027년의 화·토는 나를 쓰게 만드는 기운이라, 벌이는 것보다 회복의 리듬이 한 해의 성과를 가릅니다."),
      yong: "용신 " + H[o.yong] + "(" + o.yong + ")·희신 " + H[o.hee] + "(" + o.hee + ")을 살리는 선택이 이 해의 요령입니다. 색은 " + ELEM_COLORNAME[o.yong] + ", 방위는 " + ELEM_DIR[o.yong] + ", 시간은 " + ELEM_TIME[o.yong] + "입니다."
    };

    var domains = [domainMoney(ctx), domainWork(ctx), domainHealth(ctx), domainLove(ctx)];
    var months = monthList(ctx);
    var caution = [], good = [];
    var asc = months.slice().sort(function (x, y) { return x.score - y.score || x.m - y.m; });
    var desc = months.slice().sort(function (x, y) { return y.score - x.score || x.m - y.m; });
    asc.forEach(function (mo) { if (caution.length < 3 && mo.score <= 60) caution.push(mo); });
    if (caution.length < 2) {
      asc.forEach(function (mo) { if (caution.length < 2 && caution.indexOf(mo) < 0) caution.push(mo); });
    }
    caution.sort(function (x, y) { return x.score - y.score; });
    desc.forEach(function (mo) { if (good.length < 2 && caution.indexOf(mo) < 0 && mo.score >= 66) good.push(mo); });
    if (!good.length) desc.forEach(function (mo) { if (good.length < 2 && caution.indexOf(mo) < 0) good.push(mo); });
    good.sort(function (x, y) { return y.score - x.score; });

    caution.forEach(function (mo, i) { cautionFacts(ctx, mo, i); });
    good.forEach(function (mo) { goodFacts(ctx, mo); });
    for (var i = 0; i < caution.length; i++) {
      for (var j = i + 1; j < caution.length; j++) {
        if (Math.abs(caution[i].m - caution[j].m) === 1) {
          var pair = caution[i].m + "월과 " + caution[j].m + "월이 연달아 흔들립니다. 이 두 달에 걸친 큰일(계약·이사·수술·큰 지출)은 앞뒤 달로 옮기는 편이 안전합니다.";
          caution[i].pair = pair;
          caution[j].pair = pair;
        }
      }
    }

    var deep = deepAnnual(ctx, { months: months, good: good, caution: caution });

    return {
      year: year, yg: yg, me: me, meName: a.dayStemName, meH: H[me],
      strong: o.strong, support: o.support, total: o.total,
      yong: o.yong, hee: o.hee, gi: o.gi,
      score: score, grade: gradeOf(score), keywords: kw,
      summary: summary, deep: deep, domains: domains, months: months,
      caution: caution, good: good,
      dayClash: dayClash, harmony: harmony, monthClash: monthClash,
      dayBrName: dayBrName, monBrName: monBrName, roles: roles
    };
  }

  /* ── 분야별 ── */
  function toneOf(score) { return score >= 76 ? "hot" : score >= 62 ? "mid" : "low"; }

  function domainMoney(c) {
    var a = c.a, o = c.o, me = c.me, H = ELEM_H;
    var jaeEl = CON[me];
    var jaeGi = jaeEl === o.gi, jaeYong = jaeEl === o.yong || jaeEl === o.hee;
    var hasJae = c.roles.stem === "재성" || c.roles.branch === "재성";
    var jH = H[jaeEl];
    var s = 64;
    if (hasJae) s += 8;
    if (jaeYong) s += 10; else if (jaeGi) s -= 12;
    if (o.strong && hasJae) s += 5;
    if (!o.strong && hasJae) s -= 4;
    if (c.dayClash) s -= 6;
    if (c.harmony) s += 3;
    s = Math.round(clampNum(s, 41, 96));

    var lead, lines = [], tip;
    if (hasJae && !jaeGi) {
      lead = o.strong
        ? "2027년은 재물을 직접 쥐는 해입니다. 쥔 손을 벌리지만 않으면 통장이 두꺼워집니다."
        : "돈이 들어오는 문은 열리지만 그 무게가 나를 누릅니다. 버는 순서보다 지키는 순서가 중요한 해입니다.";
    } else if (hasJae && jaeGi) {
      lead = "재물의 문이 열리지만 그 기운이 내 사주엔 부담(기신)입니다. 들어온 돈이 그대로 나가기 쉬운 해입니다.";
    } else {
      lead = "2027년은 큰 재물이 한꺼번에 들어오는 해는 아닙니다. 대신 새는 구멍을 막기에 가장 좋은 해입니다.";
    }
    lines.push("내 사주에서 재물은 나(" + H[me] + ")가 누르는 " + jH + "(" + jaeEl + ") 기운입니다. "
      + (hasJae
        ? "정미년에 그 " + jH + "가 " + (c.roles.stem === "재성" && c.roles.branch === "재성" ? "천간과 지지 양쪽에서" : c.roles.stem === "재성" ? "천간(丁)에서" : "지지(未)에서") + " 들어옵니다."
        : "정미년에는 그 " + jH + "가 세운에 직접 오지 않아, 스스로 만든 구조에서 돈이 납니다."));
    lines.push(c.dayClash
      ? "일지 " + c.dayBrName + "가 세운과 충(沖)이라 계약서·보증·공동명의에 흠이 생기기 쉽습니다. 종이에 남지 않은 약속은 올해 돈이 되지 않습니다."
      : (o.strong
        ? "힘이 넘치는 해라 벌이는대로 쓸 수 있지만, 고정비가 같이 올라가는 것을 조심하세요. 매출이 늘면 지출도 같이 늡니다."
        : "들어오는 돈보다 나가는 돈의 속도가 빠른 해입니다. 통장을 생활비·사업비·비상금으로 나눠 두면 흐름이 보입니다."));
    tip = jaeGi
      ? "수익금의 30%는 손대지 않는 계좌로 먼저 옮기세요. 남은 돈으로만 판단하면 됩니다."
      : (o.strong
        ? "큰 지출은 용신 " + H[o.yong] + "의 수리(" + ELEM_NUMS[o.yong].slice(0, 3).join("·") + ")가 붙는 날로 미루고, 결제 전 하루를 두세요."
        : "자동결제·구독을 이번 주에 전부 목록으로 만들고, 쓰지 않는 것은 오늘 해지하세요.");

    return { key: "money", icon: "💰", title: "금전운", score: s, tone: toneOf(s), lead: lead, lines: lines, tip: tip };
  }

  function domainWork(c) {
    var a = c.a, o = c.o, me = c.me, H = ELEM_H;
    var gwanRole = "관성", sikRole = "식상", inRole = "인성";
    var hasGwan = c.roles.stem === gwanRole || c.roles.branch === gwanRole;
    var hasSik = c.roles.stem === sikRole || c.roles.branch === sikRole;
    var hasIn = c.roles.stem === inRole || c.roles.branch === inRole;
    var gwanEl = CON_BY[me];
    var s = 62;
    if (hasGwan) s += 6;
    if (hasSik) s += 8;
    if (hasIn) s += 3;
    if (gwanEl === o.gi) s -= 8; else if (gwanEl === o.yong || gwanEl === o.hee) s += 6;
    if (o.strong) s += 4; else s -= 2;
    if (c.dayClash) s -= 5;
    if (c.monthClash) s -= 3;
    s = Math.round(clampNum(s, 41, 96));

    var lead, lines = [], tip;
    if (hasGwan && hasSik) {
      lead = "맡는 자리와 알리는 일이 같이 오는 해입니다. 책임이 늘어난 만큼 이름이 알려집니다.";
    } else if (hasGwan) {
      lead = gwanEl === o.gi
        ? "책임은 늘어나는데 힘은 그만큼 붙지 않는 해입니다. 맡는 일의 개수를 줄이는 것이 곧 성과입니다."
        : "계약·직책·심사처럼 '정해진 자리'가 따라오는 해입니다. 실력이 값으로 매겨집니다.";
    } else if (hasSik) {
      lead = "새 채널·새 제안이 통하는 해입니다. 벌인 일이 매출로 이어지는 속도가 평소보다 빠릅니다.";
    } else {
      lead = "2027년은 새로 벌이기보다 안을 다지는 해입니다. 기존 상품·콘텐츠를 손보면 성과가 남습니다.";
    }
    lines.push("일(관성)은 나를 누르는 " + H[gwanEl] + "(" + gwanEl + "), 확장(식상)은 내가 낳는 " + H[GEN[me]] + "(" + GEN[me] + ") 기운입니다. "
      + (hasGwan
        ? "올해 그 " + H[gwanEl] + "이 들어와 " + (o.strong ? "힘으로 감당할 수 있는 범위 안에 있습니다." : "체력이 따라야 감당되는 크기입니다.")
        : "올해 관성은 세운에 직접 오지 않습니다. " + (o.strong ? "그래서 책임보다 확장 쪽에 힘이 실립니다." : "책임은 적은 대신 체력이 성과의 한계가 됩니다.")));
    lines.push(c.dayClash
      ? "일지 충이 있는 해라, 사람이 바뀌거나 담당이 바뀌는 일이 생기기 쉽습니다. 인수인계 문서를 남기는 습관이 재산이 됩니다."
      : (o.strong
        ? "강한 기운을 밖으로 풀어야 재물이 됩니다. 말로만 하던 기획을 이 해에 실제로 내놓으세요."
        : "혼자 다 하려는 순간 흐름이 끊깁니다. 반복 업무는 사람에게 넘기고, 나는 결정에만 힘을 쓰세요."));
    tip = (hasGwan
      ? "새 계약은 '해지 조건·정산일·책임 범위' 세 줄만 먼저 확인하세요. 나머지는 그 뒤에 읽어도 됩니다."
      : "이번 해에는 새 상품 하나보다 기존 상품의 상세페이지·가격·재고를 정리하는 편이 남는 장사입니다.");

    return { key: "work", icon: "💼", title: "사업·일운", score: s, tone: toneOf(s), lead: lead, lines: lines, tip: tip };
  }

  function domainHealth(c) {
    var a = c.a, o = c.o, me = c.me, H = ELEM_H;
    var weak = a.lacking[0];
    var overEl = (a.counts[c.yg.branchEl] >= 3 && a.counts[c.yg.branchEl] >= a.counts[c.yg.stemEl]) ? c.yg.branchEl : (a.counts[c.yg.stemEl] >= 3 ? c.yg.stemEl : null);
    var s = 70;
    if (overEl) s -= 8;
    if (a.counts[c.yg.branchEl] + a.counts[c.yg.stemEl] >= 5) s -= 5;
    if (a.lacking.indexOf(c.yg.branchEl) >= 0 || a.lacking.indexOf(c.yg.stemEl) >= 0) s += 6;
    if (c.yg.stemEl === o.gi || c.yg.branchEl === o.gi) s -= 6;
    if (a.lacking.indexOf("수") >= 0) s -= 4;
    if (a.lacking.indexOf("목") >= 0) s -= 2;
    if (c.dayClash) s -= 4;
    if (c.monthClash) s -= 3;
    s = Math.round(clampNum(s, 42, 92));

    var lead, lines = [], tip;
    if (overEl) {
      lead = H[overEl] + " 기운이 넘치는 해입니다. " + BODY_PART[overEl] + " 쪽에 먼저 신호가 옵니다.";
    } else if (a.lacking.indexOf("수") >= 0 || a.lacking.indexOf("목") >= 0) {
      lead = "마르는 기운이 강한 해입니다. " + BODY_PART[a.lacking[0]] + " 쪽을 먼저 챙기세요.";
    } else {
      lead = "큰 고비는 없지만, 쓰는 기운이 많아 피로가 쌓이는 해입니다.";
    }
    lines.push("사주에서 약한 " + H[weak] + "(" + weak + ")는 " + BODY_PART[weak] + " 쪽으로 나타납니다. "
      + (a.lacking.indexOf(c.yg.branchEl) >= 0 || a.lacking.indexOf(c.yg.stemEl) >= 0
        ? "다행히 2027년 화·토가 그 자리를 채워 주어, 올해는 컨디션의 바닥이 조금 올라옵니다."
        : "2027년 화·토는 그 약한 자리를 더 건조하게 만듭니다. 물과 휴식이 약이 됩니다."));
    lines.push(c.dayClash
      ? "일지가 흔들리는 해라 잠이 얕아지고 생활 리듬이 무너지기 쉽습니다. 수면 시간을 고정하는 것이 가장 큰 보약입니다."
      : (overEl
        ? "넘치는 기운은 열과 긴장으로 나타납니다. 혈압·체중처럼 숫자로 보이는 것부터 관리하세요."
        : "몸이 보내는 작은 신호(어지럼·소화·두통)를 그냥 넘기지 마세요. 2028년의 컨디션을 올해가 만듭니다."));
    tip = BODY_TIP[weak] + (overEl && overEl !== weak ? " " + BODY_TIP[overEl] : "");

    return { key: "health", icon: "🌿", title: "건강운", score: s, tone: toneOf(s), lead: lead, lines: lines, tip: tip };
  }

  function domainLove(c) {
    var a = c.a, o = c.o, me = c.me, H = ELEM_H;
    var spouseRole = c.gender === "female" ? "관성" : "재성";
    var spouseEl = spouseRole === "관성" ? CON_BY[me] : CON[me];
    var hasSpouse = c.roles.stem === spouseRole || c.roles.branch === spouseRole;
    var s = 66;
    if (hasSpouse) s += 7;
    if (spouseEl === o.gi) s -= 9;
    if (spouseEl === o.yong || spouseEl === o.hee) s += 6;
    if (c.dayClash) s -= 11;
    if (c.harmony) s += 8;
    if (c.monthClash) s -= 4;
    s = Math.round(clampNum(s, 41, 96));

    var lead, lines = [], tip;
    if (c.dayClash) {
      lead = "배우자궁(일지 " + c.dayBrName + ")이 올해 세운과 부딪힙니다. 가까운 사이라서 말이 더 날카로워지는 해입니다.";
    } else if (c.harmony) {
      lead = "배우자궁에 합(合)이 들어옵니다. 막혀 있던 관계가 풀리고 새 인연이 자연스럽게 이어지는 해입니다.";
    } else if (hasSpouse) {
      lead = "인연의 자리가 열려 있습니다. 다만 " + (o.strong ? "내 속도에 상대를 맞추려는 마음을 내려놓아야" : "기다리기만 하지 말고 먼저 말을 걸어야") + " 관계가 자랍니다.";
    } else {
      lead = "2027년은 관계를 늘리기보다 '지킬 사람'을 정리하는 해입니다. 남는 인연이 오래갑니다.";
    }
    lines.push("내 사주에서 인연은 " + (spouseRole === "재성" ? "재성" : "관성") + "(" + H[spouseEl] + ") 자리입니다. "
      + (hasSpouse
        ? "정미년에 그 기운이 들어와 마음이 움직이는 일이 생깁니다."
        : "올해는 그 기운이 직접 오지 않아, 스스로 만든 자리에서 사람이 남습니다."));
    lines.push("가정은 월지 " + c.monBrName + " 자리로 봅니다. "
      + (c.monthClash
        ? "올해 그 자리가 세운과 부딪혀 가족 쪽 일정과 부담이 겹칩니다. 돈과 시간을 미리 말해 두면 싸움이 줄어듭니다."
        : "올해 그 자리가 크게 흔들리지 않아, 가족과의 약속을 지키는 것만으로 신뢰가 쌓입니다."));
    tip = c.dayClash
      ? "중요한 대화는 저녁 10시 이후에 하지 마세요. 이 해의 밤 대화는 두 배로 길어집니다."
      : (c.harmony
        ? "미뤄 둔 연락·답장을 이번 달에 정리하세요. 합이 들어온 해의 먼저 건 네는 인사가 오래 갑니다."
        : "가족·연인과 '한 달에 한 번은 밖에서 식사' 같은 작은 약속을 정해 두세요.");

    return { key: "love", icon: "💞", title: "연애·가족운", score: s, tone: toneOf(s), lead: lead, lines: lines, tip: tip };
  }

  /* ── 12개월 흐름 ── */
  function monthList(c) {
    var a = c.a, o = c.o, me = c.me, yg = c.yg;
    var out = [];
    for (var m = 1; m <= 12; m++) {
      var p = pillars(yg.year, m, 15, null, 0);
      var mp = p.pillars[2];
      var mb = BRANCH_EL[mp.branch], ms = STEM_EL[mp.stem];
      var role = roleOf(me, mb);
      var rel = relTo(me, mb);
      var sc = 60 + ({ receives: 10, same: 4, controls: 5, gives: 2, controlled: -10, neutral: 0 })[rel];
      sc += c.elBonus(mb, 1) + c.elBonus(ms, 0.5);
      var factors = [];
      if (mp.branch === yg.branch) { factors.push("sameYear"); sc += (mb === o.yong || mb === o.hee) ? 4 : -4; }
      if (CHONG[mp.branch] === yg.branch) { sc -= 8; factors.push("yearClash"); }
      if (c.dayIdx !== undefined && CHONG[mp.branch] === c.dayIdx) { sc -= 10; factors.push("dayClash"); }
      if (c.monIdx !== undefined && CHONG[mp.branch] === c.monIdx) { sc -= 5; factors.push("monthClash"); }
      if (c.dayIdx !== undefined && HE6[mp.branch] === c.dayIdx) { sc += 6; factors.push("harmony"); }
      if (mb === o.gi || ms === o.gi) factors.push("gi");
      if (a.strongest.indexOf(mb) >= 0 && a.counts[mb] >= 3) factors.push("over");
      if (rel === "controlled") factors.push("controlled");
      if (mb === o.yong || ms === o.yong) factors.push("yong");
      else if (mb === o.hee || ms === o.hee) factors.push("hee");
      if (a.lacking.indexOf(mb) >= 0) factors.push("lack");
      out.push({
        m: m, hanja: STEMS_H[mp.stem] + BRANCHES_H[mp.branch], ganzi: STEMS[mp.stem] + BRANCHES[mp.branch],
        brName: BRANCHES[mp.branch] + "(" + BRANCHES_H[mp.branch] + ")",
        mb: mb, ms: ms, role: role, rel: rel, score: Math.round(clampNum(sc, 41, 97)), factors: factors
      });
    }
    return out;
  }

  /* ── 주의할 달 근거·처방 ── */
  var RX = {
    금전: [
      "큰 지출·보증·공동명의는 이 달에 걸지 마세요. 결정은 다음 달 첫 주로 미룹니다.",
      "카드 한도 알림과 자동이체 목록을 이 달 초에 한 번 정리하세요. 새는 돈의 대부분은 자동결제입니다."
    ],
    사업: [
      "새 계약은 조항을 세 번 읽고 서명은 다음 달로 미루세요. 구두 약속은 그날 문자로 남깁니다.",
      "확장 대신 기존 채널의 전환율·재구매율을 점검하는 달로 쓰세요. 매출은 그다음 달에 붙습니다."
    ],
    건강: [
      "잠드는 시간을 30분 앞당기고, 물 1.5L·저녁 가볍게 — 이 세 가지만 지키세요.",
      "무리한 운동 대신 걷기 30분. 몸이 보내는 신호(어지럼·소화·두통)를 적어 두면 다음 달이 편합니다."
    ],
    관계: [
      "말 한마디를 반 박자 늦추세요. 이 달의 말은 상대에게 두 배로 남습니다.",
      "가족·가까운 사람과의 약속은 날짜와 시간을 미리 확정하고, 돈 이야기는 이 달에 꺼내지 마세요."
    ]
  };
  var HEAD = {
    금전: ["{m}월, 돈이 새거나 계약이 틀어질 수 있는 달입니다", "{m}월, 들어오는 돈보다 나가는 돈이 빨라지는 달입니다"],
    사업: ["{m}월, 확장보다 서류를 다시 펼쳐야 하는 달입니다", "{m}월, 맡은 일이 무거워지는 달입니다"],
    건강: ["{m}월, 몸이 먼저 신호를 보내는 달입니다", "{m}월, 잠과 소화가 흐트러지기 쉬운 달입니다"],
    관계: ["{m}월, 가까운 사람과 말이 어긋나기 쉬운 달입니다", "{m}월, 마음은 앞서는데 말이 늦는 달입니다"]
  };

  function monthDomain(c, mo) {
    var f = mo.factors;
    if (f.indexOf("yearClash") >= 0) return "금전";
    if (f.indexOf("dayClash") >= 0) return "관계";
    if (mo.role === "재성" && (f.indexOf("gi") >= 0 || f.indexOf("over") >= 0)) return "금전";
    if (f.indexOf("gi") >= 0) return (mo.role === "관성" || mo.role === "비겁") ? "사업" : "건강";
    if (f.indexOf("over") >= 0) return "건강";
    if (f.indexOf("controlled") >= 0) return "사업";
    if (f.indexOf("monthClash") >= 0) return "관계";
    if (mo.role === "재성") return "금전";
    if (mo.role === "관성") return "사업";
    return "건강";
  }

  function factorLine(k, c, mo) {
    var H = ELEM_H;
    if (k === "yearClash") return "2027년 세운 미(未)와 이 달 " + mo.brName + "이 정면으로 부딪치는 충(沖)입니다. 한 해의 기둥이 흔들리는 자리라 결정이 뒤집히고, 잡아 둔 일정이 밀리기 쉽습니다.";
    if (k === "dayClash") return "사주 일지 " + c.dayBrName + "와 이 달 " + mo.brName + "이 충(沖)을 이룹니다. 배우자궁·생활 기반이 흔들려 가까운 사람과의 말 한마디가 오래 남습니다.";
    if (k === "monthClash") return "사주 월지 " + c.monBrName + "와 부딪칩니다. 가족·직장 쪽에서 예정에 없던 일이 생기고, 내 시간이 남에게 먼저 쓰입니다.";
    if (k === "gi") return H[c.o.gi] + "(" + c.o.gi + ") 기운이 기신(忌神)으로 들어오는 달입니다. " + ROLE_MONTH[mo.role] + " 쪽에서 벌인 일이 부담으로 돌아오고, 몸이 쉽게 지칩니다.";
    if (k === "over") return H[mo.mb] + "(" + mo.mb + ") 기운이 사주에 이미 " + c.a.counts[mo.mb] + "개로 넘치는 달입니다. 같은 기운이 겹치면 고집과 과속이 되어, 확인 없이 밀어붙이게 됩니다.";
    if (k === "controlled") return H[mo.mb] + "(" + mo.mb + ") 기운이 나를 누르는 달입니다. 책임과 압박이 한꺼번에 몰리고 남의 일을 대신 떠안기 쉽습니다.";
    if (k === "sameYear") return "세운 미(未)와 같은 글자가 겹치는 달입니다. 세운의 기운이 가장 진하게 드러나 좋고 나쁨이 크게 갈립니다.";
    return "";
  }

  function cautionFacts(c, mo, i) {
    var domain = monthDomain(c, mo);
    var rank = ["yearClash", "dayClash", "gi", "over", "monthClash", "controlled", "sameYear"];
    var lines = [];
    rank.forEach(function (k) {
      if (lines.length < 2 && mo.factors.indexOf(k) >= 0) {
        var t = factorLine(k, c, mo);
        if (t) lines.push(t);
      }
    });
    if (!lines.length) lines.push(factorLine("controlled", c, mo));
    var heads = HEAD[domain] || HEAD.건강;
    var head = (heads[Math.min(i, heads.length - 1)] || heads[0]).replace("{m}", mo.m);
    var rx = (RX[domain] || RX.건강).slice();
    if (domain === "건강") rx.push(elementRx(mo.mb === c.o.gi ? c.o.gi : mo.mb));
    mo.domain = domain;
    mo.headline = head;
    mo.reasons = lines;
    mo.rx = rx.slice(0, 2);
    mo.note = mo.ganzi + "월 · " + ROLE_MONTH[mo.role];
    return mo;
  }

  function goodFacts(c, mo) {
    var H = ELEM_H;
    var why;
    if (mo.factors.indexOf("yong") >= 0) why = "용신 " + H[c.o.yong] + "(" + c.o.yong + ")가 들어오는 달";
    else if (mo.factors.indexOf("hee") >= 0) why = "희신 " + H[c.o.hee] + "(" + c.o.hee + ")가 힘을 보태는 달";
    else if (mo.factors.indexOf("lack") >= 0) why = "사주에 없던 " + H[mo.mb] + "(" + mo.mb + ")가 채워지는 달";
    else if (mo.factors.indexOf("harmony") >= 0) why = "일지와 합(合)이 들어 관계가 풀리는 달";
    else if (mo.factors.indexOf("sameYear") >= 0) why = "세운의 기운이 그대로 서는 달";
    else why = "기운이 고르게 도는 달";
    mo.reason = why;
    mo.use = ROLE_USE[mo.role] + " 이 달에 몰아 두세요.";
    return mo;
  }

  global.Saju = {
    pillars: pillars, analyze: analyze, dayGanzi: dayGanzi, fortune: fortune, ohaeng: ohaeng,
    annual: annual, yearGanzi: yearGanzi, roleOf: roleOf, relTo: relTo,
    BODY_PART: BODY_PART, ROLE_MONTH: ROLE_MONTH,
    recommend: recommend, reasonLines: reasonLines, winRank: winRank,
    ELEMS: ELEMS, ELEM_H: ELEM_H, ELEM_COLOR: ELEM_COLOR, ELEM_NUMS: ELEM_NUMS,
    STEMS: STEMS, STEMS_H: STEMS_H, BRANCHES: BRANCHES, BRANCHES_H: BRANCHES_H,
    BRANCH_EL: BRANCH_EL, STEM_EL: STEM_EL, ANIMALS: ANIMALS, HOUR_LABEL: HOUR_LABEL,
    numElem: numElem, fmtTerm: fmtTerm, statsFrom: statsFrom, quality: quality, hash: hash
  };
})(window);
