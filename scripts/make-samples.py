"""가상 예시 파일 만들기 — samples/ 아래 메모 · 서식 파일
실행: python3 scripts/make-samples.py   (python-docx 필요: pip install python-docx)

내용의 정본은 js/samples.js 입니다(테스트와 같은 글). node 로 그 값을 읽어 파일로 씁니다.
· 예시1 — UTF-8 메모장(.txt)
· 예시2 — 메모장 「ANSI」 저장(EUC-KR .txt) — 옛 메모장 파일도 읽는지 시험
· 예시3 — 워드(.docx) 메모
· 서식 — 워드(.docx) 회의록 양식(표 + 번호 제목)
"""
import json
import pathlib
import subprocess

from docx import Document
from docx.shared import Pt

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "samples"
OUT.mkdir(exist_ok=True)

data = json.loads(subprocess.check_output(
    ["node", "-e", "process.stdout.write(JSON.stringify(require('./js/samples.js')))"], cwd=ROOT))
S = {s["id"]: s for s in data["SAMPLES"]}


def styled(doc):
    st = doc.styles["Normal"]
    st.font.name = "맑은 고딕"
    st.font.size = Pt(10.5)
    return doc


# 예시 1 — UTF-8
(OUT / "회의메모_예시1_주간회의.txt").write_text(S["sample-1"]["memo"] + "\n", encoding="utf-8")
# 예시 2 — 메모장 「ANSI」(한국어 Windows = CP949). 긴 줄표(—)는 CP949 에 없어 「-」 로 바꿔 씀(메모장도 같은 일을 함)
memo2 = S["sample-2"]["memo"].replace("\u2014", "-")
(OUT / "회의메모_예시2_시험결과리뷰_ANSI.txt").write_bytes(("\r\n".join(memo2.split("\n")) + "\r\n").encode("cp949"))

# 예시 3 — 워드 메모(줄마다 문단)
doc = styled(Document())
for line in S["sample-3"]["memo"].split("\n"):
    doc.add_paragraph(line)
doc.save(OUT / "회의메모_예시3_일정점검.docx")

# 서식 — 워드 회의록 양식(js/samples.js 의 FORM_TEXT 와 같은 칸)
doc = styled(Document())
doc.add_heading("제품검증팀 회의록", level=1)
t = doc.add_table(rows=3, cols=4)
t.style = "Table Grid"
cells = [["회의명", "", "일시", ""], ["장소", "", "작성자", ""], ["참석자", "", "", ""]]
for r, row in enumerate(cells):
    for c, v in enumerate(row):
        t.cell(r, c).text = v
t.cell(2, 1).merge(t.cell(2, 3))
for h in ["1. 회의 안건", "2. 주요 논의 내용", "3. 결정 사항", "4. 후속 조치 (담당/기한)", "5. 차기 회의"]:
    doc.add_paragraph(h)
    doc.add_paragraph("")
doc.save(OUT / "회의록_서식_예시.docx")

print("samples/ 에 4개 파일을 만들었습니다.")
