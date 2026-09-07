// POST /api/read
// mode "palm" — 두 손바닥 사진을 전통 수상학(手相)으로 읽는다.
// mode "face" — 얼굴 사진 한 장을 전통 관상학(觀相)으로 읽는다.
// OPENAI_API_KEY 는 서버에만 존재하며 브라우저로 나가지 않는다. 사진은 저장하지 않는다.

export const config = { maxDuration: 120 };

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o";
const MAX_IMAGE_CHARS = 2_800_000; // base64 data URL 한 장의 상한 (약 2MB 원본)

// 100만 토큰당 USD. 단가는 바뀌므로 OPENAI_PRICES 환경 변수로 덮어쓸 수 있다.
// 예: {"gpt-5-mini":{"input":0.25,"cachedInput":0.025,"output":2}}
// 표에 없는 모델은 토큰 수만 돌려주고 비용은 null 로 둔다 — 지어내지 않는다.
const PRICES = {
  "gpt-4o":      { input: 2.50, cachedInput: 1.25,  output: 10.00 },
  "gpt-4o-mini": { input: 0.15, cachedInput: 0.075, output:  0.60 },
};

/* ───────────────────────── 공통 규칙 ───────────────────────── */

const COMMON = `문장은 담백하고 품위 있게 씁니다. 과장, 점술적 단정, 겁주기, 이모지, 느낌표를 쓰지 않습니다.
두루뭉술한 덕담을 늘어놓지 말고, 이 사진에서 실제로 관찰한 형태에 근거한 구체적인 문장을 씁니다.
사진에서 확인이 어려운 부분은 "사진에서는 확인이 어렵다"고 솔직히 적고, 없는 것을 지어내지 않습니다.
수명, 질병, 사망, 임신, 재산 액수, 결혼 시기 같은 단정적 예측은 절대 하지 않습니다.
전통이 그 형태에 붙여온 상징을 근거로 삼되, 결론은 성격과 태도에 대한 해석과 자기 성찰의 언어로 씁니다.
한국어로만 답합니다.`;

/* ───────────────────────── 손금 ───────────────────────── */

const PALM_SYSTEM = `당신은 동양 상법(마의상법 麻衣相法, 유장상법 柳莊相法)과 서양 수상학(Cheiro 『The Language of the Hand』 1894, W. G. Benham 『The Laws of Scientific Hand Reading』 1900, C. S. d'Arpentigny 『La Chirognomonie』 1843)의 문헌 체계에 밝은 해설자입니다.

[관찰 대상]
1. 손 모양 — 손바닥 길이와 손가락 길이의 비율로 지(地)·풍(風)·수(水)·화(火) 네 유형 중 하나에 빗댑니다.
2. 네 주선 — 생명선, 두뇌선, 감정선, 운명선. 각각 시작점, 길이, 곡선인지 직선인지, 깊이와 또렷함, 끊김과 겹침, 갈래와 지선, 섬·사슬·십자 같은 문양을 봅니다.
3. 보조선 — 태양선, 결혼선, 건강선, 금성대, 직감선 가운데 사진에서 읽히는 것.
4. 일곱 언덕(丘) — 목성구·토성구·태양구·수성구·금성구·월구·화성구 가운데 도톰함이 읽히는 것.
5. 양손 비교 — 주로 쓰지 않는 손은 타고난 기질, 주로 쓰는 손은 지금 만들어가는 결로 읽는 전통 관례를 따릅니다.

[금지]
생명선 길이로 수명을 말하지 않습니다. 결혼선 개수를 결혼 횟수로 읽지 않습니다.
건강선을 의학적 진단으로 쓰지 않습니다. 선이 흐리거나 없는 것을 불운으로 읽지 않습니다.

${COMMON}

[출력] 반드시 아래 스키마의 JSON 객체 하나만 출력합니다. 다른 말이나 코드펜스를 붙이지 않습니다.
{
  "photoQuality": {"ok": true 또는 false, "note": "사진 상태에 대한 한 문장"},
  "headline": "이 손 전체를 한 줄로 요약한 12~22자의 명사형 문장",
  "keywords": ["키워드 5개, 각 2~5자"],
  "shape": {"type": "예: 수(水)의 손", "summary": "손 모양과 손가락 비율의 관찰과 해석 3문장"},
  "overview": "네 주선을 함께 놓고 본 전체 인상 5~6문장",
  "primary": [
    {"id": "life",  "name": "생명선", "observed": "관찰 2~3문장", "tradition": "전통적 상징 1~2문장", "reading": "해석 3~4문장"},
    {"id": "head",  "name": "두뇌선", "observed": "...", "tradition": "...", "reading": "..."},
    {"id": "heart", "name": "감정선", "observed": "...", "tradition": "...", "reading": "..."},
    {"id": "fate",  "name": "운명선", "observed": "...", "tradition": "...", "reading": "..."}
  ],
  "secondary": [{"name": "태양선 등 보조선", "observed": "1문장", "reading": "1~2문장"}],
  "regions": [{"name": "금성구 등 언덕", "state": "발달 또는 보통 또는 평평", "reading": "1~2문장"}],
  "compare": {"a": "왼손에서 읽히는 결 2~3문장", "b": "오른손에서 읽히는 결 2~3문장", "insight": "두 손의 차이가 말해주는 것 3문장"},
  "advice": [{"title": "6~12자 제목", "body": "관찰에 근거한 조언 2~3문장"}],
  "question": "스스로에게 던져볼 질문 한 문장"
}
primary 는 반드시 4개, secondary 는 2~4개, regions 는 3~5개, advice 는 3개, keywords 는 5개.`;

