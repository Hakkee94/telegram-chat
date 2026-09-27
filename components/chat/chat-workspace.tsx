'use client';

import {useEffect, useRef, type FormEvent} from 'react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Clock3,
  KeyRound,
  LoaderCircle,
  LogOut,
  Menu,
  MessageCircle,
  MoreVertical,
  Pencil,
  Search,
  Send,
  TriangleAlert,
  X,
} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {Empty, EmptyDescription, EmptyHeader, EmptyTitle} from '@/components/ui/empty';
import {Input} from '@/components/ui/input';
import {TELEGRAM_MESSAGE_LENGTH} from '@/lib/chat/config';
import type {Chat, Delivery, Message} from '@/lib/chat/model';
import {ConnectionDialog} from './connection-dialog';

const statusLabels: Record<Delivery, string> = {
  sending: 'Отправляется',
  accepted: 'Принято сервисом',
  delivered: 'Доставлено',
  read: 'Прочитано',
  failed: 'Не доставлено',
  unknown: 'Отправка не подтверждена',
};

export type ChatWorkspaceProps = {
  chats: Chat[];
  active: string;
  text: string;
  query: string;
  phone: string;
  error: string;
  pollError: string;
  connection: string;
  newChat: boolean;
  creating: boolean;
  sending: boolean;
  credentials: boolean;
  connectionOpen: boolean;
  connecting: boolean;
  connectionError: string;
  onSelect: (id: string) => void;
  onText: (text: string) => void;
  onQuery: (query: string) => void;
  onPhone: (phone: string) => void;
  onNewChat: (open: boolean) => void;
  onClearError: () => void;
  onLogout: () => void;
  onCreateChat: (event: FormEvent) => void;
  onSend: () => void;
  onConnectionOpen: (open: boolean) => void;
  onConnect: (event: FormEvent<HTMLFormElement>) => void;
};

export function ChatWorkspace(props: ChatWorkspaceProps) {
  const activeChat = props.chats.find((chat) => chat.id === props.active);
  const listRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const visibleChats = getVisibleChats(props.chats, props.query);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [props.active, activeChat?.messages.length]);

  useEffect(() => {
    const textarea = textRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [props.text, props.active]);

  function openNewChat() {
    props.onClearError();
    props.onNewChat(true);
  }

  return (
    <main className={`workspace telegram-wallpaper ${props.active ? 'has-active' : ''}`}>
      <ChatSidebar
        {...props}
        visibleChats={visibleChats}
        onNewChat={openNewChat}
      />

      <section className="conversation" aria-label="Переписка">
        {activeChat ? (
          <Conversation
            {...props}
            chat={activeChat}
            textRef={textRef}
            listRef={listRef}
            onNewChat={openNewChat}
          />
        ) : (
          <div className="welcome">
            <span>Выберите чат или начните новую переписку</span>
            {!props.credentials && <p>Подключите GREEN-API через меню, чтобы начать обмен сообщениями</p>}
          </div>
        )}
      </section>

      <ConnectionDialog
        open={props.connectionOpen}
        onOpenChange={props.onConnectionOpen}
        connecting={props.connecting}
        error={props.connectionError}
        onConnect={props.onConnect}
      />

      <NewChatDialog {...props} />
    </main>
  );
}

type SidebarProps = ChatWorkspaceProps & {
  visibleChats: Chat[];
  onNewChat: () => void;
};

