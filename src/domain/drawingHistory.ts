import { executeDrawingActionWithResult, type DrawingActionExecutionResult } from './drawingExecutor';
import { createInitialDrawingState } from './drawingState';
import type {
  DrawAction,
  DrawingHistoryAction,
  DrawingHistoryState,
  DrawingState,
} from './drawingTypes';

export interface DrawingHistoryActionExecutionResult {
  action: DrawingHistoryAction;
  history: DrawingHistoryState;
  changed: boolean;
  exportRequested: boolean;
  drawingResult?: DrawingActionExecutionResult;
  feedbackText: string;
}

export function createInitialDrawingHistoryState(present: DrawingState = createInitialDrawingState()): DrawingHistoryState {
  return {
    past: [],
    present,
    future: [],
  };
}

export function executeDrawingHistoryActionWithResult(
  history: DrawingHistoryState,
  action: DrawingHistoryAction,
): DrawingHistoryActionExecutionResult {
  switch (action.type) {
    case 'undo':
      return undoHistory(history, action);
    case 'redo':
      return redoHistory(history, action);
    case 'export':
      return {
        action,
        history,
        changed: false,
        exportRequested: true,
        feedbackText: '正在导出图片',
      };
    default:
      return applyDrawAction(history, action);
  }
}

export function executeDrawingHistoryActionsWithResults(
  history: DrawingHistoryState,
  actions: DrawingHistoryAction[],
): {
  history: DrawingHistoryState;
  results: DrawingHistoryActionExecutionResult[];
} {
  if (actions.length === 0) {
    return {
      history,
      results: [],
    };
  }

  if (actions.every(isDrawAction)) {
    return applyDrawActionBatch(history, actions);
  }

  const results: DrawingHistoryActionExecutionResult[] = [];
  const nextHistory = actions.reduce((currentHistory, action) => {
    const result = executeDrawingHistoryActionWithResult(currentHistory, action);
    results.push(result);
    return result.history;
  }, history);

  return {
    history: nextHistory,
    results,
  };
}

function applyDrawActionBatch(
  history: DrawingHistoryState,
  actions: DrawAction[],
): {
  history: DrawingHistoryState;
  results: DrawingHistoryActionExecutionResult[];
} {
  const drawingResults: DrawingActionExecutionResult[] = [];
  const nextPresent = actions.reduce((currentState, action) => {
    const result = executeDrawingActionWithResult(currentState, action);
    drawingResults.push(result);
    return result.state;
  }, history.present);
  const changed = drawingResults.some((result) => result.changed);
  const nextHistory = changed ? pushPresent(history, nextPresent) : history;

  return {
    history: nextHistory,
    results: drawingResults.map((result, index) => ({
      action: actions[index],
      history: nextHistory,
      changed: result.changed,
      exportRequested: false,
      drawingResult: result,
      feedbackText: result.feedbackText,
    })),
  };
}

function applyDrawAction(history: DrawingHistoryState, action: DrawAction): DrawingHistoryActionExecutionResult {
  const drawingResult = executeDrawingActionWithResult(history.present, action);
  const nextHistory = drawingResult.changed ? pushPresent(history, drawingResult.state) : history;

  return {
    action,
    history: nextHistory,
    changed: drawingResult.changed,
    exportRequested: false,
    drawingResult,
    feedbackText: drawingResult.feedbackText,
  };
}

function undoHistory(history: DrawingHistoryState, action: DrawingHistoryAction): DrawingHistoryActionExecutionResult {
  const previous = history.past.at(-1);

  if (!previous) {
    return {
      action,
      history,
      changed: false,
      exportRequested: false,
      feedbackText: '没有可撤销的操作',
    };
  }

  return {
    action,
    history: {
      past: history.past.slice(0, -1),
      present: previous,
      future: [history.present, ...history.future],
    },
    changed: true,
    exportRequested: false,
    feedbackText: '已撤销上一步',
  };
}

function redoHistory(history: DrawingHistoryState, action: DrawingHistoryAction): DrawingHistoryActionExecutionResult {
  const next = history.future[0];

  if (!next) {
    return {
      action,
      history,
      changed: false,
      exportRequested: false,
      feedbackText: '没有可重做的操作',
    };
  }

  return {
    action,
    history: {
      past: [...history.past, history.present],
      present: next,
      future: history.future.slice(1),
    },
    changed: true,
    exportRequested: false,
    feedbackText: '已重做上一步',
  };
}

function pushPresent(history: DrawingHistoryState, present: DrawingState): DrawingHistoryState {
  return {
    past: [...history.past, history.present],
    present,
    future: [],
  };
}

function isDrawAction(action: DrawingHistoryAction): action is DrawAction {
  return action.type === 'create' || action.type === 'update' || action.type === 'delete' || action.type === 'clear';
}
