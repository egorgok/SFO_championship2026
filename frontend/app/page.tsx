"use client";

import { parse } from "path";
import { useState, useCallback, useEffect } from "react";

// ——— Types ———
type DocType =
  | "service_note"
  | "report_note"
  | "info_certificate"
  | "letter";

type TemplateId = "org_classic" | "org_modern" | "custom";

interface TemplateInfo {
  id: "org_classic" | "org_modern";
  name: string;
  description: string;
  style: string;
  /** Имя на бэке: classic | modern → /template/{name}/generate */
  backendName: string;
  details: {
    font: string;
    fontSize: string;
    margins: string;
    notes: string;
  };
}

/** Все возможные скалярные метки (кроме paragraphs — они отдельно) */
type LabelKey =
  | "organization"
  | "document_type"
  | "topic"
  | "recipient_job"
  | "recipient_name"
  | "recipient"
  | "author"
  | "date"
  | "number"
  | "sign_position"
  | "signer";

/** Человекочитаемые подписи для каждой метки */
const LABELS: Record<LabelKey, string> = {
  organization: "Название организации",
  document_type: "Тип документа",
  topic: "Тема документа",
  recipient_job: "Должность получателя",
  recipient_name: "Имя получателя",
  recipient: "Получатель",
  author: "Автор документа",
  date: "Дата",
  number: "Номер документа",
  sign_position: "Должность подписанта",
  signer: "Подписант",
};

/** Данные шаблона: любые из LABELS + paragraphs */
interface TemplateFormData {
  organization?: string;
  document_type?: string;
  topic?: string;
  recipient_job?: string;
  recipient_name?: string;
  recipient?: string;
  author?: string;
  date?: string;
  number?: string;
  sign_position?: string;
  signer?: string;
  paragraphs: string[];
}


const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8000";

/**
 * Бэкенд API (без изменений api.py):
 *   POST /classic/process | /new-style/process  — текст → JSON
 *     ( /template/process может перехватываться роутом {template_name} )
 *   POST /template/classic/generate             — JSON → DOCX
 *   POST /template/modern/generate              — JSON → DOCX
 */

const DOC_TYPES: {
  id: DocType;
  title: string;
  short: string;
  description: string;
  icon: string;
}[] = [
  {
    id: "service_note",
    title: "Служебная записка",
    short: "Служебная",
    description: "Внутренний документ: кому, от кого, суть, подпись",
    icon: "📋",
  },
  {
    id: "report_note",
    title: "Докладная записка",
    short: "Докладная",
    description: "Доклад с предложениями или фактами",
    icon: "📑",
  },
  {
    id: "info_certificate",
    title: "Информационная справка",
    short: "Справка",
    description: "Информация по запросу или событию",
    icon: "📄",
  },
  {
    id: "letter",
    title: "Письмо",
    short: "Письмо",
    description: "Исходящее письмо организации",
    icon: "✉️",
  },
];

const TEMPLATES: TemplateInfo[] = [
  {
    id: "org_classic",
    name: "Классика",
    description: "Times New Roman, строгие поля, колонтитул с реквизитами",
    style: "from-slate-700/40 to-slate-900/40",
    /** имя шаблона на бэке → /template/classic/generate */
    backendName: "classic",
    details: {
      font: "Times New Roman",
      fontSize: "14 пт",
      margins: "20 / 20 / 30 / 15 мм",
      notes: "Строгий официальный стиль.",
    },
  },
  {
    id: "org_modern",
    name: "Современный",
    description: "Arial, компактные отступы, блок «Кому / От кого»",
    style: "from-indigo-700/40 to-violet-900/40",
    backendName: "modern",
    details: {
      font: "Arial",
      fontSize: "12 пт",
      margins: "15 / 15 / 25 / 20 мм",
      notes: "Современный корпоративный стиль.",
    },
  },
];

/**
 * Подготовка текста перед отправкой в LLM.
 */
function prepareTextForApi(raw: string): string {
  let t = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  t = t.replace(/\n{3,}/g, "\n\n");
  t = t
    .split("\n\n")
    .map((para) =>
      para
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join("\n")
    )
    .filter((para) => para.length > 0)
    .join("\n\n");
  return t.trim();
}

