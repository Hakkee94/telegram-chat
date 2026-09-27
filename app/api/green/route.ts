import type {ApiMethod} from '@/lib/chat/api';

const allowedMethods = new Set<ApiMethod>([
  'getStateInstance',
  'getSettings',
  'checkAccount',
  'sendMessage',
  'receiveNotification',
  'deleteNotification',
]);

const allowedHost = /^(?:\d+\.)?api\.green-api\.com$/;

type GreenCredentials = {
  apiUrl: string;
  idInstance: string;
  apiTokenInstance: string;
};

type RequestBody = {
  credentials?: GreenCredentials;
  method?: ApiMethod;
  payload?: {
    chatId?: string;
    message?: string;
    phoneNumber?: number;
    receiptId?: number;
  };
};

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

  try {
    const raw = await request.text();
    if (raw.length > 24096) {
      return json({error: 'Слишком большой запрос.'}, 413);
    }

    const body = JSON.parse(raw) as RequestBody;
    const credentials = body.credentials;
    const method = body.method;

    if (!credentials || !isValidCredentials(credentials) || !method || !allowedMethods.has(method)) {
      return json({error: 'Проверьте данные подключения GREEN-API.'}, 400);
    }

    const apiUrl = new URL(credentials.apiUrl);
    if (!isAllowedApiUrl(apiUrl)) {
      return json({error: 'Адрес сервиса GREEN-API указан неверно.'}, 400);
    }

    const validationError = validatePayload(method, body.payload);
    if (validationError) {
      return json({error: validationError}, 400);
    }

    const upstream = await fetch(buildApiUrl(apiUrl, credentials, method, body.payload), {
      method: httpMethod(method),
      headers: {'Content-Type': 'application/json'},
      body: requestPayload(method, body.payload),
      redirect: 'manual',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(40960)]),
      cache: 'no-store',
    });

    if (upstream.status >= 300 && upstream.status < 400) {
      return json({error: 'GREEN-API вернул перенаправление. Проверьте apiUrl.'}, 502);
    }

    if (!upstream.ok) {
      return json({error: upstreamError(upstream.status)}, upstream.status);
    }

    return json(await upstream.json());
  } catch (error) {
    if (error instanceof SyntaxError) {
      return json({error: 'Некорректный формат запроса.'}, 400);
    }

    if (error instanceof TypeError && error.message.includes('URL')) {
      return json({error: 'Проверьте формат apiUrl.'}, 400);
    }

    const details = error instanceof Error && error.message ? ` (${error.message})` : '';
    return json({error: `Нет ответа от GREEN-API. Проверьте apiUrl и подключение инстанса${details}`}, 502);
  }
}

function isValidCredentials(credentials: GreenCredentials): boolean {
  return (
    typeof credentials.apiUrl === 'string' &&
    /^\d{6,20}$/.test(credentials.idInstance) &&
    /^[a-zA-Z0-9_-]{10,256}$/.test(credentials.apiTokenInstance)
  );
}

function isAllowedApiUrl(url: URL): boolean {
  return (
    url.protocol === 'https:' &&
    allowedHost.test(url.hostname) &&
    !url.port &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    url.pathname === '/'
  );
}

function buildApiUrl(
  base: URL,
  credentials: GreenCredentials,
  method: ApiMethod,
  payload?: RequestBody['payload'],
): string {
  const url = `${base.origin}/waInstance${credentials.idInstance}/${method}/${credentials.apiTokenInstance}`;
  if (method === 'receiveNotification') {
    return `${url}?receiveTimeout=25`;
  }
  if (method === 'deleteNotification') {
    return `${url}/${payload?.receiptId}`;
  }
  return url;
}

function httpMethod(method: ApiMethod): 'GET' | 'POST' | 'DELETE' {
  if (method === 'deleteNotification') return 'DELETE';
  if (method === 'sendMessage' || method === 'checkAccount') return 'POST';
  return 'GET';
}

function requestPayload(method: ApiMethod, payload?: RequestBody['payload']): string | undefined {
  if (method === 'sendMessage') {
    return JSON.stringify({chatId: payload?.chatId, message: payload?.message});
  }
  if (method === 'checkAccount') {
    return JSON.stringify({phoneNumber: payload?.phoneNumber});
  }
}

function validatePayload(method: ApiMethod, payload?: RequestBody['payload']): string | null {
  if (method === 'sendMessage') {
    const validChatId = typeof payload?.chatId === 'string' && /^-?\d+(?:@c\.us)?$/.test(payload.chatId);
    const validMessage = typeof payload?.message === 'string' && payload.message.trim().length > 0 && payload.message.length <= 4096;
    if (!validChatId || !validMessage) {
      return 'Некорректный получатель или текст. Лимит — 4096 символов.';
    }
  }

  if (method === 'checkAccount' && !/^[1-9]\d{6,14}$/.test(String(payload?.phoneNumber))) {
    return 'Проверьте номер телефона.';
  }

  if (method === 'deleteNotification' && (!Number.isSafeInteger(payload?.receiptId) || (payload?.receiptId ?? -1) < 0)) {
    return 'Некорректное уведомление.';
  }

  return null;
}

function upstreamError(status: number): string {
  const messages: Record<number, string> = {
    400: 'GREEN-API отклонил запрос. Проверьте данные и настройки инстанса.',
    401: 'Неверные учётные данные GREEN-API.',
    403: 'Доступ запрещён. Проверьте токен, тариф и ограничения аккаунта.',
    404: 'Инстанс не найден. Проверьте ID инстанса.',
    429: 'Слишком много запросов. Подождите немного.',
    469: 'Telegram ограничил проверку номеров. Попробуйте позже.',
  };

  return messages[status] || `GREEN-API временно недоступен (HTTP ${status}).`;
}
