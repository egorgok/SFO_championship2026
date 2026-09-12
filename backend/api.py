from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from Classic import create_classic
from NewStyle import create_new_style


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OUTPUT_DIR = Path("generated")
OUTPUT_DIR.mkdir(exist_ok=True)


class TextRequest(BaseModel):
    text: str


@app.get("/")
def health():
    return {"status": "ok"}


@app.post("/classic")
def classic(request: TextRequest):
    path = OUTPUT_DIR / f"classic_{uuid4().hex}.docx"
    create_classic(request.text, str(path))

    return FileResponse(
        path,
        filename="classic.docx",
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@app.post("/new-style")
def new_style(request: TextRequest):
    path = OUTPUT_DIR / f"new_style_{uuid4().hex}.docx"
    create_new_style(request.text, str(path))

    return FileResponse(
        path,
        filename="new_style.docx",
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
