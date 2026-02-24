/**
 * ODT Converter - Converts parsed Markdown AST nodes into an OpenDocument Text file.
 *
 * ODT files are ZIP archives containing XML files following the ODF specification.
 * This module builds the ZIP using JSZip and structures the XML manually.
 */

import JSZip from 'jszip';
import { App } from 'obsidian';
import {
    MarkdownNode,
    InlineNode,
    ListNode,
} from './parser';
import { resolveImage, ResolvedImage } from './image-handler';

// Re-use the same options interface from the DOCX converter
export interface OdtConvertOptions {
    title: string;
    author: string;
    imageMaxWidth: number;
    sourcePath: string;
}

// ─── XML Escaping ────────────────────────────────────────────────

function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// ─── Image Collection & Resolution ──────────────────────────────

interface OdtImage {
    name: string;       // e.g. "Pictures/image_0.png"
    buffer: ArrayBuffer;
    width: number;      // px
    height: number;     // px
    extension: string;
}

async function collectAndResolveImages(
    nodes: MarkdownNode[],
    app: App,
    sourcePath: string,
    maxWidth: number,
): Promise<{ imageMap: Map<string, OdtImage>; images: OdtImage[] }> {
    const imageMap = new Map<string, OdtImage>();
    const images: OdtImage[] = [];

    function collectSources(nodeList: MarkdownNode[]): string[] {
        const sources: string[] = [];
        for (const node of nodeList) {
            if (node.type === 'image') {
                sources.push(node.src);
            } else if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'blockquote' || node.type === 'callout') {
                for (const child of node.children) {
                    if (child.type === 'inlineimage') {
                        sources.push(child.src);
                    }
                }
            } else if (node.type === 'list') {
                for (const item of node.items) {
                    for (const child of item.children) {
                        if (child.type === 'inlineimage') {
                            sources.push(child.src);
                        }
                    }
                }
            }
        }
        return sources;
    }

    const uniqueSources = [...new Set(collectSources(nodes))];
    let idx = 0;

    for (const src of uniqueSources) {
        const resolved = await resolveImage(app, src, sourcePath);
        if (resolved) {
            const ext = resolved.extension || 'png';
            let w = resolved.width;
            let h = resolved.height;
            if (w > maxWidth) {
                const ratio = maxWidth / w;
                h = Math.round(h * ratio);
                w = maxWidth;
            }
            const img: OdtImage = {
                name: `Pictures/image_${idx}.${ext}`,
                buffer: resolved.buffer,
                width: w,
                height: h,
                extension: ext,
            };
            imageMap.set(src, img);
            images.push(img);
            idx++;
        }
    }

    return { imageMap, images };
}

// ─── Inline Nodes → ODT XML ─────────────────────────────────────

function inlineNodesToXml(nodes: InlineNode[], imageMap: Map<string, OdtImage>): string {
    let xml = '';

    for (const node of nodes) {
        switch (node.type) {
            case 'text':
                xml += `<text:span>${escapeXml(node.content)}</text:span>`;
                break;
            case 'bold':
                xml += `<text:span text:style-name="Bold">${escapeXml(node.content)}</text:span>`;
                break;
            case 'italic':
                xml += `<text:span text:style-name="Italic">${escapeXml(node.content)}</text:span>`;
                break;
            case 'bolditalic':
                xml += `<text:span text:style-name="BoldItalic">${escapeXml(node.content)}</text:span>`;
                break;
            case 'strikethrough':
                xml += `<text:span text:style-name="Strikethrough">${escapeXml(node.content)}</text:span>`;
                break;
            case 'inlinecode':
                xml += `<text:span text:style-name="InlineCode">${escapeXml(node.content)}</text:span>`;
                break;
            case 'link':
                xml += `<text:a xlink:type="simple" xlink:href="${escapeXml(node.url.startsWith('http') ? node.url : '#')}">${escapeXml(node.text)}</text:a>`;
                break;
            case 'inlineimage': {
                const img = imageMap.get(node.src);
                if (img) {
                    const widthCm = (img.width / 96 * 2.54).toFixed(2);
                    const heightCm = (img.height / 96 * 2.54).toFixed(2);
                    xml += `<draw:frame draw:style-name="ImageFrame" draw:name="${escapeXml(node.alt || node.src)}" ` +
                        `text:anchor-type="as-char" svg:width="${widthCm}cm" svg:height="${heightCm}cm">` +
                        `<draw:image xlink:href="${img.name}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>` +
                        `</draw:frame>`;
                } else {
                    xml += `<text:span text:style-name="Italic">[Image: ${escapeXml(node.src)}]</text:span>`;
                }
                break;
            }
        }
    }

    return xml;
}