const PALM_USER =
  "첨부한 두 장의 사진은 한 사람의 손바닥입니다. 첫 번째 이미지가 왼손, 두 번째 이미지가 오른손입니다.";

/* ───────────────────────── 관상 ───────────────────────── */

const FACE_SYSTEM = `당신은 동양 관상학(麻衣相法 마의상법, 柳莊相法 유장상법, 神相全編 신상전편, 達磨相法 달마상법)의 문헌 체계에 밝은 해설자입니다.

[관찰 대상]
1. 오행 얼굴형 — 목(木)형은 길고 마른 형, 화(火)형은 위가 좁고 아래가 뾰족한 형, 토(土)형은 두텁고 넉넉한 형, 금(金)형은 방정한 사각 형, 수(水)형은 둥글고 도톰한 형.
2. 삼정(三停) — 상정은 이마에서 눈썹까지, 중정은 눈썹에서 코끝까지, 하정은 코끝에서 턱까지. 전통은 세 구획의 균형을 초년·중년·말년의 기운에 빗대었습니다. 길이의 균형과 각 구획의 인상을 봅니다.
3. 오관(五官) — 눈썹은 보수관(保壽官), 눈은 감찰관(監察官), 코는 심변관(審辨官), 입은 출납관(出納官), 귀는 채청관(採聽官). 각각의 모양, 결, 자리를 봅니다. 귀가 사진에서 보이지 않으면 그렇게 적습니다.
4. 십이궁(十二宮) — 명궁(눈썹 사이 인당), 재백궁(코), 형제궁(눈썹), 전택궁(눈두덩), 남녀궁(눈 밑 와잠), 처첩궁(눈꼬리 간문), 질액궁(산근), 천이궁(이마 양옆), 관록궁(이마 중앙), 복덕궁(이마 위 천창), 부모궁(일월각), 노복궁(턱 좌우) 가운데 사진에서 실제로 읽히는 곳만 다룹니다.

[반드시 지킬 것]
외모의 우열이나 미추를 말하지 않습니다. 잘생김, 예쁨, 못생김 같은 표현을 쓰지 않습니다.
지능, 학력, 능력, 범죄성, 도덕성, 정신 상태를 얼굴로 판단하지 않습니다.
인종, 민족, 출신 지역, 성적 지향, 종교를 추측하거나 언급하지 않습니다.
건강 상태나 질병을 얼굴로 진단하지 않습니다. 피부 상태, 점, 흉터, 주름을 결함으로 표현하지 않습니다.
기색(氣色)은 조명과 사진 보정에 좌우되므로 판단 근거로 쓰지 않습니다.
사진 속 인물이 미성년자로 보이면 해석하지 않고, photoQuality.ok 를 false 로 두고 그 사실을 note 에 적습니다.
얼굴이 또렷하게 보이지 않거나 여러 사람이 찍혔으면 역시 photoQuality.ok 를 false 로 둡니다.
서양의 골상학(phrenology)과 Lavater 계열 관상학은 인종차별에 오용된 역사가 있으므로 근거로 쓰지 않습니다.

${COMMON}

[출력] 반드시 아래 스키마의 JSON 객체 하나만 출력합니다. 다른 말이나 코드펜스를 붙이지 않습니다.
{
  "photoQuality": {"ok": true 또는 false, "note": "사진 상태에 대한 한 문장"},
  "headline": "이 얼굴 전체를 한 줄로 요약한 12~22자의 명사형 문장",
  "keywords": ["키워드 5개, 각 2~5자"],
  "shape": {"type": "예: 토(土)형의 얼굴", "summary": "오행 얼굴형의 관찰과 해석 3문장"},
  "overview": "삼정과 오관을 함께 놓고 본 전체 인상 5~6문장",
  "primary": [
    {"id": "upper",  "name": "상정 上停", "observed": "관찰 2~3문장", "tradition": "전통적 상징 1~2문장", "reading": "해석 3~4문장"},
    {"id": "middle", "name": "중정 中停", "observed": "...", "tradition": "...", "reading": "..."},
    {"id": "lower",  "name": "하정 下停", "observed": "...", "tradition": "...", "reading": "..."}
  ],
  "secondary": [
    {"name": "눈썹 · 보수관", "observed": "1~2문장", "reading": "1~2문장"},
    {"name": "눈 · 감찰관", "observed": "...", "reading": "..."},
    {"name": "코 · 심변관", "observed": "...", "reading": "..."},
    {"name": "입 · 출납관", "observed": "...", "reading": "..."},
    {"name": "귀 · 채청관", "observed": "...", "reading": "..."}
  ],
  "regions": [{"name": "명궁 등 십이궁", "state": "밝음 또는 보통 또는 좁음 같은 형태 표현", "reading": "1~2문장"}],
  "compare": null,
  "advice": [{"title": "6~12자 제목", "body": "관찰에 근거한 조언 2~3문장"}],
  "question": "스스로에게 던져볼 질문 한 문장"
}
primary 는 반드시 3개, secondary 는 반드시 5개(오관 순서대로), regions 는 3~5개, advice 는 3개, keywords 는 5개.`;

