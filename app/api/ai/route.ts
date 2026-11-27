import {
  AI_REQUEST_MAX_CHARS,
  AI_SUMMARY_MAX_MESSAGES,
  buildSummaryPrompt,
  buildTranscript,
  parseSummary,
  selectRecentMessages,
  type TranscriptMessage,
} from '@/lib/chat/ai';

const AI_TIMEOUT_MS = 45000;
const DEFAULT_API_BASE = 'https://api.z.ai/api/paas/v4';

const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {'Cache-Control': 'no-store'},
  });

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return json({error: 'Запрос с другого сайта запрещён.'}, 403);
  }

  const config = readConfig();
  if (!config) {
    return json(
      {error: 'AI не настроен: задайте переменные окружения AI_API_KEY и AI_MODEL.'},
      503,
    );
  }

  try {
    const raw = await request.text();
    if (raw.length > AI_REQUEST_MAX_CHARS) {
      return json({error: 'Слишком большой запрос.'}, 413);
    }

    const body = JSON.parse(raw) as {messages?: TranscriptMessage[]};
    const messages = body.messages;
    if (!Array.isArray(messages) || !messages.length) {
      return json({error: 'Нет сообщений для резюме.'}, 400);
    }

    if (messages.length > AI_SUMMARY_MAX_MESSAGES * 4) {
      return json({error: 'Слишком много сообщений в запросе.'}, 400);
    }

    for (const message of messages) {
      if (
        !message ||
        typeof message.text !== 'string' ||
        !message.text.trim() ||
        typeof message.outgoing !== 'boolean'
      ) {
        return json({error: 'Переданы некорректные сообщения.'}, 400);
      }
    }

    const transcript = buildTranscript(selectRecentMessages(messages));
    if (!transcript.trim()) {
      return json({error: 'Нет текстовых сообщений для резюме.'}, 400);
    }

    const upstream = await fetch(`${config.apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: buildSummaryPrompt(transcript),
        stream: false,
        temperature: 0.3,
        max_tokens: 1024,
      }),
      redirect: 'manual',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(AI_TIMEOUT_MS)]),
      cache: 'no-store',
    });

    if (upstream.status === 401 || upstream.status === 403) {
      return json({error: 'Ключ AI-сервиса отклонён. Проверьте AI_API_KEY.'}, 502);
    }

    if (upstream.status === 429) {
      return json({error: 'Слишком много запросов к AI-сервису. Попробуйте позже.'}, 502);
    }

    if (!upstream.ok) {
      return json({error: `AI-сервис вернул ошибку (HTTP ${upstream.status}).`}, 502);
    }

    const completion = (await upstream.json()) as {
      choices?: Array<{message?: {content?: string}}>;
    };
    const content = completion.choices?.[0]?.message?.content || '';
    const summary = parseSummary(content);
    if (!summary.length) {
      return json({error: 'Модель не вернула резюме. Попробуйте ещё раз.'}, 502);
    }

    return json({summary});
  } catch (error) {
    if (error instanceof SyntaxError) {
      return json({error: 'Некорректный формат запроса.'}, 400);
    }

    if (error instanceof Error && error.name === 'TimeoutError') {
      return json({error: 'AI-сервис не ответил вовремя. Попробуйте позже.'}, 504);
    }

    return json({error: 'AI-сервис недоступен. Проверьте настройки и подключение.'}, 502);
  }
}

type AiConfig = {
  apiBase: string;
  apiKey: string;
  model: string;
};

function readConfig(): AiConfig | null {
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;
  if (!apiKey || !model) {
    return null;
  }

  const base = process.env.AI_API_BASE || DEFAULT_API_BASE;
  try {
    const url = new URL(base);
    if (url.protocol !== 'https:' && url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
      return null;
    }

    return {apiBase: url.origin.replace(/\/$/, ''), apiKey, model};
  } catch {
    return null;
  }
}