// ─── Block Nodes → ODT XML ──────────────────────────────────────

function listToXml(node: ListNode, imageMap: Map<string, OdtImage>, level: number = 0): string {
    const listTag = node.ordered ? 'text:list' : 'text:list';
    const styleName = node.ordered ? 'OrderedList' : 'BulletList';
    let xml = `<${listTag} text:style-name="${styleName}">`;

    for (const item of node.items) {
        xml += '<text:list-item>';

        let prefix = '';
        if (item.checked !== undefined) {
            prefix = item.checked ? '☑ ' : '☐ ';
        }

        const inlineContent = inlineNodesToXml(item.children, imageMap);
        xml += `<text:p text:style-name="ListParagraph">${escapeXml(prefix)}${inlineContent}</text:p>`;

        if (item.subList) {
            xml += listToXml(item.subList, imageMap, level + 1);
        }

        xml += '</text:list-item>';
    }

    xml += `</${listTag}>`;
    return xml;
}

function tableToXml(node: { headers: InlineNode[][]; rows: InlineNode[][][] }, imageMap: Map<string, OdtImage>): string {
    const colCount = Math.max(node.headers.length, 1);
    let xml = '<table:table table:name="Table" table:style-name="Table">';

    // Column definitions
    for (let i = 0; i < colCount; i++) {
        xml += '<table:table-column table:style-name="TableColumn"/>';
    }

    // Header row
    xml += '<table:table-header-rows><table:table-row>';
    for (const cell of node.headers) {
        xml += '<table:table-cell table:style-name="HeaderCell" office:value-type="string">';
        xml += `<text:p text:style-name="TableHeaderParagraph">${inlineNodesToXml(cell, imageMap)}</text:p>`;
        xml += '</table:table-cell>';
    }
    xml += '</table:table-row></table:table-header-rows>';

    // Data rows
    for (const row of node.rows) {
        xml += '<table:table-row>';
        for (const cell of row) {
            xml += '<table:table-cell table:style-name="DataCell" office:value-type="string">';
            xml += `<text:p text:style-name="TableParagraph">${inlineNodesToXml(cell, imageMap)}</text:p>`;
            xml += '</table:table-cell>';
        }
        xml += '</table:table-row>';
    }

    xml += '</table:table>';
    return xml;
}

function nodeToXml(node: MarkdownNode, imageMap: Map<string, OdtImage>): string {
    switch (node.type) {
        case 'heading': {
            const styleName = `Heading${node.level}`;
            return `<text:h text:style-name="${styleName}" text:outline-level="${node.level}">${inlineNodesToXml(node.children, imageMap)}</text:h>`;
        }

        case 'paragraph':
            return `<text:p text:style-name="TextBody">${inlineNodesToXml(node.children, imageMap)}</text:p>`;

        case 'list':
            return listToXml(node, imageMap);

        case 'codeblock': {
            const lines = node.content.split('\n');
            return lines.map(line =>
                `<text:p text:style-name="CodeBlock">${escapeXml(line || ' ')}</text:p>`
            ).join('');
        }

        case 'blockquote':
            return `<text:p text:style-name="Blockquote">${inlineNodesToXml(node.children, imageMap)}</text:p>`;

        case 'callout': {
            const title = `<text:p text:style-name="CalloutTitle">${escapeXml(node.calloutType)}: ${escapeXml(node.title)}</text:p>`;
            const body = `<text:p text:style-name="CalloutBody">${inlineNodesToXml(node.children, imageMap)}</text:p>`;
            return title + body;
        }

        case 'table':
            return tableToXml(node, imageMap);

        case 'horizontalrule':
            return '<text:p text:style-name="HorizontalRule"/>';

        case 'image': {
            const img = imageMap.get(node.src);
            if (img) {
                const widthCm = (img.width / 96 * 2.54).toFixed(2);
                const heightCm = (img.height / 96 * 2.54).toFixed(2);
                return `<text:p text:style-name="ImageParagraph">` +
                    `<draw:frame draw:style-name="ImageFrame" draw:name="${escapeXml(node.alt || node.src)}" ` +
                    `text:anchor-type="as-char" svg:width="${widthCm}cm" svg:height="${heightCm}cm">` +
                    `<draw:image xlink:href="${img.name}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>` +
                    `</draw:frame></text:p>`;
            }
            return `<text:p text:style-name="TextBody"><text:span text:style-name="Italic">[Image not found: ${escapeXml(node.src)}]</text:span></text:p>`;
        }

        default:
            return '';
    }
}

