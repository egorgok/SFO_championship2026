from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from Classic import process_text as classic_process, build_docx as classic_build
from NewStyle import process_text as modern_process, build_docx as modern_build


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OUTPUT_DIR = Path("generated")
OUTPUT_DIR.mkdir(exist_ok=True)


class TextRequest(BaseModel):
    text: str


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


@app.get("/")
def health():
    return {"status": "ok"}


# ——— Process (LLM > JSON) ———

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