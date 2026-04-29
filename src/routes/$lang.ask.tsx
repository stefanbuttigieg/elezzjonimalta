import { createFileRoute } from "@tanstack/react-router";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Send, Sparkles, AlertTriangle, RotateCcw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useT } from "@/i18n/useT";
import { isLocale } from "@/i18n/types";

const askSearchSchema = z.object({
  q: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/$lang/ask")({
  validateSearch: zodValidator(askSearchSchema),
  component: AskPage,
});

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

function AskPage() {
  const t = useT();
  const { lang } = Route.useParams();
  const search = Route.useSearch();
  const locale = isLocale(lang) ? lang : "en";

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState(search.q ?? "");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoSentRef = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isStreaming]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    setError(null);
    const userMsg: Msg = { role: "user", content: trimmed };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setIsStreaming(true);

    let assistantSoFar = "";
    const upsert = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content: assistantSoFar } : m,
          );
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: next }),
      });

      if (!resp.ok || !resp.body) {
        if (resp.status === 429) {
          setError(t("ask.error.rate"));
        } else if (resp.status === 402) {
          setError(t("ask.error.credits"));
        } else {
          setError(t("ask.error.generic"));
        }
        setIsStreaming(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;

      while (!done) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") {
            done = true;
            break;
          }
          try {
            const parsed = JSON.parse(json);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsert(content);
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } catch (e) {
      console.error(e);
      setError(t("ask.error.generic"));
    } finally {
      setIsStreaming(false);
    }
  }

  // Auto-send if user arrived with ?q= prefill
  useEffect(() => {
    if (autoSentRef.current) return;
    if (search.q && search.q.trim().length > 0) {
      autoSentRef.current = true;
      void send(search.q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  const suggestions =
    locale === "mt"
      ? [
          "Liema huma l-proposti ewlenin tal-Partit Laburista?",
          "X'jagħmlu d-distretti elettorali ta' Malta?",
          "Min huma l-kandidati tan-Nazzjonalisti fid-distrett 1?",
        ]
      : [
          "What are Labour's main proposals for 2026?",
          "Which parties are contesting the 2026 election?",
          "Who are the new Nationalist candidates this year?",
        ];

  return (
    <section className="border-b border-border bg-background">
      <div className="container mx-auto flex h-[calc(100vh-4rem)] max-w-3xl flex-col px-4 py-6 md:py-10">
        <header className="shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h1 className="font-serif text-2xl font-bold text-foreground md:text-3xl">
              {t("ask.title")}
            </h1>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{t("ask.subtitle")}</p>
        </header>

        <div
          ref={scrollRef}
          className="mt-4 flex-1 space-y-4 overflow-y-auto rounded-xl border border-border bg-surface p-4 shadow-card"
        >
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <Sparkles className="h-8 w-8 text-muted-foreground" />
              <p className="max-w-md text-sm text-muted-foreground">{t("ask.empty")}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => <Bubble key={i} role={m.role} content={m.content} />)
          )}
          {isStreaming && messages[messages.length - 1]?.role === "user" ? (
            <Bubble role="assistant" content="…" />
          ) : null}
        </div>

        {error ? (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="mt-3 flex shrink-0 items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={2}
            placeholder={t("ask.placeholder")}
            disabled={isStreaming}
            className="flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
          />
          <div className="flex flex-col gap-2">
            <button
              type="submit"
              disabled={isStreaming || input.trim().length === 0}
              className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {t("ask.send")}
            </button>
            {messages.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setMessages([]);
                  setError(null);
                }}
                disabled={isStreaming}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-semibold text-muted-foreground hover:bg-accent"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t("ask.reset")}
              </button>
            ) : null}
          </div>
        </form>

        <p className="mt-2 shrink-0 text-center text-xs text-muted-foreground">
          {t("ask.disclaimer")}
        </p>
      </div>
    </section>
  );
}

function Bubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed " +
          (isUser
            ? "bg-primary text-primary-foreground"
            : "border border-border bg-background text-foreground")
        }
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <div className="prose prose-sm max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-headings:font-serif prose-headings:text-foreground prose-strong:text-foreground">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
