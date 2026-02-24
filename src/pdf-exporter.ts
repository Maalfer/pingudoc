import { App, Component, MarkdownRenderer } from 'obsidian';
import { resolveImageFile } from './image-handler';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export type PdfTheme = 'light' | 'dark';

export interface ExportToPdfOptions {
	app: App;
	markdown: string;
	sourcePath: string;
	title: string;
	theme: PdfTheme;
}

function decodeBase64ToUint8Array(base64: string): Uint8Array {
	return Uint8Array.from(Buffer.from(base64, 'base64'));
}

function wrapText(text: string, maxWidth: number, font: any, fontSize: number): string[] {
	const words = text.replace(/\r\n/g, '\n').split(/(\s+)/);
	const lines: string[] = [];
	let current = '';

	for (const w of words) {
		const candidate = current + w;
		const width = font.widthOfTextAtSize(candidate, fontSize);
		if (width <= maxWidth || current.trim().length === 0) {
			current = candidate;
			continue;
		}
		lines.push(current.trimEnd());
		current = w.trimStart();
	}
	if (current.trim().length) lines.push(current.trimEnd());
	return lines;
}

async function exportToPdfOffline(app: App, tmpEl: HTMLElement, title: string, theme: PdfTheme): Promise<Blob> {
	const pdf = await PDFDocument.create();
	const font = await pdf.embedFont(StandardFonts.Helvetica);
	const fontSize = 11;
	const lineHeight = 14;
	const margin = 36;

	const isDark = theme === 'dark';
	const bg = isDark ? rgb(0.12, 0.12, 0.12) : rgb(1, 1, 1);
	const fg = isDark ? rgb(0.92, 0.92, 0.92) : rgb(0.07, 0.07, 0.07);

	let page = pdf.addPage();
	let { width, height } = page.getSize();
	const maxWidth = width - margin * 2;
	let y = height - margin;

	const paintBackground = (p: any) => {
		const size = p.getSize();
		p.drawRectangle({ x: 0, y: 0, width: size.width, height: size.height, color: bg });
	};
	paintBackground(page);

	const rawText = (tmpEl.textContent ?? '').trim();
	const paragraphs = rawText.split(/\n\s*\n/g);

	for (const para of paragraphs) {
		const lines = wrapText(para, maxWidth, font, fontSize);
		for (const line of lines) {
			if (y < margin + lineHeight) {
				page = pdf.addPage();
				({ width, height } = page.getSize());
				y = height - margin;
				paintBackground(page);
			}
			page.drawText(line, { x: margin, y: y - fontSize, size: fontSize, font, color: fg });
			y -= lineHeight;
		}
		y -= lineHeight;
	}

	// Best-effort: append embedded images (png/jpg) below the text
	const imgs = Array.from(tmpEl.querySelectorAll('img'));
	for (const img of imgs) {
		const src = img.getAttribute('src') ?? '';
		if (!src.startsWith('data:')) continue;
		const match = src.match(/^data:([^;]+);base64,(.+)$/);
		if (!match) continue;
		const mime = match[1];
		const b64 = match[2];
		if (!b64) continue;

		try {
			const bytes = decodeBase64ToUint8Array(b64);
			const embedded = mime === 'image/png'
				? await pdf.embedPng(bytes)
				: (mime === 'image/jpeg' ? await pdf.embedJpg(bytes) : null);
			if (!embedded) continue;

			const scale = Math.min(maxWidth / embedded.width, 1);
			const drawW = embedded.width * scale;
			const drawH = embedded.height * scale;

			if (y < margin + drawH) {
				page = pdf.addPage();
				({ width, height } = page.getSize());
				y = height - margin;
				paintBackground(page);
			}

			page.drawImage(embedded, { x: margin, y: y - drawH, width: drawW, height: drawH });
			y -= drawH + lineHeight;
		} catch {
			// ignore image errors
		}
	}

	const bytes = await pdf.save();
	return new Blob([bytes], { type: 'application/pdf' });
}

function getElectron(): any {
	const w = window as unknown as { require?: (id: string) => any };
	if (typeof w.require === 'function') return w.require('electron');
	throw new Error('PDF export is only supported on Obsidian Desktop.');
}

function tryGetElectron(): any | null {
	try {
		const w = window as unknown as { require?: (id: string) => any };
		if (typeof w.require === 'function') return w.require('electron');
		return null;
	} catch {
		return null;
	}
}

