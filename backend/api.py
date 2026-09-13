import os
import json
from pathlib import Path
from uuid import uuid4

import whisper
import static_ffmpeg

from openai import OpenAI

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from Classic import process_text as classic_process, build_docx as classic_build
from NewStyle import process_text as modern_process, build_docx as modern_build

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