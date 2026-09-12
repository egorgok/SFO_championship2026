"use client";

import { useState, useCallback, useEffect } from "react";

// ——— Types ———
type DocType =
  | "service_note"
  | "report_note"
  | "info_certificate"
  | "letter";

type TemplateId = "org_classic" | "org_modern";

interface TemplateInfo {
  id: TemplateId;
  name: string;
  description: string;
  style: string;
  processEndpoint: string;
  generateEndpoint: string;
  details: {
    font: string;
    fontSize: string;
    margins: string;
    notes: string;
  };
}

/** Данные классического шаблона (из LLM / редактируемые) */
interface ClassicData {
  organization: string;
  document_type: string;
  recipient: string[];
  date: string;
  number: string;
  title: string;
  paragraphs: string[];
  sign_position: string;
  signer: string;
}

/** Данные современного шаблона */
interface ModernData {
  organization: string;
  document_type: string;
  topic: string;
  recipient: string;
  author: string;
  date: string;
  number: string;
  paragraphs: string[];
  sign_position: string;
  signer: string;
}

type StructuredData = ClassicData | ModernData;

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8000";

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
    processEndpoint: "/classic/process",
    generateEndpoint: "/classic/generate",
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
    processEndpoint: "/new-style/process",
    generateEndpoint: "/new-style/generate",
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
 * - \r\n / \r → \n
 * - одиночный \n = перенос строки (сохраняем)
 * - \n\n = граница абзаца
 * - убираем лишние пробелы по краям строк, но не схлопываем абзацы
 */
