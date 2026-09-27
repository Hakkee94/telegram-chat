'use client';

import {useEffect, useRef, useState, type FormEvent} from 'react';
import {ApiError, callApi, delay, errorText, type Credentials} from '@/lib/chat/api';
import {
  applyNotice,
  deliveryStatus,
  normalizePhone,
  upsertMessage,
  type Chat,
  type Delivery,
  type Notice,
} from '@/lib/chat/model';

const MESSAGE_LIMIT = 4096;
const MAX_RETRY_DELAY = 30_000;

type NotificationResponse = {
  receiptId: number;
  body: Notice;
};

export function useTelegram() {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [active, setActive] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [pollError, setPollError] = useState('');
  const [connection, setConnection] = useState('Не подключено');
  const [phone, setPhone] = useState('');
  const [creating, setCreating] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [newChat, setNewChat] = useState(false);
  const [query, setQuery] = useState('');

  const lifetime = useRef(new AbortController());
  const sendLock = useRef(false);
  const createLock = useRef(false);
  const statuses = useRef(new Map<string, Delivery>());

  const chat = chats.find((item) => item.id === active);
  const text = drafts[active] || '';

  useEffect(() => {
    return () => lifetime.current.abort();
  }, []);

  useEffect(() => {
    if (!credentials) return;

    const activeCredentials = credentials;

    const controller = new AbortController();
    const signal = controller.signal;
    let failures = 0;

    async function poll() {
      while (!signal.aborted) {
        try {
          const notification = await callApi<NotificationResponse | null>(
            activeCredentials,
            'receiveNotification',
            undefined,
            signal,
          );

          if (signal.aborted) return;

          failures = 0;
          setPollError('');
          setConnection('Подключено');

          if (!notification) continue;

          rememberDeliveryStatus(notification.body);
          showDeliveryError(notification.body);

          if (
            notification.body.typeWebhook === 'stateInstanceChanged' &&
            notification.body.stateInstance !== 'authorized'
          ) {
            setPollError('Аккаунт Telegram отключён. Авторизуйте его в GREEN-API и войдите заново.');
            setConnection('Аккаунт отключён');
            await acknowledge(notification.receiptId, signal);
            return;
          }

          setChats((current) => applyNotice(current, notification.body));
          await acknowledge(notification.receiptId, signal);
        } catch (pollException) {
          if (signal.aborted) return;

          setPollError(errorText(pollException));
          setConnection('Восстанавливаем связь');

          if (pollException instanceof ApiError && [401, 403, 404].includes(pollException.status)) {
            setConnection('Проверьте подключение');
            return;
          }

          failures += 1;
          const waitTime = Math.min(MAX_RETRY_DELAY, 1_000 * 2 ** Math.min(failures, 5));
          try {
            await delay(waitTime, signal);
          } catch {
            return;
          }
        }
      }
    }

    void poll();
    return () => controller.abort();

    async function acknowledge(receiptId: number, requestSignal: AbortSignal) {
      await callApi(activeCredentials, 'deleteNotification', {receiptId}, requestSignal);
    }

    function rememberDeliveryStatus(notice: Notice) {
      if (notice.typeWebhook !== 'outgoingMessageStatus' || !notice.idMessage) return;

      const nextStatus = deliveryStatus(notice.status);
      if (!nextStatus) return;

      const key = `${notice.chatId || ''}:${notice.idMessage}`;
      const previousStatus = statuses.current.get(key);
      if (previousStatus === 'read' && nextStatus === 'delivered') return;

      statuses.current.set(key, nextStatus);
    }

    function showDeliveryError(notice: Notice) {
      if (
        notice.typeWebhook === 'outgoingMessageStatus' &&
        !notice.idMessage &&
        deliveryStatus(notice.status) === 'failed'
      ) {
        setError('Telegram не смог доставить сообщение. Проверьте получателя и настройки приватности.');
      }
    }
  }, [credentials]);

  useEffect(() => {
    const context = (document as Document & {
      modelContext?: {
        registerTool: (
          tool: unknown,
          options: {signal: AbortSignal},
        ) => void | Promise<void>;
      };
    }).modelContext;

    if (!context) return;

    const controller = new AbortController();
    const tool = {
      name: 'stage_chat_message',
      description: 'Поместить текст в поле текущего чата без отправки.',
      inputSchema: {
        type: 'object',
        properties: {text: {type: 'string', maxLength: MESSAGE_LIMIT}},
        required: ['text'],
        additionalProperties: false,
      },
      execute: (input: unknown) => {
        const value = input as {text?: unknown};
        if (!active || typeof value.text !== 'string' || value.text.length > MESSAGE_LIMIT) {
          throw new Error('Выберите чат и передайте текст до 4096 символов.');
        }

        setDrafts((current) => ({...current, [active]: value.text as string}));
        return {staged: true, sent: false};
      },
    };

    try {
      void Promise.resolve(context.registerTool(tool, {signal: controller.signal})).catch(() => undefined);
    } catch {
      // ModelContext is optional and unavailable in a regular browser.
    }

    return () => controller.abort();
  }, [active]);

  async function connect(event: FormEvent<HTMLFormElement>): Promise<boolean> {
    event.preventDefault();
    if (connecting) return false;

    setError('');
    setConnecting(true);

    const data = new FormData(event.currentTarget);
    const nextCredentials: Credentials = {
      apiUrl: String(data.get('apiUrl')).trim().replace(/\/$/, ''),
      idInstance: String(data.get('idInstance')).trim(),
      apiTokenInstance: String(data.get('token')).trim(),
    };

    lifetime.current.abort();
    lifetime.current = new AbortController();
    const signal = lifetime.current.signal;

    try {
      const state = await callApi<{stateInstance: string}>(
        nextCredentials,
        'getStateInstance',
        undefined,
        signal,
      );

      if (state.stateInstance !== 'authorized') {
        throw new Error(
          `Сначала подключите аккаунт Telegram в GREEN-API. Текущее состояние: ${state.stateInstance}`,
        );
      }

      const settings = await callApi<{webhookUrl?: string; incomingWebhook?: string}>(
        nextCredentials,
        'getSettings',
        undefined,
        signal,
      );

      if (settings.webhookUrl) {
        throw new Error('В настройках инстанса очистите Webhook URL для получения сообщений через HTTP API.');
      }

      if (settings.incomingWebhook !== 'yes') {
        throw new Error('Включите получение уведомлений о входящих сообщениях в GREEN-API.');
      }

      setCredentials(nextCredentials);
      setConnection('Подключено');
      return true;
    } catch (connectException) {
      if (!signal.aborted) setError(errorText(connectException));
      return false;
    } finally {
      if (!signal.aborted) setConnecting(false);
    }
  }

  function logout() {
    lifetime.current.abort();
    setCredentials(null);
    setChats([]);
    setActive('');
    setDrafts({});
    setPhone('');
    setError('');
    setPollError('');
    setConnection('Не подключено');
    setNewChat(false);
    setQuery('');
    statuses.current.clear();
  }

  async function createChat(event: FormEvent) {
    event.preventDefault();
    if (createLock.current) return;

    if (!credentials) {
      setError('Сначала подключите GREEN-API через меню.');
      return;
    }

    setError('');
    createLock.current = true;
    setCreating(true);

    try {
      const normalized = normalizePhone(phone);
      const existing = chats.find((item) => item.phone === normalized);

      if (existing) {
        selectChat(existing.id);
        setNewChat(false);
        return;
      }

      const account = await callApi<{exist?: boolean; chatId?: string; status?: boolean}>(
        credentials,
        'checkAccount',
        {phoneNumber: Number(normalized)},
        lifetime.current.signal,
      );

      if (account.status === false) {
        throw new Error('Не удалось проверить номер. Проверьте состояние инстанса и лимиты Telegram.');
      }
      if (!account.exist || !account.chatId) {
        throw new Error('Telegram не нашёл этот номер. Проверьте номер и настройки приватности получателя.');
      }

      const id = account.chatId;
      setChats((current) =>
        current.some((item) => item.id === id)
          ? current.map((item) => (item.id === id ? {...item, phone: normalized} : item))
          : [...current, {id, name: `+${normalized}`, phone: normalized, messages: []}],
      );
      selectChat(id);
      setPhone('');
      setNewChat(false);
    } catch (createException) {
      if (!lifetime.current.signal.aborted) setError(errorText(createException));
    } finally {
      createLock.current = false;
      setCreating(false);
    }
  }

  async function send() {
    if (sendLock.current) return;
    if (!credentials) {
      setError('Сначала подключите GREEN-API через меню.');
      return;
    }
    if (!active || !text.trim() || text.length > MESSAGE_LIMIT) return;

    const content = text.trim();
    const localId = crypto.randomUUID();
    const targetChatId = active;
    const signal = lifetime.current.signal;

    sendLock.current = true;
    setSending(true);
    setError('');
    setDrafts((current) => ({...current, [targetChatId]: ''}));
    setChats((current) =>
      upsertMessage(current, targetChatId, {
        id: localId,
        text: content,
        time: Date.now(),
        outgoing: true,
        status: 'sending',
      }),
    );

    try {
      const result = await callApi<{idMessage: string}>(
        credentials,
        'sendMessage',
        {chatId: targetChatId, message: content},
        signal,
      );

      if (signal.aborted) return;
      if (!result.idMessage) {
        throw new Error('API не подтвердил отправку. Проверьте сообщение в Telegram перед повтором.');
      }

      setChats((current) =>
        current.map((chatItem) => {
          if (chatItem.id !== targetChatId) return chatItem;

          return {
            ...chatItem,
            messages: chatItem.messages
              .filter((message) => message.id !== result.idMessage)
              .map((message) =>
                message.id === localId
                  ? {
                      ...message,
                      id: result.idMessage,
                      status: statuses.current.get(`${targetChatId}:${result.idMessage}`) || 'accepted',
                    }
                  : message,
              ),
          };
        }),
      );
    } catch (sendException) {
      if (!signal.aborted) {
        const isClientError = sendException instanceof ApiError && sendException.status >= 400 && sendException.status < 500;
        setChats((current) =>
          current.map((chatItem) => ({
            ...chatItem,
            messages: chatItem.messages.map((message) =>
              message.id === localId
                ? {...message, status: isClientError ? 'failed' : 'unknown'}
                : message,
            ),
          })),
        );
        setError(errorText(sendException));
      }
    } finally {
      sendLock.current = false;
      setSending(false);
    }
  }

  function selectChat(id: string) {
    setActive(id);
    setError('');
  }

  function setText(value: string) {
    setDrafts((current) => ({...current, [active]: value}));
  }

  return {
    credentials,
    chats,
    active,
    chat,
    text,
    connecting,
    error,
    pollError,
    connection,
    phone,
    creating,
    sending,
    newChat,
    query,
    connect,
    logout,
    createChat,
    send,
    setPhone,
    setNewChat,
    setQuery,
    setError,
    selectChat,
    setText,
  };
}
