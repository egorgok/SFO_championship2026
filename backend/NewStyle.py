import json
import os
import re

from dotenv import load_dotenv
from openai import OpenAI
from docx import Document
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from datetime import datetime
from docx.oxml import OxmlElement
from docx.shared import Cm, Pt


load_dotenv()

PROMPT = """
Ты — профессиональный редактор служебных документов.

Преобразуй черновик пользователя в лаконичный официальный документ.
Сохраняй все факты, но исправляй грамматику и логику изложения.

Верни ТОЛЬКО корректный JSON без HTML, Markdown и комментариев:

{
  "organization": "название организации",
  "document_type": "тип документа",
  "topic": "полная тема документа",
  "recipient": "должность, организация и ФИО адресата",
  "author": "должность и ФИО автора",
  "date": "дата",
  "number": "номер",
  "paragraphs": [
    "логический абзац 1",
    "логический абзац 2",
    "логический абзац 3"
  ],
  "sign_position": "должность подписанта",
  "signer": "ФИО подписанта"
}

Правила:
- не придумывай факты;
- не изменяй даты, номера, адреса, должности и инициалы;
- не используй HTML и Markdown;
- не повторяй реквизиты в основном тексте;
- если значение отсутствует, верни пустую строку;
- topic должен точно отражать содержание документа;
- author содержит автора документа;
- sign_position и signer содержат данные того же автора.

Разделяй основной текст ПО СМЫСЛУ независимо от исходных переносов:

1. Событие, основание или выполненная работа.
2. Выявленные факты и результаты.
3. Последствия, выводы, предложения и сроки.

Если эти части присутствуют, paragraphs должен содержать
не менее трёх отдельных элементов.

Не объединяй весь документ в один абзац.
Не нарушай причинно-следственный и хронологический порядок.
Каждый элемент paragraphs станет отдельным абзацем DOCX.
"""


def get_styles(document):
    styles = document.styles

    def create_style(name, font_name, size, alignment, bold=False):
        if name in styles:
            style = styles[name]
        else:
            style = styles.add_style(name, WD_STYLE_TYPE.PARAGRAPH)

        style.font.name = font_name
        style.font.size = Pt(size)
        style.font.bold = bold
        style._element.rPr.rFonts.set(qn("w:eastAsia"), font_name)

        style.paragraph_format.alignment = alignment
        style.paragraph_format.first_line_indent = Cm(0)
        style.paragraph_format.line_spacing = 1.15

        return style

    return {
        "normal": create_style(
            "Обычный",
            "Arial",
            12,
            WD_ALIGN_PARAGRAPH.LEFT,
        ),
        "heading": create_style(
            "Заголовок1",
            "Arial",
            12,
            WD_ALIGN_PARAGRAPH.LEFT,
            bold=True,
        ),
        "recipient": create_style(
            "Адресат",
            "Arial",
            12,
            WD_ALIGN_PARAGRAPH.LEFT,
        ),
        "text": create_style(
            "Текст1",
            "Arial",
            12,
            WD_ALIGN_PARAGRAPH.LEFT,
        ),
        "signature": create_style(
            "Подпись1",
            "Arial",
            12,
            WD_ALIGN_PARAGRAPH.CENTER,
        ),
        "footer": create_style(
            "Колонтитул",
            "Arial",
            10,
            WD_ALIGN_PARAGRAPH.CENTER,
        ),
    }


