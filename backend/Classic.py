import os
from dotenv import load_dotenv
from openai import OpenAI
from docx import Document

load_dotenv()

PROMPT = """
1. Параметры страницы
Ориентация — книжная.
Левое поле — 3 см.
Правое поле — 1,5 см.
Верхнее поле — 2 см.
Нижнее поле — 2 см.

2. Шрифты и стили

•	Стиль «Обычный» — Times New Roman, 14 pt, интервал 1,5, по ширине, первая строка 1,25 см. Базовый стиль документа.
•	Стиль «Заголовок» — Times New Roman, 14 pt, полужирный, по центру, первая строка 0 см.
•	Стиль «Адресат» — Times New Roman, 14 pt, по правому краю, первая строка 0 см.
•	Стиль «Текст1» — Times New Roman, 14 pt, по ширине, первая строка 1,25 см.
•	Стиль «Подпись1» — Times New Roman, 14 pt, по левому краю, первая строка 0 см.
•	Стиль «Колонтитул» — Times New Roman, 11 pt, по центру.

3. Колонтитулы
Верхний — название организации.
Нижний — номер страницы.

4. Расположение реквизитов
Шапка справа — стиль «Адресат».
Дата и номер сверху — стиль «Подпись1».
Заголовок — стиль «Заголовок».
Основной текст — стиль «Текст1».
Подпись слева — стиль «Подпись1».

5. Визуальные особенности
Классический вид с абзацным отступом. Интервал 1,5. Шапка справа, подпись слева. Верхний колонтитул с названием организации.
"""


def create_classic(text: str, filename: str = "classic.docx") -> str:
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
        elif line:
            doc.add_paragraph(line)

    doc.save(filename)
    return filename
