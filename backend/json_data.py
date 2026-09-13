import os
import re

from dotenv import load_dotenv
from openai import OpenAI
from pydantic import BaseModel, Field, ValidationError


load_dotenv()


class JsonData(BaseModel):
    organization: str = ""
    document_type: str = ""
    topic: str = ""
    recipient: str = ""
    author: str = ""
    date: str = ""
    number: str = ""
    paragraphs: list[str] = Field(default_factory=list)
    sign_position: str = ""
    signer: str = ""


PROMPT = """
Ты — профессиональный редактор официально-деловых документов.

Преобразуй черновик пользователя в структурированные данные.

Верни ТОЛЬКО корректный JSON без Markdown, HTML и пояснений.

Структура JSON:

{
  "organization": "",
  "document_type": "",
  "topic": "",
  "recipient": "",
  "author": "",
  "date": "",
  "number": "",
  "paragraphs": [],
  "sign_position": "",
  "signer": ""
}

ПРАВИЛА:

1. Не придумывай факты, даты, номера, должности, адреса и ФИО.
2. Если значение отсутствует, возвращай пустую строку.
3. paragraphs должен быть массивом строк.
4. Каждый смысловой фрагмент должен быть отдельным элементом paragraphs.
5. Не объединяй в один абзац:
   - событие или основание;
   - установленные факты и результаты;
   - выводы, последствия и предложения.
6. Сохраняй хронологический порядок и существенные сведения.
7. Исправляй ошибки и приводь текст к официально-деловому стилю.
8. document_type — название документа, например:
   «ДОКЛАДНАЯ ЗАПИСКА», «СЛУЖЕБНАЯ ЗАПИСКА», «ПИСЬМО».
9. topic — заголовок или тема документа.
10. recipient — адресат одной строкой или несколькими строками,
    разделёнными символом переноса строки.
11. author — автор или исполнитель документа, если он указан.
12. sign_position — должность подписанта.
13. signer — ФИО подписанта.
14. Не повторяй реквизиты в paragraphs.
"""


def clean_response(text: str) -> str:
    """
    Удаляет Markdown-обёртку, если модель всё же вернула ```json.
    """
    text = (text or "").strip()

    text = re.sub(
        r"^```json\s*",
        "",
        text,
        flags=re.IGNORECASE,
    )

    text = re.sub(r"^```\s*", "", text)
    text = re.sub(r"\s*```$", "", text)

    return text.strip()


def process_text(text: str) -> JsonData:
    """
    Преобразует черновик пользователя в структурированный объект JsonData.
    """

    if not text or not text.strip():
        raise ValueError("Текст документа не может быть пустым.")

    text = text.replace("\r\n", "\n").replace("\r", "\n").strip()

    api_key = os.getenv("OPENAI_API_KEY")
    base_url = os.getenv("OPENAI_BASE_URL")
    model = os.getenv("OPENAI_MODEL")

    if not api_key:
        raise ValueError("Не задан OPENAI_API_KEY.")

    if not model:
        raise ValueError("Не задан OPENAI_MODEL.")

    client = OpenAI(
        api_key=api_key,
        base_url=base_url,
    )

    response = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": PROMPT,
            },
            {
                "role": "user",
                "content": text,
            },
        ],
        response_format={
            "type": "json_object",
        },
        temperature=0.2,
    )

    content = response.choices[0].message.content
    content = clean_response(content)

    try:
        # Pydantic v2
        return JsonData.model_validate_json(content)
    except AttributeError:
        # Pydantic v1
        return JsonData.parse_raw(content)
    except ValidationError as error:
        raise ValueError(
            f"Модель вернула JSON неправильной структуры: {error}"
        ) from error


def process_text_as_dict(text: str) -> dict:
    """
    Возвращает обычный dict для передачи в шаблонизатор DOCX.
    """

    data = process_text(text)

    try:
        # Pydantic v2
        return data.model_dump()
    except AttributeError:
        # Pydantic v1
        return data.dict()


def process_text_as_json(text: str) -> str:
    """
    Возвращает готовую JSON-строку.
    """

    data = process_text(text)

    try:
        # Pydantic v2
        return data.model_dump_json(
            ensure_ascii=False,
            indent=2,
        )
    except AttributeError:
        # Pydantic v1
        return data.json(
            ensure_ascii=False,
            indent=2,
        )
