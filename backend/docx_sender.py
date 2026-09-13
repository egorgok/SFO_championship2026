from pathlib import Path
from typing import Any, Mapping

from docxtpl import DocxTemplate
from jinja2 import Environment, StrictUndefined


DOCUMENT_FIELDS = (
    "organization",
    "document_type",
    "topic",
    "recipient",
    "author",
    "date",
    "number",
    "paragraphs",
    "sign_position",
    "signer",
)


def _to_dict(data: Any) -> dict:
    if isinstance(data, Mapping):
        return dict(data)

    if hasattr(data, "model_dump"):
        return data.model_dump()

    if hasattr(data, "dict"):
        return data.dict()

    raise TypeError(
        "data должен быть словарём или объектом Pydantic."
    )


def _to_lines(value: Any) -> list[str]:
    if value is None:
        return []

    if isinstance(value, str):
        return [
            line.strip()
            for line in value.splitlines()
            if line.strip()
        ]

    if isinstance(value, (list, tuple)):
        return [
            str(line).strip()
            for line in value
            if str(line).strip()
        ]

    value = str(value).strip()
    return [value] if value else []


def prepare_context(data: Any) -> dict:
    source = _to_dict(data)

    context = {
        field: source.get(field, "")
        for field in DOCUMENT_FIELDS
    }

    recipient = context.get("recipient", "")

    if isinstance(recipient, list):
        context["recipient"] = " ".join(
            str(line).strip()
            for line in recipient
            if str(line).strip()
        )
    else:
        context["recipient"] = " ".join(
            line.strip()
            for line in str(recipient).splitlines()
            if line.strip()
        )

    context["paragraphs"] = _to_lines(
        context.get("paragraphs", [])
    )

    for field in DOCUMENT_FIELDS:
        if field not in ("recipient", "paragraphs"):
            value = context[field]
            context[field] = (
                ""
                if value is None
                else str(value).strip()
            )

    return context



def fill_docx_template(
    data: Any,
    template_path: str | Path,
    output_path: str | Path,
) -> str:
    template_path = Path(template_path)
    output_path = Path(output_path)

    if not template_path.is_file():
        raise FileNotFoundError(
            f"DOCX-шаблон не найден: {template_path}"
        )

    if template_path.suffix.lower() != ".docx":
        raise ValueError("Шаблон должен иметь расширение .docx.")

    if output_path.suffix.lower() != ".docx":
        raise ValueError(
            "Результат должен иметь расширение .docx."
        )

    output_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    context = prepare_context(data)

    jinja_environment = Environment(
        undefined=StrictUndefined,
        autoescape=True,
    )

    document = DocxTemplate(str(template_path))
    document.render(
        context,
        jinja_env=jinja_environment,
    )
    document.save(str(output_path))

    return str(output_path)


def create_document(
    data: Any,
    filename: str = "result.docx",
    template: str = "templates/document_template.docx",
) -> str:
    return fill_docx_template(
        data=data,
        template_path=template,
        output_path=filename,
    )
