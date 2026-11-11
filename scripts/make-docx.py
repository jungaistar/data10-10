"""기획서 Markdown → Word(.docx)
실행: python3 scripts/make-docx.py   (python-docx 필요)
docs/01_프로젝트_기획서.md 를 읽어 같은 이름의 .docx 를 만듭니다. 제목 · 표 · 목록 · 인용 · 코드 블록(흐름도는 글 그대로)을 옮깁니다.
"""
import pathlib
import re

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "01_프로젝트_기획서.md"
OUT = SRC.with_suffix(".docx")
FONT = "맑은 고딕"


def set_font(run, size=None, bold=None, mono=False, color=None):
    name = "D2Coding" if mono else FONT
    run.font.name = name
    run._element.rPr.rFonts.set(qn("w:eastAsia"), FONT if not mono else name)
    if size:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if color:
        run.font.color.rgb = RGBColor(*color)


def add_inline(par, text, size=None):
    """**굵게** · `코드` 만 옮김"""
    for part in re.split(r"(\*\*[^*]+\*\*|`[^`]+`)", text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**"):
            set_font(par.add_run(part[2:-2]), size, bold=True)
        elif part.startswith("`") and part.endswith("`"):
            set_font(par.add_run(part[1:-1]), size, mono=True)
        else:
            set_font(par.add_run(part), size)


def main():
    doc = Document()
    st = doc.styles["Normal"]
    st.font.name = FONT
    st.element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    st.font.size = Pt(10.5)
    for lv in (1, 2, 3):
        hs = doc.styles["Heading %d" % lv]
        hs.font.name = FONT
        hs.element.rPr.rFonts.set(qn("w:eastAsia"), FONT)

    lines = SRC.read_text(encoding="utf-8").split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        s = line.strip()
        if s.startswith("```"):
            i += 1
            block = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                block.append(lines[i])
                i += 1
            p = doc.add_paragraph()
            set_font(p.add_run("\n".join(block)), 9, mono=True, color=(0x44, 0x44, 0x44))
            i += 1
            continue
        if s.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-{2,}:?", c) for c in cells):
                    rows.append(cells)
                i += 1
            ncol = max(len(r) for r in rows)
            t = doc.add_table(rows=len(rows), cols=ncol)
            t.style = "Table Grid"
            t.alignment = WD_TABLE_ALIGNMENT.CENTER
            t.autofit = False
            # 칸 너비 — 글이 긴 칸을 넓게(본문 폭 16cm 를 글 길이 비율로, 칸마다 2.2cm 이상)
            lens = [max(min(len(r[c]) if c < len(r) else 0, 60) for r in rows) + 4 for c in range(ncol)]
            widths = [max(2.2, 16.0 * x / sum(lens)) for x in lens]
            k = 16.0 / sum(widths)
            for c in range(ncol):
                t.columns[c].width = Cm(widths[c] * k)   # 표 격자(gridCol) — LibreOffice 는 이 값을 봄
            for r, row in enumerate(rows):
                for c in range(ncol):
                    cell = t.cell(r, c)
                    cell.width = Cm(widths[c] * k)
                    cell.text = ""
                    add_inline(cell.paragraphs[0], row[c] if c < len(row) else "", 9.5)
                    if r == 0:
                        for run in cell.paragraphs[0].runs:
                            run.bold = True
            doc.add_paragraph()
            continue
        if s == "---" or not s:
            i += 1
            continue
        m = re.match(r"^(#{1,3})\s+(.*)$", s)
        if m:
            doc.add_heading(m.group(2), level=len(m.group(1)))
        elif s.startswith("> "):
            p = doc.add_paragraph()
            add_inline(p, s[2:])
            for run in p.runs:
                run.italic = True
        elif re.match(r"^[-*]\s+", s):
            add_inline(doc.add_paragraph(style="List Bullet"), re.sub(r"^[-*]\s+", "", s))
        elif re.match(r"^\d+\.\s+", s):
            add_inline(doc.add_paragraph(), s)   # 번호는 글 그대로(Word 자동 번호는 목록끼리 이어져 6·7… 로 밀림)
        else:
            add_inline(doc.add_paragraph(), s)
        i += 1
    doc.core_properties.title = "AI 기반 회의록 요약 도우미 — 프로젝트 기획서"
    doc.core_properties.author = "data10-10"
    doc.save(OUT)
    print(OUT.relative_to(ROOT), "를 만들었습니다.")


if __name__ == "__main__":
    main()
