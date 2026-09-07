# 손금보기 · 관상보기

재미로 보는 상학. 사진을 찍어 올리면 전통 상학 체계로 해석해 주는 모바일 웹앱.

- **두 갈래** — 손금보기(手相)는 두 손바닥 사진으로, 관상보기(觀相)는 얼굴 사진 한 장으로 읽는다
- **모바일 전용 레이아웃** — 460px 단일 컬럼, 라이트/다크 테마 대응
- **촬영 또는 업로드** — 슬롯을 누르면 시트가 올라와 둘 중 하나를 고른다. 촬영은 `getUserMedia` 실시간 프리뷰에 손 모양 또는 얼굴 타원 가이드를 겹쳐 보여주고, 권한이 거부되면 업로드로 넘어간다
- **해석 엔진** — OpenAI Vision. API 키는 Vercel 서버리스 함수(`/api/read`)에만 존재하며 브라우저로 나가지 않는다. 사진은 저장하지 않는다
- **API 사용량** — 응답의 토큰 수로 비용을 계산해 브라우저 콘솔에만 남긴다

## 해석 체계

두 모드가 서로 다른 시스템 프롬프트를 쓴다. 관찰 대상과 금지 사항을 문헌 체계에 맞춰 명시한다.

| | 손금보기 | 관상보기 |
|---|---|---|
| 형(形) | 지·풍·수·화 네 손 유형 | 목·화·토·금·수 오행 얼굴형 |
| 주(主) | 생명선 · 두뇌선 · 감정선 · 운명선 | 삼정(三停) 상정 · 중정 · 하정 |
| 부(副) | 태양선 · 결혼선 · 건강선 · 금성대 · 직감선 | 오관(五官) 눈썹 · 눈 · 코 · 입 · 귀 |
| 구역 | 일곱 언덕(七丘) | 십이궁(十二宮) |
| 대조 | 양손 비교 | — |

문헌: 마의상법(麻衣相法), 유장상법(柳莊相法), 신상전편(神相全編), 달마상법(達磨相法),
Cheiro 『The Language of the Hand』(1894), W. G. Benham 『The Laws of Scientific Hand Reading』(1900),
C. S. d'Arpentigny 『La Chirognomonie』(1843).

### 관상 모드의 제약

얼굴을 다루므로 프롬프트에 다음을 명시하고, 테스트로 이 문구들이 실제로 전달되는지 검사한다.

- 외모의 우열이나 미추를 말하지 않는다
- 지능, 학력, 능력, 범죄성, 도덕성, 정신 상태를 얼굴로 판단하지 않는다
- 인종, 민족, 출신 지역, 성적 지향, 종교를 추측하거나 언급하지 않는다
- 건강 상태나 질병을 진단하지 않고, 점·흉터·주름을 결함으로 표현하지 않는다
- 미성년자로 보이면 해석하지 않는다
- 서양 골상학(phrenology)과 Lavater 계열은 인종차별에 오용된 역사가 있어 근거로 쓰지 않는다

## 구조

```
index.html      앱 전체 (모드 분기, 카메라, 결과 렌더)
api/read.js     Vercel 서버리스 함수 — 모드별 프롬프트, OpenAI Vision 호출, JSON 회수
package.json    type: module (ESM 서버리스 함수용)
```

빌드 단계 없음. Vercel이 루트의 `index.html`을 정적으로, `api/*.js`를 함수로 자동 인식한다.

### `/api/read`

```jsonc
// 요청
{ "mode": "palm", "left": "data:image/jpeg;base64,…", "right": "…",
  "dominantHand": "오른손", "birthYear": "1994", "focus": "일과 방향" }
{ "mode": "face", "face": "data:image/jpeg;base64,…" }

// 응답
{ "ok": true, "mode": "palm",
  "data": { "photoQuality": {…}, "headline": "…", "keywords": […],
            "shape": {…}, "overview": "…", "primary": […], "secondary": […],
            "regions": […], "compare": {…}, "advice": […], "question": "…" },
  "usage": { "model": "…", "inputTokens": 0, "cachedTokens": 0,
             "outputTokens": 0, "costUsd": 0, "usdKrw": 1400 } }
```

두 모드가 같은 응답 스키마를 쓴다 — `primary`/`secondary`/`regions` 의 뜻만 모드에 따라 달라지고,
프런트의 `MODES[mode].labels` 가 화면 제목을 붙인다. `compare` 는 손금에서만 채워진다.

## 배포

```bash
npm i -g vercel          # 아직 없다면
vercel link              # 또는 vercel (첫 배포 시 프로젝트 생성)
vercel env add OPENAI_API_KEY production
vercel env add OPENAI_API_KEY preview
vercel deploy --prod
```

GitHub 저장소를 Vercel에 연결한 경우, `main`에 푸시하면 자동 배포된다.
환경 변수는 Vercel 대시보드의 **Settings → Environment Variables** 에서도 넣을 수 있다.

### 환경 변수

| 이름 | 필수 | 설명 |
|---|---|---|
| `OPENAI_API_KEY` | ✅ | OpenAI API 키 |
| `OPENAI_MODEL` | | 기본값 `gpt-4o`. 비전을 지원하는 모델이어야 한다 |
| `OPENAI_PRICES` | | 100만 토큰당 USD 단가표(JSON). 기본표에 `gpt-4o`, `gpt-4o-mini` 만 들어 있다 |
| `USD_KRW` | | 원화 환산 환율. 기본값 1400 |

단가는 수시로 바뀌므로 코드에 박아두지 않았다. 표에 없는 모델은 **토큰 수만 남기고 비용은
계산하지 않는다** — 틀린 금액을 지어내지 않기 위해서다. 다른 모델을 쓴다면 단가를 넣어주면 된다.

```
OPENAI_PRICES={"gpt-5-mini":{"input":0.25,"cachedInput":0.025,"output":2}}
```

스냅샷 ID(`gpt-4o-2024-08-06`)는 접두사로 맞춘다. 긴 이름부터 비교하므로 `gpt-4o-mini` 가
`gpt-4o` 단가로 새지 않는다. `OPENAI_MODEL` 이 `max_tokens` 대신 `max_completion_tokens` 를
요구하거나 `temperature` 를 받지 않는 모델이어도, 400 응답의 `error.param` 을 보고 해당
파라미터만 고쳐 재요청한다.

### 사용량 확인

결과 화면에는 표시하지 않는다. 브라우저 콘솔에서 본다.

```js
palmUsage()        // { count, input, cached, output, cost, costed }
palmUsage.reset()  // 누적 초기화
```

누적은 이 기기의 `localStorage` 에만 쌓이며 서버로 나가지 않는다. 표시되는 금액은 참고용이고,
실제 청구액은 OpenAI 대시보드가 기준이다.

## 로컬 실행

```bash
vercel env pull          # .env 생성
vercel dev               # http://localhost:3000
```

카메라(`getUserMedia`)는 보안 컨텍스트에서만 열린다. `localhost` 와 HTTPS 도메인은 괜찮고,
사설 IP로 접속한 개발 서버에서는 권한 요청이 막혀 업로드 폴백으로 넘어간다.

## 주의

손금과 관상은 과학적으로 검증된 성격·미래 예측법이 아니다. 이 앱의 해석은 전통 상학의 상징을
자기 성찰의 언어로 옮긴 것이며, 수명·질병·관계의 결과를 예측하지 않는다. 특히 관상은 사람을
얼굴로 가늠하는 근거가 될 수 없다. 서버 프롬프트에도 같은 제약이 걸려 있다.