// ——— Preview components ———

function ClassicPreview({ data }: { data: TemplateFormData }) {
  const recipientLines = (data.recipient || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div
      className="bg-white text-black rounded-lg shadow-2xl overflow-hidden text-[13px] leading-[1.5]"
      style={{ fontFamily: '"Times New Roman", Times, serif' }}
    >
      <div className="p-6 min-h-[460px]">
        {/* Адресат — блок справа, отступ ~половина ширины */}
        <div className="ml-auto w-[55%] text-right mb-6 space-y-0.5">
          {recipientLines.length > 0 ? (
            recipientLines.map((line, i) => <div key={i}>{line}</div>)
          ) : (
            <div className="text-neutral-400">Адресат</div>
          )}
        </div>

        {/* Дата / Номер — слева, одной строкой */}
        <div className="mb-4">
          Дата: {data.date || "—"} Номер: {data.number || "—"}
        </div>

        {/* Тема — по центру, жирным */}
        <div className="text-center font-bold mb-2">
          {data.topic || data.document_type || "ТЕМА ДОКУМЕНТА"}
        </div>

        {/* Абзацы — с отступом первой строки */}
        <div className="space-y-2 text-justify">
          {(data.paragraphs || []).filter((p) => p.trim()).length > 0 ? (
            (data.paragraphs || [])
              .filter((p) => p.trim())
              .map((p, i) => (
                <p key={i} className="indent-8">{p}</p>
              ))
          ) : (
            <p className="text-neutral-400 indent-8">Текст документа…</p>
          )}
        </div>

        {/* Подпись */}
        <div className="mt-10 space-y-1">
          {data.sign_position && <div>{data.sign_position}</div>}
          <div className="w-48 border-b border-black">&nbsp;</div>
          {data.signer && <div>{data.signer}</div>}
        </div>
      </div>
    </div>
  );
}

function ModernPreview({ data }: { data: TemplateFormData }) {
  const recipientText = [data.recipient_job, data.recipient_name]
    .filter(Boolean)
    .join(" ") || data.recipient || "—";

  return (
    <div
      className="bg-white text-black rounded-lg shadow-2xl overflow-hidden text-[12px] leading-[1.35]"
      style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
    >
      <div className="p-5 min-h-[460px]">
        {/* Тема */}
        <div className="font-bold mb-3">
          {data.topic || data.document_type || "Тема документа"}
        </div>

        {/* Таблица Кому / От кого */}
        <table className="w-full border-collapse mb-5 text-[12px]">
          <tbody>
            <tr>
              <td className="border border-black px-2 py-1 w-[35%] align-top">
                Кому:
              </td>
              <td className="border border-black px-2 py-1 align-top">
                {recipientText}
              </td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 align-top">
                От кого:
              </td>
              <td className="border border-black px-2 py-1 align-top">
                {data.author || "—"}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Абзацы — без отступа первой строки */}
        <div className="space-y-2.5">
          {(data.paragraphs || []).filter((p) => p.trim()).length > 0 ? (
            (data.paragraphs || [])
              .filter((p) => p.trim())
              .map((p, i) => <p key={i}>{p}</p>)
          ) : (
            <p className="text-neutral-400">Текст документа…</p>
          )}
        </div>

        {/* Подпись — по центру */}
        <div className="mt-10 text-center space-y-1">
          {data.sign_position && <div>{data.sign_position}</div>}
          <div className="mx-auto w-48 border-b border-black">&nbsp;</div>
          {data.signer && <div>{data.signer}</div>}
        </div>
      </div>
    </div>
  );
}

// ——— Main ———

