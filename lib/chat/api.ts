export type Credentials = {
  apiUrl: string;
  idInstance: string;
  apiTokenInstance: string;
};

export type ApiMethod =
  | 'getStateInstance'
  | 'getSettings'
  | 'checkAccount'
  | 'sendMessage'
  | 'receiveNotification'
  | 'deleteNotification';

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function callApi<T>(
  credentials: Credentials,
  method: ApiMethod,
  payload?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch('/api/green', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({credentials, method, payload}),
    signal,
    cache: 'no-store',
  });

  const result = (await response.json()) as {error?: string};
  if (!response.ok) {
    throw new ApiError(result.error || 'Не удалось выполнить запрос.', response.status);
  }

  return result as T;
}

export function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Не удалось выполнить запрос. Попробуйте ещё раз.';
}

export function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel);
      resolve();
    }, ms);

    function cancel() {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }

    signal.addEventListener('abort', cancel, {once: true});
  });
}
