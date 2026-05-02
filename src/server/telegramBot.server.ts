// Telegram bot logic for Vot Malta 2026.
// Handles incoming Telegram updates with slash commands routing to the
// existing knowledge base (parties, candidates, proposals, FAQs).

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

type TgMessage = {
  message_id: number;
  chat: { id: number; type: string };
  from?: { id: number; username?: string; first_name?: string };
  text?: string;
};

type TgCallbackQuery = {
  id: string;
  from: { id: number; username?: string; first_name?: string };
  message?: TgMessage;
  data?: string;
};

type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
};

type InlineKeyboard = { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
type TelegramGatewayResponse = { ok?: boolean; result?: unknown; [key: string]: unknown };

function getEnv() {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
  const TELEGRAM_API_KEY = process.env.TELEGRAM_API_KEY;
  if (!TELEGRAM_API_KEY) throw new Error("TELEGRAM_API_KEY is not configured");
  return { LOVABLE_API_KEY, TELEGRAM_API_KEY };
}

async function tgCall(path: string, body: Record<string, unknown>): Promise<TelegramGatewayResponse> {
  const { LOVABLE_API_KEY, TELEGRAM_API_KEY } = getEnv();
  let lastError = "unknown error";

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const resp = await fetch(`${GATEWAY_URL}/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TELEGRAM_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const raw = await resp.text();
    let data: TelegramGatewayResponse = {};
    try {
      const parsed = raw ? JSON.parse(raw) : {};
      data = parsed && typeof parsed === "object" ? (parsed as TelegramGatewayResponse) : { raw: parsed };
    } catch {
      data = { raw };
    }

    if (resp.ok) return data;

    lastError = `Telegram ${path} failed [${resp.status}]: ${JSON.stringify(data)}`;
    const retryable = resp.status === 429 || resp.status >= 500;
    if (!retryable || attempt === 3) break;
    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }

  throw new Error(lastError);
}

async function sendMessage(
  chatId: number,
  text: string,
  replyMarkup?: InlineKeyboard
): Promise<{ message_id: number } | null> {
  // Telegram limit is 4096 chars per message.
  const chunk = text.length > 4000 ? text.slice(0, 3990) + "\n…(truncated)" : text;
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: chunk,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (replyMarkup) body.reply_markup = replyMarkup;
  const data = await tgCall("sendMessage", body);
  const result = data.result;
  if (result && typeof result === "object" && "message_id" in result) {
    return { message_id: Number(result.message_id) };
  }
  return null;
}

// Neutral feedback keyboard. Encoded as `fb:<up|down>` — no per-message ID
// needed because we key feedback rows on (chat_id, message_id, user_id).
function feedbackKeyboard(): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "👍 Helpful", callback_data: "fb:up" },
        { text: "👎 Not helpful", callback_data: "fb:down" },
      ],
    ],
  };
}

const HELP_TEXT = `<b>Vot Malta 2026 — Bot</b>
Neutral, non-partisan helper for Malta's 30 May 2026 General Election.

<b>Commands</b>
/candidates [district|name] — list or search candidates
/party [name|short] — show party info and proposals
/proposals [keyword|party] — search published proposals
/faq [keyword] — search voting FAQs
/ask &lt;question&gt; — ask the assistant anything
/help — show this message

Examples:
<code>/candidates 5</code>
<code>/candidates abela</code>
<code>/party PL</code>
<code>/proposals housing</code>
<code>/proposals PL</code>
<code>/faq id card</code>
<code>/ask When do polls open?</code>`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function handleCandidates(arg: string): Promise<string> {
  const a = arg.trim();
  if (!a) {
    return "Usage: <code>/candidates &lt;district number&gt;</code> or <code>/candidates &lt;name&gt;</code>";
  }

  // District number (1-13)?
  const n = Number(a);
  if (Number.isInteger(n) && n >= 1 && n <= 13) {
    const { data: d } = await supabaseAdmin
      .from("districts")
      .select("id, number, name_en")
      .eq("number", n)
      .eq("status", "published")
      .maybeSingle();
    if (!d) return `No published district found for number ${n}.`;
    const { data: cands } = await supabaseAdmin
      .from("candidates")
      .select("full_name, party:parties(short_name, name_en)")
      .eq("status", "published")
      .eq("primary_district_id", d.id)
      .order("full_name", { ascending: true })
      .limit(50);
    if (!cands || cands.length === 0) {
      return `District ${n} (${escapeHtml(d.name_en)}): no published candidates yet.`;
    }
    const lines = cands.map((c) => {
      const p = (c.party as { short_name?: string; name_en?: string } | null);
      const party = p?.short_name || p?.name_en || "Independent";
      return `• ${escapeHtml(c.full_name)} — <i>${escapeHtml(party)}</i>`;
    });
    return `<b>District ${n} — ${escapeHtml(d.name_en)}</b>\n${lines.join("\n")}`;
  }

  // Name search
  const { data: cands } = await supabaseAdmin
    .from("candidates")
    .select("full_name, slug, party:parties(short_name, name_en), primary_district:districts!candidates_primary_district_id_fkey(number)")
    .eq("status", "published")
    .ilike("full_name", `%${a}%`)
    .order("full_name", { ascending: true })
    .limit(15);
  if (!cands || cands.length === 0) {
    return `No candidates found matching "${escapeHtml(a)}".`;
  }
  const lines = cands.map((c) => {
    const p = c.party as { short_name?: string; name_en?: string } | null;
    const party = p?.short_name || p?.name_en || "Independent";
    const dist = (c.primary_district as { number?: number } | null)?.number;
    return `• ${escapeHtml(c.full_name)} — <i>${escapeHtml(party)}</i>${dist ? ` (D${dist})` : ""}`;
  });
  return `<b>Candidates matching "${escapeHtml(a)}"</b>\n${lines.join("\n")}`;
}

async function handleParty(arg: string): Promise<string> {
  const a = arg.trim();
  if (!a) {
    const { data: parties } = await supabaseAdmin
      .from("parties")
      .select("short_name, name_en")
      .eq("status", "published")
      .order("name_en");
    const list = (parties ?? [])
      .map((p) => `• ${escapeHtml(p.short_name || "")} — ${escapeHtml(p.name_en)}`)
      .join("\n");
    return `<b>Parties</b>\n${list}\n\nUse <code>/party &lt;short name&gt;</code> for details.`;
  }
  const { data: party } = await supabaseAdmin
    .from("parties")
    .select("id, name_en, short_name, description_en, leader_name, website, slogan_en")
    .eq("status", "published")
    .or(`short_name.ilike.${a},name_en.ilike.%${a}%,slug.ilike.%${a}%`)
    .limit(1)
    .maybeSingle();
  if (!party) return `No party found matching "${escapeHtml(a)}".`;

  const { data: props } = await supabaseAdmin
    .from("proposals")
    .select("title_en")
    .eq("status", "published")
    .eq("party_id", party.id)
    .limit(8);

  const lines = [
    `<b>${escapeHtml(party.name_en)}${party.short_name ? ` (${escapeHtml(party.short_name)})` : ""}</b>`,
  ];
  if (party.slogan_en) lines.push(`<i>${escapeHtml(party.slogan_en)}</i>`);
  if (party.leader_name) lines.push(`Leader: ${escapeHtml(party.leader_name)}`);
  if (party.website) lines.push(`Website: ${escapeHtml(party.website)}`);
  if (party.description_en) lines.push(`\n${escapeHtml(party.description_en.slice(0, 500))}`);
  if (props && props.length > 0) {
    lines.push(`\n<b>Top proposals</b>`);
    for (const p of props) lines.push(`• ${escapeHtml(p.title_en)}`);
  }
  return lines.join("\n");
}

async function handleProposals(arg: string): Promise<string> {
  const a = arg.trim();
  if (!a) {
    return "Usage: <code>/proposals &lt;keyword&gt;</code> or <code>/proposals &lt;party short name&gt;</code>";
  }

  // Try matching a party first (short name or name)
  const { data: party } = await supabaseAdmin
    .from("parties")
    .select("id, name_en, short_name")
    .eq("status", "published")
    .or(`short_name.ilike.${a},name_en.ilike.%${a}%,slug.ilike.%${a}%`)
    .limit(1)
    .maybeSingle();

  let query = supabaseAdmin
    .from("proposals")
    .select("title_en, description_en, party:parties(short_name, name_en)")
    .eq("status", "published")
    .order("updated_at", { ascending: false })
    .limit(10);

  let header: string;
  if (party) {
    query = query.eq("party_id", party.id);
    header = `<b>Proposals — ${escapeHtml(party.name_en)}${party.short_name ? ` (${escapeHtml(party.short_name)})` : ""}</b>`;
  } else {
    query = query.or(`title_en.ilike.%${a}%,description_en.ilike.%${a}%`);
    header = `<b>Proposals matching "${escapeHtml(a)}"</b>`;
  }

  const { data: props } = await query;
  if (!props || props.length === 0) {
    return `No published proposals found for "${escapeHtml(a)}".`;
  }

  const lines = props.map((p) => {
    const pty = p.party as { short_name?: string; name_en?: string } | null;
    const tag = pty?.short_name || pty?.name_en;
    const desc = p.description_en ? ` — ${escapeHtml(p.description_en.slice(0, 140))}` : "";
    return `• <b>${escapeHtml(p.title_en)}</b>${tag ? ` <i>(${escapeHtml(tag)})</i>` : ""}${desc}`;
  });
  return `${header}\n${lines.join("\n")}`;
}

async function handleFaq(arg: string): Promise<string> {
  const a = arg.trim();
  let query = supabaseAdmin
    .from("voting_faqs")
    .select("question_en, answer_en")
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .limit(8);
  if (a) {
    query = query.or(`question_en.ilike.%${a}%,answer_en.ilike.%${a}%`);
  }
  const { data: faqs } = await query;
  if (!faqs || faqs.length === 0) {
    return a ? `No FAQs found matching "${escapeHtml(a)}".` : `No FAQs published yet.`;
  }
  const blocks = faqs.map(
    (f) =>
      `<b>${escapeHtml(f.question_en ?? "(untitled)")}</b>\n${escapeHtml((f.answer_en ?? "").slice(0, 500))}`
  );
  return blocks.join("\n\n");
}

async function handleAsk(arg: string): Promise<string> {
  const q = arg.trim();
  if (!q) return "Usage: <code>/ask &lt;your question&gt;</code>";

  const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const ANON = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !ANON) return "Assistant is unavailable right now.";

  const resp = await fetch(`${SUPABASE_URL}/functions/v1/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({ messages: [{ role: "user", content: q }] }),
  });
  if (!resp.ok || !resp.body) {
    return "Sorry, the assistant could not answer right now.";
  }
  // Read the streamed SSE response and concatenate the text deltas.
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let out = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const j = JSON.parse(payload);
        const delta = j.choices?.[0]?.delta?.content;
        if (typeof delta === "string") out += delta;
      } catch {
        // ignore malformed chunks
      }
    }
  }
  return out.trim() ? escapeHtml(out.trim()) : "I couldn't compose an answer.";
}