export default function Home() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [draft, setDraft] = useState("");
  const [docType, setDocType] = useState<DocType | null>(null);
  const [template, setTemplate] = useState<TemplateId | null>(null);
  const [customTemplateFile, setCustomTemplateFile] = useState<File | null>(
    null
  );
  const [processing, setProcessing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TemplateFormData | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [textCollapsed, setTextCollapsed] = useState(false);
  const [templateInfoId, setTemplateInfoId] = useState<
    "org_classic" | "org_modern" | null
  >(null);

  const selectedType = DOC_TYPES.find((d) => d.id === docType);
  const selectedTemplate = TEMPLATES.find((t) => t.id === template);
  const infoTemplate = TEMPLATES.find((t) => t.id === templateInfoId);
  
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTemplateInfoId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const goNext = () => {
    setError(null);
    if (step === 1) {
      if (!draft.trim()) {
        setError("Введите черновик текста");
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!docType) {
        setError("Выберите тип документа");
        return;
      }
      if (!template) {
        setError("Выберите шаблон");
        return;
      }
      if (template === "custom" && !customTemplateFile) {
        setError("Загрузите файл шаблона");
        return;
      }
      startProcessing();
    }
  };

  const startProcessing = useCallback(async () => {
    if (!docType || !template) return;

    setProcessing(true);
    setError(null);
    setData(null);
    setStep(3);

    try {
      const typeHint = selectedType
        ? `Тип документа: ${selectedType.title}.\n\n`
        : "";
      const payloadText = typeHint + prepareTextForApi(draft);

      const processUrl =
        template === "org_classic"
          ? `${API_BASE}/classic/process`
          : template === "org_modern"
            ? `${API_BASE}/new-style/process`
            : `${API_BASE}/template/process`;

      const res = await fetch(processUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: payloadText }),
      });

      if (!res.ok) {
        let detail = `Ошибка сервера (${res.status})`;
        try {
          const errJson = await res.json();
          if (errJson?.detail) detail = String(errJson.detail);
        } catch {}
        throw new Error(detail);
      }

      const json = await res.json();
      console.log("[process] template =", template);
      console.log("[process] raw json =", json);

      let raw: any;
      if (template === "custom") {
        setDocumentId(json.document_id);
        raw = json.data;
      } else {
        raw = json;
      }

      if (!raw) throw new Error("Backend не вернул данные документа");

      // Приводим recipient к строке, если пришёл массивом (classic)
      let recipient = raw.recipient;
      if (Array.isArray(recipient)) {
        recipient = recipient.map(String).map((s) => s.trim()).filter(Boolean).join("\n");
      } else if (recipient == null) {
        recipient = "";
      } else {
        recipient = String(recipient);
      }

      const parsed: TemplateFormData = {
        organization: raw.organization ?? "",
        document_type: raw.document_type ?? "",
        topic: raw.topic ?? "",
        recipient_job: raw.recipient_job ?? "",
        recipient_name: raw.recipient_name ?? "",
        recipient,
        author: raw.author ?? "",
        date: raw.date ?? "",
        number: raw.number ?? "",
        sign_position: raw.sign_position ?? "",
        signer: raw.signer ?? "",
        paragraphs: Array.isArray(raw.paragraphs) && raw.paragraphs.length
          ? raw.paragraphs.map(String)
          : [""],
      };

      setData(parsed);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Не удалось обработать текст. Проверьте, что бэкенд запущен."
      );
    } finally {
      setProcessing(false);
    }
  }, [draft, docType, template, selectedType]);

  const saveTemplateData = async () => {
    if (!data || !documentId) {
      throw new Error("Документ ещё не обработан");
    }

    const payload = {
      organization: data.organization || "",
      document_type: data.document_type || "",
      topic: data.topic || "",
      recipient_job: data.recipient_job || "",
      recipient_name: data.recipient_name || "",
      recipient: data.recipient || "",
      author: data.author || "",
      date: data.date || "",
      number: data.number || "",
      paragraphs: data.paragraphs || [],
      sign_position: data.sign_position || "",
      signer: data.signer || "",
    };

    const res = await fetch(`${API_BASE}/template/data/${documentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      let detail = `Ошибка сохранения (${res.status})`;
      try {
        const errJson = await res.json();
        if (errJson?.detail) detail = String(errJson.detail);
      } catch {}
      throw new Error(detail);
    }

    return await res.json();
  };

  const handleDownloadGuidebook = async () => {
    try {
      setError(null);
      const res = await fetch(`${API_BASE}/guidebook`, { method: "GET" });
      if (!res.ok) {
        throw new Error(`Не удалось скачать гайдбук (${res.status})`);
      }

      // Пытаемся взять имя файла из Content-Disposition
      const cd = res.headers.get("Content-Disposition") || "";
      const match = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
      const filename = match ? decodeURIComponent(match[1]) : "guidebook.docx";

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка скачивания гайдбука");
    }
  };

  const handleDownload = async () => {
    if (!data || !template) return;
    setGenerating(true);
    setError(null);

    try {
      let url: string;
      let body: BodyInit;
      let headers: HeadersInit = {};

      if (template === "custom") {
        await saveTemplateData();
        if (!customTemplateFile) throw new Error("Выберите файл шаблона");
        if (!documentId) throw new Error("Документ ещё не обработан");

        const formData = new FormData();
        formData.append("template", customTemplateFile);

        const res = await fetch(`${API_BASE}/custom-template/${documentId}`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Ошибка генерации документа");
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = customTemplateFile.name.replace(/\.docx$/i, "_generated.docx");
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return;
      }

      if (template === "org_classic") {
        url = `${API_BASE}/classic/generate`;
        headers = { "Content-Type": "application/json" };
        body = JSON.stringify({
          organization: data.organization || "",
          document_type: data.document_type || "",
          recipient: (data.recipient || "")
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
          date: data.date || "",
          number: data.number || "",
          title: data.topic || "",
          paragraphs: data.paragraphs || [],
          sign_position: data.sign_position || "",
          signer: data.signer || "",
        });
      } else {
        url = `${API_BASE}/new-style/generate`;
        headers = { "Content-Type": "application/json" };
        body = JSON.stringify({
          organization: data.organization || "",
          document_type: data.document_type || "",
          topic: data.topic || "",
          recipient_job: data.recipient_job || "",
          recipient_name: data.recipient_name || "",
          recipient: data.recipient || "",
          author: data.author || "",
          date: data.date || "",
          number: data.number || "",
          paragraphs: data.paragraphs || [],
          sign_position: data.sign_position || "",
          signer: data.signer || "",
        });
      }

      const res = await fetch(url, { method: "POST", headers, body });

      if (!res.ok) {
        let detail = `Ошибка генерации (${res.status})`;
        try {
          const errJson = await res.json();
          if (errJson?.detail) detail = String(errJson.detail);
        } catch {}
        throw new Error(detail);
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download =
        template === "org_classic"
          ? "classic.docx"
          : template === "org_modern"
            ? "modern.docx"
            : "document.docx";
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сформировать DOCX");
    } finally {
      setGenerating(false);
    }
  };

  const updateField = (key: string, value: string | string[]) => {
    setData((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const updateParagraph = (index: number, value: string) => {
    setData((prev) => {
      if (!prev) return prev;
      const paragraphs = [...(prev.paragraphs || [])];
      paragraphs[index] = value;
      return { ...prev, paragraphs };
    });
  };

  const addParagraph = () => {
    setData((prev) => {
      if (!prev) return prev;
      return { ...prev, paragraphs: [...(prev.paragraphs || []), ""] };
    });
  };

  const removeParagraph = (index: number) => {
    setData((prev) => {
      if (!prev) return prev;
      const paragraphs = [...(prev.paragraphs || [])];
      if (paragraphs.length <= 1) return prev;
      paragraphs.splice(index, 1);
      return { ...prev, paragraphs };
    });
  };

  const reset = () => {
    setStep(1);
    setDraft("");
    setDocType(null);
    setTemplate(null);
    setCustomTemplateFile(null);
    setError(null);
    setData(null);
    setProcessing(false);
    setGenerating(false);
    setTextCollapsed(false);
    setTemplateInfoId(null);
  };

  const onCustomFile = (file: File | null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".docx")) {
      setError("Нужен файл в формате .docx");
      return;
    }
    setCustomTemplateFile(file);
    setTemplate("custom");
    setError(null);
  };

  return (
    <div className="relative min-h-dvh flex flex-col">
      {/* Header */}
      <header className="relative z-10 px-4 sm:px-6 pt-4 sm:pt-6 pb-2 sm:pb-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl glass-strong flex items-center justify-center text-lg shrink-0">
              📄
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold tracking-tight truncate">
                Документ за 3 шага
              </h1>
              <p className="text-xs text-white/50 truncate">
                ИИ-конструктор служебных документов
              </p>
            </div>
          </div>
          <button
            onClick={reset}
            className="text-xs sm:text-sm px-3 py-1.5 rounded-lg glass hover:bg-white/10 transition focus-ring"
          >
            Сброс
          </button>
        </div>
      </header>

      {/* Progress */}
      <div className="relative z-10 px-4 sm:px-6 pt-2 pb-3 sm:pt-3 sm:pb-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 sm:gap-3">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex-1 flex items-center gap-2">
                <div
                  className={`
                    w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-sm font-medium shrink-0 transition-all
                    ${
                      step === s
                        ? "bg-blue-500 text-white glow-accent"
                        : step > s
                          ? "bg-emerald-500/80 text-white"
                          : "glass text-white/40"
                    }
                  `}
                >
                  {step > s ? "✓" : s}
                </div>
                <span
                  className={`hidden sm:inline text-xs font-medium ${
                    step === s ? "text-white" : "text-white/40"
                  }`}
                >
                  {s === 1
                    ? "Черновик"
                    : s === 2
                      ? "Тип и шаблон"
                      : "Редактирование"}
                </span>
                {s < 3 && (
                  <div
                    className={`flex-1 h-0.5 rounded ${
                      step > s ? "bg-emerald-500/60" : "bg-white/10"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main */}
      <main className="relative z-10 flex-1 flex flex-col px-4 sm:px-6 pt-3 sm:pt-5 pb-8 sm:pb-12">
        <div className="max-w-5xl w-full mx-auto flex-1">
          {error && step !== 3 && (
            <div className="mb-4 p-3 rounded-xl glass border-amber-400/30 text-amber-200 text-sm step-enter">
              {error}
            </div>
          )}

          {/* STEP 1 */}
          {step === 1 && (
            <div className="step-enter space-y-4 max-w-3xl mx-auto">
              <div className="glass-card rounded-2xl p-4 sm:p-6">
                <h2 className="text-lg sm:text-xl font-semibold mb-1">
                  Шаг 1. Черновик
                </h2>
                <p className="text-sm text-white/55 mb-3">
                  Вставьте текст как есть. Переносы строк сохраняются: одна
                  строка → строка, пустая строка → новый абзац.
                </p>

                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={
                    "Кому: Начальнику отдела\n\nПроверил склад 10.03.2026.\nОбнаружил недостачу.\n\nПрошу провести инвентаризацию."
                  }
                  rows={12}
                  className="w-full rounded-xl bg-black/30 border border-white/10 p-3 sm:p-4 text-sm sm:text-base text-white placeholder:text-white/30 focus:border-blue-400/50 focus:ring-1 focus:ring-blue-400/30 outline-none resize-y min-h-[200px] focus-ring font-mono leading-relaxed"
                />
                <p className="mt-2 text-[11px] text-white/35">
                  Подсказка: Enter — новая строка, Enter дважды — новый абзац.
                  Текст будет нормализован перед отправкой в ИИ.
                </p>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={goNext}
                  className="px-5 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-medium text-sm sm:text-base transition shadow-lg shadow-blue-500/25 focus-ring"
                >
                  Далее
                </button>
              </div>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div className="step-enter space-y-5 max-w-3xl mx-auto">
              <div className="glass-card rounded-2xl p-4 sm:p-6">
                <h2 className="text-lg sm:text-xl font-semibold mb-1">
                  Шаг 2. Тип документа и шаблон
                </h2>
                <p className="text-sm text-white/55 mb-4">
                  Тип помогает ИИ. Шаблон задаёт внешний вид DOCX.
                </p>

                {/* Тип документа */}
                <h3 className="text-sm font-medium text-white/70 mb-2">
                  Тип документа
                </h3>
                <div className="grid grid-cols-1 xs:grid-cols-2 gap-2.5 sm:gap-3 mb-6">
                  {DOC_TYPES.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setDocType(d.id)}
                      className={`
                        text-left p-3 sm:p-4 rounded-xl transition focus-ring
                        ${
                          docType === d.id
                            ? "glass-strong !ring-2 !ring-blue-400/60"
                            : "glass hover:bg-white/10"
                        }
                      `}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="text-xl">{d.icon}</span>
                        <div className="min-w-0">
                          <div className="font-medium text-sm sm:text-base">
                            {d.title}
                          </div>
                          <div className="text-xs text-white/50 mt-0.5 leading-snug">
                            {d.description}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Шаблоны: Классика + Современный */}
                <h3 className="text-sm font-medium text-white/70 mb-2">
                  Шаблон оформления
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                  {TEMPLATES.map((t) => (
                    <div
                      key={t.id}
                      className={`
                        relative text-left p-3 sm:p-4 rounded-xl transition
                        ${
                          template === t.id
                            ? "glass-strong !ring-2 !ring-violet-400/60"
                            : "glass hover:bg-white/10"
                        }
                      `}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setTemplate(t.id);
                          setCustomTemplateFile(null);
                          setDocumentId(null);
                        }}
                        className="w-full text-left focus-ring rounded-lg"
                      >
                        <div
                          className={`h-14 rounded-lg mb-2.5 bg-gradient-to-br ${t.style} border border-white/10`}
                        />
                        <div className="font-medium text-sm sm:text-base pr-8">
                          {t.name}
                        </div>
                        <div className="text-xs text-white/50 mt-0.5 pr-6">
                          {t.description}
                        </div>
                      </button>
                      <button
                        type="button"
                        aria-label={`Подробнее о шаблоне «${t.name}»`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setTemplateInfoId(t.id);
                        }}
                        className="absolute top-2.5 right-2.5 w-8 h-8 rounded-lg glass hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition focus-ring"
                      >
                        <span className="text-lg leading-none">⋯</span>
                      </button>
                    </div>
                  ))}
                </div>

                {/* Свой шаблон — drag & drop + click */}
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-white/70">
                      Или свой шаблон
                    </h3>
                    <button
                      type="button"
                      onClick={handleDownloadGuidebook}
                      className="text-xs px-3 py-1.5 rounded-lg glass hover:bg-white/10 transition focus-ring text-white/80"
                      title="Скачать гайдбук с доступными метками шаблона"
                    >
                      ⬇ Гайдбук по меткам
                    </button>
                  </div>
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const file = e.dataTransfer.files?.[0] ?? null;
                      onCustomFile(file);
                    }}
                    className={`
                      relative flex flex-col items-center justify-center gap-2 p-5 rounded-xl border border-dashed
                      transition
                      ${
                        template === "custom"
                          ? "glass-strong !ring-2 !ring-violet-400/60 border-violet-400/40"
                          : "glass border-white/15 hover:bg-white/5 hover:border-white/25"
                      }
                    `}
                  >
                    <input
                      type="file"
                      accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        onCustomFile(file);
                        // сброс value, чтобы можно было выбрать тот же файл снова
                        e.target.value = "";
                      }}
                    />
                    <div className="text-2xl pointer-events-none">📄</div>
                    <div className="text-sm font-medium text-center pointer-events-none">
                      {customTemplateFile
                        ? customTemplateFile.name
                        : "Перетащите .docx или нажмите, чтобы выбрать"}
                    </div>
                    <div className="text-xs text-white/45 text-center pointer-events-none">
                      {customTemplateFile
                        ? "Можно выбрать другой файл"
                        : "Файл должен содержать метки {{ organization }}, {{ title }} и т.д."}
                    </div>
                  </div>

                  {template === "custom" && customTemplateFile && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomTemplateFile(null);
                        setTemplate(null);
                      }}
                      className="mt-2 text-xs text-red-300/80 hover:text-red-300"
                    >
                      Убрать свой шаблон
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-between gap-2">
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2.5 rounded-xl glass hover:bg-white/10 text-sm transition focus-ring"
                >
                  ← Назад
                </button>
                <button
                  onClick={goNext}
                  disabled={
                    !docType ||
                    !template ||
                    (template === "custom" && !customTemplateFile)
                  }
                  className="px-5 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 disabled:opacity-40 disabled:pointer-events-none text-white font-medium text-sm sm:text-base transition shadow-lg shadow-blue-500/25 focus-ring"
                >
                  Обработать →
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div className="step-enter space-y-4">
              {processing && (
                <div className="glass-card rounded-2xl p-6 sm:p-8 text-center max-w-3xl mx-auto">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full glass-strong mb-4 pulse-soft">
                    <span className="text-2xl">✨</span>
                  </div>
                  <h2 className="text-lg font-semibold mb-1">
                    ИИ обрабатывает текст…
                  </h2>
                  <p className="text-sm text-white/55">
                    Исправление стиля, извлечение реквизитов, разбиение на
                    абзацы. Факты не добавляются.
                  </p>
                </div>
              )}

              {!processing && error && !data && (
                <div className="glass-card rounded-2xl p-5 border border-red-400/30 max-w-3xl mx-auto">
                  <h2 className="text-lg font-semibold text-red-300 mb-2">
                    Не удалось обработать
                  </h2>
                  <p className="text-sm text-white/60 mb-4">{error}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => startProcessing()}
                      className="px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-sm font-medium focus-ring"
                    >
                      Повторить
                    </button>
                    <button
                      onClick={() => setStep(1)}
                      className="px-4 py-2 rounded-xl glass hover:bg-white/10 text-sm focus-ring"
                    >
                      К черновику
                    </button>
                  </div>
                </div>
              )}

              {!processing && data && (
                <>
                  {error && (
                    <div className="p-3 rounded-xl glass border-amber-400/30 text-amber-200 text-sm">
                      {error}
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
                    {/* Left: form */}
                    <div className="glass-card rounded-2xl p-4 sm:p-5 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-lg font-semibold">
                          Реквизиты и текст
                        </h2>
                        <div className="text-xs text-white/45">
                          {selectedType?.title} ·{" "}
                          {template === "custom"
                            ? "Свой шаблон"
                            : selectedTemplate?.name}
                        </div>
                        <div className="text-xs text-white/45">
                          Не все поля обязательны к заполнению
                        </div>
                      </div>

                      <div className="space-y-3">
                        {(Object.keys(LABELS) as LabelKey[]).map((key) => {
                          const value = (data as any)[key];
                          // Показываем поле, только если оно вообще было в ответе бэка.
                          // Пустые строки тоже показываем — пользователь может заполнить.
                          if (value === undefined) return null;

                          // recipient в classic может быть многострочным — сделаем textarea
                          if (key === "recipient") {
                            return (
                              <div key={key}>
                                <label className="text-xs text-white/55 mb-1 block">
                                  {LABELS[key]} {key === "recipient" && "(по строкам)"}
                                </label>
                                <textarea
                                  value={String(value ?? "")}
                                  onChange={(e) => updateField(key, e.target.value)}
                                  rows={2}
                                  className="w-full rounded-lg bg-black/25 border border-white/10 px-3 py-2 text-sm outline-none focus:border-blue-400/50 focus-ring resize-y min-h-[60px]"
                                />
                              </div>
                            );
                          }

                          return (
                            <Field
                              key={key}
                              label={LABELS[key]}
                              value={String(value ?? "")}
                              onChange={(v) => updateField(key, v)}
                            />
                          );
                        })}
                      </div>

                      {/* Paragraphs */}
                      <div className="border-t border-white/10 pt-3">
                        <button
                          type="button"
                          onClick={() => setTextCollapsed((v) => !v)}
                          className="flex items-center justify-between w-full text-left mb-2 group focus-ring rounded-lg"
                        >
                          <span className="text-sm font-medium text-white/80">
                            Абзацы текста
                          </span>
                          <span className="text-xs text-white/45 px-2 py-1 rounded-md glass">
                            {textCollapsed ? "Развернуть" : "Свернуть"}
                          </span>
                        </button>

                        {!textCollapsed && (
                          <div className="space-y-2">
                            {(data.paragraphs || []).map((p, i) => (
                              <div key={i} className="flex gap-2 items-start">
                                <textarea
                                  value={p}
                                  onChange={(e) =>
                                    updateParagraph(i, e.target.value)
                                  }
                                  rows={3}
                                  className="flex-1 rounded-lg bg-black/25 border border-white/10 px-3 py-2 text-sm outline-none focus:border-blue-400/50 focus-ring resize-y min-h-[60px]"
                                  placeholder={`Абзац ${i + 1}`}
                                />
                                <button
                                  type="button"
                                  onClick={() => removeParagraph(i)}
                                  disabled={(data.paragraphs || []).length <= 1}
                                  className="mt-1 w-8 h-8 rounded-lg glass text-white/50 hover:text-red-300 disabled:opacity-30 shrink-0"
                                  title="Удалить абзац"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={addParagraph}
                              className="text-xs text-blue-300 hover:text-blue-200"
                            >
                              + добавить абзац
                            </button>
                          </div>
                        )}
                      </div>
                    </div>


                    {/* Right: live preview */}
                    <div className="space-y-3">
                      <h3 className="text-sm font-medium text-white/70 px-1">
                        Предпросмотр
                      </h3>
                      <div className="rounded-xl overflow-hidden border border-white/10 bg-neutral-900/50 p-3 sm:p-4">
                        {template !== "custom" &&
                          (template === "org_classic" ? (
                            <ClassicPreview data={data} />
                          ) : (
                            <ModernPreview data={data} />
                          ))}
                      </div>
                      <p className="text-[11px] text-white/35 text-center">
                        Макет приближён к итоговому DOCX. Правки отображаются
                        сразу.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col-reverse sm:flex-row justify-between gap-2 pt-2">
                    <button
                      onClick={() => setStep(2)}
                      className="px-4 py-2.5 rounded-xl glass hover:bg-white/10 text-sm transition focus-ring"
                    >
                      ← Изменить тип/шаблон
                    </button>
                    <button
                      onClick={handleDownload}
                      disabled={generating}
                      className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-white font-medium text-sm sm:text-base transition shadow-lg shadow-emerald-500/25 focus-ring flex items-center justify-center gap-2"
                    >
                      {generating ? (
                        "Формирование…"
                      ) : (
                        <>
                          <span>⬇</span> Скачать DOCX
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </main>

      <footer className="relative z-10 px-4 py-4 text-center text-[11px] text-white/30">
        MVP «Документ за 3 шага»
      </footer>

      {/* Template info modal */}
      {infoTemplate && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setTemplateInfoId(null)}
          />
          <div className="relative z-10 w-full sm:max-w-md max-h-[85dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl glass-strong border border-white/20 shadow-2xl p-5">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg font-semibold">
                Шаблон «{infoTemplate.name}»
              </h2>
              <button
                onClick={() => setTemplateInfoId(null)}
                className="w-8 h-8 rounded-lg glass"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-white/60 mb-3">
              {infoTemplate.details.notes}
            </p>
            <dl className="text-sm space-y-2">
              <div>
                <dt className="text-xs text-white/40">Шрифт</dt>
                <dd>{infoTemplate.details.font}</dd>
              </div>
              <div>
                <dt className="text-xs text-white/40">Размер</dt>
                <dd>{infoTemplate.details.fontSize}</dd>
              </div>
              <div>
                <dt className="text-xs text-white/40">Поля</dt>
                <dd>{infoTemplate.details.margins}</dd>
              </div>
            </dl>
            <button
              onClick={() => {
                setTemplate(infoTemplate.id);
                setCustomTemplateFile(null);
                setTemplateInfoId(null);
              }}
              className="w-full mt-4 px-4 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-400 text-white font-medium text-sm"
            >
              Выбрать этот шаблон
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs text-white/55 mb-1 block">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg bg-black/25 border border-white/10 px-3 py-2 text-sm outline-none focus:border-blue-400/50 focus-ring"
      />
    </div>
  );
}
