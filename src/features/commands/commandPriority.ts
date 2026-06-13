export const STALE_COMMAND_MESSAGE = '已优先处理新的语音指令，上一条解析结果已忽略。';

export interface CommandPriorityToken {
  id: number;
  signal: AbortSignal;
  replacedPrevious: boolean;
}

export interface CommandPriorityController {
  beginCommand: () => CommandPriorityToken;
  isCurrent: (token: CommandPriorityToken) => boolean;
  ignoreIfStale: (token: CommandPriorityToken) => boolean;
  applyIfCurrent: (token: CommandPriorityToken, apply: () => void) => boolean;
  finishCommand: (token: CommandPriorityToken) => void;
}

export function createCommandPriorityController(): CommandPriorityController {
  let nextCommandId = 0;
  let currentAbortController: AbortController | null = null;
  let currentCommandId: number | null = null;

  function beginCommand(): CommandPriorityToken {
    const replacedPrevious = currentAbortController !== null && !currentAbortController.signal.aborted;

    currentAbortController?.abort();
    currentAbortController = new AbortController();

    const token: CommandPriorityToken = {
      id: nextCommandId + 1,
      signal: currentAbortController.signal,
      replacedPrevious,
    };

    nextCommandId = token.id;
    currentCommandId = token.id;

    return token;
  }

  function isCurrent(token: CommandPriorityToken): boolean {
    return currentCommandId === token.id && currentAbortController?.signal === token.signal && !token.signal.aborted;
  }

  function ignoreIfStale(token: CommandPriorityToken): boolean {
    return !isCurrent(token);
  }

  function applyIfCurrent(token: CommandPriorityToken, apply: () => void): boolean {
    if (ignoreIfStale(token)) {
      return false;
    }

    apply();
    return true;
  }

  function finishCommand(token: CommandPriorityToken): void {
    if (!isCurrent(token)) {
      return;
    }

    currentCommandId = null;
    currentAbortController = null;
  }

  return {
    beginCommand,
    isCurrent,
    ignoreIfStale,
    applyIfCurrent,
    finishCommand,
  };
}