function ChatSidebar({
  ...props
}: SidebarProps) {
  return (
    <aside className="chat-sidebar" aria-label="Список чатов">
      <div className="sidebar-toolbar">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="icon-button" aria-label="Меню">
              <Menu size={23} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="chat-menu">
            <DropdownMenuItem onSelect={props.onNewChat}>
              <Pencil />
              Новый чат
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onConnectionOpen(true)}>
              <KeyRound />
              {props.credentials ? 'Переподключить GREEN-API' : 'Подключить GREEN-API'}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={props.onLogout}>
              <LogOut />
              Выйти
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="search-field">
          <Search size={19} />
          <input
            aria-label="Поиск чатов"
            placeholder="Поиск"
            value={props.query}
            onChange={(event) => props.onQuery(event.target.value)}
          />
          {props.query && (
            <button aria-label="Очистить поиск" onClick={() => props.onQuery('')}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="chat-category">
        <span>
          Все чаты <b>{props.chats.length}</b>
        </span>
        <span className="service-name">Telegram</span>
      </div>

      <div className="chat-list">
        {props.visibleChats.map((chat) => (
          <button
            className={`chat-row ${chat.id === props.active ? 'selected' : ''}`}
            key={chat.id}
            onClick={() => props.onSelect(chat.id)}
            aria-current={chat.id === props.active ? 'true' : undefined}
          >
            <Avatar name={chat.name} id={chat.id} />
            <span className="chat-preview">
              <strong>{chat.name}</strong>
              <span>{chat.messages.at(-1)?.text || 'Пока нет сообщений'}</span>
            </span>
            {chat.messages.length > 0 && <time>{formatTime(chat.messages.at(-1)!.time)}</time>}
          </button>
        ))}

        {!props.visibleChats.length && (
          <Empty className="sidebar-empty">
            <EmptyHeader>
              <MessageCircle size={32} />
              <EmptyTitle>{props.query ? 'Ничего не найдено' : 'Пока нет чатов'}</EmptyTitle>
              <EmptyDescription>
                {props.query ? 'Попробуйте другое имя или номер.' : 'Начните переписку по номеру телефона.'}
              </EmptyDescription>
            </EmptyHeader>
            {!props.query && <Button variant="link" onClick={props.onNewChat}>Новый чат</Button>}
          </Empty>
        )}
      </div>

      <div className="sidebar-bottom">
        <span className={`connection-state ${props.pollError ? 'warning' : ''}`} title={props.connection}>
          {props.connection}
        </span>
        <Button className="compose-new" aria-label="Новый чат" title="Новый чат" onClick={props.onNewChat}>
          <Pencil size={24} />
        </Button>
      </div>

      {!props.active && !props.newChat && (props.error || props.pollError) && (
        <div className="sidebar-error" role="alert">{props.error || props.pollError}</div>
      )}
    </aside>
  );
}

type ConversationProps = ChatWorkspaceProps & {
  chat: Chat;
  textRef: React.RefObject<HTMLTextAreaElement | null>;
  listRef: React.RefObject<HTMLDivElement | null>;
  onNewChat: () => void;
};

function Conversation({chat, textRef, listRef, onNewChat, ...props}: ConversationProps) {
  return (
    <>
      <header className="conversation-head">
        <Button
          className="back-button icon-button"
          variant="ghost"
          size="icon"
          aria-label="К списку чатов"
          onClick={() => props.onSelect('')}
        >
          <ArrowLeft />
        </Button>
        <Avatar name={chat.name} id={chat.id} small />
        <div className="conversation-person">
          <h1>{chat.name}</h1>
          <p>{chat.phone ? `+${chat.phone}` : 'Telegram'}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="icon-button" aria-label="Действия чата">
              <MoreVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="chat-menu">
            <DropdownMenuItem onSelect={onNewChat}><Pencil />Новый чат</DropdownMenuItem>
            <DropdownMenuItem onSelect={props.onLogout}><LogOut />Выйти</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="messages-scroll" ref={listRef}>
        <div className="messages" role="log" aria-label="Сообщения" aria-live="polite" aria-relevant="additions text">
          {!chat.messages.length && (
            <div className="conversation-empty">
              <span>Пока нет сообщений</span>
              <p>Напишите первое сообщение</p>
            </div>
          )}
          {chat.messages.map((message, index) => (
            <div key={message.id}>
              {(index === 0 || isDifferentDay(message.time, chat.messages[index - 1].time)) && (
                <div className="date-divider">{formatDate(message.time)}</div>
              )}
              <MessageBubble message={message} />
            </div>
          ))}
        </div>
      </div>

      {!props.newChat && (props.error || props.pollError) && (
        <div className="chat-error" role="alert">
          {props.error || props.pollError}
          {props.error && (
            <button aria-label="Закрыть сообщение об ошибке" onClick={props.onClearError}>
              <X size={16} />
            </button>
          )}
        </div>
      )}

      <div className="composer-area">
        <form className="composer" onSubmit={(event) => { event.preventDefault(); props.onSend(); }}>
          <textarea
            ref={textRef}
            aria-label="Сообщение"
            placeholder={props.credentials ? 'Сообщение' : 'Подключите GREEN-API через меню'}
            rows={1}
            maxLength={TELEGRAM_MESSAGE_LENGTH}
            value={props.text}
            onChange={(event) => props.onText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                props.onSend();
              }
            }}
          />
          <Button
            type="submit"
            className="send-button"
            aria-label="Отправить сообщение"
            disabled={props.sending || !props.text.trim() || !props.credentials}
          >
            {props.sending ? <LoaderCircle className="spin" /> : <Send size={22} />}
          </Button>
        </form>
        {props.text.length > TELEGRAM_MESSAGE_LENGTH - 300 && (
          <span className="character-count">{props.text.length} / {TELEGRAM_MESSAGE_LENGTH}</span>
        )}
      </div>
    </>
  );
}

