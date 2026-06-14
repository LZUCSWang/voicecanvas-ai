import type {
  DrawAction,
  DrawingHistoryAction,
  DrawingObjectType,
  DrawingPosition,
  DrawingSize,
  DrawingTargetSelector,
  UpdateDrawingChanges,
} from '../../domain/drawingTypes';
import { createSceneTemplateActions, type SceneTemplateType } from '../scenes/sceneTemplates';

export type LocalCommandSource = 'local';

export interface LocalCommandParseBase {
  source: LocalCommandSource;
  actions: DrawingHistoryAction[];
  normalizedText: string;
  segments: string[];
  reason: string;
}

export interface LocalCommandParseSuccess extends LocalCommandParseBase {
  ok: true;
}

export interface LocalCommandParseFailure extends LocalCommandParseBase {
  ok: false;
  error: string;
}

export type LocalCommandParseResult = LocalCommandParseSuccess | LocalCommandParseFailure;

const COLORS: Array<{ keywords: string[]; value: string }> = [
  { keywords: ['红色', '红'], value: '#ef4444' },
  { keywords: ['蓝色', '蓝'], value: '#2563eb' },
  { keywords: ['绿色', '绿'], value: '#16a34a' },
  { keywords: ['黄色', '黄'], value: '#d97706' },
  { keywords: ['黑色', '黑'], value: '#111827' },
  { keywords: ['白色', '白'], value: '#ffffff' },
  { keywords: ['紫色', '紫'], value: '#7c3aed' },
  { keywords: ['橙色', '橙'], value: '#f97316' },
];

const POSITION_KEYWORDS: Array<{ keywords: string[]; value: DrawingPosition }> = [
  { keywords: ['左上角', '左上'], value: 'top-left' },
  { keywords: ['右上角', '右上'], value: 'top-right' },
  { keywords: ['左下角', '左下'], value: 'bottom-left' },
  { keywords: ['右下角', '右下'], value: 'bottom-right' },
  { keywords: ['左边', '左侧'], value: 'left' },
  { keywords: ['右边', '右侧'], value: 'right' },
  { keywords: ['上方', '顶部', '上面'], value: 'top' },
  { keywords: ['下方', '底部', '下面'], value: 'bottom' },
  { keywords: ['中间', '中央', '中心'], value: 'center' },
];

const OBJECT_TYPE_KEYWORDS: Array<{ keywords: string[]; value: DrawingObjectType }> = [
  { keywords: ['圆形'], value: 'circle' },
  { keywords: ['矩形'], value: 'rectangle' },
  { keywords: ['三角形'], value: 'triangle' },
  { keywords: ['箭头'], value: 'arrow' },
  { keywords: ['直线', '线条'], value: 'line' },
  { keywords: ['文字', '文本', '标题', '说明'], value: 'text' },
];

const FINE_TUNE_TRANSLATE_STEP = 24;
const FINE_TUNE_SCALE_STEP = 1.15;
const FINE_TUNE_SMALL_SCALE_STEP = 0.88;

interface ParsedCommandSegment {
  actions: DrawingHistoryAction[];
  reason: string;
}

export function normalizeCommandText(input: string): string {
  let normalized = input.normalize('NFKC').trim().replace(/\s+/g, ' ');

  const replacements: Array<[RegExp, string]> = [
    [/擦掉全部/g, '清空'],
    [/下载图片/g, '导出'],
    [/保存/g, '导出'],
    [/车消/g, '撤销'],
    [/回退/g, '撤销'],
    [/长方形/g, '矩形'],
    [/方块/g, '矩形'],
    [/巨型/g, '矩形'],
    [/园形/g, '圆形'],
    [/圈圈/g, '圆形'],
    [/圆(?!形)/g, '圆形'],
  ];

  replacements.forEach(([pattern, replacement]) => {
    normalized = normalized.replace(pattern, replacement);
  });

  return normalized;
}

