"use client";

import { useState, useCallback, useEffect } from "react";

// ——— Types & mock data ———
type DocType =
  | "service_note"
  | "report_note"
  | "info_certificate"
  | "letter";

type TemplateId = "org_classic" | "org_modern";

interface Requisite {
  key: string;
  label: string;
  required: boolean;
  auto: boolean;
  value: string;
  placeholder?: string;
}

interface TemplateInfo {
  id: TemplateId;
  name: string;
  description: string;
  preview: string;
  style: string;
  details: {
    font: string;
    fontSize: string;
    margins: string;
    lineHeight: string;
    paragraphIndent: string;
    alignment: string;
    header: string;
    footer: string;
    requisitesOrder: string;
    notes: string;
  };
}

const DOC_TYPES: {
  id: DocType;
  title: string;
  short: string;
  description: string;
  icon: string;
  requiredKeys: string[];
}[] = [
  {
    id: "service_note",
    title: "Служебная записка",
    short: "Служебная",
    description: "Внутренний документ: кому, от кого, суть, подпись",
    icon: "📋",
    requiredKeys: ["addressee", "author", "subject", "number", "date", "executor"],
  },
  {
    id: "report_note",
    title: "Докладная записка",
    short: "Докладная",
    description: "Доклад с предложениями или фактами",
    icon: "📑",
    requiredKeys: ["report_addressee", "author", "subject", "number", "date", "executor"],
  },
  {
    id: "info_certificate",
    title: "Информационная справка",
    short: "Справка",
    description: "Информация по запросу или событию",
    icon: "📄",
    requiredKeys: ["subject", "author", "date"],
  },
  {
    id: "letter",
    title: "Письмо",
    short: "Письмо",
    description: "Исходящее письмо организации",
    icon: "✉️",
    requiredKeys: ["addressee", "letter_author", "subject", "date", "number", "executor"],
  },
];

const TEMPLATES: TemplateInfo[] = [
  {
    id: "org_classic",
    name: "Классика",
    description: "Times New Roman, строгие поля, колонтитул с реквизитами",
    preview: "Классический деловой стиль",
    style: "from-slate-700/40 to-slate-900/40",
    details: {
      font: "Times New Roman",
      fontSize: "14 пт (основной текст), 12 пт (реквизиты)",
      margins: "Верх: 20 мм · Низ: 20 мм · Лево: 30 мм · Право: 15 мм",
      lineHeight: "1,5 (полуторный)",
      paragraphIndent: "1,25 см (красная строка)",
      alignment: "По ширине (основной текст), по центру (заголовок)",
      header: "Колонтитул сверху: полное наименование организации + логотип слева",
      footer: "Номер страницы по центру · «Страница X из Y»",
      requisitesOrder:
        "1) Адресат (справа сверху)\n2) Автор / от кого (слева ниже)\n3) Дата и №\n4) Заголовок по центру\n5) Текст\n6) Подпись справа внизу",
      notes:
        "Строгий официальный стиль по ГОСТ Р 7.0.97-2016. Подходит для государственных и крупных организаций.",
    },
  },
  {
    id: "org_modern",
    name: "Современный",
    description: "Inter/Arial, компактные отступы, минималистичный хедер",
    preview: "Современный минимализм",
    style: "from-indigo-700/40 to-violet-900/40",
    details: {
      font: "Arial (или Inter)",
      fontSize: "12 пт (основной текст), 11 пт (вторичные реквизиты)",
      margins: "Верх: 15 мм · Низ: 15 мм · Лево: 20 мм · Право: 15 мм",
      lineHeight: "1,15–1,2 (компактный)",
      paragraphIndent: "Без красной строки, отступ между абзацами 6 пт",
      alignment: "По левому краю (текст), заголовок — полужирный слева",
      header: "Тонкая линия + короткое название организации справа",
      footer: "Только номер страницы справа, без лишнего текста",
      requisitesOrder:
        "1) Шапка организации (сверху)\n2) Дата и исх. № в одной строке\n3) Адресат\n4) Тема (жирным)\n5) Текст\n6) Подпись + ФИО внизу слева",
      notes:
        "Современный корпоративный стиль. Меньше «воздуха», удобнее для экрана и печати на A4 без лишних полей.",
    },
  },
];

