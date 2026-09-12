import json
import os
import re

from dotenv import load_dotenv
from openai import OpenAI
from docx import Document
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt


load_dotenv()

PROMPT = """
Ты — профессиональный редактор служебных документов.

Преобразуй черновик пользователя в официальный служебный документ.
Сохраняй факты, но исправляй стиль, грамматику и логику изложения.

Верни ТОЛЬКО корректный JSON без HTML, Markdown и комментариев:

{
  "organization": "название организации",
  "document_type": "тип документа",
  "recipient": [
    "первая строка адресата",
    "вторая строка адресата",
    "ФИО адресата"
  ],
  "date": "дата",
  "number": "номер",
  "title": "тема документа",
  "paragraphs": [
    "логический абзац 1",
    "логический абзац 2",
    "логический абзац 3"
  ],
  "sign_position": "должность подписанта",
  "signer": "ФИО подписанта"
}



ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА:

1. Не придумывай новые факты, даты, должности, адреса и фамилии.
2. Не изменяй инициалы, номера и даты.
3. Не повторяй реквизиты в основном тексте.
4. Не возвращай HTML, Markdown или служебные пояснения.
5. Если реквизит отсутствует, верни пустую строку.
6. document_type оформляй как название типа документа:
   например, «ДОКЛАДНАЯ ЗАПИСКА».
7. В recipient не пиши слова «Кому» и «От кого».
8. Адресата разделяй на 2–3 логические строки.
9. Автор черновика должен использоваться только в подписи:
   sign_position — его должность;
   signer — его ФИО.
10. Не помещай автора отдельной строкой под адресатом.

ПРАВИЛА ЗАГОЛОВКА:
- сохраняй смысл и существенные уточнения исходного заголовка;
- не сокращай заголовок до слишком общей формулировки;
- заголовок должен точно отражать предмет, место или результат события;
- если исходный заголовок уже указан, используй его как основу;
- исправляй формулировку только для официально-делового стиля;
- не добавляй сведения, которых нет в черновике.

ГЛАВНОЕ ПРАВИЛО ДЛЯ ОСНОВНОГО ТЕКСТА:

Разделяй текст на абзацы ПО СМЫСЛУ, даже если пользователь ввёл
весь черновик одной строкой или одним абзацем.

Соблюдай следующий логический порядок:

1. Основание, событие или выполненное действие:
   что произошло, кем, когда и где.
2. Установленные факты и результаты:
   что именно выявлено или установлено.
3. Последствия, выводы и предложения:
   возможные риски, необходимые действия и срок выполнения.

Если присутствуют все три смысловые части, массив paragraphs
ОБЯЗАТЕЛЬНО должен содержать не менее трёх отдельных элементов.

Нельзя:
- объединять описание проверки, нарушения и предложения
  в один абзац;
- помещать предложение раньше выявленных фактов;
- менять хронологический порядок;
- удалять существенные сведения;
- чрезмерно сокращать заголовок или основной текст.

Каждый элемент массива paragraphs станет отдельным абзацем DOCX.
"""


def get_styles(document):
    styles = document.styles

    def create_style(name, font_name, size, alignment, indent=0, bold=False):
        if name in styles:
            style = styles[name]
        else:
            style = styles.add_style(name, WD_STYLE_TYPE.PARAGRAPH)

        style.font.name = font_name
        style.font.size = Pt(size)
        style.font.bold = bold
        style._element.rPr.rFonts.set(qn("w:eastAsia"), font_name)

        style.paragraph_format.alignment = alignment
        style.paragraph_format.first_line_indent = Cm(indent)
        style.paragraph_format.line_spacing = 1.5

        return style

    return {
        "normal": create_style(
            "Обычный",
            "Times New Roman",
            14,
            WD_ALIGN_PARAGRAPH.JUSTIFY,
            indent=1.25,
        ),
        "heading": create_style(
            "Заголовок",
            "Times New Roman",
            14,
            WD_ALIGN_PARAGRAPH.CENTER,
            bold=True,
        ),
        "recipient": create_style(
            "Адресат",
            "Times New Roman",
            14,
            WD_ALIGN_PARAGRAPH.RIGHT,
        ),
        "text": create_style(
            "Текст1",
            "Times New Roman",
            14,
            WD_ALIGN_PARAGRAPH.JUSTIFY,
            indent=1.25,
        ),
        "signature": create_style(
            "Подпись1",
            "Times New Roman",
            14,
            WD_ALIGN_PARAGRAPH.LEFT,
        ),
        "footer": create_style(
            "Колонтитул",
            "Times New Roman",
            11,
            WD_ALIGN_PARAGRAPH.CENTER,
        ),
    }


