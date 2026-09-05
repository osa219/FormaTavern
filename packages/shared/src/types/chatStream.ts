import type { MessageView } from '../schemas/message';

export type ChatStreamEvent =
  | {
      type: 'start';
      messageId: string;
      chatId: string;
      parentId: string | null;
      userMessageId?: string;
      resumedFrom?: number;
    }
  | { type: 'token'; text: string }
  | { type: 'usage'; promptTokens: number; completionTokens: number }
  | { type: 'done'; message: MessageView }
  | {
      type: 'error';
      message: MessageView;
      error: { message: string; recoverable: boolean };
    };