function prepareTextForApi(raw: string): string {
  let t = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // нормализуем слишком много пустых строк (макс 2 подряд = 1 абзац)
  t = t.replace(/\n{3,}/g, "\n\n");
  // trim каждой строки, но сохраняем структуру абзацев
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

function isClassic(data: StructuredData): data is ClassicData {
  return Array.isArray((data as ClassicData).recipient);
}

function emptyClassic(): ClassicData {
  return {
    organization: "",
    document_type: "",
    recipient: ["", ""],
    date: "",
    number: "",
    title: "",
    paragraphs: [""],
    sign_position: "",
    signer: "",
  };
}

function emptyModern(): ModernData {
  return {
    organization: "",
    document_type: "",
    topic: "",
    recipient: "",
    author: "",
    date: "",
    number: "",
    paragraphs: [""],
    sign_position: "",
    signer: "",
  };
}

// ——— Preview components ———

function ClassicPreview({ data }: { data: ClassicData }) {
  const recipient = (data.recipient || []).filter((l) => l.trim());
  return (
    <div
      className="bg-white text-black rounded-lg shadow-2xl overflow-hidden text-[13px] leading-[1.5]"
      style={{ fontFamily: '"Times New Roman", Times, serif' }}
    >
      {/* Header org */}
      <div className="text-center text-[11px] text-neutral-600 border-b border-neutral-200 py-2 px-4">
        {data.organization || "— организация —"}
      </div>

      <div className="p-6 min-h-[420px]">
        {/* Recipient right */}
        <div className="text-right mb-4 space-y-0.5 pl-[40%]">
          {recipient.length > 0 ? (
            recipient.map((line, i) => (
              <div key={i}>{line}</div>
            ))
          ) : (
            <div className="text-neutral-400">Адресат</div>
          )}
        </div>

        {/* Date / number */}
        <div className="mb-4 text-[12px]">
          Дата: {data.date || "—"} &nbsp;&nbsp; Номер: {data.number || "—"}
        </div>

        {/* Doc type + title */}
        <div className="text-center font-bold mb-1 uppercase tracking-wide">
          {data.document_type || "СЛУЖЕБНЫЙ ДОКУМЕНТ"}
        </div>
        {data.title && (
          <div className="text-center font-bold mb-4">{data.title}</div>
        )}

        {/* Body */}
        <div className="space-y-3 text-justify">
          {(data.paragraphs || [])
            .filter((p) => p.trim())
            .map((p, i) => (
              <p key={i} className="indent-8 first:mt-0">
                {p}
              </p>
            ))}
          {(data.paragraphs || []).filter((p) => p.trim()).length === 0 && (
            <p className="text-neutral-400 indent-8">Текст документа…</p>
          )}
        </div>

        {/* Signature */}
        <div className="mt-8 space-y-1">
          {data.sign_position && <div>{data.sign_position}</div>}
          <div>____________________</div>
          {data.signer && <div>{data.signer}</div>}
        </div>
      </div>

      <div className="text-center text-[10px] text-neutral-500 border-t border-neutral-200 py-1.5">
        1
      </div>
    </div>
  );
}

function ModernPreview({ data }: { data: ModernData }) {
  return (
    <div
      className="bg-white text-black rounded-lg shadow-2xl overflow-hidden text-[12px] leading-[1.35]"
      style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
    >
      <div className="p-5 min-h-[420px]">
        {/* Topic */}
        {data.topic ? (
          <div className="font-bold mb-3 text-[13px]">{data.topic}</div>
        ) : (
          <div className="font-bold mb-3 text-neutral-400 text-[13px]">
            Тема документа
          </div>
        )}

        {/* To / From table */}
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 mb-4 text-[12px]">
          <div className="font-bold">Кому:</div>
          <div>{data.recipient || <span className="text-neutral-400">—</span>}</div>
          <div className="font-bold">От кого:</div>
          <div>{data.author || <span className="text-neutral-400">—</span>}</div>
        </div>

        {/* Body */}
        <div className="space-y-2.5">
          {(data.paragraphs || [])
            .filter((p) => p.trim())
            .map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          {(data.paragraphs || []).filter((p) => p.trim()).length === 0 && (
            <p className="text-neutral-400">Текст документа…</p>
          )}
        </div>

        {/* Signature center */}
        <div className="mt-8 text-center space-y-1">
          {data.sign_position && <div>{data.sign_position}</div>}
          <div>____________________</div>
          {data.signer && <div>{data.signer}</div>}
        </div>
      </div>

      <div className="text-center text-[10px] text-neutral-500 border-t border-neutral-200 py-1.5">
        {(data.topic || data.document_type || "Документ") + " | " + (data.date || "")}
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
  const [processing, setProcessing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StructuredData | null>(null);
  const [textCollapsed, setTextCollapsed] = useState(false);
  const [templateInfoId, setTemplateInfoId] = useState<TemplateId | null>(null);

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
      if (!docType || !template) {
        setError("Выберите тип документа и шаблон");
        return;
      }
      startProcessing();
    }
  };

  const startProcessing = useCallback(async () => {
    if (!docType || !template) return;
    const tpl = TEMPLATES.find((t) => t.id === template);
    if (!tpl) return;

    setProcessing(true);
    setError(null);
    setData(null);
    setStep(3);

    try {
      const typeHint = selectedType
        ? `Тип документа: ${selectedType.title}.\n\n`
        : "";
      const payloadText = typeHint + prepareTextForApi(draft);

      const res = await fetch(`${API_BASE}${tpl.processEndpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: payloadText }),
      });

      if (!res.ok) {
        let detail = `Ошибка сервера (${res.status})`;
        try {
          const errJson = await res.json();
          if (errJson?.detail) detail = String(errJson.detail);
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }

      const json = await res.json();

      // Нормализуем под нужную форму
      if (tpl.id === "org_classic") {
        const c: ClassicData = {
          organization: json.organization || "",
          document_type: json.document_type || "",
          recipient: Array.isArray(json.recipient)
            ? json.recipient
            : String(json.recipient || "")
                .split("\n")
                .map((s: string) => s.trim())
                .filter(Boolean),
          date: json.date || "",
          number: json.number || "",
          title: json.title || "",
          paragraphs:
            Array.isArray(json.paragraphs) && json.paragraphs.length
              ? json.paragraphs
              : [""],
          sign_position: json.sign_position || "",
          signer: json.signer || "",
        };
        if (c.recipient.length === 0) c.recipient = [""];
        setData(c);
      } else {
        const m: ModernData = {
          organization: json.organization || "",
          document_type: json.document_type || "",
          topic: json.topic || "",
          recipient: json.recipient || "",
          author: json.author || "",
          date: json.date || "",
          number: json.number || "",
          paragraphs:
            Array.isArray(json.paragraphs) && json.paragraphs.length
              ? json.paragraphs
              : [""],
          sign_position: json.sign_position || "",
          signer: json.signer || "",
        };
        setData(m);
      }
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

  const handleDownload = async () => {
    if (!data || !selectedTemplate) return;
    setGenerating(true);
    setError(null);

    try {
      const res = await fetch(
        `${API_BASE}${selectedTemplate.generateEndpoint}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      );

      if (!res.ok) {
        let detail = `Ошибка генерации (${res.status})`;
        try {
          const errJson = await res.json();
          if (errJson?.detail) detail = String(errJson.detail);
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        selectedTemplate.id === "org_classic" ? "classic.docx" : "new_style.docx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось сформировать DOCX"
      );
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

  const updateRecipientLine = (index: number, value: string) => {
    setData((prev) => {
      if (!prev || !isClassic(prev)) return prev;
      const recipient = [...prev.recipient];
      recipient[index] = value;
      return { ...prev, recipient };
    });
  };

  const addRecipientLine = () => {
    setData((prev) => {
      if (!prev || !isClassic(prev)) return prev;
      return { ...prev, recipient: [...prev.recipient, ""] };
    });
  };

  const reset = () => {
    setStep(1);
    setDraft("");
    setDocType(null);
    setTemplate(null);
    setError(null);
    setData(null);
    setProcessing(false);
    setGenerating(false);
    setTextCollapsed(false);
    setTemplateInfoId(null);
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
                  Вставьте текст как есть. Переносы строк сохраняются:
                  одна строка → строка, пустая строка → новый абзац.
                </p>

                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={
                    "Пример:\n\nКому: Начальнику отдела\n\nПроверил склад 10.03.2026.\nОбнаружил недостачу.\n\nПрошу провести инвентаризацию."
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
                            ? "glass-strong ring-2 ring-blue-400/60"
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
                            ? "glass-strong ring-2 ring-violet-400/60"
                            : "glass hover:bg-white/10"
                        }
                      `}
                    >
                      <button
                        type="button"
                        onClick={() => setTemplate(t.id)}
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
                  disabled={!docType || !template}
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
                          {selectedType?.title} · {selectedTemplate?.name}
                        </div>
                      </div>

                      {isClassic(data) ? (
                        /* ——— Classic fields ——— */
                        <div className="space-y-3">
                          <Field
                            label="Организация"
                            value={data.organization}
                            onChange={(v) => updateField("organization", v)}
                          />
                          <Field
                            label="Тип документа"
                            value={data.document_type}
                            onChange={(v) => updateField("document_type", v)}
                          />
                          <div>
                            <label className="text-xs text-white/55 mb-1 block">
                              Адресат (по строкам)
                            </label>
                            {data.recipient.map((line, i) => (
                              <input
                                key={i}
                                type="text"
                                value={line}
                                onChange={(e) =>
                                  updateRecipientLine(i, e.target.value)
                                }
                                className="w-full mb-1.5 rounded-lg bg-black/25 border border-white/10 px-3 py-2 text-sm outline-none focus:border-blue-400/50 focus-ring"
                                placeholder={`Строка ${i + 1}`}
                              />
                            ))}
                            <button
                              type="button"
                              onClick={addRecipientLine}
                              className="text-xs text-blue-300 hover:text-blue-200"
                            >
                              + строка адресата
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Field
                              label="Дата"
                              value={data.date}
                              onChange={(v) => updateField("date", v)}
                            />
                            <Field
                              label="Номер"
                              value={data.number}
                              onChange={(v) => updateField("number", v)}
                            />
                          </div>
                          <Field
                            label="Заголовок / тема"
                            value={data.title}
                            onChange={(v) => updateField("title", v)}
                          />
                          <Field
                            label="Должность подписанта"
                            value={data.sign_position}
                            onChange={(v) => updateField("sign_position", v)}
                          />
                          <Field
                            label="ФИО подписанта"
                            value={data.signer}
                            onChange={(v) => updateField("signer", v)}
                          />
                        </div>
                      ) : (
                        /* ——— Modern fields ——— */
                        <div className="space-y-3">
                          <Field
                            label="Тема"
                            value={(data as ModernData).topic}
                            onChange={(v) => updateField("topic", v)}
                          />
                          <Field
                            label="Кому (адресат)"
                            value={(data as ModernData).recipient}
                            onChange={(v) => updateField("recipient", v)}
                          />
                          <Field
                            label="От кого (автор)"
                            value={(data as ModernData).author}
                            onChange={(v) => updateField("author", v)}
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <Field
                              label="Дата"
                              value={data.date}
                              onChange={(v) => updateField("date", v)}
                            />
                            <Field
                              label="Номер"
                              value={data.number}
                              onChange={(v) => updateField("number", v)}
                            />
                          </div>
                          <Field
                            label="Должность подписанта"
                            value={data.sign_position}
                            onChange={(v) => updateField("sign_position", v)}
                          />
                          <Field
                            label="ФИО подписанта"
                            value={data.signer}
                            onChange={(v) => updateField("signer", v)}
                          />
                        </div>
                      )}

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
                        {isClassic(data) ? (
                          <ClassicPreview data={data} />
                        ) : (
                          <ModernPreview data={data as ModernData} />
                        )}
                      </div>
                      <p className="text-[11px] text-white/35 text-center">
                        Макет приближён к итоговому DOCX. Правки слева сразу
                        отражаются здесь.
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
        MVP «Документ за 3 шага» · Первенство России 2026 · Адаптивно 320–1920px
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
            <p className="text-sm text-white/60 mb-3">{infoTemplate.details.notes}</p>
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