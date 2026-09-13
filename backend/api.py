from pathlib import Path
from uuid import uuid4
from typing import Literal



from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from Classic import process_text as classic_process, build_docx as classic_build
from NewStyle import process_text as modern_process, build_docx as modern_build
from json_data import process_text_as_dict
from docx_sender import fill_docx_template


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://192.168.0.141:3000",
        "http://localhost:3000", 
        "http://127.0.0.1:3000", 
        "http://2.27.43.236:3000", 
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OUTPUT_DIR = Path("generated")
OUTPUT_DIR.mkdir(exist_ok=True)

TEMPLATE_DIR = Path("Shablones")

TEMPLATES = {
    "classic": TEMPLATE_DIR / "classic.docx",
    "modern": TEMPLATE_DIR / "modern.docx",
}


class TextRequest(BaseModel):
    text: str

class TemplateData(BaseModel):
    organization: str = ""
    document_type: str = ""
    topic: str = ""
    recipient: str | list[str] = ""
    author: str = ""
    date: str = ""
    number: str = ""
    paragraphs: list[str] = Field(default_factory=list)
    sign_position: str = ""
    signer: str = ""

class ClassicData(BaseModel):
    organization: str = ""
    document_type: str = ""
    recipient: list[str] = Field(default_factory=list)
    date: str = ""
    number: str = ""
    title: str = ""
    paragraphs: list[str] = Field(default_factory=list)
    sign_position: str = ""
    signer: str = ""


class ModernData(BaseModel):
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

def get_template_path(template_name: str) -> Path:
    template_path = TEMPLATES.get(template_name)

    if template_path is None:
        raise HTTPException(
            status_code=404,
            detail=f"Неизвестный шаблон: {template_name}",
        )

    if not template_path.is_file():
        raise HTTPException(
            status_code=500,
            detail=f"Файл шаблона не найден: {template_path}",
        )

    return template_path

@app.get("/")
def health():
    return {"status": "ok"}


# ——— Process (LLM > JSON) ———
@app.post("/template/{template_name}") # Полный text -> docx
def create_document_from_text(
    template_name: Literal["classic", "modern"],
    request: TextRequest,
):
    template_path = get_template_path(template_name)

    output_path = (
        OUTPUT_DIR /
        f"{template_name}_{uuid4().hex}.docx"
    )

    try:
        data = process_text_as_dict(request.text)

        fill_docx_template(
            data=data,
            template_path=template_path,
            output_path=output_path,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка создания документа: {e}",
        )

    return FileResponse(
        path=output_path,
        filename=f"{template_name}.docx",
        media_type=(
            "application/vnd.openxmlformats-officedocument."
            "wordprocessingml.document"
        ),
    )

@app.post("/template/process", response_model=TemplateData) # text -> json
def template_process_endpoint(request: TextRequest):
    try:
        return process_text_as_dict(request.text)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка обработки текста: {e}",
        )

@app.post("/template/{template_name}/generate") # json -> docx
def template_generate_endpoint(
    template_name: Literal["classic", "modern"],
    data: TemplateData,
):
    template_path = get_template_path(template_name)

    output_path = (
        OUTPUT_DIR /
        f"{template_name}_{uuid4().hex}.docx"
    )

    try:
        fill_docx_template(
            data=data.model_dump(),
            template_path=template_path,
            output_path=output_path,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка заполнения шаблона: {e}",
        )

    return FileResponse(
        path=output_path,
        filename=f"{template_name}.docx",
        media_type=(
            "application/vnd.openxmlformats-officedocument."
            "wordprocessingml.document"
        ),
    )

@app.post("/classic/process")
def classic_process_endpoint(request: TextRequest):
    try:
        data = classic_process(request.text)
        print(data)
        return data
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка обработки: {e}")


@app.post("/new-style/process")
def modern_process_endpoint(request: TextRequest):
    try:
        data = modern_process(request.text)
        return data
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка обработки: {e}")


# ——— Generate (JSON > DOCX) ———

@app.post("/classic/generate")
def classic_generate(data: ClassicData):
    path = OUTPUT_DIR / f"classic_{uuid4().hex}.docx"
    try:
        classic_build(data.model_dump(), str(path))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка генерации: {e}")
    return FileResponse(
        path,
        filename="classic.docx",
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@app.post("/new-style/generate")
def modern_generate(data: ModernData):
    path = OUTPUT_DIR / f"new_style_{uuid4().hex}.docx"
    try:
        modern_build(data.model_dump(), str(path))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка генерации: {e}")
    return FileResponse(
        path,
        filename="new_style.docx",
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


# ——— Legacy: text - DOCX напрямую ———

@app.post("/classic")
def classic(request: TextRequest):
    path = OUTPUT_DIR / f"classic_{uuid4().hex}.docx"
    try:
        data = classic_process(request.text)
        classic_build(data, str(path))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка: {e}")
    return FileResponse(
        path,
        filename="classic.docx",
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@app.post("/new-style")
def new_style(request: TextRequest):
    path = OUTPUT_DIR / f"new_style_{uuid4().hex}.docx"
    try:
        data = modern_process(request.text)
        modern_build(data, str(path))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка: {e}")
    return FileResponse(
        path,
        filename="new_style.docx",
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )