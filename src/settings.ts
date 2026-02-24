/**
 * Plugin settings for PinguDoc.
 */

import { App, PluginSettingTab, Setting } from 'obsidian';
import type PinguDocPlugin from './main';
import type { ExportFormat } from './main';

export interface ExportPluginSettings {
	language: 'en' | 'es' | 'pt';
	pdfTheme: 'light' | 'dark';
}

export const DEFAULT_SETTINGS: ExportPluginSettings = {
	language: 'en',
	pdfTheme: 'light',
};

type I18nKey =
	| 'settingsTitle'
	| 'export'
	| 'exportDocx'
	| 'exportOdt'
	| 'exportPdf'
	| 'language'
	| 'languageDesc'
	| 'pdfTheme'
	| 'pdfThemeDesc'
	| 'light'
	| 'dark';

const STRINGS: Record<ExportPluginSettings['language'], Record<I18nKey, string>> = {
	en: {
		settingsTitle: 'PinguDoc — Settings',
		export: 'Export...',
		exportDocx: 'Export to Word (.docx)',
		exportOdt: 'Export to ODT (.odt)',
		exportPdf: 'Export to PDF (.pdf)',
		language: 'Language',
		languageDesc: 'Choose the language used in this settings panel.',
		pdfTheme: 'PDF theme',
		pdfThemeDesc: 'Choose the theme used when exporting to PDF.',
		light: 'Light',
		dark: 'Dark',
	},
	es: {
		settingsTitle: 'PinguDoc — Ajustes',
		export: 'Exportar...',
		exportDocx: 'Exportar a Word (.docx)',
		exportOdt: 'Exportar a ODT (.odt)',
		exportPdf: 'Exportar a PDF (.pdf)',
		language: 'Idioma',
		languageDesc: 'Elige el idioma usado en este panel de ajustes.',
		pdfTheme: 'Tema del PDF',
		pdfThemeDesc: 'Elige el tema usado al exportar a PDF.',
		light: 'Claro',
		dark: 'Oscuro',
	},
	pt: {
		settingsTitle: 'PinguDoc — Configurações',
		export: 'Exportar...',
		exportDocx: 'Exportar para Word (.docx)',
		exportOdt: 'Exportar para ODT (.odt)',
		exportPdf: 'Exportar para PDF (.pdf)',
		language: 'Idioma',
		languageDesc: 'Escolha o idioma usado neste painel de configurações.',
		pdfTheme: 'Tema do PDF',
		pdfThemeDesc: 'Escolha o tema usado ao exportar para PDF.',
		light: 'Claro',
		dark: 'Escuro',
	},
};

export class ExportSettingTab extends PluginSettingTab {
	plugin: PinguDocPlugin;

	constructor(app: App, plugin: PinguDocPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		const t = (key: I18nKey): string => STRINGS[this.plugin.settings.language][key];

		containerEl.createEl('h2', { text: t('settingsTitle') });

		// Export dropdown (hover)
		const exportRow = containerEl.createDiv({ cls: 'setting-item' });
		exportRow.createDiv({ cls: 'setting-item-info' });
		const exportControl = exportRow.createDiv({ cls: 'setting-item-control' });
		const exportWrap = exportControl.createDiv();
		exportWrap.style.position = 'relative';
		exportWrap.style.display = 'inline-block';

		const exportButton = exportWrap.createEl('button', { text: t('export') });
		exportButton.addClass('mod-cta');

		const menu = exportWrap.createDiv();
		menu.style.position = 'absolute';
		menu.style.top = '100%';
		menu.style.left = '0';
		menu.style.zIndex = '1000';
		menu.style.display = 'none';
		menu.style.minWidth = '220px';
		menu.style.borderRadius = '8px';
		menu.style.padding = '6px';
		menu.style.marginTop = '6px';
		menu.style.background = 'var(--background-secondary)';
		menu.style.border = '1px solid var(--background-modifier-border)';
		menu.style.boxShadow = 'var(--shadow-s)';

		const addMenuItem = (label: string, format: ExportFormat) => {
			const item = menu.createEl('div', { text: label });
			item.style.padding = '8px 10px';
			item.style.borderRadius = '6px';
			item.style.cursor = 'pointer';
			item.onmouseenter = () => {
				item.style.background = 'var(--background-modifier-hover)';
			};
			item.onmouseleave = () => {
				item.style.background = 'transparent';
			};
			item.onclick = async () => {
				menu.style.display = 'none';
				await this.plugin.exportActiveNote(format);
			};
		};

		addMenuItem(t('exportDocx'), 'docx');
		addMenuItem(t('exportOdt'), 'odt');
		addMenuItem(t('exportPdf'), 'pdf');

		exportWrap.onmouseenter = () => {
			menu.style.display = 'block';
		};
		exportWrap.onmouseleave = () => {
			menu.style.display = 'none';
		};

		new Setting(containerEl)
			.setName(t('language'))
			.setDesc(t('languageDesc'))
			.addDropdown(dropdown => dropdown
				.addOption('en', 'English')
				.addOption('es', 'Español')
				.addOption('pt', 'Português')
				.setValue(this.plugin.settings.language)
				.onChange(async (value) => {
					this.plugin.settings.language = value as ExportPluginSettings['language'];
					await this.plugin.saveSettings();
					this.display();
				}));

		new Setting(containerEl)
			.setName(t('pdfTheme'))
			.setDesc(t('pdfThemeDesc'))
			.addDropdown(dropdown => dropdown
				.addOption('light', t('light'))
				.addOption('dark', t('dark'))
				.setValue(this.plugin.settings.pdfTheme)
				.onChange(async (value) => {
					this.plugin.settings.pdfTheme = value as 'light' | 'dark';
					await this.plugin.saveSettings();
				}));
	}
}
