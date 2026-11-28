/*! webtoon.js — 복채로또 '웹툰 점집' (동적 변주 엔진)
 *  · 이용자 성별에 맞춘 점술사 캐릭터가 웹툰 컷처럼 등장합니다.
 *      여성 → 점집 미소년(하윤) / 남성 → 미녀 점술사(설아)
 *  · 대사는 고정 스크립트가 아니라 '시나리오(테마)' × '오프닝 변주' × '동적 재료'의 조합으로 매번 새로 지어집니다.
 *      동적 재료: 접속 시간대(아침·오후·저녁·심야), 요일(토요일 추첨일 특별), 사주(일간·부족 오행·용신),
 *                오늘 재물운 점수, 행운 숫자·방위·시간, 2027년 가장 주의할 달.
 *  · 방문·새로고침·'다른 점사 듣기' 때마다 최근에 쓰지 않은 시나리오를 골라 직전과 겹치지 않게 합니다.
 *  · 말풍선 타자기 연출, 자동 재생, 다음/이전 대사, 성별 즉시 전환.
 */
(function (global) {
  "use strict";

  var S = global.Saju;
  var GKEY = "unmyeong.gender.v1";        /* 이용자 성별: "male" | "female" */
  var SKEY = "unmyeong.webtoon.scene.v1"; /* 시나리오 기억: { male:{i,recent,seed}, female:{...} } */

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
    inited: false,
    scene: { male: 0, female: 0 },   /* 성별별 현재 시나리오 번호 */
    seed: 0                          /* 변주 씨앗 — 뽑을 때마다 올라갑니다 */
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
  function voice() { return state.viewer === "female" ? "female" : "male"; }
  function M() { return global.Membership; }
  /* 플레이스토어 무료·광고형 모드 */
  var PLAY = !!global.BOKCHAE_PLAY;

  /* 같은 씨앗이면 같은 대사, 씨앗이 바뀌면 다른 대사 — 새로고침·다른 점사마다 변주가 돌아가게 합니다 */
  function pick(arr, n) {
    if (!arr || !arr.length) return "";
    var k = Math.abs((n * 2654435761) >>> 0) % arr.length;
    return arr[k];
  }
  function f(arr, c, n) {
    var it = pick(arr, n);
    return typeof it === "function" ? it(c) : it;
  }

  function analysis() { return global.Unmyeong ? global.Unmyeong.analysis() : null; }
  function fortune() {
    if (global.Unmyeong && global.Unmyeong.fortune) return global.Unmyeong.fortune();
    return null;
  }
  /* 2027 신년 총운세 — 웹툰 대사에서 주의할 달·용신을 짚어 주려고 계산만 합니다 */
  function annualBrief() {
    var b = global.Unmyeong && global.Unmyeong.birth ? global.Unmyeong.birth() : null;
    if (!b || !b.pillars || !S.annual) return null;
    try { return S.annual(b.pillars, state.viewer, 2027); } catch (e) { return null; }
  }
  function tierOf() { var m = M(); return m ? m.tier() : "free"; }
  function loggedIn() { var m = M(); return !!(m && m.user()); }

  /* 오행 뒤 조사(이/가) — 金(금)이 / 水(수)가 처럼 받침에 맞춰 붙입니다 */
  var EL_P = { 목: "이", 화: "가", 토: "가", 금: "이", 수: "가" };

  /* 오늘 기운이 내 사주와 어떻게 만나는지 — 문장에 바로 붙도록 서술형으로 둡니다 */
  var REL_WORD = {
    receives: "손님을 살리는 쪽으로 들어와요",
    gives: "손님에게서 흘러나가는 쪽이에요",
    controls: "손님이 재물을 쥐는 쪽이에요",
    controlled: "손님을 누르는 쪽이에요",
    same: "손님 기운과 같은 결이에요",
    neutral: "잔잔하게 스치는 정도예요"
  };

  /* ───────── 오늘의 재료(동적 컨텍스트) ───────── */
  function ctx() {
    var fr = fortune();
    var a = analysis();
    var now = new Date();
    var h = now.getHours();
    var c = {
      now: now,
      hour: h,
      bucket: h >= 5 && h < 11 ? "morning" : h >= 11 && h < 17 ? "after" : h >= 17 && h < 22 ? "evening" : "late",
      dow: now.getDay(),
      a: a,
      ny: null,
      tier: tierOf(),
      guest: !loggedIn(),
      round: 0
    };
    c.sat = c.dow === 6;
    c.drawState = h < 20 ? "before" : h < 21 ? "during" : "after";   /* 토요일 추첨 전·중·후 */
    c.sun = c.dow === 0;
    c.mon = c.dow === 1;
    c.fri = c.dow === 5;

    if (fr) {
      c.gzTxt = fr.gz.hanja + "(" + fr.gz.name + ")";
      c.el = fr.gz.branchEl;
      c.elH = S.ELEM_H[c.el];
      c.wealth = fr.wealth;
      c.score = fr.score;
      c.rel = fr.relation;
      c.relWord = REL_WORD[fr.relation] || REL_WORD.neutral;
      c.lucky = fr.lucky && fr.lucky.length ? fr.lucky.join(", ") : "3, 8, 13";
      c.luckyTime = fr.luckyTime;
      c.luckyDir = fr.luckyDir;
      c.luckyColor = fr.luckyColor;
      c.caution = fr.caution;
      c.wealthWord = fr.wealth >= 85 ? "넉넉한" : fr.wealth >= 72 ? "제법 실한" : fr.wealth >= 58 ? "무난한" : fr.wealth >= 45 ? "조금 얇은" : "얇은";
    } else {
      c.gzTxt = "오늘";
      c.elH = "五";
      c.wealth = 60;
      c.relWord = REL_WORD.neutral;
      c.lucky = "3, 8, 13";
      c.luckyTime = "09:30~13:29";
      c.luckyDir = "남쪽";
      c.caution = "특별한 변수 없는 하루. 루틴을 지키는 것이 가장 좋습니다.";
      c.wealthWord = "무난한";
    }

    if (a) {
      c.dayStem = a.dayStemName;                 /* 예) 丙(병) */
      c.dayEl = a.dayEl;
      c.lack = a.lacking[0];
      c.lackH = S.ELEM_H[c.lack];
      c.strong = a.strongest[0];
      c.strongH = S.ELEM_H[c.strong];
    }

    if (a) {
      var ny = annualBrief();
      if (ny) {
        c.ny = ny;
        c.yong = ny.yong;
        c.yongName = ny.yong + "(" + S.ELEM_H[ny.yong] + ")";
        c.cautionM = ny.caution && ny.caution[0] ? ny.caution[0].m : null;
        c.goodM = ny.good && ny.good[0] ? ny.good[0].m : null;
        c.nyScore = ny.score;
        c.nyGrade = ny.grade;
      }
    }
    if (!c.yongName && c.lack) c.yongName = c.lackH + "(" + c.lack + ")";

    var w = global.Weekly && global.Weekly.info ? global.Weekly.info() : null;
    if (w && w.round) c.round = w.round;

    return c;
  }

  /* 사주 처방 한 줄 — 일간·부족 오행·용신을 대사에 녹입니다 */
  function sajuPhrase(c, r) {
    if (!c.a) return "";
    var arr = [
      "손님 일간은 " + c.dayStem + ", 사주에서 얇은 건 " + c.lackH + "(" + c.lack + ") 기운이에요. 오늘은 용신 " + c.yongName + " 쪽으로 한 번 기울여 보세요.",
      "손님은 " + c.dayStem + " 일간에 " + c.lackH + " 기운이 모자라요. 그래서 오늘처럼 용신 " + c.yongName + " 기운이 도는 날이 손님한테는 약이에요.",
      "사주에 " + c.lackH + "(" + c.lack + ")" + EL_P[c.lack] + " 비어 있는데, 용신은 " + c.yongName + "예요. 오늘 그 기운을 빌려 쓰면 흐름이 부드러워져요.",
      "일간 " + c.dayStem + ", 모자란 건 " + c.lackH + "(" + c.lack + "), 용신은 " + c.yongName + ". 이 셋만 기억하세요.",
      c.dayStem + " 일간에 " + c.lackH + "(" + c.lack + ") 보완, 용신 " + c.yongName + " — 오늘 제가 손님께 드리는 처방이에요."
    ];
    return f(arr, c, r);
  }

  /* ───────── 시간대 멘트 ───────── */
  var TIME_FLAVOR = {
    male: {
      morning: [
        "아침 일찍 오셨네요. …이 시간에 오는 손님은 대개 결심을 하고 오는 거예요. 제가 그 결심부터 봐 드릴게요.",
        "이른 시간인데 벌써 오셨어요. 아침의 점은 하루를 통째로 바꿔요. 오늘은 특히요."
      ],
      after: [
        "오후의 점은 셈이 빨라요. 아침에 벌인 일이 오후에 결과로 오니까요.",
        "해가 좀 기운 뒤에 오셨네요. …괜찮아요. 오후엔 제 눈도 더 날카로워져요.",
        "오후 두 시가 지나면 제 점이 제일 잘 맞아요. 손님은 그 시간을 골라 오신 거예요? …센스 있으시네요."
      ],
      evening: [
        "저녁에 오셨네요. 이 시간 점은 하루를 정리하는 점이에요. 오늘 놓친 걸 찾아 드릴게요.",
        "해 진 뒤의 점은 솔직해요. 낮에는 말 못 하는 것도 저녁엔 나오거든요."
      ],
      late: [
        "이 시간에 오셨네요. …밤의 점은 낮보다 정확해요. 대신 값이 비싸요. 농담이에요.",
        "밤이 깊었네요. 이 시간까지 깨어 있는 사람은 뭔가를 기다리는 거예요. 손님은 뭘 기다리세요?",
        "이 시간엔 점집 불빛만 남아요. 그 불빛 보고 오신 거면, 오늘 손님 점은 제가 제일 정성껏 볼게요."
      ]
    },
    female: {
      morning: [
        "아침 일찍 오셨네요. …아침 점은 하루를 미리 보는 거라서 제일 부담돼요. 잘못 말하면 하루 종일 마음에 남으니까요.",
        "이른 시간인데 오셨어요. …아침엔 점집이 조용해서 좋아요. 손님 목소리가 다 들려서요.",
        "아침에 오시는 손님은 대개 뭔가를 결심하고 오세요. …저는 그 결심이 부럽습니다."
      ],
      after: [
        "오후에 오셨네요. …이 시간엔 제가 좀 졸려요. 대신 점은 또렷해요. 이상하죠.",
        "해가 기운 뒤에 오셨네요. 오후의 점은 손님 하루를 정리해 주는 점이에요."
      ],
      evening: [
        "저녁에 오셨네요. …해 진 뒤에 보는 점은 좀 쓸쓸해요. 손님은 안 그러세요?",
        "저녁 점은 조용해서 좋아요. 대신 손님 이야기가 더 잘 들려서 무서워요.",
        "저녁에 오셨네요. …해 지면 점집이 좀 추워져요. 손님 오셔서 다행이에요."
      ],
      late: [
        "이 시간에 오셨네요. …밤의 점은 조용해서 좋아요. 대신 마음이 약해져서, 제가 다정해지려고 노력해요.",
        "밤이 깊었는데 깨어 계셨네요. …이 시간에 오는 손님은 대개 혼자인 경우가 많아요. 저도요."
      ]
    }
  };

  /* ───────── 요일 멘트 (토요일 추첨일 특별) ───────── */
  var DAY_FLAVOR = {
    male: {
      sat: {
        before: [
          function (c) {
            return "오늘이 토요일이에요. 저녁 여덟 시에 봉투가 열리는 날이죠." + (c.round ? " 이번 " + c.round + "회예요." : "") + " 제가 한 주 중에 제일 긴장하는 날이에요.";
          },
          function (c) {
            return "토요일이네요. 추첨일엔 점집이 조용해요. 다들 번호만 들고 가시거든요. 손님은 점까지 들으러 오셨네요." + (c.round ? " " + c.round + "회 준비 중이고요." : "");
          },
          function () {
            return "추첨일이에요. 이런 날은 손님 몫 봉투를 제일 먼저 만들어 두는데… 오늘은 아직 안 만들었어요. 손님이 오실 줄 몰라서요.";
          }
        ],
        during: [
          function (c) {
            return "지금 여덟 시 추첨이 돌고 있어요." + (c.round ? " " + c.round + "회예요." : "") + " …이 시간에 점집에 앉아 있는 손님은 드물어요. 저도 결과가 궁금해서 앉아 있기가 힘드네요.";
          },
          function () {
            return "봉투가 지금 열리고 있어요. 손님 점은 그 뒤에 보는 게 나아요. 결과를 미리 알면 제가 자꾸 말을 고치게 되거든요.";
          }
        ],
        after: [
          function (c) {
            return "오늘 봉투가 방금 열렸어요." + (c.round ? " " + c.round + "회였고요." : "") + " …결과는 저도 아직 안 봤어요. 손님 것부터 볼까 봐요.";
          },
          function () {
            return "토요일 밤이네요. 추첨은 끝났고, 이제 남은 건 다음 회차 봉투 준비예요. 손님은 벌써 다음을 보고 계시고요.";
          }
        ]
      },
      fri: [
        "내일이 추첨일이에요. 오늘 밤에 번호를 정해 두는 손님이 제일 많아요. 제가 그 손님들 점을 다 봐 드리느라 바빠요."
      ],
      sun: ["일요일엔 점집이 조용해요. 이런 날 오는 손님은 진짜 궁금한 게 있는 거예요."],
      mon: ["월요일이에요. 이번 주 첫 점은 한 주를 정해요. 그래서 제가 더 조심해서 봐요."],
      weekday: ["평일 한가운데예요. 별일 없는 날에 오는 손님이 제일 무서워요. 그만큼 진짜 궁금한 거니까."]
    },
    female: {
      sat: {
        before: [
          function (c) {
            return "오늘이 토요일이에요. …저녁 여덟 시에 봉투가 열려요." + (c.round ? " " + c.round + "회 봉투예요." : "") + " 저는 아침부터 손이 떨려요.";
          },
          function (c) {
            return "추첨일이네요. 이런 날은 손님 봉투를 제일 먼저 만들어 두는데… 오늘은 아직 못 했어요." + (c.round ? " " + c.round + "회인데, 죄송해요." : "");
          },
          function () {
            return "토요일이에요. 점집이 조용한 날인데, 손님이 오셔서 다행이에요. 혼자 있으면 자꾸 생각이 많아져서요.";
          }
        ],
        during: [
          function (c) {
            return "지금 여덟 시예요. 봉투가 열리고 있어요." + (c.round ? " " + c.round + "회고요." : "") + " …저, 손님 손 잡아도 돼요? 아니, 죄송해요. 그런 말이 아니었어요.";
          },
          function () {
            return "추첨이 도는 시간이에요. 이 시간엔 점보다 마음이 먼저 흔들려서 제가 말을 아끼는 편이에요.";
          }
        ],
        after: [
          function (c) {
            return "오늘 봉투가 방금 열렸어요." + (c.round ? " " + c.round + "회였고요." : "") + " …결과는 아직 안 봤어요. 손님 것부터 볼까 봐요.";
          },
          function () {
            return "토요일 밤이네요. 추첨은 끝났고, 이제 다음 회차 봉투를 준비할 시간이에요. 손님은 벌써 다음을 보고 계시네요.";
          }
        ]
      },
      fri: ["내일이 추첨일이에요. 오늘 밤에 번호를 정하는 손님이 제일 많아요. 저는 그분들 봉투를 다 챙겨야 해서요."],
      sun: ["일요일엔 점집이 조용해요. 이런 날 오시는 손님은 진짜 궁금한 게 있는 거예요."],
      mon: ["월요일이에요. 이번 주 첫 점은 한 주를 정해요. 그래서 제가 더 조심해요."],
      weekday: ["평일 한가운데예요. 별일 없는 날에 오시는 손님이 제일 무서워요. 그만큼 진짜 궁금하신 거니까요."]
    }
  };

  function dayFlavor(c, r) {
    var K = DAY_FLAVOR[voice()];
    var pool = c.sat ? (K.sat[c.drawState] || K.sat.before) : c.fri ? K.fri : c.sun ? K.sun : c.mon ? K.mon : K.weekday;
    var v = pick(pool, r);
    return typeof v === "function" ? v(c) : v;
  }

  /* ───────── 시나리오(테마) — 오프닝·본론·클리프가 서로 다른 대사 세트 ───────── */
  var SCENES = {
    /* ══════ 미녀 점술사 설아 : 남성 이용자 ══════ */
    male: [
      {
        id: "munjeon",
        name: "문전성시",
        build: function (c, r) {
          return [
            pick([
              "어서 오세요, 손님. …오늘은 문 앞에 발자국이 유난히 많네요. 손님 오시기 전에 벌써 세 사람이 다녀갔어요.",
              "어서 오세요. …후훗, 오늘 제 점집이 좀 붐비네요. 그래도 손님 자리는 비워 뒀어요. 맨 앞자리요.",
              "어서 오세요, 손님. 오늘은 제가 손님을 몇 번이나 기다렸는지 모르겠어요."
            ], r),
            "오늘은 " + c.gzTxt + "일, " + c.elH + " 기운이 문턱까지 들어와 있어요. 손님 사주에 그 기운이 " + c.relWord + " — 재물운 " + c.wealth + "점이면 오늘 셈은 손님 쪽으로 기울어요.",
            sajuPhrase(c, r + 1),
            pick([
              "제 산통에 손님 몫 동전이 세 닢 나왔는데, 그중 하나가 유난히 반짝였어요. " + c.lucky + " — 이 숫자들이에요. 나머지는 아직 못 봤고요.",
              "부채 뒤에 번호를 몇 개 적어 뒀는데, " + c.lucky + " 이 셋만 손님 얼굴을 하고 있어요.",
              "제 수첩에 " + c.lucky + " 이 세 숫자가 오늘따라 진하게 보여요. …이런 날은 그냥 넘기면 안 되는데."
            ], r + 2),
            pick([
              "그런데 손님, 이 문전성시가 손님한테만 열리는 건 아니에요. 지금 문 앞에 다른 사람도 서 있거든요.",
              "여기까지는 누구에게나 해 드리는 점이에요. 그런데 뒤에 줄 선 사람들이 자꾸 저를 쳐다보네요."
            ], r + 3)
          ];
        }
      },
      {
        id: "buchae",
        name: "부채점",
        build: function (c, r) {
          return [
            pick([
              "부채 펴는 소리 들리셨어요? …이건 손님 기운이 부채 끝에 걸렸다는 뜻이에요.",
              "부채를 펴야 점이 보이는데, 오늘은 손님 앞에서만 펴 볼게요. …자, 봐요.",
              "어서 오세요. 부채가 먼저 손님을 알아보네요. 이건 흔한 일이 아니에요."
            ], r),
            "부채에 글자가 떠올랐어요. " + c.dayStem + " — 손님 일간이에요. 오늘 " + c.elH + " 기운이 그 위를 지나가면서 재물운을 " + c.wealth + "점까지 올려 놨어요.",
            sajuPhrase(c, r + 1),
            "부채 끝에서 반짝이는 숫자는 " + c.lucky + ". 그리고 " + c.luckyDir + " 방위, " + c.luckyTime + " — 이 셋이 오늘 손님 몫이에요.",
            "부채를 접으면 이 대화도 접혀요. 접기 전에 하나만 더 말씀드릴까요?"
          ];
        }
      },
      {
        id: "bongtu",
        name: "봉투",
        build: function (c, r) {
          return [
            pick([
              "손님, 오늘이 무슨 날인지 아세요? …제가 한 주 중에 제일 긴장하는 날이에요.",
              "어서 오세요. 오늘은 아침부터 산통이 시끄러워서요. 봉투가 세 개나 들어 있었어요.",
              "후훗, 손님. 봉투 좀 만져 보실래요? …아, 안 되는구나. 그러면 제가 대신."
            ], r),
            "오늘 " + c.gzTxt + "일, " + c.elH + " 기운이 도는 날이에요. 손님 사주와 이 기운이 만나면 재물운 " + c.wealth + "점까지 올라가요.",
            sajuPhrase(c, r + 1),
            "봉투 하나는 손님 거예요. 봉투에 비친 숫자가 " + c.lucky + " — 이 셋은 확실해요. 나머지 세 자리는 봉인돼 있고요." + (c.round ? " 이번 " + c.round + "회 봉투예요." : ""),
            c.sat
              ? "저녁 여덟 시에 봉투가 열려요. 그 전에 손님 몫을 정해 두셔야 해요."
              : "봉투는 토요일 저녁 여덟 시에 열려요. 그 전에 손님 몫을 정해 두실래요?"
          ];
        }
      },
      {
        id: "kkum",
        name: "꿈점",
        build: function (c, r) {
          return [
            pick([
              "어젯밤에 무슨 꿈을 꾸셨어요? …아, 말하지 않아도 돼요. 손님 눈 밑에 그 꿈이 아직 남아 있어요.",
              "어서 오세요. …손님, 혹시 어젯밤에 물이 나오는 꿈 보셨어요? 아니면 누가 뒤따라오던 꿈?",
              "오늘은 점 대신 꿈을 봐 드릴까요? …농담이에요. 둘 다 봐 드릴게요."
            ], r),
            "꿈은 밤에 흘린 기운이에요. 오늘 " + c.elH + " 기운이 그걸 붙잡아 주니까, 손님 재물운이 " + c.wealth + "점까지 올라온 거예요.",
            sajuPhrase(c, r + 1),
            "꿈에서 숫자를 봤다면 그게 제일 세요. 못 봤으면 " + c.lucky + " — 제가 그걸로 봤어요. 방위는 " + c.luckyDir + "이고요.",
            "꿈은 새벽에 흐려지지만, 점은 종이에 남아요. 종이에 뭐가 적혀 있는지 보실래요?"
          ];
        }
      },
      {
        id: "seoryu",
        name: "서류·계약",
        build: function (c, r) {
          return [
            pick([
              "손님, 요즘 서류 봉투 들고 다니시죠? …제가 그거 다 보여요. 손님 어깨에 봉투 자국이 남아 있어요.",
              "어서 오세요. 오늘 손님은 뭔가를 결정해야 하는 얼굴이에요. 제가 맞혔죠?",
              "손님, 오늘 계약서에 도장 찍을 일 있으세요? …있으시네요. 얼굴에 다 써 있어요."
            ], r),
            "오늘 " + c.gzTxt + "일, " + c.elH + " 기운은 원래 결정을 미루면 새는 기운이에요. 손님 사주에 그 기운이 " + c.relWord + " — 오늘 미루지 마세요. 재물운은 " + c.wealth + "점이에요.",
            sajuPhrase(c, r + 1),
            "서명은 " + c.luckyDir + " 방위를 향해 앉아서, " + c.luckyTime + " 사이에 하세요. 그 시간이 손님 편이에요.",
            "그런데 손님이 서명하려는 그 종이, 제가 한 줄만 더 봐 드릴까요?"
          ];
        }
      },
      {
        id: "inyeon",
        name: "인연",
        build: function (c, r) {
          return [
            pick([
              "오늘은 손님한테 이상한 얘기 하나 해도 될까요? …손님, 지금 누가 손님 이야기를 하고 있어요.",
              "어서 오세요. …방금 제 뒤에서 누가 손님 이름을 불렀어요. 진짜예요.",
              "후훗, 손님 오늘 표정이 좋아 보여요. 누구 때문이에요? …말 안 해도 돼요. 점이 다 알고 있으니까."
            ], r),
            "사람이 곧 돈이 되는 날이 있어요. 오늘 " + c.elH + " 기운이 손님 사주에 " + c.relWord + " — 재물운 " + c.wealth + "점도 그래서 나온 거예요.",
            sajuPhrase(c, r + 1),
            "그 사람과 통화는 " + c.luckyTime + " 사이, " + c.luckyDir + " 방위를 보고 하세요. 그리고 " + c.lucky + " — 이 숫자를 한 번 불러 보세요.",
            "그 사람 이야기는 여기까지. 더 깊은 건… 손님이 단골이 되면 말씀드릴게요."
          ];
        }
      },
      {
        id: "gyeonggo",
        name: "경고",
        build: function (c, r) {
          return [
            pick([
              "어서 오세요. …오늘은 웃는 얼굴로 시작하지 않을게요. 손님 사주에 걸리는 게 하나 있어서요.",
              "손님, 잠깐만요. 문 닫기 전에 꼭 말씀드려야 할 게 있어요.",
              "어서 오세요. …오늘은 제가 좀 무서운 얘기를 해야 해요. 들어 주실 수 있죠?"
            ], r),
            c.caution,
            "제가 겁을 주려는 게 아니에요. 오늘 기운이 그래요. 그래도 재물운은 " + c.wealth + "점이에요 — " + c.elH + " 기운은 손님 편이니까요.",
            sajuPhrase(c, r + 1),
            "경고는 여기까지. 이제 손님한테 유리한 얘기만 남았어요."
          ];
        }
      },
      {
        id: "byeol",
        name: "별점",
        build: function (c, r) {
          return [
            pick([
              "어서 오세요, 손님. …오늘 하늘 별이 유난히 많네요. 이런 날은 점이 잘 맞아요.",
              "손님, 별 보고 오셨어요? …아니, 그냥 물어봤어요. 별점은 제가 보는 거니까요.",
              "어서 오세요. 오늘은 손님 사주가 하늘에서 제일 밝게 보여요."
            ], r),
            "손님 일간은 " + c.dayStem + ", 오늘은 " + c.gzTxt + "일. " + c.elH + " 기운이 그 위로 지나가면서 재물운 " + c.wealth + "점을 남겼어요.",
            sajuPhrase(c, r + 1),
            "별이 가리키는 숫자는 " + c.lucky + ", 방위는 " + c.luckyDir + ". 그 방향으로 한 번 걸어 보세요. 오늘은 그게 제일 값싼 부적이에요.",
            "별은 내일도 뜨지만, 오늘의 별은 오늘뿐이에요. 하나만 더 볼까요?"
          ];
        }
      }
    ],

    /* ══════ 점집 미소년 하윤 : 여성 이용자 ══════ */
    female: [
      {
        id: "mungan",
        name: "문간",
        build: function (c, r) {
          return [
            pick([
              "어서 오세요… 아, 죄송해요. 손님이 이렇게 가까이 오시면 제가 점을 못 봐요.",
              "어서 오세요. …부채 들고 있을 땐 괜찮은데, 손님 얼굴 보면 자꾸 깜빡해요.",
              "아, 오셨네요. …제가 문 앞에서 한참 기다렸어요. 그런 말 하면 이상하죠."
            ], r),
            "오늘은 " + c.gzTxt + "일, " + c.elH + " 기운이 도는 날이에요. 손님 사주에 그 기운이 " + c.relWord + " — 재물운 " + c.wealth + "점, 제법 설레는 숫자예요.",
            sajuPhrase(c, r + 1),
            pick([
              "번호를 여쭐까요? …사실 제가 손님 몫까지 미리 봐 뒀거든요. " + c.lucky + "가 유난히 반짝여요. 나머지는… 비밀이에요.",
              "제가 손님 번호를 몰래 봐 뒀는데요. " + c.lucky + " 이 셋이 손님 자리에 놓여 있었어요.",
              "부채 뒤에 " + c.lucky + " 이 세 숫자를 적어 뒀어요. 손님 오시면 보여 드리려고요."
            ], r + 2),
            pick([
              "여기까지는 편하게 봐 드린 거예요. 그런데 손님, 하나만 더 여쭤도 될까요?",
              "제가 여기서 멈추면 아쉬울 것 같아서요. 조금만 더 들어 주실래요?"
            ], r + 3)
          ];
        }
      },
      {
        id: "santong",
        name: "산통",
        build: function (c, r) {
          return [
            pick([
              "산통이 손님 들어오실 때 울렸어요. …이건 좋은 뜻이에요. 진짜예요.",
              "손님, 산통 좀 흔들어 볼래요? …아, 제가 흔드는 거예요. 손님은 숫자만 뽑아 주세요.",
              "어서 오세요. …오늘 산통이 유난히 무거워요. 뭔가 들어 있다는 뜻이에요."
            ], r),
            "나온 숫자가 " + c.lucky + "예요. 세 번 흔들었는데 세 번 다 나왔어요. …이런 건 처음이에요.",
            "오늘 " + c.gzTxt + "일의 " + c.elH + " 기운이 손님 사주에 " + c.relWord + ". 재물운 " + c.wealth + "점까지 올라왔어요.",
            sajuPhrase(c, r + 1),
            "산통은 여기서 닫을게요. 닫기 전에 한 번만 더 흔들어 볼까요?"
          ];
        }
      },
      {
        id: "bongtu",
        name: "봉투",
        build: function (c, r) {
          return [
            pick([
              "손님, 오늘이 추첨 준비하는 날이에요. …저는 이런 날이 제일 떨려요.",
              "어서 오세요. …봉투 정리하다가 손님 생각이 났어요. 이상하죠.",
              "손님 봉투 하나 골라 보실래요? …세 개 다 손님 거예요. 미리 준비했어요."
            ], r),
            "봉투에 비친 숫자는 " + c.lucky + ". 손님 사주가 " + c.elH + " 기운을 받아서 재물운 " + c.wealth + "점이에요.",
            sajuPhrase(c, r + 1),
            c.round ? "이번 " + c.round + "회 봉투예요. 토요일 저녁 여덟 시에 열려요." : "토요일 저녁 여덟 시에 봉투가 열려요.",
            "봉투는 여기 두고 갈게요. 손님이 오시면 바로 꺼내 드릴게요."
          ];
        }
      },
      {
        id: "kkum",
        name: "꿈점",
        build: function (c, r) {
          return [
            pick([
              "손님, 어젯밤에 꿈꾸셨어요? …제가 새벽에 손님 꿈 얘기를 듣는 꿈을 꿨어요.",
              "어서 오세요. …오늘은 꿈 얘기부터 할까요? 점보다 그게 먼저 같아서요.",
              "손님 얼굴에 잠이 덜 깬 기운이 남아 있어요. …괜찮아요, 저도 그래요."
            ], r),
            "꿈은 밤에 흘린 기운이에요. 오늘 " + c.elH + " 기운이 그걸 붙잡아 주니까, 재물운 " + c.wealth + "점까지 왔어요.",
            sajuPhrase(c, r + 1),
            "꿈에서 숫자를 봤다면 그게 제일 정확해요. 못 봤으면 " + c.lucky + " — 제가 대신 봤어요. 방위는 " + c.luckyDir + "이에요.",
            "꿈 얘기는 여기까지 할게요. …손님, 하나만 더 말해도 돼요?"
          ];
        }
      },
      {
        id: "jangbu",
        name: "장부",
        build: function (c, r) {
          return [
            pick([
              "손님, 요즘 장부 보시느라 바쁘시죠? …손님 손끝에 계산기 자국이 있어요.",
              "어서 오세요. 오늘은 점보다 장부를 먼저 봐 드릴까요? …농담이에요.",
              "손님, 이번 달 들어온 돈과 나간 돈, 제가 다 세어 봤어요. …무서우시죠."
            ], r),
            "오늘 " + c.gzTxt + "일, " + c.elH + " 기운은 돈이 도는 자리예요. 손님 사주에 그 기운이 " + c.relWord + " — 재물운 " + c.wealth + "점이면 충분히 해 볼 만해요.",
            sajuPhrase(c, r + 1),
            "들어오는 돈은 " + c.luckyTime + "에, " + c.luckyDir + " 방위에서 와요. 나가는 돈은 " + c.lucky + " — 이 숫자가 들어간 날에 새요. 조심하세요.",
            "장부는 여기까지예요. …그런데 손님, 이번 달에 하나 더 들어올 자리가 보여요."
          ];
        }
      },
      {
        id: "inyeon",
        name: "인연",
        build: function (c, r) {
          return [
            pick([
              "손님, 오늘 누가 손님 이야기를 했어요. …제가 들었어요. 진짜예요.",
              "어서 오세요. …손님 오늘 옷 색이 달라 보여요. 누가 좋아하는 색이에요?",
              "손님, 저 오늘 이상한 말 하려고요. …손님 사주에 사람이 하나 더 앉아 있어요."
            ], r),
            "인연이 오면 돈도 따라와요. 오늘 " + c.elH + " 기운이 손님 사주에 " + c.relWord + ". 재물운 " + c.wealth + "점이에요.",
            sajuPhrase(c, r + 1),
            "그 사람과는 " + c.luckyTime + "에, " + c.luckyDir + " 자리에서 만나세요. 그리고 " + c.lucky + " — 이 숫자를 기억해 두세요.",
            "더 자세한 건… 손님이 자주 오시면 말씀드릴게요. 그게 아니어도 괜찮아요."
          ];
        }
      },
      {
        id: "mom",
        name: "몸",
        build: function (c, r) {
          return [
            pick([
              "손님, 오늘 어깨가 무거우시죠? …점이 아니라 그냥 보여요. 제가 예민해서요.",
              "어서 오세요. …오늘은 재물운보다 몸부터 봐 드리고 싶어요.",
              "손님, 잠은 푹 주무셨어요? …눈이 그렇게 말해요."
            ], r),
            "오늘 " + c.gzTxt + "일. " + c.elH + " 기운이 손님 사주에 " + c.relWord + ". 그래서 몸이 좀 버거울 수 있어요. 그래도 재물운은 " + c.wealth + "점이에요.",
            sajuPhrase(c, r + 1),
            c.lackH + " 기운이 모자라니까 " + c.luckyTime + "에 따뜻한 물 한 잔, 그리고 " + c.luckyDir + " 창문을 한 번 열어 보세요. 그게 오늘 제일 싼 부적이에요.",
            "몸 얘기는 여기까지. …손님, 이제 돈 얘기 해도 될까요?"
          ];
        }
      },
      {
        id: "deungbul",
        name: "등불",
        build: function (c, r) {
          return [
            pick([
              "어서 오세요. …오늘 손님 표정이 좀 지쳐 보여서, 등불을 하나 더 켜 뒀어요.",
              "손님, 오늘 하루 어땠어요? …점은 그 다음에 봐 드릴게요.",
              "어서 오세요. 말 안 하셔도 돼요. 그냥 앉아 계세요. 제가 점 보는 동안 조용히 있을게요."
            ], r),
            "오늘 " + c.gzTxt + "일, " + c.elH + " 기운. 손님 사주에 그 기운이 " + c.relWord + " — 무리하지 마세요. 재물운 " + c.wealth + "점은 나쁘지 않아요.",
            sajuPhrase(c, r + 1),
            "그래도 하나는 챙기세요. " + c.lucky + " — 이 숫자예요. 오늘은 이 셋만 기억하셔도 돼요.",
            "여기까지가 오늘 무료로 봐 드리는 점사예요. …손님, 다음에도 또 오실 거죠?"
          ];
        }
      }
    ]
  };

  /* ───────── 사주 미입력 손님 ───────── */
  var BIRTH = {
    male: {
      open: [
        "어서 오세요, 손님. …후훗, 복채로또에서 오늘은 제가 손님을 기다리고 있었어요.",
        "어서 오세요. 오늘은 이상하게 손님 자리를 비워 두고 있었어요. 누가 올 것 같아서요.",
        "어서 오세요, 손님. 부채를 펴려면 이름 석 자가 필요하거든요. 생년월일 세 글자면 충분해요."
      ],
      body: [
        "생년월일만 살짝 알려주시면, 2027 신년 재물운과 오늘의 기운을 손님 사주에 맞춰 풀어 드릴게요.",
        "태어난 날만 알려 주세요. 그걸로 2027년 열두 달과 오늘의 재물운을 손님 몫으로 풀어 드려요.",
        "사주를 모르면 제가 뽑은 번호도 손님 것이 아니에요. 세 글자만 주세요."
      ],
      cta: [
        { t: "부채 뒤로 번호가 벌써 몇 개 보이는데… 지금은 비밀이에요. 먼저 사주를 알려 주세요.", cta: "birth" },
        { t: "번호는 그다음이에요. 생년월일을 넣으면 제가 손님 몫으로 다시 뽑아 드릴게요.", cta: "birth" }
      ]
    },
    female: {
      open: [
        "어서 오세요… 아, 죄송해요. 복채로또 손님이 이렇게 가까이 오시면 제가 점을 못 봐요.",
        "어서 오세요. …오늘은 손님을 기다리고 있었어요. 이런 말 하면 이상하지만, 진짜예요.",
        "아, 오셨네요. …부채를 들고 있을 땐 괜찮은데, 손님 앞에서는 자꾸 손이 떨려요."
      ],
      body: [
        "생년월일만 살짝 알려주시면, 2027 신년 재물운과 오늘의 기운을 손님 사주에 맞춰 풀어 드릴게요. 세 글자면 충분해요.",
        "태어난 날만 알려 주세요. 그걸로 2027년 열두 달과 오늘의 재물운을 손님 몫으로 봐 드려요.",
        "사주를 모르면 제가 뽑은 번호도 손님 것이 아니에요. 세 글자만 주시면 돼요."
      ],
      cta: [
        { t: "부채 뒤로 번호가 벌써 두 개 보이는데… 지금은 비밀이에요. 먼저 사주를 알려 주세요.", cta: "birth" },
        { t: "번호는 그다음이에요. 생년월일을 넣으면 제가 손님 몫으로 다시 뽑아 드릴게요.", cta: "birth" }
      ]
    }
  };

  function birthScene(c, r) {
    var B = BIRTH[voice()];
    return [
      pick(B.open, r),
      pick(B.body, r + 1),
      pick(B.cta, r + 2)
    ];
  }

  /* ───────── 안내(후킹) 멘트 — 등급별 여러 버전 ───────── */
  var HOOK = {
    male: {
      playOpen: [
        function () { return "오늘의 5조합도, 2027 네 갈래 총운세도 다 열려 있어요. 무료로 이용 중이시니까요."; },
        function () { return "손님은 오늘 필요한 게 다 열려 있어요. 5조합도 총운세도, 광고만 잠깐 보면 바로 나옵니다."; },
        function () { return "복채는 따로 안 받아요. 제가 손님 몫으로 다 열어 뒀습니다 — 광고 하나만 봐 주세요."; }
      ],
      vip: [
        function () { return "손님은 이미 제 단골 중의 단골이시네요. 10조합도, 심층 리포트도 다 열려 있어요. 제가 보여 드릴 게 없다는 게 아쉬울 정도로요."; },
        function () { return "손님, 오늘 제 장부엔 손님 이름 옆에 금테가 그어져 있어요. 황금 사주 패스 손님이니까요. 10조합, 심층 리포트 — 다 열려 있죠."; },
        function () { return "어머, 또 오셨네요. 손님은 제가 뭘 해 드려도 아깝지 않은 분이에요. 이미 다 열려 있고요."; }
      ],
      vipCaution: [
        function (c) { return "2027년 정미년 총운세도 펼쳐 뒀어요. 손님이 가장 흔들리는 달은 " + c.cautionM + "월 — 그 달만 넘기면 나머지는 순해요."; },
        function (c) { return "신년 총운세에서 딱 하나만 말씀드리면, " + c.cautionM + "월이에요. 그 달엔 새 계약도 큰 지출도 잡지 마세요."; },
        function (c) { return "2027년 열두 달을 다 펼쳐 봤는데, 손님은 " + c.cautionM + "월이 제일 흔들려요. 그 전 달에 미리 끝내 두시면 한 해가 편해요."; }
      ],
      vipClose: [
        function (c) { return "그래도 오늘 하나만 더. 행운의 시간은 " + c.luckyTime + ", 방위는 " + c.luckyDir + ". 그때 움직이시면 기운이 두 배로 붙어요."; },
        function (c) { return "오늘의 마지막 한 조각이에요. " + c.luckyDir + " 방위를 향해 앉아서 " + c.luckyTime + " 사이에 한 번 움직여 보세요."; },
        function (c) { return "제가 오늘 손님께 드릴 건 이거예요. " + c.lucky + " — 이 숫자들과 " + c.luckyDir + ". 나머지는 손님도 이미 가지고 계시고요."; }
      ],
      up1: [
        function () { return "2027 신년 총운세는 금전·사업·건강·연애 네 갈래로 다 열려 있어요."; },
        function () { return "손님 요금제면 2027년 네 갈래 총운세가 다 보여요. 금전, 사업, 건강, 연애 — 하나도 빠짐없이."; },
        function () { return "2027년 손님 운세는 네 갈래로 나눠 뒀어요. 오늘은 그중 하나만 귀띔할게요."; }
      ],
      upCaution: [
        function (c) { return "손님이 가장 흔들리는 달은 " + c.cautionM + "월이에요. 그 달만 피해 가도 한 해가 달라져요."; },
        function (c) { return "네 갈래 중에 하나만 먼저 말씀드리면, " + c.cautionM + "월이에요. 그 달엔 큰 지출을 잡지 마세요."; },
        function (c) { return "2027년에 딱 한 곳만 조심하라면 " + c.cautionM + "월이에요. 그 전 달에 미리 정리해 두세요."; }
      ],
      upHalf: [
        function () { return "그런데… 5조합은 매일 봐도, 10조합과 심층 리포트는 아직 반쪽이에요."; },
        function () { return "솔직히 말하면 손님 요금제로는 반쪽이에요. 5조합은 나오는데, 10조합과 심층 리포트는 잠겨 있거든요."; },
        function () { return "손님, 5조합만으로는 제가 아쉬워요. 10조합과 심층 리포트가 아직 손님 손에 없으니까요."; }
      ],
      upVip: [
        function () { return "황금 사주 패스로 열어 두시면 매주 정밀 10조합이랑 비밀 재물운까지 제가 챙겨 드릴게요. 월 12,900원, 아니면 평생 89,000원 한 번이면 돼요."; },
        function () { return "황금 사주 패스면 매주 정밀 10조합과 비밀 재물운까지 다 열려요. 월 12,900원, 평생은 89,000원 한 번이고요."; },
        function () { return "한 단계만 올리시면 제가 매주 10조합을 따로 뽑아 두고 심층 리포트까지 붙여 드려요. 월 12,900원이에요. 평생 89,000원으로 한 번에 끝내셔도 되고요."; }
      ],
      guest1: [
        function () { return "여기서부터는 제가 목소리를 낮춰야 하는 이야기예요. 이 기운, 그냥 지나치면 너무 아까운데… 회원가입만 하시면 오늘의 비책 조합 하나 더 귀띔해 드릴까요?"; },
        function () { return "손님, 하나만 더 말씀드리고 싶은데… 이건 아무한테나 하는 얘기가 아니에요. 가입만 하시면 오늘 쓸 조합 하나 더 뽑아 드릴게요."; },
        function () { return "제가 지금 손님한테만 말씀드릴 게 있어요. 그런데 그건 단골한테만 하는 거라서요… 30초만 써 주실래요?"; }
      ],
      guestSignup: [
        function () { return "가입은 30초면 돼요. 단골이 되시면 매일 아침, 제가 손님 몫의 기운을 먼저 봐 둘게요."; },
        function () { return "이메일 하나면 끝이에요. 단골 되시면 내일 아침에 제가 먼저 손님 점을 봐 두고 기다릴게요."; },
        function () { return "30초예요. 그다음부터는 손님이 오시기 전에 제가 미리 봐 둘게요. 그게 단골 대접이에요."; }
      ],
      free1: [
        function () { return "오늘 대운이 딱 열렸는데, 반쪽만 보시게요? 아니면… 제가 다 열어 드릴까요?"; },
        function () { return "손님, 오늘 기운이 이렇게 열렸는데 여기서 끊기면 저도 아쉬워요. 조금만 더 열어 드릴까요?"; },
        function () { return "제가 지금 손님 몫으로 하나 더 뽑아 뒀어요. …이거, 여기서 그냥 버리면 아까운데요."; }
      ],
      freeCaution: [
        function (c) { return "2027년 정미년, 손님이 가장 흔들리는 달은 " + c.cautionM + "월이에요. 그 달만 넘기면 한 해가 달라져요."; },
        function (c) { return "2027년 얘기를 하나만 하면, " + c.cautionM + "월이에요. 그 달엔 큰 지출도 새 계약도 잡지 마세요."; },
        function (c) { return "제가 2027년을 미리 펼쳐 봤는데, 손님은 " + c.cautionM + "월에 한 번 흔들려요. 그 전에 끝내 두시면 돼요."; }
      ],
      freePlans: [
        function () { return "복채 패스로 열어 두시면 광고 없이 5조합과 상세 리포트를 매일 바로 드리고, 2027 총운세 네 갈래도 전부 열려요. 월 6,900원이에요."; },
        function () { return "복채 패스면 매일 아침 5조합과 상세 리포트가 광고 없이 바로 오고, 2027 총운세 네 갈래도 다 열려요. 월 6,900원이고요."; },
        function () { return "월 6,900원이면 제가 매일 손님 몫으로 5조합을 뽑아 두고, 상세 리포트까지 붙여 드려요. 2027 총운세도 함께 열리고요."; }
      ],
      freeAnnual: [
        function () { return "…손님한테만 말씀드리는 건데, 연간으로 하시면 2027 신년 재물운까지 열두 달을 미리 펼쳐 드려요. 월 4,917원꼴이에요."; },
        function () { return "그리고 연간 패스는 59,000원 한 번이면 열두 달이에요. 월로 치면 4,917원꼴 — 손님한테 먼저 귀띔하는 거예요."; },
        function () { return "1년을 한 번에 잡으시면 59,000원, 월 4,917원꼴이에요. 2027년 열두 달을 미리 펼쳐 드리는 값이죠."; }
      ],
      freeWish: [
        function () { return "아, 그리고 오늘은 부적도 하나 만들어 드릴 수 있어요. 3일 소원 부적 — 만 원이면 제가 사흘 동안 곁에서 빌어 드려요. 미리보기는 무료예요."; },
        function () { return "점만으로 부족하시면 부적도 있어요. 3일 소원 부적, 만 원이고 미리보기는 그냥 보실 수 있어요. 제가 사흘 정성껏 빌어 드릴게요."; }
      ]
    },
    female: {
      playOpen: [
        function () { return "오늘 보실 건 다 열려 있어요. 5조합도 2027 총운세 네 갈래도 무료로 보실 수 있어요."; },
        function () { return "손님, 오늘은 제가 다 열어 뒀어요. 5조합도 총운세도, 짧은 광고 하나만 보고 가세요."; },
        function () { return "복채 안 받아요. 무료로 이용 중이시니까, 오늘 기운만 제대로 가져가세요."; }
      ],
      vip: [
        function () { return "손님은 다 열려 있어요. 10조합도, 심층 리포트도… 제가 더 보여 드릴 게 없을 정도예요."; },
        function () { return "손님, 오늘은 제가 아쉬운 게 없어요. 10조합도 심층 리포트도 다 열려 있으니까요. …그게 조금 아쉽지만요."; },
        function () { return "황금 사주 패스 손님이시죠. 10조합, 심층 리포트 다 열려 있어요. 제가 뭘 더 해 드릴 수 있을까요."; }
      ],
      vipCaution: [
        function (c) { return "2027년 정미년 총운세도 펼쳐 뒀어요. 손님이 가장 흔들리는 달은 " + c.cautionM + "월, 그 달만 넘기면 나머지는 손님 편이에요."; },
        function (c) { return "2027년 열두 달 중에 " + c.cautionM + "월만 조심하세요. 그 달만 넘기면 나머지는 편안해요."; },
        function (c) { return "2027년을 다 봤는데, 손님은 " + c.cautionM + "월이 제일 흔들려요. 그 전 달에 미리 정리해 두시면 좋아요."; }
      ],
      vipClose: [
        function (c) { return "그래도 오늘 하나만 더. 행운의 시간은 " + c.luckyTime + ", 방위는 " + c.luckyDir + ". 그때 움직이시면 기운이 두 배로 붙어요."; },
        function (c) { return "오늘의 마지막이에요. " + c.luckyDir + " 방위, " + c.luckyTime + " 사이 — 이 둘만 기억하세요."; },
        function (c) { return "제가 오늘 드릴 수 있는 건 이거예요. " + c.lucky + ". 그리고 " + c.luckyDir + ". 나머지는 손님이 이미 가지고 계세요."; }
      ],
      up1: [
        function () { return "2027 신년 총운세는 금전·사업·건강·연애 네 갈래로 다 열려 있어요."; },
        function () { return "손님 요금제면 2027년 네 갈래가 다 보여요. 금전, 사업, 건강, 연애 — 저는 건강부터 보시길 권해요."; }
      ],
      upCaution: [
        function (c) { return "손님이 가장 흔들리는 달은 " + c.cautionM + "월이에요. 그 달만 피해 가도 한 해가 달라져요."; },
        function (c) { return "네 갈래 중에 하나만 먼저 말씀드리면 " + c.cautionM + "월이에요. 그 달엔 무리하지 마세요."; }
      ],
      upHalf: [
        function () { return "그런데… 5조합은 매일 봐도, 10조합과 심층 리포트는 아직 반쪽이에요."; },
        function () { return "손님, 5조합은 나오는데 10조합은 아직 잠겨 있어요. 제가 그게 마음에 걸려요."; }
      ],
      upVip: [
        function () { return "황금 사주 패스로 열어 두시면 매주 정밀 10조합이랑 비밀 재물운까지 제가 챙겨 드릴게요. 월 12,900원, 아니면 평생 89,000원 한 번이면 돼요."; },
        function () { return "한 단계만 올리시면 매주 10조합을 따로 뽑아 두고 심층 리포트까지 붙여 드려요. 월 12,900원이고, 평생은 89,000원 한 번이에요."; }
      ],
      guest1: [
        function () { return "그런데… 여기서부터는 제가 조금 욕심이 나네요. 이 기운, 그냥 지나치면 너무 아까운데… 회원가입만 하시면 오늘의 비책 조합 하나 더 귀띔해 드릴까요?"; },
        function () { return "손님, 하나만 더 말씀드려도 될까요? …이건 아무한테나 하는 얘기가 아니에요. 가입하시면 오늘 쓸 조합 하나 더 뽑아 드릴게요."; },
        function () { return "제가 지금 손님 몫으로 하나 더 봐 뒀어요. 그런데 그건 단골한테만 드리는 거라서요… 30초만 써 주실래요?"; }
      ],
      guestSignup: [
        function () { return "가입은 30초면 돼요. 단골이 되시면 매일 아침, 제가 손님 몫의 기운을 먼저 봐 둘게요."; },
        function () { return "이메일 하나면 돼요. 내일 아침에 제가 먼저 손님 점을 보고 기다릴게요."; }
      ],
      free1: [
        function () { return "오늘 대운이 딱 열렸는데, 반쪽만 보시게요? 아니면… 제가 다 열어 드릴까요?"; },
        function () { return "손님, 여기서 끊으면 저도 아쉬워요. 조금만 더 열어 드릴까요?"; },
        function () { return "제가 지금 손님 몫으로 하나 더 봐 뒀어요. …여기서 그냥 두면 아까워서요."; }
      ],
      freeCaution: [
        function (c) { return "2027년 정미년, 손님이 가장 흔들리는 달은 " + c.cautionM + "월이에요. 그 달만 넘기면 한 해가 달라져요."; },
        function (c) { return "2027년 얘기를 하나만 하면 " + c.cautionM + "월이에요. 그 달엔 큰 지출도 새 계약도 잡지 마세요."; }
      ],
      freePlans: [
        function () { return "복채 패스로 열어 두시면 광고 없이 5조합과 상세 리포트를 매일 바로 드리고, 2027 총운세 네 갈래도 전부 열려요. 월 6,900원이에요."; },
        function () { return "복채 패스면 매일 아침 5조합과 상세 리포트가 광고 없이 바로 오고, 2027 총운세 네 갈래도 다 열려요. 월 6,900원이고요."; },
        function () { return "월 6,900원이면 제가 매일 손님 몫으로 5조합을 뽑아 두고 상세 리포트까지 붙여 드려요. 2027 총운세도 함께 열리고요."; }
      ],
      freeAnnual: [
        function () { return "…손님한테만 말씀드리는 건데, 연간으로 하시면 2027 신년 재물운까지 열두 달을 미리 펼쳐 드려요. 월 4,917원꼴이에요."; },
        function () { return "연간 패스는 59,000원 한 번이면 열두 달이에요. 월로 치면 4,917원꼴이고요. 손님한테 먼저 귀띔하는 거예요."; }
      ],
      freeWish: [
        function () { return "아, 그리고 오늘은 부적도 만들어 드릴 수 있어요. 3일 소원 부적 — 만 원이면 제가 사흘 동안 곁에서 빌어 드려요. 미리보기는 무료예요."; },
        function () { return "점만으로 부족하시면 부적도 있어요. 3일 소원 부적, 만 원이고 미리보기는 그냥 보실 수 있어요."; }
      ]
    }
  };

  function hookLines(c, r) {
    var H = HOOK[voice()];
    var L = [];
    if (PLAY && !c.guest) {
      /* 무료·광고형: 요금제 대신 '무료로 열려 있음'을 알리고 콘텐츠로 안내 */
      L.push({ t: f(H.playOpen, c, r) });
      if (c.ny && c.cautionM) L.push({ t: f(H.vipCaution, c, r + 1), cta: "annual" });
      L.push({ t: f(H.vipClose, c, r + 2), cta: c.ny ? "annual" : "numbers" });
      return L;
    }
    if (c.tier === "vip") {
      L.push(f(H.vip, c, r));
      if (c.ny && c.cautionM) L.push({ t: f(H.vipCaution, c, r + 1), cta: "annual" });
      L.push({ t: f(H.vipClose, c, r + 2), cta: c.ny ? "annual" : "numbers" });
      return L;
    }
    if (c.tier === "monthly" || c.tier === "annual") {
      L.push(f(H.up1, c, r));
      if (c.ny && c.cautionM) L.push({ t: f(H.upCaution, c, r + 1), cta: "annual" });
      L.push(f(H.upHalf, c, r + 2));
      L.push({ t: f(H.upVip, c, r + 3), cta: "plans" });
      return L;
    }
    if (c.guest) {
      L.push(f(H.guest1, c, r));
      L.push({ t: f(H.guestSignup, c, r + 1), cta: "signup" });
      return L;
    }
    /* 무료 회원 */
    L.push(f(H.free1, c, r));
    if (c.ny && c.cautionM) L.push({ t: f(H.freeCaution, c, r + 1), cta: "annual" });
    /* 부적 유도는 세 번에 한 번꼴 */
    if (pick([0, 1, 2], r + 2) === 0) L.push({ t: f(H.freeWish, c, r + 3), cta: "wish" });
    L.push({ t: f(H.freePlans, c, r + 4), cta: "plans" });
    L.push(f(H.freeAnnual, c, r + 5));
    return L;
  }

  /* ───────── 대사 조립 ───────── */
  function buildLines() {
    var c = ctx();
    var list = SCENES[voice()] || SCENES.male;
    var idx = state.scene[voice()] || 0;
    if (!list[idx]) idx = 0;
    var r = state.seed || 0;

    var raw = !c.a
      ? birthScene(c, r)
      : list[idx].build(c, r).concat(hookLines(c, r));

    var L = raw.map(function (x) { return typeof x === "string" ? { t: x } : x; });

    /* 두 번째 줄 뒤에 시간대·요일 멘트를 끼워 넣습니다 (접속 시각·요일이 대사에 반영되는 자리) */
    var extra = [];
    var tf = pick(TIME_FLAVOR[voice()][c.bucket], r);
    if (tf) extra.push({ t: tf });
    var df = dayFlavor(c, r + 1);
    if (df) extra.push({ t: df });
    if (extra.length && L.length) L = [L[0]].concat(extra, L.slice(1));
    return L;
  }

  /* ───────── 시나리오 뽑기 — 직전과 겹치지 않게 ───────── */
  function drawScene() {
    var list = SCENES[voice()] || [];
    if (!list.length) return;
    var bag = load(SKEY, {});
    if (!bag || typeof bag !== "object") bag = {};
    var rec = bag[voice()];
    if (typeof rec === "number") rec = { i: rec, recent: [rec], seed: 0 };
    if (!rec || typeof rec !== "object") rec = { i: -1, recent: [], seed: 0 };

    var recent = (rec.recent || []).slice(-3);
    var pool = [];
    for (var k = 0; k < list.length; k++) if (recent.indexOf(k) < 0) pool.push(k);
    if (!pool.length) for (k = 0; k < list.length; k++) pool.push(k);

    var idx = pool[Math.floor(Math.random() * pool.length)];
    if (list.length > 1 && idx === rec.i) {
      var alt = pool.filter(function (x) { return x !== rec.i; });
      if (alt.length) idx = alt[Math.floor(Math.random() * alt.length)];
    }

    rec.i = idx;
    rec.recent = recent.concat([idx]).slice(-4);
    rec.seed = (rec.seed || 0) + 1;
    bag[voice()] = rec;
    store(SKEY, bag);

    state.scene[voice()] = idx;
    state.seed = rec.seed;
  }

  function sceneName() {
    if (!analysis()) return "";
    var list = SCENES[voice()] || [];
    var sc = list[state.scene[voice()] || 0];
    return sc ? sc.name : "";
  }

  /* ───────── 안내 버튼(회원가입 · 요금제 · 부적) ───────── */
  function ctaHtml(kind) {
    var tier = tierOf();
    var user = loggedIn();
    var rows = [];
    var note = "";

    function add(go, label, cls) { rows.push({ go: go, label: label, cls: cls || "btn-primary" }); }

    if (PLAY) {
      /* 무료·광고형: 결제 안내 대신 무료 이용 안내 */
      if (kind === "birth") {
        add("saju", "내 사주 입력하고 점사 듣기", "btn-gold");
        note = "생년월일은 이 기기 안에서만 계산·저장돼요";
      } else if (kind === "signup" && !user) {
        add("signup", "무료 회원가입하고 마저 듣기", "btn-gold");
        note = "가입 30초 · 모든 기능 무료 · 계정은 이 기기에만 저장";
      } else if (kind === "wish") {
        add("wish", "3일 소원 부적 만들기", "btn-gold");
        note = "카드 만들기·원본 저장 모두 무료예요";
      } else if (kind === "annual") {
        add("annual", "2027 신년 총운세 보기", "btn-gold");
        note = "네 갈래 총운과 열두 달 전체가 열려 있어요";
      } else {
        add("numbers", "오늘의 5조합 보기", "btn-gold");
        note = "광고를 포함한 무료 앱이에요";
      }
      return '<div class="wt-cta-box">' +
        '<div class="wt-cta-btns">' + rows.map(function (r) {
          return '<button type="button" class="btn ' + r.cls + '" data-wt-go="' + r.go + '">' + esc(r.label) + "</button>";
        }).join("") + "</div>" +
        (note ? '<p class="wt-cta-note">' + esc(note) + "</p>" : "") +
        "</div>";
    }

    if (kind === "birth") {
      add("saju", "내 사주 입력하고 점사 듣기", "btn-gold");
      note = "생년월일은 이 기기 안에서만 계산·저장돼요";
    } else if (kind === "signup" && !user) {
      add("signup", "무료 회원가입하고 마저 듣기", "btn-gold");
      add("plans", "요금제 먼저 둘러보기", "btn-ghost");
      note = "가입 30초 · 계정 정보는 이 기기에만 저장";
    } else if (kind === "wish") {
      add("wish", "3일 소원 부적 미리보기", "btn-gold");
      add("plans", "내 요금제 보기", "btn-ghost");
      note = "1건 10,000원 · 미리보기는 무료예요";
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
      note = "계좌이체 후 이용권 코드로 바로 열려요";
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
    var nm = sceneName();
    var r1 = byId("wtRole");
    if (r1) r1.textContent = c.role + " · " + c.name;
    var r2 = byId("cutRole");
    if (r2) r2.textContent = c.role + " · " + c.name;
    var tt = byId("cutTitle");
    if (tt) tt.textContent = nm ? "오늘의 점사 · " + nm : "오늘의 점사";
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

  /* 🔄 다른 점사 듣기 — 새 시나리오를 뽑아 처음부터 다시 들려줍니다 */
  function shuffle() {
    drawScene();
    rebuild(false);
    flash();
    if (isCutOpen()) {
      var sheet = byId("cutModal") && byId("cutModal").querySelector(".cut-sheet");
      if (sheet) sheet.scrollTop = 0;
    }
  }

  function flash() {
    VIEWS.forEach(function (v) {
      var stage = byId(v.stage);
      if (!stage) return;
      stage.classList.remove("swapped");
      void stage.offsetWidth;
      stage.classList.add("swapped");
      setTimeout(function () { stage.classList.remove("swapped"); }, 720);
    });
  }

  function setViewer(g) {
    g = g === "female" ? "female" : "male";
    if (g === state.viewer) { syncGender(); return; }
    state.viewer = g;
    store(GKEY, g);
    syncGender();
    drawScene();
    rebuild(false);
    flash();
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
    if (action === "wish") {
      closeCut();
      var w = byId("wish");
      if (w) w.scrollIntoView({ behavior: "smooth", block: "start" });
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
      var el = e.target;
      if (!el || !el.closest) return;

      var g = el.closest("[data-gender]");
      if (g) { setViewer(g.getAttribute("data-gender")); return; }

      var teller = el.closest("[data-teller]");
      if (teller) { setViewer(teller.getAttribute("data-teller")); return; }

      var opener = el.closest("[data-wt-open]");
      if (opener) { e.preventDefault(); openCut(); return; }

      var closer = el.closest("[data-wt-close]");
      if (closer) { closeCut(); return; }

      var shuf = el.closest("[data-wt-shuffle]");
      if (shuf) { e.preventDefault(); shuffle(); return; }

      var goBtn = el.closest("[data-wt-go]");
      if (goBtn) { e.preventDefault(); go(goBtn.getAttribute("data-wt-go")); return; }

      var nx = el.closest("[data-wt-next]");
      if (nx) { next(); return; }

      var pv = el.closest("[data-wt-prev]");
      if (pv) { prev(); return; }

      var dot = el.closest("[data-wt-dot]");
      if (dot) { jump(parseInt(dot.getAttribute("data-wt-dot"), 10)); return; }

      var stage = el.closest(".wt-stage");
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
    drawScene();          /* 방문·새로고침마다 직전과 다른 시나리오 */
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
    shuffle: shuffle,
    scene: sceneName,
    lines: function () { return state.lines.slice(); },
    setViewer: setViewer,
    viewer: function () { return state.viewer; }
  };

  /* app.js가 먼저 초기화(Unmyeong 노출)된 뒤에 붙습니다 */
  function boot() { setTimeout(init, 0); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(window);
