# 손금보기

재미로 보는 손금. 두 손바닥 사진을 찍어 올리면 전통 수상학 체계로 해석해 주는 모바일 웹앱.

- **모바일 전용 레이아웃** — 460px 단일 컬럼, 라이트/다크 테마 대응
- **촬영 또는 업로드** — 손 슬롯을 누르면 시트가 올라와 둘 중 하나를 고른다. 촬영은 `getUserMedia` 실시간 프리뷰에 손 모양 가이드를 겹쳐 보여주고, 권한이 거부되면 업로드로 넘어간다
- **API 사용량** — 응답의 토큰 수로 비용을 계산해 결과 하단에 이번 건과 누적을 표시한다. 누적은 `localStorage` 에만 쌓인다
- **해석 엔진** — OpenAI Vision. API 키는 Vercel 서버리스 함수(`/api/read`)에만 존재하며 브라우저로 나가지 않음
- **해석 체계** — 마의상법, 유장상법, Cheiro(1894), Benham(1900), d'Arpentigny(1843)의 관법을 서버 프롬프트에 관찰 원칙으로 넣어, 4대 주선 · 보조선 · 일곱 언덕 · 손의 네 모양 순으로 읽는다. 수명·질병·결혼 시기 같은 단정적 예측은 금지

## 구조

```
index.html      앱 전체 (뷰 라우팅, 카메라, 결과 렌더)
api/read.js     Vercel 서버리스 함수 — OpenAI Vision 호출, JSON 스키마 회수
package.json    type: module (ESM 서버리스 함수용)
```

빌드 단계 없음. Vercel이 루트의 `index.html`을 정적으로, `api/*.js`를 함수로 자동 인식한다.

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

단가는 수시로 바뀌므로 코드에 박아두지 않았다. 표에 없는 모델은 **토큰 수만 보여주고 비용은
계산하지 않는다** — 틀린 금액을 지어내지 않기 위해서다. 다른 모델을 쓴다면 단가를 넣어주면 된다.

```
OPENAI_PRICES={"gpt-5-mini":{"input":0.25,"cachedInput":0.025,"output":2}}
```

스냅샷 ID(`gpt-4o-2024-08-06`)는 접두사로 맞춘다. 긴 이름부터 비교하므로 `gpt-4o-mini` 가
`gpt-4o` 단가로 새지 않는다. 표시되는 금액은 참고용이며, 실제 청구액은 OpenAI 대시보드가 기준이다.

`OPENAI_MODEL`을 바꿔 `max_tokens` 대신 `max_completion_tokens`를 요구하거나 `temperature`를 받지
않는 모델을 지정해도, `api/read.js`가 400 응답의 `error.param`을 보고 해당 파라미터만 고쳐 재요청한다.

## 로컬 실행

```bash
vercel env pull          # .env 생성
vercel dev               # http://localhost:3000
```

카메라(`getUserMedia`)는 보안 컨텍스트에서만 열린다. `localhost`와 HTTPS 도메인은 괜찮고,
사설 IP로 접속한 개발 서버에서는 권한 요청이 막혀 앨범 선택 폴백으로 넘어간다.

## 주의

손금은 과학적으로 검증된 성격·미래 예측법이 아니다. 이 앱의 해석은 전통 상학의 상징을
자기 성찰의 언어로 옮긴 것이며, 수명·질병·관계의 결과를 예측하지 않는다.
서버 프롬프트에도 같은 제약이 걸려 있다.
