'use client';

import {useState, type FormEvent} from 'react';
import {ChatWorkspace} from '@/components/chat/chat-workspace';
import {useTelegram} from '@/hooks/use-telegram';

export default function Home() {
  const chat = useTelegram();
  const [connectionOpen, setConnectionOpen] = useState(false);

  async function connect(event: FormEvent<HTMLFormElement>) {
    const connected = await chat.connect(event);
    if (connected) setConnectionOpen(false);
  }

  return (
    <ChatWorkspace
      chats={chat.chats}
      active={chat.active}
      text={chat.text}
      query={chat.query}
      phone={chat.phone}
      error={chat.error}
      pollError={chat.pollError}
      connection={chat.connection}
      newChat={chat.newChat}
      creating={chat.creating}
      sending={chat.sending}
      credentials={Boolean(chat.credentials)}
      connectionOpen={connectionOpen}
      connecting={chat.connecting}
      connectionError={chat.error}
      onConnectionOpen={setConnectionOpen}
      onSelect={chat.selectChat}
      onText={chat.setText}
      onQuery={chat.setQuery}
      onPhone={chat.setPhone}
      onNewChat={chat.setNewChat}
      onClearError={() => chat.setError('')}
      onLogout={chat.logout}
      onCreateChat={chat.createChat}
      onSend={() => void chat.send()}
      onConnect={connect}
    />
  );
}
