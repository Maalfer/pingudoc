import { App, Component, MarkdownRenderer } from 'obsidian';

export type PdfTheme = 'light' | 'dark';

export interface ExportToPdfOptions {
	app: App;
	markdown: string;
	sourcePath: string;
	title: string;
	theme: PdfTheme;
}

function getElectron(): any {
	const w = window as unknown as { require?: (id: string) => any };
	if (typeof w.require === 'function') return w.require('electron');
	throw new Error('PDF export is only supported on Obsidian Desktop.');
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
	@page { margin: 18mm; }
	html, body { height: 100%; }
	body {
		margin: 0;
		padding: 0;
		background: ${background};
		color: ${foreground};
		font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
		font-size: 13.5px;
		line-height: 1.6;
	}
	.container {
		max-width: 900px;
		margin: 0 auto;
		padding: 24px;
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

export async function exportToPdf(options: ExportToPdfOptions): Promise<Blob> {
	const component = new Component();
	component.load();

	const tmpEl = document.createElement('div');
	await MarkdownRenderer.renderMarkdown(options.markdown, tmpEl, options.sourcePath, component);
	const bodyHtml = tmpEl.innerHTML;
	component.unload();

	const electron = getElectron();
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
