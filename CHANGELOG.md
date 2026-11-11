# CHANGELOG — data10-10 AI 기반 회의록 요약 도우미

버전마다 기획서 워드 판을 `docs/기획서/` 에 남긴다(옛 판을 지우지 않는다).

## 2026-11-11 첫 화면 모양 고르기 (판 2026-11-11.3)

- 로그인 전 첫 화면을 두 가지로: 디자인 + 움직임(지금 모양) · 사진 슬라이드(사진 3장이 옆으로 넘어감)
- 관리자 「첫 화면」 페이지에서 고르고 간격(3~20초)을 정함 — Supabase 표 `data1010_site_settings`
- `supabase/site.sql`(표 1 · 함수 1 · 정책 2), 안내 `supabase/README.md` 11번
- 슬라이드 사진 `images/slide-1~3.jpg` — 건설 현장 그림 3장(판 2026-11-11.4)

## 2026-11-11 게시판 · 새 글 알림 (판 2026-11-11.2)

- 게시판(글 · 댓글 · 공지)과 새 글 알림(메뉴 숫자 · 화면 알림 · 브라우저 알림) — `js/board.js` · `css/board.css`
- Supabase 설정 `supabase/board.sql`(표 4 · 함수 5 · 정책 10 · 트리거 2), 설정 표 `data1010_board_settings`
- 연결 순서 · 설정 바꾸는 법 `supabase/README.md` 10번, 확인 `supabase/verify.sql`

## v2.1 — 2026-11-10

- 로컬 실행 — HTML 한 파일(dist/data10-10_회의록요약도우미.html, 설치 · exe 없이 더블클릭) · 설정의 「HTML 한 파일로 받기」
- 선택: Non Archive 실행기(tools/local-exe — PyInstaller --onedir --noarchive, 내 PC 127.0.0.1 에서만 열림)
- 파일로 열었을 때 사내 AI 서버 CORS(Origin: null) 안내

기획서: `docs/기획서/data10-10_나선준_AI기반회의록요약도우미_기획서_v2.1.docx`

## v2.0 — 2026-11-10

- 최종 기획서 — 파이프라인 · 아키텍처 · 와이어프레임 정리
- 로그인 · 사용 신청 · 관리자 승인(요청자 Supabase 로 옮길 수 있게)
- 로그인 전 대문

기획서: `docs/기획서/data10-10_나선준_AI기반회의록요약도우미_기획서_v2.0.docx`

## v1.2 — 2026-11-08

- jobability.co.kr 새 주소로 옮김

기획서: `docs/기획서/data10-10_나선준_AI기반회의록요약도우미_기획서_v1.2.docx`

## v1.1 — 2026-10-27

- 판 맞추기 — 모든 js·css ?v= · fresh-guard · 옛 파일과 새 파일이 섞이면 새로고침 안내
- 리포 비공개 전환 안내(2026-10-26)

기획서: `docs/기획서/data10-10_나선준_AI기반회의록요약도우미_기획서_v1.1.docx`

## v1.0 — 2026-10-20

- 1단계 — 서식 · 메모 · 이름 가리기 · 세 가지 정리 방법 · 편집 · 내보내기 · Action Item
- 가상 메모 3건 · 기획서 v0.1

기획서: `docs/기획서/data10-10_나선준_AI기반회의록요약도우미_기획서_v1.0.docx`
