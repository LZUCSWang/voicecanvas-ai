import type { DrawAction, DrawingObjectType, DrawingPosition, DrawingSize } from '../../domain/drawingTypes';
import { createSceneTemplateActions, type SceneTemplateType } from '../scenes/sceneTemplates';

export type LocalCommandSource = 'local';

export interface LocalCommandParseBase {
  source: LocalCommandSource;
  actions: DrawAction[];
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
];

interface ParsedCommandSegment {
  actions: DrawAction[];
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
    return failure(segment, [segment], '当前版本尚未接入导出动作', '已识别为导出图片，但当前 PR 还未实现导出。');
  }

  if (segment.includes('撤销')) {
    return failure(segment, [segment], '当前版本尚未接入撤销动作', '已识别为撤销，但当前 PR 还未实现撤销历史。');
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

function parseSceneCommand(segment: string): ParsedCommandSegment | null {
  if (segment.includes('流程图')) {
    if (segment.includes('登录')) {
      return scene('flowchart', '登录流程图', ['打开登录页', '输入账号', '验证身份', '进入工作台'], '生成登录流程图');
    }

    return scene('flowchart', '三步流程图', ['语音输入', '本地解析', '生成画面'], '生成三步流程图');
  }

  if (segment.includes('对比图') || segment.includes('比较图')) {
    return scene(
      'comparison',
      segment.includes('本地解析') || segment.includes('云端解析') ? '本地解析 vs 云端解析' : '方案对比图',
      ['本地解析', '云端解析', '低延迟反馈', '复杂语义兜底'],
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

function detectPosition(segment: string): DrawingPosition {
  return POSITION_KEYWORDS.find((position) => position.keywords.some((keyword) => segment.includes(keyword)))?.value ?? 'center';
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
