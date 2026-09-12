import os
from dotenv import load_dotenv
from openai import OpenAI
from docx import Document

load_dotenv()

PROMPT = """
1. Параметры страницы
Ориентация — книжная.
Левое поле — 2,5 см.
Правое поле — 2 см.
Верхнее поле — 1,5 см.
Нижнее поле — 1,5 см.

2. Шрифты и стили

•	Стиль «Обычный» — Arial, 12 pt, интервал 1,15, по левому краю, первая строка 0 см. Базовый стиль документа.
•	Стиль «Заголовок1» — Arial, 12 pt, полужирный, по левому краю, первая строка 0 см.
•	Стиль «Адресат» — Arial, 12 pt, по левому краю, первая строка 0 см.
•	Стиль «Текст1» — Arial, 12 pt, по левому краю, первая строка 0 см.
•	Стиль «Подпись1» — Arial, 12 pt, по центру, первая строка 0 см.
•	Стиль «Колонтитул» — Arial, 10 pt, по центру.

3. Колонтитулы
Верхний — отсутствует.
Нижний — название документа и дата.

4. Расположение реквизитов
Тема сверху слева — стиль «Заголовок1».
Блок «Кому / От кого» — таблица, стиль «Адресат».
Основной текст — стиль «Текст1».
Подпись по центру — стиль «Подпись1».

5. Визуальные особенности
Лаконичный вид без абзацного отступа. Интервал 1,15. Табличная шапка «Кому / От кого». Подпись по центру. Нижний колонтитул с названием документа и датой.
"""


def create_new_style(text: str, filename: str = "new_style.docx") -> str:
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
    )

    doc = Document()

    for line in response.choices[0].message.content.splitlines():
        line = line.strip()

        if line.startswith("#"):
            doc.add_heading(line.lstrip("# ").strip(), level=1)
        elif line.startswith("-"):
            doc.add_paragraph(line.lstrip("- ").strip(), style="List Bullet")
        elif line:
            doc.add_paragraph(line)

    doc.save(filename)
    return filename
