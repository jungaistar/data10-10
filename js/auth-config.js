// 로그인 설정 — 이 파일 한 곳만 바꾸면 된다(생성: data10-00/scripts/apply-auth-kit.mjs, 대문 문구 출처 docs/plan.json).
// 내 Supabase 로 옮길 때: url · anonKey 를 내 프로젝트 값으로, 카카오를 설정하지 않았으면 kakao: false. 안내 = docs/내_깃허브로_옮기기.md
// prefix 는 supabase/auth.sql 의 표 이름 앞부분과 같아야 한다.
window.AUTH_CONFIG = {
  "url": "https://hcmgdztsgjvzcyxyayaj.supabase.co",
  "anonKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjbWdkenRzZ2p2emN5eHlheWFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0MzU4ODcsImV4cCI6MjA4NzAxMTg4N30.gznaPzY1l8qDAPsEyYNR9KS7f7VqS3xaw-_2HTSwSZw",
  "prefix": "data1010",
  "kakao": true,
  "idleMinutes": 30,
  "localBypass": true,
  "site": {
    "title": "AI 기반 회의록 요약 도우미",
    "summary": "회의 직후 메모장 · 워드로 적은 메모와 회의록 서식을 넣으면 결정 사항과 Action Item(할 일 · 담당 · 기한)까지 서식 칸에 맞춰 정리하는 브라우저 도구입니다. 반자동 AI · 로컬 LLM · AI 없는 규칙 초안 중 하나로 정리합니다.",
    "course": "현장 데이터 디지털화 전문가과정 · 2차수",
    "features": [
      {
        "name": "서식에 맞춘 회의록",
        "desc": "메모와 회의록 서식을 넣으면 칸 역할에 맞춰 회의명 · 안건 · 결정 · Action Item · 다음 회의를 채웁니다."
      },
      {
        "name": "세 가지 정리 방법",
        "desc": "프롬프트 복사(반자동) · 로컬 LLM 자동 보내기 · AI 없는 규칙 초안 중 회사 기준에 맞는 것을 고릅니다."
      },
      {
        "name": "이름 가리기 · 근거 점검",
        "desc": "AI 로 보내기 전 이름을 「인물1」로 가리고, 메모에 없는 담당 · 기한 · 결정을 「확인 필요」로 표시합니다."
      },
      {
        "name": "Action Item 모아 보기",
        "desc": "모든 회의록의 할 일을 기한 순으로 모아 기한 지남 · 3일 안 기한 · 담당자별로 보고 완료를 체크합니다."
      },
      {
        "name": "서식 관리",
        "desc": "기본 3종을 고치거나 우리 팀 워드 양식(.docx) · 양식 글에서 칸을 뽑아 새 서식을 만듭니다."
      },
      {
        "name": "편집 · 내보내기",
        "desc": "칸별 편집, 메모 원문 대조, 저장 · Word(.doc) · 인쇄/PDF · 글 복사."
      }
    ],
    "steps": [
      "로그인 · 승인 / 로컬 실행",
      "서식 고르기",
      "메모 넣기",
      "이름 가리기",
      "정리하기",
      "확인 · 내보내기"
    ],
    "flow": [
      {
        "step": "로그인 · 승인 / 로컬 실행",
        "desc": "웹: 메일 + 비밀번호로 가입 → 관리자 승인 · 사내 PC: HTML 한 파일을 더블클릭(로그인 생략)"
      },
      {
        "step": "서식 고르기",
        "desc": "기본 3종 또는 워드 양식(.docx)으로 만든 서식"
      },
      {
        "step": "메모 넣기",
        "desc": "붙여 넣기 · .txt(UTF-8 · ANSI) · .docx, 회의일 확인"
      },
      {
        "step": "이름 가리기",
        "desc": "이름 찾기 → 「인물N」 가리기 · 남은 이름 점검"
      },
      {
        "step": "정리하기",
        "desc": "반자동 AI · 로컬 LLM · 규칙 초안 중 하나 → 서식 칸 채우기"
      },
      {
        "step": "확인 · 내보내기",
        "desc": "메모 근거 점검(확인 필요), 편집, 저장 · Word · 인쇄"
      }
    ],
    "goals": [
      "메모(붙여 넣기 · .txt · .docx)와 회의록 서식을 함께 넣어 서식 칸에 맞춘 회의록을 만듭니다.",
      "외부 AI · 로컬 LLM · AI 없이 중 회사 기준에 맞는 방법 하나는 반드시 쓸 수 있게 합니다.",
      "메모에 없는 담당 · 기한 · 결정을 「확인 필요」로 표시해 AI 가 지어낸 내용을 거릅니다."
    ],
    "screen": "docs/img/screen.png",
    "plan": "plan.html",
    "home": true,
    "landing": {
      "colors": {
        "navy": "#0f2a2e",
        "navy2": "#0a1d20",
        "brand": "#0d6f54",
        "brandDark": "#0a5843",
        "accent": "#7fe0b8"
      }
    }
  }
};
