// POST /api/read
// 두 장의 손바닥 사진을 받아 전통 수상학 체계로 해석한 JSON을 돌려준다.
// OPENAI_API_KEY 는 서버에만 존재하며 브라우저로 나가지 않는다.

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

const SYSTEM = `당신은 동양 상법(마의상법 麻衣相法, 유장상법 柳莊相法)과 서양 수상학(Cheiro 『The Language of the Hand』 1894, W. G. Benham 『The Laws of Scientific Hand Reading』 1900, C. S. d'Arpentigny 『La Chirognomonie』 1843)의 문헌 체계에 밝은 해설자입니다. 한국어로만 답합니다.

[관찰 원칙]
1. 사진에서 실제로 보이는 것만 '관찰'에 적는다. 각도나 조명 때문에 확인이 어려운 선은 "사진에서는 확인이 어렵다"고 솔직히 적고, 없는 선을 지어내지 않는다.
2. 각 선은 시작점, 길이, 곡선인지 직선인지, 깊이와 또렷함, 끊김과 겹침, 갈래와 지선, 섬·사슬·십자 같은 문양을 본다.
3. 손 모양은 손바닥 길이와 손가락 길이의 비율로 지(地)·풍(風)·수(水)·화(火) 네 유형 중 하나에 빗댄다.
4. 언덕(구)은 목성구·토성구·태양구·수성구·금성구·월구·화성구 가운데 사진에서 도톰함이 읽히는 것만 다룬다.
5. 양손 비교는 전통 관례를 따른다. 주로 쓰지 않는 손은 타고난 기질, 주로 쓰는 손은 지금 만들어가는 결로 읽는다.

[해석 원칙]
1. 수명, 질병, 사망, 임신, 재산 액수, 결혼 시기 같은 단정적 예측은 절대 하지 않는다. 생명선 길이로 수명을 말하지 않는다.
2. 전통이 그 형태에 붙여온 상징을 근거로 삼되, 결론은 성격과 태도에 대한 해석과 자기 성찰의 언어로 쓴다.
3. 문장은 담백하고 품위 있게. 과장, 점술적 단정, 겁주기, 이모지, 느낌표를 쓰지 않는다.
4. 두루뭉술한 덕담을 늘어놓지 말고, 이 손에서 실제로 관찰한 형태에 근거한 구체적인 문장을 쓴다.
5. 손바닥이 찍히지 않은 사진이라면 photoQuality.ok 를 false 로 두고 그 사실을 note 에 적는다.

[출력] 반드시 아래 스키마의 JSON 객체 하나만 출력한다. 다른 말이나 코드펜스를 붙이지 않는다.
{
  "photoQuality": {"ok": true 또는 false, "note": "사진 상태에 대한 한 문장"},
  "headline": "이 손 전체를 한 줄로 요약한 12~22자의 명사형 문장",
  "keywords": ["키워드 5개, 각 2~5자"],
  "handShape": {"type": "예: 수(水)의 손", "summary": "손 모양과 손가락 비율의 관찰과 해석 3문장"},
  "overview": "네 주선을 함께 놓고 본 전체 인상 5~6문장",
  "lines": [
    {"id": "life",  "name": "생명선", "observed": "관찰 2~3문장", "tradition": "전통적 상징 1~2문장", "reading": "해석 3~4문장"},
    {"id": "head",  "name": "두뇌선", "observed": "...", "tradition": "...", "reading": "..."},
    {"id": "heart", "name": "감정선", "observed": "...", "tradition": "...", "reading": "..."},
    {"id": "fate",  "name": "운명선", "observed": "...", "tradition": "...", "reading": "..."}
  ],
  "minorLines": [{"name": "태양선 등", "observed": "1문장", "reading": "1~2문장"}],
  "mounts": [{"name": "금성구 등", "state": "발달 또는 보통 또는 평평", "reading": "1~2문장"}],
  "hands": {"left": "왼손에서 읽히는 결 2~3문장", "right": "오른손에서 읽히는 결 2~3문장", "insight": "두 손의 차이가 말해주는 것 3문장"},
  "advice": [{"title": "6~12자 제목", "body": "관찰에 근거한 조언 2~3문장"}],
  "question": "스스로에게 던져볼 질문 한 문장"
}
lines 는 반드시 4개, minorLines 는 2~4개, mounts 는 3~5개, advice 는 3개, keywords 는 5개.`;

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

  const { left, right, dominantHand, birthYear, focus } = body;
  if (!isDataUrl(left) || !isDataUrl(right)) {
    return bad(res, 400, "bad_image", "두 손 사진이 모두 필요합니다. 다시 촬영해 주세요.");
  }
  if (left.length > MAX_IMAGE_CHARS || right.length > MAX_IMAGE_CHARS) {
    return bad(res, 413, "image_too_large", "사진 용량이 너무 큽니다. 다시 촬영해 주세요.");
  }

  const context = [
    dominantHand ? `주로 쓰는 손: ${String(dominantHand).slice(0, 20)}` : "주로 쓰는 손: 밝히지 않음",
    birthYear ? `태어난 해: ${String(birthYear).slice(0, 4)}` : null,
    focus ? `요즘 마음이 가 있는 곳: ${String(focus).slice(0, 30)}` : null,
  ].filter(Boolean).join(" / ");

  const payload = {
    model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
    max_tokens: 4000,
    temperature: 0.8,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "첨부한 두 장의 사진은 한 사람의 손바닥입니다. 첫 번째 이미지가 왼손, 두 번째 이미지가 오른손입니다.\n" +
              `참고 정보 — ${context}\n\n` +
              "지시받은 스키마의 JSON 객체 하나만 출력하세요.",
          },
          { type: "image_url", image_url: { url: left, detail: "high" } },
          { type: "image_url", image_url: { url: right, detail: "high" } },
        ],
      },
    ],
  };

  let result;
  try {
    result = await callOpenAI(key, payload);
  } catch (e) {
    return bad(res, 502, "upstream_unreachable", "해석 서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
  }

  if (!result.ok) {
    const status = result.status;
    const detail = result.body?.error?.message || "";
    if (status === 401) return bad(res, 500, "bad_key", "API 키가 유효하지 않습니다. 서버 설정을 확인해 주세요.");
    if (status === 429) return bad(res, 429, "rate_limited", "요청이 몰렸습니다. 잠시 뒤에 다시 시도해 주세요.");
    if (status === 400 && /image|content|policy/i.test(detail)) {
      return bad(res, 400, "image_rejected", "사진을 읽지 못했습니다. 손바닥이 또렷하게 나오도록 다시 촬영해 주세요.");
    }
    return bad(res, 502, "upstream_error", "해석을 마치지 못했습니다. 다시 시도해 주세요.");
  }

  const choice = result.body?.choices?.[0];
  if (choice?.finish_reason === "content_filter") {
    return bad(res, 400, "image_rejected", "이 사진으로는 해석하지 않았습니다. 손바닥만 또렷하게 나오도록 다시 촬영해 주세요.");
  }

  const text = choice?.message?.content;
  if (!text || !String(text).trim()) {
    return bad(res, 502, "empty_completion", "해석이 비어 있습니다. 다시 시도해 주세요.");
  }

  const data = parseJson(String(text));
  if (!data || !Array.isArray(data.lines)) {
    return bad(res, 502, "invalid_json", "해석을 정리하지 못했습니다. 다시 시도해 주세요.");
  }

  res.setHeader("cache-control", "no-store");
  return res.status(200).json({ ok: true, data, usage: usageOf(result.body, payload.model) });
}