const INITIAL_REQUISITES: Record<string, Requisite> = {
  addressee: {
    key: "addressee",
    label: "Кому / Адресат",
    required: true,
    auto: false,
    value: "",
    placeholder: "Должность, ФИО, организация",
  },
  author: {
    key: "author",
    label: "От кого / Автор",
    required: true,
    auto: false,
    value: "",
    placeholder: "Должность, ФИО",
  },
  letter_author: {
    key: "letter_author",
    label: "Отправитель",
    required: true,
    auto: false,
    value: "",
    placeholder: "Организация, должность, ФИО"
  },
  report_addresse: {
    key: "report_addressee",
    label: "Кому / Адресат",
    required: false,
    auto: false,
    value: "",
    placeholder: "Опционально: должность, ФИО, организация"
  },
  subject: {
    key: "subject",
    label: "Тема / Заголовок",
    required: true,
    auto: false,
    value: "",
    placeholder: "Кратко о содержании",
  },
  date: {
    key: "date",
    label: "Дата",
    required: true,
    auto: true,
    value: "",
    placeholder: "ДД.ММ.ГГГГ или текущая",
  },
  number: {
    key: "number",
    label: "Номер документа",
    required: true,
    auto: false,
    value: "",
    placeholder: "Номер"
  },
  executor: {
    key: "executor",
    label: "Исполнитель",
    required: false,
    auto: false,
    value: "",
    placeholder: "Опционально"
  }
};

// Simple mock AI
function mockAiProcess(raw: string, type: DocType): {
  improved: string;
  extracted: Record<string, string>;
} {
  let text = raw
    .replace(/\s+/g, " ")
    .replace(/слушай/gi, "")
    .replace(/нужно срочно/gi, "необходимо")
    .replace(/кончились/gi, "закончились")
    .replace(/Вася/gi, "Кладовщик")
    .trim();

  if (type === "service_note" || type === "report_note") {
    if (
      !text.toLowerCase().includes("прошу") &&
      !text.toLowerCase().includes("докладываю")
    ) {
      text = `Довожу до Вашего сведения следующее.\n\n${text}\n\nПрошу рассмотреть.`;
    }
  }

  const extracted: Record<string, string> = {};
  const dateMatch = raw.match(/(\d{1,2}[./]\d{1,2}[./]\d{2,4})/);
  if (dateMatch) extracted.date = dateMatch[1];

  const fio = raw.match(/([А-ЯЁ][а-яё]+\s+[А-ЯЁ]\.[А-ЯЁ]\.?)/);
  if (fio) extracted.author = fio[1];

  return {
    improved: text || "Текст обработан. (В реальном сервисе здесь результат ИИ.)",
    extracted,
  };
}

