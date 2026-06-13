export type CanvasExportFormat = 'png' | 'svg';

export interface CanvasExportResult {
  ok: boolean;
  format: CanvasExportFormat;
  fileName: string;
  fallbackUsed: boolean;
  error?: string;
}

interface CanvasExportOptions {
  now?: Date;
  documentRef?: Document;
  urlApi?: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>;
  imageFactory?: () => HTMLImageElement;
}

export async function exportCanvasAsImage(
  svgElement: SVGSVGElement | null,
  options: CanvasExportOptions = {},
): Promise<CanvasExportResult> {
  if (!svgElement) {
    return {
      ok: false,
      format: 'png',
      fileName: createCanvasExportFileName('png', options.now),
      fallbackUsed: false,
      error: '没有找到可导出的 SVG 画布。',
    };
  }

  try {
    return await exportSvgAsPng(svgElement, options);
  } catch (error) {
    const fallback = downloadSvg(svgElement, options);

    return {
      ...fallback,
      fallbackUsed: true,
      error: error instanceof Error ? error.message : 'PNG 导出失败，已改为 SVG 下载。',
    };
  }
}

export function createCanvasExportFileName(format: CanvasExportFormat, now: Date = new Date()): string {
  const timestamp = now.toISOString().replace(/\.\d{3}Z$/, '').replace('T', '-').replace(/:/g, '');

  return `voicecanvas-ai-${timestamp}.${format}`;
}

export function ensureSvgDownloadMarkup(markup: string): string {
  if (markup.includes('xmlns=')) {
    return markup;
  }

  return markup.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
}

async function exportSvgAsPng(svgElement: SVGSVGElement, options: CanvasExportOptions): Promise<CanvasExportResult> {
  const documentRef = options.documentRef ?? document;
  const urlApi = options.urlApi ?? URL;
  const imageFactory = options.imageFactory ?? (() => new Image());
  const width = svgElement.viewBox.baseVal.width || svgElement.clientWidth || 800;
  const height = svgElement.viewBox.baseVal.height || svgElement.clientHeight || 500;
  const markup = serializeSvg(svgElement);
  const svgBlob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = urlApi.createObjectURL(svgBlob);

  try {
    const image = await loadImage(svgUrl, imageFactory);
    const canvas = documentRef.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('当前浏览器无法创建 PNG 导出画布。');
    }

    context.drawImage(image, 0, 0, width, height);
    const pngBlob = await canvasToBlob(canvas);
    const fileName = createCanvasExportFileName('png', options.now);
    downloadBlob(pngBlob, fileName, documentRef, urlApi);

    return {
      ok: true,
      format: 'png',
      fileName,
      fallbackUsed: false,
    };
  } finally {
    urlApi.revokeObjectURL(svgUrl);
  }
}

function downloadSvg(svgElement: SVGSVGElement, options: CanvasExportOptions): CanvasExportResult {
  const documentRef = options.documentRef ?? document;
  const urlApi = options.urlApi ?? URL;
  const fileName = createCanvasExportFileName('svg', options.now);
  const svgBlob = new Blob([serializeSvg(svgElement)], { type: 'image/svg+xml;charset=utf-8' });
  downloadBlob(svgBlob, fileName, documentRef, urlApi);

  return {
    ok: true,
    format: 'svg',
    fileName,
    fallbackUsed: false,
  };
}

function serializeSvg(svgElement: SVGSVGElement): string {
  return ensureSvgDownloadMarkup(new XMLSerializer().serializeToString(svgElement));
}

function loadImage(url: string, imageFactory: () => HTMLImageElement): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = imageFactory();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('PNG 导出时浏览器无法读取当前 SVG。'));
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('当前浏览器未能生成 PNG 文件。'));
      }
    }, 'image/png');
  });
}

function downloadBlob(
  blob: Blob,
  fileName: string,
  documentRef: Document,
  urlApi: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>,
): void {
  const url = urlApi.createObjectURL(blob);
  const anchor = documentRef.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  documentRef.body.append(anchor);
  anchor.click();
  anchor.remove();
  urlApi.revokeObjectURL(url);
}