function buildHtml(title: string, bodyHtml: string, theme: PdfTheme): string {
	const isDark = theme === 'dark';
	const background = isDark ? '#1e1e1e' : '#ffffff';
	const foreground = isDark ? '#e6e6e6' : '#111111';
	const link = isDark ? '#93c5fd' : '#2563eb';
	const codeBg = isDark ? '#2a2a2a' : '#f3f4f6';
	const border = isDark ? '#3a3a3a' : '#e5e7eb';

	return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
	@page { margin: 0; }
	html, body { height: 100%; background: ${background}; }
	body {
		margin: 0;
		padding: 18mm;
		background: ${background};
		color: ${foreground};
		font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
		font-size: 13.5px;
		line-height: 1.6;
		-webkit-print-color-adjust: exact;
		print-color-adjust: exact;
	}
	.container {
		max-width: 900px;
		margin: 0 auto;
		padding: 0;
	}
	h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 20px 0 10px; }
	a { color: ${link}; text-decoration: none; }
	a:hover { text-decoration: underline; }
	p { margin: 10px 0; }
	pre {
		background: ${codeBg};
		border: 1px solid ${border};
		border-radius: 8px;
		padding: 12px;
		overflow: auto;
	}
	code {
		background: ${codeBg};
		border: 1px solid ${border};
		border-radius: 6px;
		padding: 2px 6px;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
		font-size: 0.95em;
	}
	pre code { border: none; padding: 0; }
	blockquote {
		margin: 12px 0;
		padding: 8px 12px;
		border-left: 4px solid ${border};
		background: ${isDark ? '#232323' : '#fafafa'};
	}
	table { width: 100%; border-collapse: collapse; margin: 12px 0; }
	th, td { border: 1px solid ${border}; padding: 8px; vertical-align: top; }
	img { max-width: 100%; height: auto; }
</style>
</head>
<body>
	<div class="container">
		${bodyHtml}
	</div>
</body>
</html>`;
}

function toBase64(arrayBuffer: ArrayBuffer): string {
	return Buffer.from(new Uint8Array(arrayBuffer)).toString('base64');
}

function getImageMime(extension: string): string {
	switch (extension.toLowerCase()) {
		case 'png':
			return 'image/png';
		case 'jpg':
		case 'jpeg':
			return 'image/jpeg';
		case 'gif':
			return 'image/gif';
		case 'bmp':
			return 'image/bmp';
		case 'webp':
			return 'image/webp';
		case 'svg':
			return 'image/svg+xml';
		default:
			return 'application/octet-stream';
	}
}

async function embedImagesAsDataUrls(app: App, container: HTMLElement, sourcePath: string): Promise<void> {
	const imgs = Array.from(container.querySelectorAll('img'));
	for (const img of imgs) {
		const rawSrc = img.getAttribute('src') ?? '';
		if (!rawSrc) continue;
		if (rawSrc.startsWith('data:') || rawSrc.startsWith('http://') || rawSrc.startsWith('https://')) continue;

		const srcNoQuery = rawSrc.split('?')[0] ?? rawSrc;
		let candidate = decodeURIComponent(srcNoQuery);

		// Obsidian desktop often renders vault images as app://local/<...>/<filename>
		if (candidate.startsWith('app://local/')) {
			candidate = candidate.replace(/^app:\/\/local\//, '');
			candidate = candidate.split('/').pop() ?? candidate;
		}

		const file = resolveImageFile(app, candidate, sourcePath);
		if (!file) continue;

		const buffer = await app.vault.readBinary(file);
		const base64 = toBase64(buffer);
		const mime = getImageMime(file.extension);
		img.setAttribute('src', `data:${mime};base64,${base64}`);
	}
}

export async function exportToPdf(options: ExportToPdfOptions): Promise<Blob> {
	const component = new Component();
	component.load();

	const tmpEl = document.createElement('div');
	await MarkdownRenderer.renderMarkdown(options.markdown, tmpEl, options.sourcePath, component);
	await embedImagesAsDataUrls(options.app, tmpEl, options.sourcePath);
	const electron = tryGetElectron();
	if (!electron) {
		const blob = await exportToPdfOffline(options.app, tmpEl, options.title, options.theme);
		component.unload();
		return blob;
	}

	const bodyHtml = tmpEl.innerHTML;
	component.unload();

	const remote = electron.remote ?? electron;
	const BrowserWindow = remote.BrowserWindow;
	if (!BrowserWindow) {
		throw new Error('Unable to access Electron BrowserWindow for PDF export.');
	}

	const win = new BrowserWindow({
		show: false,
		webPreferences: {
			contextIsolation: true,
			sandbox: true,
		},
	});

	try {
		const html = buildHtml(options.title, bodyHtml, options.theme);
		await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

		const pdfBuffer: Buffer = await win.webContents.printToPDF({
			printBackground: true,
		});

		return new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' });
	} finally {
		win.destroy();
	}
}
