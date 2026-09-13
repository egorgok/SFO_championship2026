import os
import json
from pathlib import Path
from uuid import uuid4
from typing import Literal

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
import whisper
import static_ffmpeg

from openai import OpenAI

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from starlette.background import BackgroundTask

from Classic import process_text as classic_process, build_docx as classic_build
from NewStyle import process_text as modern_process, build_docx as modern_build
from json_data import process_text_as_dict
from docx_sender import fill_docx_template

static_ffmpeg.add_paths()

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
BASE_DIR = Path(__file__).resolve().parent

GUIDEBOOK_PATH = (
    BASE_DIR
    / "templates"
    / "GuideBook.docx"
)
OUTPUT_DIR = Path("generated")
OUTPUT_DIR.mkdir(exist_ok=True)

TEMPLATE_DIR = Path("template")
CUSTOM_TEMPLATE_DIR = Path("uploaded_templates")
CUSTOM_TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)

MAX_TEMPLATE_SIZE = 64 * 1024 * 1024  # 64 МБ

# Временное хранение результатов обработки текста.
DOCUMENT_CACHE: dict[str, dict] = {}


def remove_files(*paths: Path) -> None:
    for path in paths:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass


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

    recipient_job: str = ""
    recipient_name: str = ""
    recipient: str = ""

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

    recipient_job: str = ""
    recipient_name: str = ""
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
@app.get("/guidebook")
def download_guidebook():
    """
    Возвращает пользователю инструкцию по созданию DOCX-шаблонов.
    """

    if not GUIDEBOOK_PATH.is_file():
        raise HTTPException(
            status_code=404,
            detail="Файл инструкции не найден.",
        )

    return FileResponse(
        path=GUIDEBOOK_PATH,
        filename="GuideBook.docx",
        media_type=(
            "application/vnd.openxmlformats-officedocument."
            "wordprocessingml.document"
        ),
    )

@app.post("/template/process")
def template_process_endpoint(request: TextRequest):
    try:
        raw_data = process_text_as_dict(request.text)

        # Добавляет отсутствующие поля со значениями по умолчанию:
        # строки — "", paragraphs — []
        data = TemplateData(**raw_data).model_dump()

        document_id = uuid4().hex
        DOCUMENT_CACHE[document_id] = data

        return {
            "document_id": document_id,
            "data": data,
        }

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка обработки текста: {error}",
        ) from error

@app.put("/template/data/{document_id}")
def update_template_data(
    document_id: str,
    data: TemplateData,
):
    """
    Принимает отредактированные пользователем данные
    и сохраняет их для последующей генерации DOCX.
    """

    if document_id not in DOCUMENT_CACHE:
        raise HTTPException(
            status_code=404,
            detail=(
                "Данные документа не найдены. "
                "Сначала обработайте черновик через /template/process."
            ),
        )

    updated_data = data.model_dump()

    DOCUMENT_CACHE[document_id] = updated_data

    return {
        "document_id": document_id,
        "data": updated_data,
        "message": "Изменения сохранены.",
    }


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

@app.post("/custom-template/{document_id}")
async def generate_from_custom_template(
    document_id: str,
    template: UploadFile = File(...),
):
    """
    Принимает DOCX-шаблон.
    Использует актуальный JSON документа.
    """

    data = DOCUMENT_CACHE.get(document_id)

    if data is None:
        raise HTTPException(
            status_code=404,
            detail=(
                "Данные документа не найдены. "
                "Сначала обработайте текст через /template/process."
            ),
        )

    original_filename = template.filename or ""

    if Path(original_filename).suffix.lower() != ".docx":
        raise HTTPException(
            status_code=400,
            detail="Можно загружать только файлы .docx.",
        )

    template_content = await template.read(
        MAX_TEMPLATE_SIZE + 1
    )

    if not template_content:
        raise HTTPException(
            status_code=400,
            detail="Загруженный шаблон пуст.",
        )

    if len(template_content) > MAX_TEMPLATE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="Размер шаблона не должен превышать 64 МБ.",
        )

    if not template_content.startswith(b"PK"):
        raise HTTPException(
            status_code=400,
            detail="Файл не является корректным DOCX.",
        )

    file_id = uuid4().hex

    template_path = (
        CUSTOM_TEMPLATE_DIR /
        f"template_{file_id}.docx"
    )

    output_path = (
        OUTPUT_DIR /
        f"custom_{file_id}.docx"
    )

    try:
        template_path.write_bytes(template_content)

        fill_docx_template(
            data=data,
            template_path=template_path,
            output_path=output_path,
        )

    except Exception as error:
        remove_files(template_path, output_path)

        raise HTTPException(
            status_code=400,
            detail=f"Ошибка заполнения шаблона: {error}",
        ) from error

    return FileResponse(
        path=output_path,
        filename="custom_document.docx",
        media_type=(
            "application/vnd.openxmlformats-officedocument."
            "wordprocessingml.document"
        ),
        background=BackgroundTask(
            remove_files,
            template_path,
            output_path,
        ),
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


model = whisper.load_model("small")
@app.post("/api/speech-to-text")
async def speech_to_text(audio: UploadFile = File(...)):
    temp_filename = f"temp_{audio.filename}"
    with open(temp_filename, "wb") as buffer:
        content = await audio.read()
        buffer.write(content)

    try:
        client = OpenAI(
                api_key=os.getenv("OPENAI_API_KEY"),
                base_url=os.getenv("OPENAI_BASE_URL"),
            )
    
        result = model.transcribe(temp_filename, language="ru",fp16=False,no_speech_threshold=0.35,temperature=0.5) 
        transcribed_text = result.get("text", "").strip()
        if not transcribed_text:
                    return {"error": "Не удалось распознать речь."}, 400
        response = client.chat.completions.create(
                        model=os.getenv("OPENAI_MODEL"),
                        messages=[
                            {"role": "system", "content": "Ты должен изменить опечатки сервиса распознования речи, не исправляя грамматику и пунктуацию. Не добавляй информацию от себя. Ожидай официально-деловой стиль."},
                            {"role": "user", "content": transcribed_text},
                        ],
                        response_format={"type": "json_object"},
                    )
        data = json.loads(response.choices[0].message.content).get("text", "")
        return {"text": data}
        
    except Exception as e:
        return {"error": str(e)}, 500
        
    finally:
        if os.path.exists(temp_filename):
            os.remove(temp_filename)