def add_page_number(paragraph):
    run = paragraph.add_run()
    field_begin = OxmlElement("w:fldChar")
    field_begin.set(qn("w:fldCharType"), "begin")

    instruction = OxmlElement("w:instrText")
    instruction.set(qn("xml:space"), "preserve")
    instruction.text = "PAGE"

    field_end = OxmlElement("w:fldChar")
    field_end.set(qn("w:fldCharType"), "end")

    run._r.append(field_begin)
    run._r.append(instruction)
    run._r.append(field_end)


def clean_json(text):
    text = text.strip()
    text = re.sub(r"^```json\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"^```\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


def create_classic(text: str, filename: str = "classic.docx") -> str:
    if not text or not text.strip():
        raise ValueError("Текст документа не может быть пустым.")
    
    text = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    client = OpenAI(
        api_key=os.getenv("OPENAI_API_KEY"),
        base_url=os.getenv("OPENAI_BASE_URL"),
    )
    text = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    response = client.chat.completions.create(
        model=os.getenv("OPENAI_MODEL"),
        messages=[
            {"role": "system", "content": PROMPT},
            {"role": "user", "content": text},
        ],
        response_format={"type": "json_object"},
    )

    data = clean_json(response.choices[0].message.content)
    document = Document()
    styles = get_styles(document)

    settings = document.settings.element
    update_fields = OxmlElement("w:updateFields")
    update_fields.set(qn("w:val"), "true")
    settings.append(update_fields)

    section = document.sections[0]
    section.top_margin = Cm(2)
    section.bottom_margin = Cm(2)
    section.left_margin = Cm(3)
    section.right_margin = Cm(1.5)

    # Верхний колонтитул с названием организации
    header = section.header.paragraphs[0]
    header.style = styles["footer"]
    header.text = data.get("organization", "")

    # Нижний колонтитул с номером страницы
    footer = section.footer.paragraphs[0]
    footer.style = styles["footer"]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    add_page_number(footer)

    # Адресат справа
    recipient = data.get("recipient", [])
    if recipient:
        paragraph = document.add_paragraph(style=styles["recipient"])
        paragraph.paragraph_format.line_spacing = 1.5
        paragraph.paragraph_format.first_line_indent = Cm(0)

        for index, line in enumerate(recipient):
            if line:
                if index == 0:
                    paragraph.add_run(f"{line}\n")
                else:
                    paragraph.add_run(f"{line}\n")


    # Дата и номер
    paragraph = document.add_paragraph(style=styles["signature"])
    paragraph.paragraph_format.first_line_indent = Cm(0)
    paragraph.add_run(
        f"Дата: {data.get('date', '')}    "
        f"Номер: {data.get('number', '')}"
    )

    # Тип документа
    document_type = document.add_paragraph(style=styles["heading"])
    document_type.paragraph_format.first_line_indent = Cm(0)
    document_type.add_run(
        data.get("document_type") or "СЛУЖЕБНЫЙ ДОКУМЕНТ"
    )

    # Заголовок
    if data.get("title"):
        title = document.add_paragraph(style=styles["heading"])
        title.paragraph_format.first_line_indent = Cm(0)
        title.add_run(data["title"])

    # Основной текст
    for paragraph_text in data.get("paragraphs", []):
        if paragraph_text.strip():
            paragraph = document.add_paragraph(style=styles["text"])
            paragraph.add_run(paragraph_text.strip())

    # Подпись слева
    document.add_paragraph()

    if data.get("sign_position"):
        paragraph = document.add_paragraph(style=styles["signature"])
        paragraph.paragraph_format.first_line_indent = Cm(0)
        paragraph.add_run(data["sign_position"])

    paragraph = document.add_paragraph(style=styles["signature"])
    paragraph.paragraph_format.first_line_indent = Cm(0)
    paragraph.add_run("____________________")

    if data.get("signer"):
        paragraph = document.add_paragraph(style=styles["signature"])
        paragraph.paragraph_format.first_line_indent = Cm(0)
        paragraph.add_run(data["signer"])

    document.save(filename)
    return filename
