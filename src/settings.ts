/**
 * Plugin settings for PinguDoc.
 */

import { App, PluginSettingTab, Setting } from 'obsidian';
import type PinguDocPlugin from './main';

export interface ExportPluginSettings {
	pdfTheme: 'light' | 'dark';
}

export const DEFAULT_SETTINGS: ExportPluginSettings = {
	pdfTheme: 'light',
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

		containerEl.createEl('h2', { text: 'PinguDoc — Settings' });

		new Setting(containerEl)
			.setName('PDF theme')
			.setDesc('Choose the theme used when exporting to PDF.')
			.addDropdown(dropdown => dropdown
				.addOption('light', 'Light')
				.addOption('dark', 'Dark')
				.setValue(this.plugin.settings.pdfTheme)
				.onChange(async (value) => {
					this.plugin.settings.pdfTheme = value as 'light' | 'dark';
					await this.plugin.saveSettings();
				}));
	}
}
