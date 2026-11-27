import type {Message} from './model';

export const AI_SUMMARY_MAX_MESSAGES = 40;
export const AI_SUMMARY_MAX_CHARS = 12000;
export const AI_REQUEST_MAX_CHARS = 65536;

export type TranscriptMessage = {
  text: string;
  outgoing: boolean;
  time: number;
};

type ChatCompletionMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

// Собирает последние текстовые сообщения для модели: новые в приоритете,
// лимит по количеству и по общему объёму, порядок — от старых к новым.
export function selectRecentMessages(
  messages: ReadonlyArray<Pick<Message, 'text' | 'outgoing' | 'time'>>,
  max = AI_SUMMARY_MAX_MESSAGES,
): TranscriptMessage[] {
  const recent = messages
    .filter((message) => typeof message.text === 'string' && message.text.trim())
    .slice(-max);

  let total = 0;
  const kept: TranscriptMessage[] = [];
  for (let index = recent.length - 1; index >= 0; index--) {
    const {text, outgoing, time} = recent[index];
    total += text.length;
    if (total > AI_SUMMARY_MAX_CHARS) break;
    kept.unshift({text, outgoing, time});
  }

  return kept;
}

export function buildTranscript(messages: TranscriptMessage[]): string {
  return messages
    .map((message) => {
      const author = message.outgoing ? 'Я' : 'Собеседник';
      return `${author}: ${message.text.replace(/\s+/g, ' ').trim()}`;
    })
    .join('\n');
}

export function buildSummaryPrompt(transcript: string): ChatCompletionMessage[] {
  return [
    {
      role: 'system',
      content:
        'Ты помощник, который кратко резюмирует переписку в Telegram. Отвечай на русском языке.',
    },
    {
      role: 'user',
      content: [
        'Сделай краткое резюме переписки: 3–6 пунктов, каждый с новой строки.',
        'Без вступления, без нумерации и без markdown.',
        'Если по переписке не о чем резюмировать, напиши «Недостаточно сообщений для резюме».',
        '',
        'Переписка:',
        transcript,
      ].join('\n'),
    },
  ];
}

// Приводит ответ модели к списку пунктов: убирает маркеры списков,
// нумерацию и пустые строки.
export function parseSummary(text: string): string[] {
  const items = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-–—*•]\s*/, '').replace(/^\d+[.)]\s*/, '').trim())
    .filter(Boolean);

  if (items.length) {
    return items;
  }

  const single = text.trim();
  return single ? [single] : [];
}

export async function requestSummary(
  messages: TranscriptMessage[],
  signal?: AbortSignal,
): Promise<string[]> {
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({messages}),
    signal,
    cache: 'no-store',
  });

  const result = (await response.json().catch(() => ({}))) as {
    summary?: string[];
    error?: string;
  };

  if (!response.ok) {
    throw new Error(result.error || 'Не удалось получить резюме.');
  }

  if (!Array.isArray(result.summary) || !result.summary.length) {
    throw new Error('Модель не вернула резюме.');
  }

  return result.summary;
}