function NewChatDialog(props: ChatWorkspaceProps) {
  return (
    <Dialog open={props.newChat} onOpenChange={props.onNewChat}>
      <DialogContent className="new-chat-dialog" showCloseButton={false}>
        <DialogClose asChild>
          <Button className="dialog-close icon-button" variant="ghost" size="icon" aria-label="Закрыть">
            <X />
          </Button>
        </DialogClose>
        <DialogHeader>
          <DialogTitle>Новый чат</DialogTitle>
          <DialogDescription>Введите номер телефона получателя с кодом страны.</DialogDescription>
        </DialogHeader>
        <form onSubmit={props.onCreateChat}>
          <label htmlFor="phone">Номер телефона</label>
          <Input
            id="phone"
            type="tel"
            placeholder="+7 999 123-45-67"
            value={props.phone}
            onChange={(event) => props.onPhone(event.target.value)}
            required
            autoFocus
            disabled={props.creating}
          />
          {props.error && <p className="error" role="alert">{props.error}</p>}
          <Button type="submit" className="primary-button" disabled={props.creating}>
            {props.creating ? <><LoaderCircle className="spin" />Ищем получателя…</> : 'Начать переписку'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MessageBubble({message}: {message: Message}) {
  const status = message.status || 'accepted';
  const hasProblem = status === 'failed' || status === 'unknown';

  return (
    <div className={`message-line ${message.outgoing ? 'outgoing' : ''}`}>
      <div className={`bubble ${hasProblem ? 'message-problem' : ''}`}>
        <p>{message.text}</p>
        <span className="message-meta">
          <time dateTime={new Date(message.time).toISOString()}>{formatTime(message.time)}</time>
          {message.outgoing && <DeliveryMark status={status} />}
        </span>
      </div>
    </div>
  );
}

function DeliveryMark({status}: {status: Delivery}) {
  const label = statusLabels[status];
  return (
    <span className={`delivery ${status}`} title={label} aria-label={label}>
      {status === 'read' ? <CheckCheck size={16} /> : null}
      {status === 'accepted' || status === 'delivered' ? <Check size={16} /> : null}
      {status === 'sending' ? <Clock3 size={13} /> : null}
      {(status === 'failed' || status === 'unknown') && <><TriangleAlert size={13} />{label}</>}
    </span>
  );
}

function Avatar({name, id, small = false}: {name: string; id: string; small?: boolean}) {
  const colors = ['#68b74d', '#c78dca', '#efa24b', '#64a9de', '#e4776f'];
  const colorIndex = Array.from(id).reduce((sum, character) => sum + character.charCodeAt(0), 0) % colors.length;
  const initials = name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase();

  return (
    <span className={`avatar ${small ? 'small' : ''}`} style={{backgroundColor: colors[colorIndex]}} aria-hidden="true">
      {name.startsWith('+') ? <MessageCircle size={small ? 20 : 25} /> : initials}
    </span>
  );
}

function getVisibleChats(chats: Chat[], query: string): Chat[] {
  const normalizedQuery = query.toLocaleLowerCase();
  return chats
    .filter((chat) => `${chat.name} ${chat.phone || ''}`.toLocaleLowerCase().includes(normalizedQuery))
    .sort((a, b) => (b.messages.at(-1)?.time || 0) - (a.messages.at(-1)?.time || 0));
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'});
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('ru-RU', {day: 'numeric', month: 'long'});
}

function isDifferentDay(first: number, second: number): boolean {
  return new Date(first).toDateString() !== new Date(second).toDateString();
}
