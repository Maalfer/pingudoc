# Note to Word — Obsidian Plugin

![Cover](assets/portada.png)

**Note to Word** is an [Obsidian](https://obsidian.md) plugin that lets you export your notes to **Word (.docx)** and **OpenDocument (.odt)** formats with a single click. All your formatting — headings, bold, italic, lists, tables, code blocks, callouts, and embedded images — is faithfully preserved in the exported document.

---

## Features

- **One-click export** — Use the ribbon icon, the command palette, or the right-click context menu on any `.md` file.
- **DOCX & ODT support** — Export to Microsoft Word (`.docx`) or LibreOffice / OpenDocument (`.odt`).
- **Full formatting preservation** — Headings, bold, italic, strikethrough, inline code, code blocks, blockquotes, callouts, horizontal rules, and nested lists are all converted accurately.
- **Embedded images** — Images referenced in your notes (including wiki-link syntax like `![[image.png]]`) are resolved from the vault and embedded directly into the exported document.
- **Tables** — Markdown tables are converted into properly formatted, styled tables.
- **Configurable** — Set a default author name, choose the max image width, toggle frontmatter metadata inclusion, and pick your preferred export format from the settings panel.

---

## How to Use

### Export a Note

1. Open any Markdown note in Obsidian.
2. Click the **export icon** in the ribbon bar, or use the **Command Palette** (`Ctrl/Cmd + P`) and search for:
   - `Export current note to Word (.docx)`
   - `Export current note to ODT (.odt)`
3. The exported file will be downloaded automatically.

You can also **right-click** any `.md` file in the file explorer and choose the export option from the context menu.

![Export Button](assets/boton-exportar.png)

### Exported Document Preview

Below is an example of a note exported to Word format. Notice how headings, lists, and images are preserved:

![Document Preview](assets/documento.png)

---

## Installation

### From Obsidian Community Plugins (Recommended)

1. Open **Settings → Community Plugins** in Obsidian.
2. Click **Browse** and search for **"Note to Word"**.
3. Click **Install**, then **Enable**.

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/your-repo/releases).
2. Create a folder in your vault: `.obsidian/plugins/note-to-docx/`
3. Copy the downloaded files into that folder.
4. Restart Obsidian and enable the plugin in **Settings → Community Plugins**.

---

## Settings

| Setting | Description |
|---|---|
| **Author** | Default author name embedded in exported documents. |
| **Max Image Width** | Maximum width (px) for embedded images. Larger images are scaled down proportionally. |
| **Include Frontmatter** | When enabled, YAML frontmatter properties are included as document metadata. |
| **Default Export Format** | Choose between `.docx` (Word) and `.odt` (OpenDocument) as the default format. |

---

## Development

```bash
# Clone the repository
git clone https://github.com/your-repo/note-to-docx.git

# Install dependencies
npm install

# Start development build (watch mode)
npm run dev

# Production build
npm run build
```

**Requirements:** Node.js ≥ 16

---

## License

This project is licensed under the [0-BSD License](LICENSE).