// ─── ODT XML Templates ──────────────────────────────────────────

function buildMimetype(): string {
    return 'application/vnd.oasis.opendocument.text';
}

function buildMeta(title: string, author: string): string {
    const now = new Date().toISOString();

    return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
                     xmlns:dc="http://purl.org/dc/elements/1.1/"
                     xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"
                     office:version="1.2">
  <office:meta>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <meta:creation-date>${now}</meta:creation-date>
    <dc:date>${now}</dc:date>
    <meta:generator>PinguDoc</meta:generator>
  </office:meta>
</office:document-meta>`;
}

function buildManifest(images: OdtImage[]): string {
    let entries = `  <manifest:file-entry manifest:media-type="application/vnd.oasis.opendocument.text" manifest:full-path="/"/>
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="content.xml"/>
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="styles.xml"/>
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="meta.xml"/>`;

    for (const img of images) {
        const mimeType = getMimeType(img.extension);
        entries += `\n  <manifest:file-entry manifest:media-type="${mimeType}" manifest:full-path="${img.name}"/>`;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
${entries}
</manifest:manifest>`;
}

function getMimeType(ext: string): string {
    switch (ext.toLowerCase()) {
        case 'png': return 'image/png';
        case 'jpg': case 'jpeg': return 'image/jpeg';
        case 'gif': return 'image/gif';
        case 'bmp': return 'image/bmp';
        case 'svg': return 'image/svg+xml';
        case 'webp': return 'image/webp';
        default: return 'image/png';
    }
}