def clean_json(text):
    text = text.strip()
    text = re.sub(r"^```json\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"^```\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


def set_cell_text(cell, text, bold=False):
    cell.text = ""
    paragraph = cell.paragraphs[0]
    paragraph.style = "Адресат"
    run = paragraph.add_run(text or "")
    run.font.name = "Arial"
    run.font.size = Pt(12)
    run.bold = bold
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "Arial")


def remove_table_borders(table):
    table_properties = table._tbl.tblPr
    borders = table_properties.first_child_found_in("w:tblBorders")

    if borders is None:
        borders = OxmlElement("w:tblBorders")
        table_properties.append(borders)

    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = f"w:{edge}"
        border = borders.find(qn(tag))

        if border is None:
            border = OxmlElement(tag)
            borders.append(border)

        border.set(qn("w:val"), "nil")


def _make_number(document_type: str) -> str:
    """Номер вида 1-СЗ, 1-ДЗ, 1-С, 1-П..."""
    t = (document_type or "").upper()

    if "ДОКЛАДН" in t:
        suffix = "ДЗ"
    elif "СЛУЖЕБН" in t:
        suffix = "СЗ"
    elif "СПРАВК" in t:
        suffix = "С"
    elif "ПИСЬМ" in t:
        suffix = "П"
    else:
        suffix = "Д"  # документ по умолчанию

    return f"1-{suffix}"


def process_text(text: str) -> dict:
    """LLM: черновик - структурированный JSON."""
    if not text or not text.strip():
        raise ValueError("Текст документа не может быть пустым.")

    text = text.replace("\r\n", "\n").replace("\r", "\n").strip()

    client = OpenAI(
        api_key=os.getenv("OPENAI_API_KEY"),
        base_url=os.getenv("OPENAI_BASE_URL"),
    )
    response = client.chat.completions.create(
        model=os.getenv("OPENAI_MODEL"),
        messages=[
            {"role": "system", "content": PROMPT},
            {"role": "user", "content": text},
        ],
        response_format={"type": "json_object"},
    )

    data = clean_json(response.choices[0].message.content)
    
    # Автозаполнение
    if not (data.get("date") or "").strip():
        data["date"] = datetime.now().strftime("%d.%m.%Y")
    
    if not (data.get("number") or "").strip():
        data["number"] = _make_number(data.get("document_type"))
    
    return data


def build_docx(data: dict, filename: str = "new_style.docx") -> str:
    """Структурированные данные - DOCX"""
    document = Document()
    styles = get_styles(document)

    section = document.sections[0]
    section.top_margin = Cm(1.5)
    section.bottom_margin = Cm(1.5)
    section.left_margin = Cm(2.5)
    section.right_margin = Cm(2)

    # Тема сверху слева
    if data.get("topic"):
        topic = document.add_paragraph(style=styles["heading"])
        topic.add_run(data["topic"])

    # Табличный блок «Кому / От кого»
    table = document.add_table(rows=2, cols=2)
    table.autofit = False
    table.columns[0].width = Cm(7.5)
    table.columns[1].width = Cm(7.5)

    remove_table_borders(table)

    set_cell_text(table.cell(0, 0), "Кому:", bold=True)
    set_cell_text(table.cell(0, 1), data.get("recipient", "") or "")

    set_cell_text(table.cell(1, 0), "От кого:", bold=True)
    set_cell_text(table.cell(1, 1), data.get("author", "") or "")

    # Основной текст
    for paragraph_text in data.get("paragraphs", []) or []:
        if str(paragraph_text).strip():
            paragraph = document.add_paragraph(style=styles["text"])
            paragraph.add_run(str(paragraph_text).strip())

    # Подпись по центру
    document.add_paragraph()

    if data.get("sign_position"):
        paragraph = document.add_paragraph(style=styles["signature"])
        paragraph.add_run(data["sign_position"])

    paragraph = document.add_paragraph(style=styles["signature"])
    paragraph.add_run("____________________")

    if data.get("signer"):
        paragraph = document.add_paragraph(style=styles["signature"])
        paragraph.add_run(data["signer"])

    # Нижний колонтитул
    footer = section.footer.paragraphs[0]
    footer.style = styles["footer"]
    footer_text = data.get("topic") or data.get("document_type", "") or ""
    footer.add_run(f"{footer_text} | {data.get('date', '') or ''}")

    document.save(filename)
    return filename


def create_new_style(text: str, filename: str = "new_style.docx") -> str:
    """Полный цикл: текст - LLM - DOCX (для обратной совместимости)."""
    data = process_text(text)
    return build_docx(data, filename)