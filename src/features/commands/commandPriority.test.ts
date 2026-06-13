import { describe, expect, it, vi } from 'vitest';
import { createCommandPriorityController, STALE_COMMAND_MESSAGE } from './commandPriority';

describe('command priority controller', () => {
  it('assigns monotonic command ids and aborts the previous pending command', () => {
    const controller = createCommandPriorityController();
    const first = controller.beginCommand();
    const second = controller.beginCommand();

    expect(first.id).toBe(1);
    expect(second.id).toBe(2);
    expect(first.replacedPrevious).toBe(false);
    expect(second.replacedPrevious).toBe(true);
    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
    expect(controller.isCurrent(first)).toBe(false);
    expect(controller.isCurrent(second)).toBe(true);
  });

  it('invalidates a pending AI command when a local edit starts', () => {
    const controller = createCommandPriorityController();
    const pendingAi = controller.beginCommand();
    const localEdit = controller.beginCommand();

    expect(pendingAi.signal.aborted).toBe(true);
    expect(controller.isCurrent(pendingAi)).toBe(false);
    expect(controller.isCurrent(localEdit)).toBe(true);
  });

  it('ignores late slow results after a newer command has taken priority', () => {
    const controller = createCommandPriorityController();
    const state = {
      drawingHistory: 'initial-history',
      systemStatus: 'latest status',
      commandParseMeta: 'latest meta',
      conversationLog: ['latest conversation'],
      recentExecutedActions: ['latest action'],
      canvasRevision: 1,
      conversationRevision: 1,
      spokenFeedback: [] as string[],
    };
    const first = controller.beginCommand();
    const second = controller.beginCommand();

    expect(controller.applyIfCurrent(first, () => {
      state.drawingHistory = 'stale-history';
      state.systemStatus = 'stale status';
      state.commandParseMeta = 'stale meta';
      state.conversationLog.push('stale conversation');
      state.recentExecutedActions.push('stale action');
      state.canvasRevision += 1;
      state.conversationRevision += 1;
      state.spokenFeedback.push('stale feedback');
    })).toBe(false);
    expect(controller.applyIfCurrent(second, () => {
      state.drawingHistory = 'latest-history';
    })).toBe(true);

    expect(state).toEqual({
      drawingHistory: 'latest-history',
      systemStatus: 'latest status',
      commandParseMeta: 'latest meta',
      conversationLog: ['latest conversation'],
      recentExecutedActions: ['latest action'],
      canvasRevision: 1,
      conversationRevision: 1,
      spokenFeedback: [],
    });
  });

  it('keeps the latest command able to update state normally', () => {
    const controller = createCommandPriorityController();
    const commit = vi.fn();
    const command = controller.beginCommand();

    expect(controller.applyIfCurrent(command, commit)).toBe(true);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(STALE_COMMAND_MESSAGE).toContain('已优先处理新的语音指令');
  });

  it('does not treat a completed command as a pending command to replace', () => {
    const controller = createCommandPriorityController();
    const first = controller.beginCommand();

    controller.finishCommand(first);
    const second = controller.beginCommand();

    expect(first.signal.aborted).toBe(false);
    expect(second.replacedPrevious).toBe(false);
    expect(controller.isCurrent(first)).toBe(false);
    expect(controller.isCurrent(second)).toBe(true);
  });
});