export function parseLocalCommand(input: string): LocalCommandParseResult {
  const normalizedText = normalizeCommandText(input);
  const segments = splitCommandSegments(normalizedText);

  if (!normalizedText) {
    return failure(normalizedText, [], '输入为空', '请输入中文绘图命令。');
  }

  if (segments.length === 0) {
    return failure(normalizedText, [], '未匹配到本地规则', `暂未识别本地命令：“${normalizedText}”。`);
  }

  const parsedSegments: ParsedCommandSegment[] = [];

  for (const segment of segments) {
    const parsedSegment = parseCommandSegment(segment);

    if (!parsedSegment.ok) {
      return failure(normalizedText, segments, parsedSegment.reason, parsedSegment.error);
    }

    parsedSegments.push(parsedSegment);
  }

  const actions = parsedSegments.flatMap((segment) => segment.actions);
  const reason =
    parsedSegments.length === 1
      ? parsedSegments[0].reason
      : `已拆分 ${parsedSegments.length} 段：${parsedSegments.map((segment) => segment.reason).join('；')}`;

  return {
    ok: true,
    source: 'local',
    actions,
    normalizedText,
    segments,
    reason,
  };
}

function splitCommandSegments(normalizedText: string): string[] {
  return normalizedText
    .split(/(?:然后|并且|再)/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function parseCommandSegment(segment: string): (ParsedCommandSegment & { ok: true }) | LocalCommandParseFailure {
  const scene = parseSceneCommand(segment);

  if (scene) {
    return {
      ok: true,
      ...scene,
    };
  }

  if (segment.includes('清空')) {
    return {
      ok: true,
      actions: [{ type: 'clear' }],
      reason: '清空画布',
    };
  }

  if (segment.includes('导出')) {
    return {
      ok: true,
      actions: [{ type: 'export', format: 'png' }],
      reason: '导出图片',
    };
  }

  if (segment.includes('撤销')) {
    return {
      ok: true,
      actions: [{ type: 'undo' }],
      reason: '撤销上一步',
    };
  }

  if (segment.includes('重做')) {
    return {
      ok: true,
      actions: [{ type: 'redo' }],
      reason: '重做上一步',
    };
  }

  const fineTuneAction = parseFineTuneCommand(segment);

  if (fineTuneAction) {
    return {
      ok: true,
      actions: [fineTuneAction.action],
      reason: fineTuneAction.reason,
    };
  }

  if (segment.includes('变大一点')) {
    return {
      ok: true,
      actions: [{ type: 'update', changes: { size: 'large' } }],
      reason: '放大最近对象',
    };
  }

  if (segment.includes('变小一点')) {
    return {
      ok: true,
      actions: [{ type: 'update', changes: { size: 'small' } }],
      reason: '缩小最近对象',
    };
  }

  const textAction = parseTextCommand(segment);

  if (textAction) {
    return {
      ok: true,
      actions: [textAction],
      reason: `创建文字：${textAction.text ?? 'Text'}`,
    };
  }

  const objectType = detectObjectType(segment);

  if (objectType) {
    return {
      ok: true,
      actions: [
        {
          type: 'create',
          objectType,
          color: detectColor(segment),
          position: detectPosition(segment),
          size: detectSize(segment, objectType === 'text' ? 'small' : 'medium'),
        },
      ],
      reason: `创建${formatObjectType(objectType)}`,
    };
  }

  return failure(segment, [segment], '未匹配到本地规则', `暂未识别本地命令：“${segment}”。`);
}

function parseFineTuneCommand(segment: string): { action: DrawAction; reason: string } | null {
  const deleteCommand = parseDeleteCommand(segment);

  if (deleteCommand) {
    return deleteCommand;
  }

  const updateCommand = parseUpdateCommand(segment);

  if (updateCommand) {
    return updateCommand;
  }

  return null;
}

function parseDeleteCommand(segment: string): { action: DrawAction; reason: string } | null {
  if (!segment.includes('删除')) {
    return null;
  }

  const targetText = segment.replace(/^把/, '').replace(/^删除/, '').replace(/^掉/, '').trim();
  const target = parseTargetSelector(targetText);

  return {
    action: {
      type: 'delete',
      target,
    },
    reason: `删除${describeTargetForReason(target)}`,
  };
}

function parseUpdateCommand(segment: string): { action: DrawAction; reason: string } | null {
  const normalizedSegment = segment.replace(/^把/, '').trim();
  const operation = findUpdateOperation(normalizedSegment);

  if (!operation) {
    return null;
  }

  const targetText = normalizedSegment.slice(0, operation.index).trim();
  const valueText = normalizedSegment.slice(operation.index + operation.keyword.length).trim();
  const target = parseTargetSelector(targetText);
  const changes = parseUpdateChanges(operation.keyword, valueText, target);

  if (!changes) {
    return null;
  }

  return {
    action: {
      type: 'update',
      target,
      changes,
    },
    reason: `把${describeTargetForReason(target)}${describeChangesForReason(changes, target)}`,
  };
}

function findUpdateOperation(segment: string): { keyword: string; index: number } | null {
  const keywords = [
    '右移一点',
    '左移一点',
    '上移一点',
    '下移一点',
    '放大一点',
    '缩小一点',
    '调大一点',
    '调小一点',
    '变宽一点',
    '变窄一点',
    '变高一点',
    '变矮一点',
    '拉宽一点',
    '压窄一点',
    '拉高一点',
    '压低一点',
    '置顶',
    '置底',
    '上移一层',
    '下移一层',
    '往前一层',
    '往后一层',
    '改成',
    '改为',
  ];

  const matches = keywords
    .map((keyword) => ({ keyword, index: segment.indexOf(keyword) }))
    .filter((match) => match.index >= 0)
    .sort((left, right) => left.index - right.index);

  return matches[0] ?? null;
}

function parseTargetSelector(targetText: string): DrawingTargetSelector {
  const target: DrawingTargetSelector = {
    strategy: detectTargetStrategy(targetText),
  };
  const objectType = detectObjectType(targetText);
  const color = detectExplicitColor(targetText);
  const position = detectExplicitPosition(targetText);
  const textIncludes = extractTextIncludes(targetText);

  if (objectType) {
    target.objectType = objectType;
  }

  if (color) {
    target.color = color;
  }

  if (position) {
    target.position = position;
  }

  if (textIncludes) {
    target.textIncludes = textIncludes;
  }

  return target;
}

function parseUpdateChanges(
  operation: string,
  valueText: string,
  target: DrawingTargetSelector,
): UpdateDrawingChanges | null {
  switch (operation) {
    case '右移一点':
      return { translate: { dx: FINE_TUNE_TRANSLATE_STEP, dy: 0 } };
    case '左移一点':
      return { translate: { dx: -FINE_TUNE_TRANSLATE_STEP, dy: 0 } };
    case '上移一点':
      return { translate: { dx: 0, dy: -FINE_TUNE_TRANSLATE_STEP } };
    case '下移一点':
      return { translate: { dx: 0, dy: FINE_TUNE_TRANSLATE_STEP } };
    case '放大一点':
    case '调大一点':
      return { scale: FINE_TUNE_SCALE_STEP };
    case '缩小一点':
    case '调小一点':
      return { scale: FINE_TUNE_SMALL_SCALE_STEP };
    case '变宽一点':
    case '拉宽一点':
      return { resize: { dw: FINE_TUNE_TRANSLATE_STEP, dh: 0 } };
    case '变窄一点':
    case '压窄一点':
      return { resize: { dw: -FINE_TUNE_TRANSLATE_STEP, dh: 0 } };
    case '变高一点':
    case '拉高一点':
      return { resize: { dw: 0, dh: FINE_TUNE_TRANSLATE_STEP } };
    case '变矮一点':
    case '压低一点':
      return { resize: { dw: 0, dh: -FINE_TUNE_TRANSLATE_STEP } };
    case '置顶':
      return { layer: 'front' };
    case '置底':
      return { layer: 'back' };
    case '上移一层':
    case '往前一层':
      return { layer: 'forward' };
    case '下移一层':
    case '往后一层':
      return { layer: 'backward' };
    case '改成':
    case '改为':
      return parseChangeValue(valueText, target);
    default:
      return null;
  }
}

function parseChangeValue(valueText: string, target: DrawingTargetSelector): UpdateDrawingChanges | null {
  if (valueText.includes('虚线')) {
    return { strokeStyle: 'dashed' };
  }

  if (valueText.includes('实线')) {
    return { strokeStyle: 'solid' };
  }

  const color = detectExplicitColor(valueText);

  if (color && target.objectType !== 'text') {
    return { color };
  }

  const text = valueText.replace(/^["“”'：:\s]+/, '').replace(/["“”'\s]+$/, '');

  if (text) {
    return { text };
  }

  return null;
}

function parseSceneCommand(segment: string): ParsedCommandSegment | null {
  if (segment.includes('流程图')) {
    if (segment.includes('登录')) {
      return scene(
        'flowchart',
        '登录流程图',
        ['打开登录页', '输入用户名密码', '本地校验输入', '请求服务端验证', '登录成功', '进入工作台'],
        '生成登录流程图',
      );
    }

    return scene('flowchart', '三步流程图', ['语音输入', '本地解析', '生成画面'], '生成三步流程图');
  }

  if (segment.includes('对比图') || segment.includes('比较图')) {
    return scene(
      'comparison',
      segment.includes('本地解析') || segment.includes('云端解析') ? '本地解析 vs 云端解析' : '方案对比图',
      ['本地规则离线解析', '云端 AI 上下文解析', '低延迟可靠命令', '复杂语义生成场景', '撤销重做可追溯', 'PNG 导出可提交'],
      '生成对比图',
    );
  }

  if (segment.includes('架构图')) {
    return scene(
      'architecture',
      segment.toLowerCase().includes('voicecanvas') ? 'VoiceCanvas 项目架构' : '项目架构图',
      ['语音输入', '本地解析', '场景模板', 'SVG 画布'],
      '生成项目架构图',
    );
  }

  if (segment.includes('思维导图') || segment.includes('脑图')) {
    return scene(
      'mind-map',
      segment.includes('语音绘图') ? '语音绘图' : '思维导图',
      ['语音输入', '指令解析', '图形生成', '画布反馈'],
      '生成思维导图',
    );
  }

  if (segment.includes('海报')) {
    return scene('poster', segment.includes('发布会') ? '发布会小海报' : 'VoiceCanvas 发布', ['语音绘图', '本地解析', '场景生成'], '生成小海报');
  }

  return null;
}

function scene(type: SceneTemplateType, title: string, items: string[], reason: string): ParsedCommandSegment {
  return {
    actions: [{ type: 'clear' }, ...createSceneTemplateActions({ type, title, items })],
    reason,
  };
}

function parseTextCommand(segment: string): (DrawAction & { type: 'create'; objectType: 'text' }) | null {
  if (!segment.includes('写') && !segment.includes('文字')) {
    return null;
  }

  const textValue = extractTextValue(segment);

  if (!textValue) {
    return null;
  }

  return {
    type: 'create',
    objectType: 'text',
    color: detectColor(segment),
    position: detectPosition(segment),
    size: detectSize(segment, 'small'),
    text: textValue,
  };
}

function extractTextValue(segment: string): string {
  const writeTextIndex = segment.indexOf('写文字');
  const writeIndex = segment.indexOf('写');
  const textIndex = segment.indexOf('文字');
  let value = '';

  if (writeTextIndex >= 0) {
    value = segment.slice(writeTextIndex + '写文字'.length);
  } else if (writeIndex >= 0) {
    value = segment.slice(writeIndex + '写'.length);
  } else if (textIndex >= 0) {
    value = segment.slice(textIndex + '文字'.length);
  }

  return value.replace(/^[\s:：，,。；;]+/, '').replace(/^(一个|一段|一行|内容)/, '').trim();
}

function detectObjectType(segment: string): DrawingObjectType | null {
  const objectType = OBJECT_TYPE_KEYWORDS.find((candidate) => candidate.keywords.some((keyword) => segment.includes(keyword)));

  return objectType?.value ?? null;
}

function detectColor(segment: string): string {
  return COLORS.find((color) => color.keywords.some((keyword) => segment.includes(keyword)))?.value ?? '#111827';
}

function detectExplicitColor(segment: string): string | null {
  return COLORS.find((color) => color.keywords.some((keyword) => segment.includes(keyword)))?.value ?? null;
}

function detectPosition(segment: string): DrawingPosition {
  return POSITION_KEYWORDS.find((position) => position.keywords.some((keyword) => segment.includes(keyword)))?.value ?? 'center';
}

function detectExplicitPosition(segment: string): DrawingPosition | null {
  return POSITION_KEYWORDS.find((position) => position.keywords.some((keyword) => segment.includes(keyword)))?.value ?? null;
}

function detectTargetStrategy(segment: string): DrawingTargetSelector['strategy'] {
  if (hasAny(segment, ['第一个', '最早', '最前'])) {
    return 'first';
  }

  return 'latest';
}

function extractTextIncludes(segment: string): string | undefined {
  const match = segment.match(/包含[“"]?([^“”"\s]+)[”"]?/);

  return match?.[1];
}

function detectSize(segment: string, fallback: DrawingSize): DrawingSize {
  if (hasAny(segment, ['变大一点', '大号', '大的', '大型', '大圆形', '大矩形', '大三角形', '大箭头', '大直线', '大线条', '大文字'])) {
    return 'large';
  }

  if (hasAny(segment, ['变小一点', '小号', '小的', '小型', '小圆形', '小矩形', '小三角形', '小箭头', '小直线', '小线条', '小文字'])) {
    return 'small';
  }

  if (hasAny(segment, ['中号', '中等', '中型', '中圆形', '中矩形', '中三角形', '中箭头', '中直线', '中线条', '中文字'])) {
    return 'medium';
  }

  return fallback;
}

function hasAny(segment: string, keywords: string[]): boolean {
  return keywords.some((keyword) => segment.includes(keyword));
}

function formatObjectType(objectType: DrawingObjectType): string {
  const labels: Record<DrawingObjectType, string> = {
    circle: '圆形',
    rectangle: '矩形',
    triangle: '三角形',
    line: '直线',
    arrow: '箭头',
    text: '文字',
  };

  return labels[objectType];
}

function describeTargetForReason(target: DrawingTargetSelector): string {
  const objectType = target.objectType ?? 'object';
  const objectLabel = objectType === 'object' ? '对象' : formatObjectType(objectType);

  if (target.color && target.objectType) {
    return `${formatColor(target.color)}${objectLabel}`;
  }

  if (target.position && target.objectType) {
    return `${formatPosition(target.position)}${objectLabel}`;
  }

  if (target.textIncludes) {
    return `包含“${target.textIncludes}”的${objectLabel}`;
  }

  if (target.strategy === 'first') {
    return `第一个${objectLabel}`;
  }

  return `最近的${objectLabel}`;
}

function describeChangesForReason(changes: UpdateDrawingChanges, target: DrawingTargetSelector): string {
  if (changes.translate) {
    if (Math.abs(changes.translate.dx) >= Math.abs(changes.translate.dy) && changes.translate.dx !== 0) {
      return changes.translate.dx > 0 ? '右移一点' : '左移一点';
    }

    if (changes.translate.dy !== 0) {
      return changes.translate.dy > 0 ? '下移一点' : '上移一点';
    }
  }

  if (typeof changes.scale === 'number') {
    if (target.objectType === 'text') {
      return changes.scale >= 1 ? '调大一点' : '调小一点';
    }

    return changes.scale >= 1 ? '放大一点' : '缩小一点';
  }

  if (changes.resize) {
    if (Math.abs(changes.resize.dw) >= Math.abs(changes.resize.dh) && changes.resize.dw !== 0) {
      return changes.resize.dw > 0 ? '变宽一点' : '变窄一点';
    }

    if (changes.resize.dh !== 0) {
      return changes.resize.dh > 0 ? '变高一点' : '变矮一点';
    }
  }

  if (changes.color) {
    return `改成${formatColor(changes.color)}`;
  }

  if (typeof changes.text === 'string') {
    return `改成${changes.text}`;
  }

  if (changes.strokeStyle) {
    return changes.strokeStyle === 'dashed' ? '改成虚线' : '改成实线';
  }

  if (changes.layer) {
    const labels: Record<NonNullable<UpdateDrawingChanges['layer']>, string> = {
      front: '置顶',
      back: '置底',
      forward: '上移一层',
      backward: '下移一层',
    };

    return labels[changes.layer];
  }

  return '更新';
}

function formatColor(color: string): string {
  const colorLabel = COLORS.find((candidate) => candidate.value === color)?.keywords[0];

  return colorLabel ?? color;
}

function formatPosition(position: DrawingPosition): string {
  const labels: Record<DrawingPosition, string> = {
    center: '中间',
    'top-left': '左上角',
    'top-right': '右上角',
    'bottom-left': '左下角',
    'bottom-right': '右下角',
    left: '左侧',
    right: '右侧',
    top: '上方',
    bottom: '下方',
  };

  return labels[position];
}

function failure(normalizedText: string, segments: string[], reason: string, error: string): LocalCommandParseFailure {
  return {
    ok: false,
    source: 'local',
    actions: [],
    normalizedText,
    segments,
    reason,
    error,
  };
}