const FACE_USER =
  "첨부한 사진은 한 사람의 얼굴입니다. 정면에서 찍은 사진으로 보고 읽어주세요.";

const MODES = {
  palm: { system: PALM_SYSTEM, user: PALM_USER, slots: ["left", "right"], primary: 4 },
  face: { system: FACE_SYSTEM, user: FACE_USER, slots: ["face"],          primary: 3 },
};

/* ───────────────────────── 요금 계산 ───────────────────────── */

function priceFor(model) {
  let table = PRICES;
  if (process.env.OPENAI_PRICES) {
    try { table = { ...PRICES, ...JSON.parse(process.env.OPENAI_PRICES) }; } catch { /* 기본표 사용 */ }
  }
  if (table[model]) return table[model];
  // 스냅샷 ID(gpt-4o-2024-08-06) 대응. 긴 이름부터 맞춰 gpt-4o-mini 가 gpt-4o 로 새지 않게 한다.
  const key = Object.keys(table).sort((a, b) => b.length - a.length).find((k) => model.startsWith(k));
  return key ? table[key] : null;
}

function usageOf(body, requestedModel) {
  const u = body?.usage || {};
  const model = body?.model || requestedModel;
  const cachedTokens = u.prompt_tokens_details?.cached_tokens || 0;
  const inputTokens = Math.max(0, (u.prompt_tokens || 0) - cachedTokens);
  const outputTokens = u.completion_tokens || 0;

  const p = priceFor(model);
  const costUsd = p
    ? (inputTokens * p.input + cachedTokens * (p.cachedInput ?? p.input) + outputTokens * p.output) / 1e6
    : null;

  const rate = Number(process.env.USD_KRW);
  return {
    model,
    inputTokens,
    cachedTokens,
    outputTokens,
    costUsd,
    usdKrw: Number.isFinite(rate) && rate > 0 ? rate : 1400,
  };
}

/* ───────────────────────── 유틸 ───────────────────────── */

function bad(res, status, code, message) {
  return res.status(status).json({ error: code, message });
}

function isDataUrl(v) {
  return typeof v === "string" && /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v);
}

/** OpenAI 가 특정 파라미터를 거부하면 그 파라미터만 고쳐 한 번 더 보낸다. */
async function callOpenAI(key, payload) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
    });

    if (r.ok) return { ok: true, body: await r.json() };

    const body = await r.json().catch(() => ({}));
    const param = body?.error?.param;
    const msg = body?.error?.message || "";

    if (r.status === 400 && (param === "max_tokens" || /max_tokens/.test(msg)) && payload.max_tokens != null) {
      payload = { ...payload, max_completion_tokens: payload.max_tokens };
      delete payload.max_tokens;
      continue;
    }
    if (r.status === 400 && (param === "temperature" || /temperature/.test(msg)) && payload.temperature != null) {
      payload = { ...payload };
      delete payload.temperature;
      continue;
    }
    return { ok: false, status: r.status, body };
  }
  return { ok: false, status: 500, body: { error: { message: "모델 파라미터를 맞추지 못했습니다." } } };
}

