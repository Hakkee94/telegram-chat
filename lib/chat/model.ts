export type Delivery =
  | 'sending'
  | 'accepted'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'unknown';

export type Message = {
  id: string;
  text: string;
  time: number;
  outgoing: boolean;
  status?: Delivery;
};

export type Chat = {
  id: string;
  name: string;
  phone?: string;
  messages: Message[];
};

export type Notice = {
  typeWebhook?: string;
  idMessage?: string;
  timestamp?: number;
  chatId?: string;
  status?: string;
  stateInstance?: string;
  senderData?: {
    chatId?: string;
    chatName?: string;
    senderName?: string;
    senderPhoneNumber?: number;
  };
  messageData?: {
    textMessageData?: {textMessage?: string};
    extendedTextMessageData?: {text?: string};
  };
};

export function normalizePhone(input: string): string {
  if (!/^[+\d\s()-]+$/.test(input)) {
    throw new Error('Введите номер телефона без букв.');
  }

  let phone = input.replace(/\D/g, '');
  if (phone.length === 11 && phone.startsWith('8')) {
    phone = `7${phone.slice(1)}`;
  }

  if (!/^[1-9]\d{6,14}$/.test(phone)) {
    throw new Error('Введите международный номер с кодом страны: от 7 до 15 цифр.');
  }

  return phone;
}

export function upsertMessage(
  chats: Chat[],
  chatId: string,
  message: Message,
  name = chatId,
): Chat[] {
  const existing = chats.find((chat) => chat.id === chatId);
  if (!existing) {
    return [...chats, {id: chatId, name, messages: [message]}];
  }

  if (existing.messages.some((item) => item.id === message.id)) {
    return chats;
  }

  return chats.map((chat) =>
    chat.id === chatId
      ? {
          ...chat,
          messages: [...chat.messages, message].sort((a, b) => a.time - b.time),
        }
      : chat,
  );
}

export function deliveryStatus(status?: string): Delivery | undefined {
  if (status === 'read' || status === 'delivered') {
    return status;
  }

  if (['failed', 'noAccount', 'notInGroup'].includes(status || '')) {
    return 'failed';
  }
}

export function applyNotice(chats: Chat[], notice: Notice): Chat[] {
  if (notice.typeWebhook === 'outgoingMessageStatus') {
    return applyDeliveryStatus(chats, notice);
  }

  const supportedTypes = [
    'incomingMessageReceived',
    'outgoingMessageReceived',
    'outgoingAPIMessageReceived',
  ];

  if (!supportedTypes.includes(notice.typeWebhook || '')) {
    return chats;
  }

  const text =
    notice.messageData?.textMessageData?.textMessage ??
    notice.messageData?.extendedTextMessageData?.text;
  const chatId = notice.senderData?.chatId;

  if (typeof text !== 'string' || !chatId || !notice.idMessage) {
    return chats;
  }

  const outgoing = notice.typeWebhook !== 'incomingMessageReceived';
  const timestamp = (notice.timestamp || Date.now() / 1000) * 1000;
  const name = notice.senderData?.chatName || notice.senderData?.senderName || chatId;

  return upsertMessage(
    chats,
    chatId,
    {
      id: notice.idMessage,
      text,
      time: timestamp,
      outgoing,
      status: outgoing ? 'accepted' : undefined,
    },
    name,
  );
}

function applyDeliveryStatus(chats: Chat[], notice: Notice): Chat[] {
  const status = deliveryStatus(notice.status);
  if (!status) {
    return chats;
  }

  return chats.map((chat) => ({
    ...chat,
    messages: chat.messages.map((message) => {
      const belongsToChat = !notice.chatId || chat.id === notice.chatId;
      if (message.id !== notice.idMessage || !message.outgoing || !belongsToChat) {
        return message;
      }

      const keepReadStatus = message.status === 'read' && status === 'delivered';
      return {...message, status: keepReadStatus ? 'read' : status};
    }),
  }));
}