async function routeCommand(text: string): Promise<{ command: string; response: string }> {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return {
      command: "ask",
      response: await handleAsk(trimmed),
    };
  }
  // strip @botname suffix and extract args
  const match = trimmed.match(/^\/([a-zA-Z_]+)(?:@\S+)?\s*(.*)$/s);
  if (!match) return { command: "unknown", response: HELP_TEXT };
  const cmd = match[1].toLowerCase();
  const arg = match[2] ?? "";

  switch (cmd) {
    case "start":
    case "help":
      return { command: cmd, response: HELP_TEXT };
    case "candidates":
    case "candidate":
      return { command: "candidates", response: await handleCandidates(arg) };
    case "party":
    case "parties":
      return { command: "party", response: await handleParty(arg) };
    case "proposals":
    case "proposal":
      return { command: "proposals", response: await handleProposals(arg) };
    case "faq":
    case "faqs":
      return { command: "faq", response: await handleFaq(arg) };
    case "ask":
      return { command: "ask", response: await handleAsk(arg) };
    default:
      return { command: cmd, response: `Unknown command: <code>/${escapeHtml(cmd)}</code>\n\n${HELP_TEXT}` };
  }
}

// Commands where feedback is meaningful. We skip /help and unknown commands
// since rating those would just be noise.
const FEEDBACK_COMMANDS = new Set(["candidates", "party", "proposals", "faq", "ask"]);