function buildStyles(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
    xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
    xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
    xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
    xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
    xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
    office:version="1.2">
  <office:styles>
    <!-- Default text style -->
    <style:style style:name="Default" style:family="paragraph">
      <style:paragraph-properties fo:margin-bottom="0.2cm"/>
      <style:text-properties fo:font-family="Calibri" fo:font-size="11pt"/>
    </style:style>
    <!-- Heading styles -->
    <style:style style:name="Heading1" style:family="paragraph" style:parent-style-name="Default">
      <style:paragraph-properties fo:margin-top="0.5cm" fo:margin-bottom="0.3cm"/>
      <style:text-properties fo:font-size="18pt" fo:font-weight="bold" fo:color="#1E293B"/>
    </style:style>
    <style:style style:name="Heading2" style:family="paragraph" style:parent-style-name="Default">
      <style:paragraph-properties fo:margin-top="0.4cm" fo:margin-bottom="0.25cm"/>
      <style:text-properties fo:font-size="15pt" fo:font-weight="bold" fo:color="#334155"/>
    </style:style>
    <style:style style:name="Heading3" style:family="paragraph" style:parent-style-name="Default">
      <style:paragraph-properties fo:margin-top="0.35cm" fo:margin-bottom="0.2cm"/>
      <style:text-properties fo:font-size="13pt" fo:font-weight="bold" fo:color="#475569"/>
    </style:style>
    <style:style style:name="Heading4" style:family="paragraph" style:parent-style-name="Default">
      <style:paragraph-properties fo:margin-top="0.3cm" fo:margin-bottom="0.15cm"/>
      <style:text-properties fo:font-size="12pt" fo:font-weight="bold" fo:color="#475569"/>
    </style:style>
    <style:style style:name="Heading5" style:family="paragraph" style:parent-style-name="Default">
      <style:paragraph-properties fo:margin-top="0.25cm" fo:margin-bottom="0.1cm"/>
      <style:text-properties fo:font-size="11pt" fo:font-weight="bold" fo:color="#64748B"/>
    </style:style>
    <style:style style:name="Heading6" style:family="paragraph" style:parent-style-name="Default">
      <style:paragraph-properties fo:margin-top="0.2cm" fo:margin-bottom="0.1cm"/>
      <style:text-properties fo:font-size="11pt" fo:font-weight="bold" fo:font-style="italic" fo:color="#64748B"/>
    </style:style>
    <!-- Body text -->
    <style:style style:name="TextBody" style:family="paragraph" style:parent-style-name="Default">
      <style:paragraph-properties fo:margin-bottom="0.2cm"/>
    </style:style>
    <!-- Code block -->
    <style:style style:name="CodeBlock" style:family="paragraph" style:parent-style-name="Default">
      <style:paragraph-properties fo:background-color="#F1F5F9" fo:margin-left="0.6cm" fo:margin-bottom="0cm"/>
      <style:text-properties fo:font-family="Courier New" fo:font-size="9pt"/>
    </style:style>
    <!-- Blockquote -->
    <style:style style:name="Blockquote" style:family="paragraph" style:parent-style-name="Default">
      <style:paragraph-properties fo:margin-left="1cm" fo:border-left="0.06cm solid #94A3B8" fo:padding-left="0.3cm"/>
    </style:style>
    <!-- Callouts -->
    <style:style style:name="CalloutTitle" style:family="paragraph" style:parent-style-name="Default">
      <style:paragraph-properties fo:margin-left="0.6cm" fo:border-left="0.06cm solid #3B82F6" fo:padding-left="0.3cm" fo:margin-top="0.2cm"/>
      <style:text-properties fo:font-weight="bold" fo:color="#3B82F6"/>
    </style:style>
    <style:style style:name="CalloutBody" style:family="paragraph" style:parent-style-name="Default">
      <style:paragraph-properties fo:margin-left="1cm" fo:border-left="0.06cm solid #3B82F6" fo:padding-left="0.3cm" fo:margin-bottom="0.2cm"/>
    </style:style>
    <!-- Horizontal rule -->
    <style:style style:name="HorizontalRule" style:family="paragraph" style:parent-style-name="Default">
      <style:paragraph-properties fo:border-bottom="0.06cm solid #CBD5E1" fo:margin-top="0.3cm" fo:margin-bottom="0.3cm"/>
    </style:style>
    <!-- Image paragraph -->
    <style:style style:name="ImageParagraph" style:family="paragraph" style:parent-style-name="Default">
      <style:paragraph-properties fo:text-align="center" fo:margin-top="0.3cm" fo:margin-bottom="0.3cm"/>
    </style:style>
    <!-- List paragraph -->
    <style:style style:name="ListParagraph" style:family="paragraph" style:parent-style-name="Default">
      <style:paragraph-properties fo:margin-bottom="0.1cm"/>
    </style:style>
    <!-- Table styles -->
    <style:style style:name="TableHeaderParagraph" style:family="paragraph" style:parent-style-name="Default">
      <style:text-properties fo:font-weight="bold"/>
    </style:style>
    <style:style style:name="TableParagraph" style:family="paragraph" style:parent-style-name="Default"/>
    <!-- Inline text styles -->
    <style:style style:name="Bold" style:family="text">
      <style:text-properties fo:font-weight="bold"/>
    </style:style>
    <style:style style:name="Italic" style:family="text">
      <style:text-properties fo:font-style="italic"/>
    </style:style>
    <style:style style:name="BoldItalic" style:family="text">
      <style:text-properties fo:font-weight="bold" fo:font-style="italic"/>
    </style:style>
    <style:style style:name="Strikethrough" style:family="text">
      <style:text-properties style:text-line-through-style="solid"/>
    </style:style>
    <style:style style:name="InlineCode" style:family="text">
      <style:text-properties fo:font-family="Courier New" fo:font-size="10pt" fo:background-color="#E8E8E8"/>
    </style:style>
    <!-- Image frame -->
    <style:style style:name="ImageFrame" style:family="graphic">
      <style:graphic-properties fo:margin-left="0cm" fo:margin-right="0cm" fo:margin-top="0cm" fo:margin-bottom="0cm"/>
    </style:style>
    <!-- Table styles -->
    <style:style style:name="Table" style:family="table">
      <style:table-properties style:width="17cm" table:align="margins"/>
    </style:style>
    <style:style style:name="TableColumn" style:family="table-column">
      <style:table-column-properties style:use-optimal-column-width="true"/>
    </style:style>
    <style:style style:name="HeaderCell" style:family="table-cell">
      <style:table-cell-properties fo:padding="0.1cm" fo:border="0.05cm solid #CCCCCC" fo:background-color="#E2E8F0"/>
    </style:style>
    <style:style style:name="DataCell" style:family="table-cell">
      <style:table-cell-properties fo:padding="0.1cm" fo:border="0.05cm solid #CCCCCC"/>
    </style:style>
  </office:styles>
  <office:automatic-styles>
    <style:page-layout style:name="pm1">
      <style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm"
          fo:margin-top="2.54cm" fo:margin-bottom="2.54cm"
          fo:margin-left="2.54cm" fo:margin-right="2.54cm"/>
    </style:page-layout>
  </office:automatic-styles>
  <office:master-styles>
    <style:master-page style:name="Standard" style:page-layout-name="pm1"/>
  </office:master-styles>
</office:document-styles>`;
}

function buildContent(bodyXml: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
    xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
    xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
    xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
    xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
    xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
    xmlns:xlink="http://www.w3.org/1999/xlink"
    xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"
    office:version="1.2">
  <office:automatic-styles>
    <text:list-style style:name="BulletList">
      <text:list-level-style-bullet text:level="1" text:bullet-char="•">
        <style:list-level-properties text:space-before="0.5cm" text:min-label-width="0.5cm"/>
      </text:list-level-style-bullet>
      <text:list-level-style-bullet text:level="2" text:bullet-char="◦">
        <style:list-level-properties text:space-before="1cm" text:min-label-width="0.5cm"/>
      </text:list-level-style-bullet>
      <text:list-level-style-bullet text:level="3" text:bullet-char="▪">
        <style:list-level-properties text:space-before="1.5cm" text:min-label-width="0.5cm"/>
      </text:list-level-style-bullet>
    </text:list-style>
    <text:list-style style:name="OrderedList">
      <text:list-level-style-number text:level="1" style:num-format="1" style:num-suffix=".">
        <style:list-level-properties text:space-before="0.5cm" text:min-label-width="0.5cm"/>
      </text:list-level-style-number>
      <text:list-level-style-number text:level="2" style:num-format="a" style:num-suffix=".">
        <style:list-level-properties text:space-before="1cm" text:min-label-width="0.5cm"/>
      </text:list-level-style-number>
      <text:list-level-style-number text:level="3" style:num-format="i" style:num-suffix=".">
        <style:list-level-properties text:space-before="1.5cm" text:min-label-width="0.5cm"/>
      </text:list-level-style-number>
    </text:list-style>
  </office:automatic-styles>
  <office:body>
    <office:text>
${bodyXml}
    </office:text>
  </office:body>
</office:document-content>`;
}

// ─── Main Export Function ────────────────────────────────────────

/**
 * Convert an array of MarkdownNodes into an ODT Blob.
 */
export async function convertToOdt(
    nodes: MarkdownNode[],
    app: App,
    options: OdtConvertOptions,
): Promise<Blob> {
    // Resolve all images
    const { imageMap, images } = await collectAndResolveImages(
        nodes, app, options.sourcePath, options.imageMaxWidth,
    );

    // Generate body XML from all nodes
    let bodyXml = '';
    for (const node of nodes) {
        bodyXml += nodeToXml(node, imageMap);
    }

    // Build the ZIP archive
    const zip = new JSZip();

    // mimetype must be first entry and uncompressed
    zip.file('mimetype', buildMimetype(), { compression: 'STORE' });

    // XML files
    zip.file('content.xml', buildContent(bodyXml));
    zip.file('styles.xml', buildStyles());
    zip.file('meta.xml', buildMeta(options.title, options.author));
    zip.file('META-INF/manifest.xml', buildManifest(images));

    // Embed images
    for (const img of images) {
        zip.file(img.name, img.buffer);
    }

    // Generate the blob
    return await zip.generateAsync({
        type: 'blob',
        mimeType: 'application/vnd.oasis.opendocument.text',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
    });
}
