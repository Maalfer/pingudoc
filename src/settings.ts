/**
 * Plugin settings for Note to Word & ODT export.
 */

import { App, PluginSettingTab, Setting } from 'obsidian';
import type NoteToDocxPlugin from './main';

export interface ExportPluginSettings {
	defaultAuthor: string;
	imageMaxWidth: number;
	includeMetadata: boolean;
	defaultFormat: 'docx' | 'odt';
}

export const DEFAULT_SETTINGS: ExportPluginSettings = {
	defaultAuthor: '',
	imageMaxWidth: 600,
	includeMetadata: false,
	defaultFormat: 'docx',
};

export class ExportSettingTab extends PluginSettingTab {
	plugin: NoteToDocxPlugin;

	constructor(app: App, plugin: NoteToDocxPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Note to Word & ODT — Settings' });

		new Setting(containerEl)
			.setName('Default export format')
			.setDesc('Choose the default format when using the ribbon icon or quick export.')
			.addDropdown(dropdown => dropdown
				.addOption('docx', 'Word (.docx)')
				.addOption('odt', 'OpenDocument (.odt)')
				.setValue(this.plugin.settings.defaultFormat)
				.onChange(async (value) => {
					this.plugin.settings.defaultFormat = value as 'docx' | 'odt';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Author')
			.setDesc('Default author name for exported documents.')
			.addText(text => text
				.setPlaceholder('Your name')
				.setValue(this.plugin.settings.defaultAuthor)
				.onChange(async (value) => {
					this.plugin.settings.defaultAuthor = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Max image width (px)')
			.setDesc('Maximum width in pixels for embedded images. Images larger than this will be scaled down proportionally.')
			.addText(text => text
				.setPlaceholder('600')
				.setValue(String(this.plugin.settings.imageMaxWidth))
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num > 0) {
						this.plugin.settings.imageMaxWidth = num;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Include frontmatter metadata')
			.setDesc('If enabled, YAML frontmatter properties will be included as document metadata in the exported file.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.includeMetadata)
				.onChange(async (value) => {
					this.plugin.settings.includeMetadata = value;
					await this.plugin.saveSettings();
				}));
	}
}