async function processMessage(update: TgUpdate): Promise<void> {
  const msg = update.message;
  if (!msg || !msg.text) return;
  const chatId = msg.chat.id;
  const text = msg.text;

  let command = "unknown";
  let response = "";
  let ok = true;
  try {
    const r = await routeCommand(text);
    command = r.command;
    response = r.response;
  } catch (e) {
    console.error("telegram routeCommand error", e);
    response = "Something went wrong handling your message. Please try again.";
    ok = false;
  }

  let sentMessageId: number | null = null;
  try {
    const wantsFeedback = ok && FEEDBACK_COMMANDS.has(command);
    const sent = await sendMessage(
      chatId,
      response,
      wantsFeedback ? feedbackKeyboard() : undefined
    );
    sentMessageId = sent?.message_id ?? null;
  } catch (e) {
    console.error("telegram sendMessage error", e);
  }

  await supabaseAdmin.from("telegram_messages").upsert(
    [
      {
        update_id: update.update_id,
        chat_id: chatId,
        username: msg.from?.username ?? null,
        text,
        command,
        response: response.slice(0, 4000),
        raw_update: JSON.parse(JSON.stringify(update)),
      },
    ],
    { onConflict: "update_id" }
  );

  // Cache the (question, answer) for the bot message so we can attach context
  // to feedback rows when the user later taps 👍/👎. We piggy-back on the
  // telegram_messages table by writing a row keyed on the bot's update_id-like
  // identifier — but simplest is a tiny in-table mapping via raw_update.
  // To avoid a new table, we store the bot answer reference in raw_update of
  // a synthetic row. We use negative update_id space derived from message_id.
  if (sentMessageId !== null && FEEDBACK_COMMANDS.has(command)) {
    await supabaseAdmin.from("telegram_messages").upsert(
      [
        {
          // Synthetic update_id: negative so it never collides with real
          // Telegram update IDs (which are positive bigints).
          update_id: -((BigInt(chatId) * 1000000n + BigInt(sentMessageId)) as unknown as number),
          chat_id: chatId,
          username: null,
          text: null,
          command: `bot_answer:${command}`,
          response: response.slice(0, 4000),
          raw_update: {
            kind: "bot_answer",
            chat_id: chatId,
            message_id: sentMessageId,
            question: text,
          },
        },
      ],
      { onConflict: "update_id" }
    );
  }
}

