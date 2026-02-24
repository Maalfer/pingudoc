/**
 * Note to Word & ODT — Obsidian Plugin
 *
 * Export your Obsidian notes to Word (.docx) or OpenDocument (.odt) format,
 * preserving images, headings, lists, tables, and all formatting.
 */

import { Notice, Plugin, TFile, MarkdownView } from 'obsidian';
import { DEFAULT_SETTINGS, ExportPluginSettings, ExportSettingTab } from './settings';
import { parseMarkdown } from './parser';
import { convertToDocx } from './converter';
import { convertToOdt } from './odt-converter';
import { saveAs } from 'file-saver';

type ExportFormat = 'docx' | 'odt';

export default class NoteToDocxPlugin extends Plugin {
	settings: ExportPluginSettings;

	async onload() {
		await this.loadSettings();

		// Ribbon icon — quick export button (uses default format)
		this.addRibbonIcon('file-output', 'Export note (default format)', async () => {
			await this.exportActiveNote(this.settings.defaultFormat);
		});

		// Command: Export current note to Word (.docx)
		this.addCommand({
			id: 'export-to-docx',
			name: 'Export current note to Word (.docx)',
			checkCallback: (checking: boolean) => {
				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (activeView?.file) {
					if (!checking) {
						this.exportNote(activeView.file, 'docx');
					}
					return true;
				}
				return false;
			},
		});

		// Command: Export current note to ODT (.odt)
		this.addCommand({
			id: 'export-to-odt',
			name: 'Export current note to ODT (.odt)',
			checkCallback: (checking: boolean) => {
				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (activeView?.file) {
					if (!checking) {
						this.exportNote(activeView.file, 'odt');
					}
					return true;
				}
				return false;
			},
		});

		// File menu: right-click export options
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (file instanceof TFile && file.extension === 'md') {
					menu.addItem((item) => {
						item
							.setTitle('Export to Word (.docx)')
							.setIcon('file-output')
							.onClick(async () => {
								await this.exportNote(file, 'docx');
							});
					});
					menu.addItem((item) => {
						item
							.setTitle('Export to ODT (.odt)')
							.setIcon('file-output')
							.onClick(async () => {
								await this.exportNote(file, 'odt');
							});
					});
				}
			}),
		);

		// Settings tab
		this.addSettingTab(new ExportSettingTab(this.app, this));
	}

	onunload() {
		// Nothing to clean up
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<ExportPluginSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Export the currently active note.
	 */
	private async exportActiveNote(format: ExportFormat) {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView?.file) {
			new Notice('No active note to export.');
			return;
		}
		await this.exportNote(activeView.file, format);
	}

	/**
	 * Export a specific note to the given format.
	 */
	private async exportNote(file: TFile, format: ExportFormat) {
		const formatLabel = format === 'docx' ? 'Word (.docx)' : 'ODT (.odt)';
		const loadingNotice = new Notice(`Exporting to ${formatLabel}...`, 0);

		try {
			// 1. Read the Markdown content
			const content = await this.app.vault.read(file);

			// 2. Parse into AST
			const nodes = parseMarkdown(content);

			// 3. Get note title (filename without extension)
			const title = file.basename;

			// 4. Build export options
			const exportOptions = {
				title,
				author: this.settings.defaultAuthor || 'Obsidian User',
				imageMaxWidth: this.settings.imageMaxWidth,
				sourcePath: file.path,
			};

			// 5. Convert to the chosen format
			let blob: Blob;
			let fileName: string;

			if (format === 'odt') {
				blob = await convertToOdt(nodes, this.app, exportOptions);
				fileName = `${title}.odt`;
			} else {
				blob = await convertToDocx(nodes, this.app, exportOptions);
				fileName = `${title}.docx`;
			}

			// 6. Download the file
			saveAs(blob, fileName);

			loadingNotice.hide();
			new Notice(`✅ Exported: ${fileName}`);
		} catch (error) {
			loadingNotice.hide();
			console.error('Note export error:', error);
			new Notice(`❌ Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}
}