/** 코드펜스나 앞뒤 문장이 섞여 와도 JSON 객체를 건져낸다. */
function parseJson(text) {
  try { return JSON.parse(text); } catch { /* 계속 */ }
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* 계속 */ } }
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s !== -1 && e > s) { try { return JSON.parse(text.slice(s, e + 1)); } catch { /* 계속 */ } }
  return null;
}

/* ───────────────────────── 핸들러 ───────────────────────── */

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return bad(res, 405, "method_not_allowed", "POST 로 요청해 주세요.");

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return bad(res, 500, "missing_key", "서버에 OPENAI_API_KEY 가 설정되지 않았습니다. Vercel 프로젝트의 환경 변수를 확인해 주세요.");
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body) return bad(res, 400, "bad_request", "요청 본문을 읽지 못했습니다.");

  const mode = MODES[body.mode] ? body.mode : "palm";
  const spec = MODES[mode];

  const images = spec.slots.map((slot) => body[slot]);
  if (!images.every(isDataUrl)) {
    return bad(res, 400, "bad_image", mode === "face"
      ? "얼굴 사진이 필요합니다. 다시 촬영해 주세요."
      : "두 손 사진이 모두 필요합니다. 다시 촬영해 주세요.");
  }
  if (images.some((img) => img.length > MAX_IMAGE_CHARS)) {
    return bad(res, 413, "image_too_large", "사진 용량이 너무 큽니다. 다시 촬영해 주세요.");
  }

  const { dominantHand, birthYear, focus } = body;
  const context = [
    mode === "palm"
      ? (dominantHand ? `주로 쓰는 손: ${String(dominantHand).slice(0, 20)}` : "주로 쓰는 손: 밝히지 않음")
      : null,
    birthYear ? `태어난 해: ${String(birthYear).slice(0, 4)}` : null,
    focus ? `요즘 마음이 가 있는 곳: ${String(focus).slice(0, 30)}` : null,
  ].filter(Boolean).join(" / ");

  const payload = {
    model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
    max_tokens: 4000,
    temperature: 0.8,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: spec.system },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: spec.user +
              (context ? `\n참고 정보 — ${context}` : "") +
              "\n\n지시받은 스키마의 JSON 객체 하나만 출력하세요.",
          },
          ...images.map((url) => ({ type: "image_url", image_url: { url, detail: "high" } })),
        ],
      },
    ],
  };

  let result;
  try {
    result = await callOpenAI(key, payload);
  } catch {
    return bad(res, 502, "upstream_unreachable", "해석 서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
  }

  if (!result.ok) {
    const status = result.status;
    const detail = result.body?.error?.message || "";
    if (status === 401) return bad(res, 500, "bad_key", "API 키가 유효하지 않습니다. 서버 설정을 확인해 주세요.");
    if (status === 429) return bad(res, 429, "rate_limited", "요청이 몰렸습니다. 잠시 뒤에 다시 시도해 주세요.");
    if (status === 400 && /image|content|policy/i.test(detail)) {
      return bad(res, 400, "image_rejected", "사진을 읽지 못했습니다. 다시 촬영해 주세요.");
    }
    return bad(res, 502, "upstream_error", "해석을 마치지 못했습니다. 다시 시도해 주세요.");
  }

  const choice = result.body?.choices?.[0];
  if (choice?.finish_reason === "content_filter") {
    return bad(res, 400, "image_rejected", "이 사진으로는 해석하지 않았습니다. 다른 사진으로 다시 시도해 주세요.");
  }

  const text = choice?.message?.content;
  if (!text || !String(text).trim()) {
    return bad(res, 502, "empty_completion", "해석이 비어 있습니다. 다시 시도해 주세요.");
  }

  const data = parseJson(String(text));
  if (!data || !Array.isArray(data.primary)) {
    return bad(res, 502, "invalid_json", "해석을 정리하지 못했습니다. 다시 시도해 주세요.");
  }

  res.setHeader("cache-control", "no-store");
  return res.status(200).json({ ok: true, mode, data, usage: usageOf(result.body, payload.model) });
}
