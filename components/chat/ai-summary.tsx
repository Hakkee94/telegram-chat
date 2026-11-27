'use client';

import {useState} from 'react';
import {LoaderCircle, Sparkles, X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import type {Chat} from '@/lib/chat/model';
import {requestSummary} from '@/lib/chat/ai';

type AiSummaryState = 'idle' | 'loading' | 'done' | 'error';

export function AiSummaryPanel({chat}: {chat: Chat}) {
  const [state, setState] = useState<AiSummaryState>('idle');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<string[]>([]);
  const [error, setError] = useState('');

  if (chat.messages.length < 4) {
    return null;
  }

  async function run() {
    setState('loading');
    setOpen(true);
    setError('');

    try {
      setItems(await requestSummary(chat.messages));
      setState('done');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось получить резюме.');
      setState('error');
    }
  }

  return (
    <div className="ai-summary">
      <Button
        variant="ghost"
        size="icon"
        className="icon-button"
        aria-label="Резюме переписки от AI"
        title="Резюме переписки от AI"
        onClick={run}
        disabled={state === 'loading'}
      >
        {state === 'loading' ? <LoaderCircle className="spin" /> : <Sparkles />}
      </Button>

      {open && (
        <div className="ai-summary-card" role="dialog" aria-label="Резюме переписки">
          <div className="ai-summary-head">
            <strong>Резюме переписки</strong>
            <button aria-label="Закрыть резюме" onClick={() => setOpen(false)}>
              <X size={16} />
            </button>
          </div>

          {state === 'loading' && (
            <p className="ai-summary-note">
              <LoaderCircle className="spin" size={14} /> Модель читает переписку…
            </p>
          )}

          {state === 'error' && (
            <div className="ai-summary-error" role="alert">
              {error}
              <button onClick={run}>Повторить</button>
            </div>
          )}

          {state === 'done' && (
            <ul className="ai-summary-list">
              {items.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