async function processCallbackQuery(update: TgUpdate): Promise<void> {
  const cq = update.callback_query;
  if (!cq) return;
  const data = cq.data ?? "";
  const msg = cq.message;
  if (!msg) {
    await tgCall("answerCallbackQuery", { callback_query_id: cq.id });
    return;
  }
  const chatId = msg.chat.id;
  const messageId = msg.message_id;

  if (!data.startsWith("fb:")) {
    await tgCall("answerCallbackQuery", { callback_query_id: cq.id });
    return;
  }
  const verdict = data.slice(3);
  const rating = verdict === "up" ? 1 : verdict === "down" ? -1 : 0;
  if (rating === 0) {
    await tgCall("answerCallbackQuery", { callback_query_id: cq.id });
    return;
  }

  // Look up the cached question/answer/command for this bot message.
  const syntheticId = -((BigInt(chatId) * 1000000n + BigInt(messageId)) as unknown as number);
  const { data: ctx } = await supabaseAdmin
    .from("telegram_messages")
    .select("command, response, raw_update")
    .eq("update_id", syntheticId)
    .maybeSingle();

  const rawUpdate = (ctx?.raw_update ?? {}) as { question?: string };
  const question = rawUpdate.question ?? null;
  const answer = ctx?.response ?? null;
  const command = (ctx?.command ?? "").replace(/^bot_answer:/, "") || null;

  // Insert (or update) feedback. ON CONFLICT lets users change their mind.
  const { error: insErr } = await supabaseAdmin.from("telegram_feedback").upsert(
    [
      {
        chat_id: chatId,
        message_id: messageId,
        user_id: cq.from.id,
        username: cq.from.username ?? null,
        command,
        rating,
        question,
        answer: answer ? String(answer).slice(0, 4000) : null,
      },
    ],
    { onConflict: "chat_id,message_id,user_id" }
  );
  if (insErr) console.error("telegram_feedback upsert error", insErr);

  // Replace the keyboard with a neutral acknowledgement so the same user
  // doesn't keep tapping. Both choices get the same thank-you so the UI
  // doesn't reward one direction over the other.
  try {
    await tgCall("editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [[{ text: "✓ Thanks for the feedback", callback_data: "fb:noop" }]],
      },
    });
  } catch (e) {
    // Editing can fail if the message is too old; ignore.
    console.warn("editMessageReplyMarkup failed", e);
  }
  await tgCall("answerCallbackQuery", {
    callback_query_id: cq.id,
    text: "Thanks — recorded.",
  });
}