// ——— Component ———
export default function Home() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [draft, setDraft] = useState("");
  const [docType, setDocType] = useState<DocType | null>(null);
  const [template, setTemplate] = useState<TemplateId | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [improvedText, setImprovedText] = useState("");
  const [requisites, setRequisites] = useState<Record<string, Requisite>>({});
  const [showMissingForm, setShowMissingForm] = useState(false);
  const [aiFailed, setAiFailed] = useState(false);
  const [textCollapsed, setTextCollapsed] = useState(false);
  const [templateInfoId, setTemplateInfoId] = useState<TemplateId | null>(null);

  const selectedType = DOC_TYPES.find((d) => d.id === docType);
  const infoTemplate = TEMPLATES.find((t) => t.id === templateInfoId);

  // Close modal on Escape
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
    if (!docType) return;
    setProcessing(true);
    setError(null);
    setAiFailed(false);
    setStep(3);

    await new Promise((r) => setTimeout(r, 1600));

    try {
      const { improved, extracted } = mockAiProcess(draft, docType);
      setImprovedText(improved);

      const typeMeta = DOC_TYPES.find((d) => d.id === docType)!;
      const reqs: Record<string, Requisite> = {};
      typeMeta.requiredKeys.forEach((key) => {
        const base = INITIAL_REQUISITES[key];
        if (base) {
          reqs[key] = {
            ...base,
            value:
              extracted[key] ||
              (key === "date" ? new Date().toLocaleDateString("ru-RU") : ""),
          };
        }
      });
      setRequisites(reqs);

      const missing = Object.values(reqs).filter(
        (r) => r.required && !r.value.trim()
      );
      if (missing.length > 0) {
        setShowMissingForm(true);
      }
    } catch {
      setAiFailed(true);
      setError(
        "ИИ-компонент временно недоступен. Текст сохранён - можно повторить."
      );
    } finally {
      setProcessing(false);
    }
  }, [draft, docType]);

  const updateReq = (key: string, value: string) => {
    setRequisites((prev) => ({
      ...prev,
      [key]: { ...prev[key], value },
    }));
  };

  const handleDownload = () => {
    const content = [
      `=== ${selectedType?.title ?? "Документ"} ===`,
      `Шаблон: ${TEMPLATES.find((t) => t.id === template)?.name}`,
      "",
      ...Object.values(requisites).map(
        (r) => `${r.label}: ${r.value.trim() || "[Заполнить]"}`
      ),
      "",
      "——— Текст ———",
      improvedText,
      "",
      "(Файл сгенерирован в демо-режиме. В полном решении настоящий DOCX по правилам шаблона.)",
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedType?.short ?? "document"}_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const forceAiError = () => {
    setAiFailed(true);
    setProcessing(false);
    setError("ИИ-компонент недоступен (демо сценария 6). Текст сохранён.");
  };

  const reset = () => {
    setStep(1);
    setDraft("");
    setDocType(null);
    setTemplate(null);
    setImprovedText("");
    setRequisites({});
    setShowMissingForm(false);
    setError(null);
    setAiFailed(false);
    setTextCollapsed(false);
    setTemplateInfoId(null);
  };

  return (
    <div className="relative min-h-dvh flex flex-col">
      {/* Header */}
      <header className="relative z-10 px-4 sm:px-6 pt-4 sm:pt-6 pb-2 sm:pb-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
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
        <div className="max-w-3xl mx-auto">
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
                      : "Готовый файл"}
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

      {/* Main content */}
      <main className="relative z-10 flex-1 flex flex-col px-4 sm:px-6 pt-3 sm:pt-5 pb-8 sm:pb-12">
        <div className="max-w-3xl w-full mx-auto flex-1">
          {error && (
            <div className="mb-4 p-3 rounded-xl glass border-amber-400/30 text-amber-200 text-sm step-enter">
              {error}
            </div>
          )}

          {/* STEP 1 */}
          {step === 1 && (
            <div className="step-enter space-y-4">
              <div className="glass-card rounded-2xl p-4 sm:p-6">
                <h2 className="text-lg sm:text-xl font-semibold mb-1">
                  Шаг 1. Черновик
                </h2>
                <p className="text-sm text-white/55 mb-4">
                  Вставьте текст как есть - с ошибками, разговорным стилем или
                  без реквизитов. ИИ исправит стиль, сохранив смысл и факты.
                </p>

                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Вставьте или наберите черновик документа…"
                  rows={10}
                  className="w-full rounded-xl bg-black/30 border border-white/10 p-3 sm:p-4 text-sm sm:text-base text-white placeholder:text-white/30 focus:border-blue-400/50 focus:ring-1 focus:ring-blue-400/30 outline-none resize-y min-h-[180px] focus-ring"
                />
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
            <div className="step-enter space-y-5">
              <div className="glass-card rounded-2xl p-4 sm:p-6">
                <h2 className="text-lg sm:text-xl font-semibold mb-1">
                  Шаг 2. Тип документа и шаблон
                </h2>
                <p className="text-sm text-white/55 mb-4">
                  Тип определяет структуру и обязательные реквизиты. Шаблон отвечает за
                  визуальное оформление (шрифты, поля, колонтитулы).
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
                        <span className="text-lg leading-none tracking-tighter">
                          ⋯
                        </span>
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
                  Обработать и сформировать →
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div className="step-enter space-y-4">
              {processing && (
                <div className="glass-card rounded-2xl p-6 sm:p-8 text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full glass-strong mb-4 pulse-soft">
                    <span className="text-2xl">✨</span>
                  </div>
                  <h2 className="text-lg font-semibold mb-1">
                    ИИ обрабатывает текст…
                  </h2>
                  <p className="text-sm text-white/55">
                    Исправление ошибок, деловой стиль, извлечение реквизитов.
                    Факты не добавляются.
                  </p>
                  <button
                    onClick={forceAiError}
                    className="mt-4 text-xs text-white/40 hover:text-white/70 underline"
                  >
                    (демо: сымитировать ошибку ИИ)
                  </button>
                </div>
              )}

              {aiFailed && !processing && (
                <div className="glass-card rounded-2xl p-5 border border-red-400/30">
                  <h2 className="text-lg font-semibold text-red-300 mb-2">
                    ИИ временно недоступен
                  </h2>
                  <p className="text-sm text-white/60 mb-4">
                    Ваш черновик сохранён. Можно повторить обработку позже или
                    вернуться к редактированию.
                  </p>
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

              {!processing && !aiFailed && improvedText && (
                <>
                  <div className="glass-card rounded-2xl p-4 sm:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <h2 className="text-lg font-semibold">
                        Результат обработки
                      </h2>
                    </div>

                    <div className="text-xs text-white/45 mb-4 flex flex-wrap gap-x-3 gap-y-1">
                      <span>Тип: {selectedType?.title}</span>
                      <span>
                        Шаблон:{" "}
                        {TEMPLATES.find((t) => t.id === template)?.name}
                      </span>
                    </div>

                    {/* Реквизиты */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                      {Object.values(requisites).map((r) => {
                        const isEmpty = !r.value.trim();
                        const needFill = r.required && isEmpty;
                        return (
                          <div key={r.key}>
                            <label className="flex items-center gap-1.5 text-xs text-white/55 mb-1">
                              <span>
                                {r.label}
                                {r.required && (
                                  <span className="text-amber-400/80"> *</span>
                                )}
                              </span>
                              {needFill && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30">
                                  Заполните
                                </span>
                              )}
                            </label>
                            <input
                              type="text"
                              value={r.value}
                              onChange={(e) =>
                                updateReq(r.key, e.target.value)
                              }
                              placeholder={
                                needFill
                                  ? "[Заполнить]"
                                  : r.placeholder || undefined
                              }
                              className={`w-full rounded-lg bg-black/25 border px-3 py-2 text-sm outline-none focus-ring ${
                                needFill
                                  ? "border-amber-400/40 focus:border-amber-400/60"
                                  : "border-white/10 focus:border-blue-400/50"
                              }`}
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* Итоговый текст, который можно редактировать */}
                    <div className="border-t border-white/10 pt-4">
                      <button
                        type="button"
                        onClick={() => setTextCollapsed((v) => !v)}
                        className="flex items-center justify-between w-full text-left mb-2 group focus-ring rounded-lg"
                      >
                        <span className="text-sm font-medium text-white/80 group-hover:text-white">
                          Текст документа
                        </span>
                        <span className="text-xs text-white/45 group-hover:text-white/70 px-2 py-1 rounded-md glass">
                          {textCollapsed ? "Развернуть" : "Свернуть"}
                        </span>
                      </button>

                      {!textCollapsed && (
                        <textarea
                          value={improvedText}
                          onChange={(e) => setImprovedText(e.target.value)}
                          rows={8}
                          className="w-full rounded-xl bg-black/30 border border-white/10 p-3 text-sm text-white focus:border-blue-400/50 outline-none resize-y focus-ring min-h-[140px]"
                        />
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col-reverse sm:flex-row justify-between gap-2">
                    <button
                      onClick={() => setStep(2)}
                      className="px-4 py-2.5 rounded-xl glass hover:bg-white/10 text-sm transition focus-ring"
                    >
                      ← Изменить тип/шаблон
                    </button>
                    <button
                      onClick={handleDownload}
                      className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-medium text-sm sm:text-base transition shadow-lg shadow-emerald-500/25 focus-ring flex items-center justify-center gap-2"
                    >
                      <span>⬇</span> Сгенерировать и скачать
                    </button>
                  </div>

                  <p className="text-[11px] text-white/35 text-center px-2">
                    Демо: скачивается текстовый файл. В полном MVP backend
                    сформирует настоящий редактируемый DOCX по правилам
                    выбранного шаблона (поля, шрифт, колонтитулы, реквизиты).
                  </p>
                </>
              )}
            </div>
          )}
        </div>  
      </main>

      <footer className="relative z-10 px-4 py-4 text-center text-[11px] text-white/30">
        MVP «Документ за 3 шага» · Первенство России 2026 · Адаптивно 320–1920px
      </footer>

      {/* Модалка с полной информацией о шаблоне */}
      {infoTemplate && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="template-info-title"
        >
          {/* Затемнение */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setTemplateInfoId(null)}
          />

          {/* Окно */}
          <div className="relative z-10 w-full sm:max-w-md max-h-[85dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl glass-strong border border-white/20 shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-black/20 backdrop-blur-md">
              <h2
                id="template-info-title"
                className="text-base sm:text-lg font-semibold truncate"
              >
                Шаблон «{infoTemplate.name}»
              </h2>
              <button
                type="button"
                onClick={() => setTemplateInfoId(null)}
                className="w-8 h-8 rounded-lg glass hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white focus-ring shrink-0"
                aria-label="Закрыть"
              >
                ✕
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4 text-sm">
              <p className="text-white/60 text-xs leading-relaxed">
                {infoTemplate.details.notes}
              </p>

              <dl className="space-y-3">
                <div>
                  <dt className="text-xs text-white/40 mb-0.5">Шрифт</dt>
                  <dd className="text-white/90">{infoTemplate.details.font}</dd>
                </div>
                <div>
                  <dt className="text-xs text-white/40 mb-0.5">Размер</dt>
                  <dd className="text-white/90">
                    {infoTemplate.details.fontSize}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-white/40 mb-0.5">Поля страницы</dt>
                  <dd className="text-white/90">
                    {infoTemplate.details.margins}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-white/40 mb-0.5">
                    Межстрочный интервал
                  </dt>
                  <dd className="text-white/90">
                    {infoTemplate.details.lineHeight}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-white/40 mb-0.5">
                    Абзацные отступы
                  </dt>
                  <dd className="text-white/90">
                    {infoTemplate.details.paragraphIndent}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-white/40 mb-0.5">Выравнивание</dt>
                  <dd className="text-white/90">
                    {infoTemplate.details.alignment}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-white/40 mb-0.5">Колонтитул (верх)</dt>
                  <dd className="text-white/90">
                    {infoTemplate.details.header}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-white/40 mb-0.5">Колонтитул (низ)</dt>
                  <dd className="text-white/90">
                    {infoTemplate.details.footer}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-white/40 mb-0.5">
                    Порядок и расположение реквизитов
                  </dt>
                  <dd className="text-white/90 whitespace-pre-line leading-relaxed">
                    {infoTemplate.details.requisitesOrder}
                  </dd>
                </div>
              </dl>

              <button
                type="button"
                onClick={() => {
                  setTemplate(infoTemplate.id);
                  setTemplateInfoId(null);
                }}
                className="w-full mt-2 px-4 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-400 text-white font-medium text-sm transition focus-ring"
              >
                Выбрать этот шаблон
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
