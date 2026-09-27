'use client';

import {type FormEvent} from 'react';
import {LoaderCircle, LockKeyhole, X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';

type ConnectionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connecting: boolean;
  error: string;
  onConnect: (event: FormEvent<HTMLFormElement>) => void;
};

export function ConnectionDialog({
  open,
  onOpenChange,
  connecting,
  error,
  onConnect,
}: ConnectionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="new-chat-dialog connection-dialog" showCloseButton={false}>
        <DialogClose asChild>
          <Button className="dialog-close icon-button" variant="ghost" size="icon" aria-label="Закрыть">
            <X />
          </Button>
        </DialogClose>

        <DialogHeader>
          <DialogTitle>Подключение GREEN-API</DialogTitle>
          <DialogDescription>
            Введите apiUrl, idInstance и apiTokenInstance из карточки инстанса GREEN-API.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onConnect}>
          <label htmlFor="apiUrl">apiUrl</label>
          <Input
            id="apiUrl"
            name="apiUrl"
            type="url"
            placeholder="https://api.green-api.com"
            autoComplete="url"
            required
            disabled={connecting}
          />

          <label htmlFor="instance">idInstance</label>
          <Input
            id="instance"
            name="idInstance"
            placeholder="1101XXXXXXXXXX"
            inputMode="numeric"
            autoComplete="off"
            required
            disabled={connecting}
          />

          <label htmlFor="token">apiTokenInstance</label>
          <Input
            id="token"
            name="token"
            type="password"
            placeholder="Токен инстанса"
            autoComplete="off"
            required
            disabled={connecting}
          />

          {error && <p className="error" role="alert">{error}</p>}

          <Button type="submit" className="primary-button" disabled={connecting}>
            {connecting ? (
              <>
                <LoaderCircle className="spin" />
                Проверяем…
              </>
            ) : (
              'Подключить'
            )}
          </Button>
        </form>

        <p className="login-privacy">
          <LockKeyhole size={15} />
          Токен не сохраняется после выхода
        </p>
      </DialogContent>
    </Dialog>
  );
}