async function processUpdate(update: TgUpdate): Promise<void> {
  if (update.callback_query) {
    try {
      await processCallbackQuery(update);
    } catch (e) {
      console.error("telegram processCallbackQuery error", e);
    }
    return;
  }
  await processMessage(update);
}

const MAX_RUNTIME_MS = 50_000;
const MIN_REMAINING_MS = 5_000;

export async function runTelegramPoll(): Promise<{
  ok: boolean;
  processed: number;
  finalOffset: number;
}> {
  const { data: state, error: stateErr } = await supabaseAdmin
    .from("telegram_bot_state")
    .select("update_offset")
    .eq("id", 1)
    .single();
  if (stateErr) throw new Error(stateErr.message);

  let currentOffset = Number(state.update_offset);
  let totalProcessed = 0;
  const startTime = Date.now();

  while (true) {
    const elapsed = Date.now() - startTime;
    const remainingMs = MAX_RUNTIME_MS - elapsed;
    if (remainingMs < MIN_REMAINING_MS) break;
    const timeout = Math.min(45, Math.floor(remainingMs / 1000) - 5);
    if (timeout < 1) break;

    const data = await tgCall("getUpdates", {
      offset: currentOffset,
      timeout,
      allowed_updates: ["message", "callback_query"],
    });
    const updates = (data.result ?? []) as TgUpdate[];
    if (updates.length === 0) continue;

    for (const u of updates) {
      await processUpdate(u);
      totalProcessed += 1;
    }

    const newOffset = Math.max(...updates.map((u) => u.update_id)) + 1;
    const { error: offsetErr } = await supabaseAdmin
      .from("telegram_bot_state")
      .update({ update_offset: newOffset, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (offsetErr) throw new Error(offsetErr.message);
    currentOffset = newOffset;
  }

  return { ok: true, processed: totalProcessed, finalOffset: currentOffset };
}
