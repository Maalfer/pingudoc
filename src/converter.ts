/**
 * DOCX Converter - Converts parsed Markdown AST nodes into a Word document.
 */

import {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    AlignmentType,
    BorderStyle,
    ImageRun,
    ExternalHyperlink,
    Table,
    TableRow,
    TableCell,
    WidthType,
    ShadingType,
    LevelFormat,
    convertInchesToTwip,
} from 'docx';
import { App } from 'obsidian';
import {
    MarkdownNode,
    InlineNode,
    ListNode,
    ListItemNode,
} from './parser';
import { resolveImage, ResolvedImage } from './image-handler';

// ─── Configuration ───────────────────────────────────────────────

export interface ConvertOptions {
    title: string;
    author: string;
    imageMaxWidth: number; // pixels
    sourcePath: string; // The path of the source note in the vault
}

// ─── Heading Level Mapping ───────────────────────────────────────

const HEADING_MAP: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
    4: HeadingLevel.HEADING_4,
    5: HeadingLevel.HEADING_5,
    6: HeadingLevel.HEADING_6,
};

// ─── Inline Conversion ──────────────────────────────────────────

interface InlineConvertContext {
    app: App;
    sourcePath: string;
    imageMaxWidth: number;
    resolvedImages: Map<string, ResolvedImage | null>;
}

/**
 * Convert InlineNode[] to an array of docx TextRun / ImageRun / ExternalHyperlink.
 */
function convertInlineNodes(
    nodes: InlineNode[],
    ctx: InlineConvertContext,
): (TextRun | ImageRun | ExternalHyperlink)[] {
    const runs: (TextRun | ImageRun | ExternalHyperlink)[] = [];

    for (const node of nodes) {
        switch (node.type) {
            case 'text':
                runs.push(new TextRun({ text: node.content }));
                break;
            case 'bold':
                runs.push(new TextRun({ text: node.content, bold: true }));
                break;
            case 'italic':
                runs.push(new TextRun({ text: node.content, italics: true }));
                break;
            case 'bolditalic':
                runs.push(new TextRun({ text: node.content, bold: true, italics: true }));
                break;
            case 'strikethrough':
                runs.push(new TextRun({ text: node.content, strike: true }));
                break;
            case 'inlinecode':
                runs.push(new TextRun({
                    text: node.content,
                    font: 'Courier New',
                    size: 20, // 10pt
                    shading: {
                        type: ShadingType.SOLID,
                        color: 'E8E8E8',
                        fill: 'E8E8E8',
                    },
                }));
                break;
            case 'link':
                runs.push(new ExternalHyperlink({
                    children: [
                        new TextRun({
                            text: node.text,
                            color: '2563EB',
                            underline: { type: 'single' as never },
                        }),
                    ],
                    link: node.url.startsWith('http') ? node.url : `https://obsidian.md`,
                }));
                break;
            case 'inlineimage': {
                const resolved = ctx.resolvedImages.get(node.src);
                if (resolved) {
                    const { width, height } = calculateDimensions(
                        resolved.width,
                        resolved.height,
                        node.width ?? ctx.imageMaxWidth,
                    );
                    runs.push(new ImageRun({
                        data: resolved.buffer,
                        transformation: { width, height },
                        type: mapImageExtension(resolved.extension),
                    }));
                } else {
                    // Image not found — show placeholder text
                    runs.push(new TextRun({
                        text: `[Image: ${node.src}]`,
                        italics: true,
                        color: '999999',
                    }));
                }
                break;
            }
        }
    }

    return runs;
}

// ─── Helper Functions ────────────────────────────────────────────

function mapImageExtension(ext: string): 'png' | 'jpg' | 'gif' | 'bmp' {
    switch (ext.toLowerCase()) {
        case 'jpg':
        case 'jpeg':
            return 'jpg';
        case 'gif':
            return 'gif';
        case 'bmp':
            return 'bmp';
        default:
            return 'png';
    }
}

function calculateDimensions(
    originalWidth: number,
    originalHeight: number,
    maxWidth: number,
): { width: number; height: number } {
    if (originalWidth <= maxWidth) {
        return { width: originalWidth, height: originalHeight };
    }
    const ratio = maxWidth / originalWidth;
    return {
        width: maxWidth,
        height: Math.round(originalHeight * ratio),
    };
}

// ─── Block-Level Conversion ──────────────────────────────────────

/**
 * Pre-resolve all images referenced in the AST so conversion is synchronous.
 */
async function preResolveImages(
    nodes: MarkdownNode[],
    app: App,
    sourcePath: string,
): Promise<Map<string, ResolvedImage | null>> {
    const imageMap = new Map<string, ResolvedImage | null>();

    function collectImageSources(nodeList: MarkdownNode[]): string[] {
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

    const sources = [...new Set(collectImageSources(nodes))];

    for (const src of sources) {
        if (!imageMap.has(src)) {
            const resolved = await resolveImage(app, src, sourcePath);
            imageMap.set(src, resolved);
        }
    }

    return imageMap;
}

/**
 * Convert a list node into an array of paragraphs with bullet/numbering.
 */
function convertList(
    node: ListNode,
    ctx: InlineConvertContext,
    level: number = 0,
): Paragraph[] {
    const paragraphs: Paragraph[] = [];
    const reference = node.ordered ? 'ordered-list' : 'bullet-list';

    for (const item of node.items) {
        const runs = convertInlineNodes(item.children, ctx);

        // Add checkbox prefix if applicable
        if (item.checked !== undefined) {
            const checkbox = item.checked ? '☑ ' : '☐ ';
            runs.unshift(new TextRun({ text: checkbox }));
        }

        paragraphs.push(new Paragraph({
            children: runs,
            numbering: { reference, level },
            spacing: { after: 80 },
        }));

        // Handle sub-lists
        if (item.subList) {
            paragraphs.push(...convertList(item.subList, ctx, level + 1));
        }
    }

    return paragraphs;
}

/**
 * Convert a table node into a docx Table.
 */
function convertTable(
    node: { headers: InlineNode[][]; rows: InlineNode[][][] },
    ctx: InlineConvertContext,
): Table {
    const headerRow = new TableRow({
        tableHeader: true,
        children: node.headers.map(cellInlines => {
            // Build bold inline nodes for header cells
            const boldInlines: InlineNode[] = cellInlines.map(n => {
                if (n.type === 'text') {
                    return { type: 'bold' as const, content: n.content };
                }
                return n;
            });
            return new TableCell({
                children: [new Paragraph({
                    children: convertInlineNodes(boldInlines, ctx),
                })],
                shading: { type: ShadingType.SOLID, color: 'E2E8F0', fill: 'E2E8F0' },
                width: { size: 100 / Math.max(node.headers.length, 1), type: WidthType.PERCENTAGE },
            });
        }),
    });

    const dataRows = node.rows.map(row => new TableRow({
        children: row.map(cellInlines => new TableCell({
            children: [new Paragraph({
                children: convertInlineNodes(cellInlines, ctx),
            })],
            width: { size: 100 / Math.max(node.headers.length, 1), type: WidthType.PERCENTAGE },
        })),
    }));

    const borderDef = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
    return new Table({
        rows: [headerRow, ...dataRows],
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
            top: borderDef,
            bottom: borderDef,
            left: borderDef,
            right: borderDef,
            insideHorizontal: borderDef,
            insideVertical: borderDef,
        },
    });
}

/**
 * Convert a single MarkdownNode into one or more docx elements.
 */
function convertNode(
    node: MarkdownNode,
    ctx: InlineConvertContext,
): (Paragraph | Table)[] {
    switch (node.type) {
        case 'heading':
            return [new Paragraph({
                children: convertInlineNodes(node.children, ctx),
                heading: HEADING_MAP[node.level],
                spacing: { before: 240, after: 120 },
            })];

        case 'paragraph':
            return [new Paragraph({
                children: convertInlineNodes(node.children, ctx),
                spacing: { after: 200 },
            })];

        case 'list':
            return convertList(node, ctx);

        case 'codeblock': {
            const codeLines = node.content.split('\n');
            return codeLines.map((line, idx) => new Paragraph({
                children: [new TextRun({
                    text: line || ' ',
                    font: 'Courier New',
                    size: 18, // 9pt
                })],
                shading: { type: ShadingType.SOLID, color: 'F1F5F9', fill: 'F1F5F9' },
                spacing: {
                    before: idx === 0 ? 200 : 0,
                    after: idx === codeLines.length - 1 ? 200 : 0,
                },
                indent: { left: convertInchesToTwip(0.3) },
            }));
        }

        case 'blockquote':
            return [new Paragraph({
                children: convertInlineNodes(node.children, ctx),
                indent: { left: convertInchesToTwip(0.5) },
                border: {
                    left: { style: BorderStyle.SINGLE, size: 6, color: '94A3B8', space: 10 },
                },
                spacing: { before: 120, after: 120 },
            })];

        case 'callout': {
            const colorMap: Record<string, string> = {
                'NOTE': '3B82F6',
                'TIP': '10B981',
                'IMPORTANT': '8B5CF6',
                'WARNING': 'F59E0B',
                'CAUTION': 'EF4444',
            };
            const color = colorMap[node.calloutType] ?? '6B7280';

            return [
                new Paragraph({
                    children: [new TextRun({
                        text: `${node.calloutType}: ${node.title}`,
                        bold: true,
                        color,
                    })],
                    border: {
                        left: { style: BorderStyle.SINGLE, size: 6, color, space: 10 },
                    },
                    indent: { left: convertInchesToTwip(0.3) },
                    spacing: { before: 200 },
                }),
                new Paragraph({
                    children: convertInlineNodes(node.children, ctx),
                    indent: { left: convertInchesToTwip(0.5) },
                    border: {
                        left: { style: BorderStyle.SINGLE, size: 6, color, space: 10 },
                    },
                    spacing: { after: 200 },
                }),
            ];
        }

        case 'table':
            return [convertTable(node, ctx)];

        case 'horizontalrule':
            return [new Paragraph({
                children: [],
                border: {
                    bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CBD5E1' },
                },
                spacing: { before: 200, after: 200 },
            })];

        case 'image': {
            const resolved = ctx.resolvedImages.get(node.src);
            if (resolved) {
                const { width, height } = calculateDimensions(
                    resolved.width,
                    resolved.height,
                    node.width ?? ctx.imageMaxWidth,
                );
                return [new Paragraph({
                    children: [new ImageRun({
                        data: resolved.buffer,
                        transformation: { width, height },
                        type: mapImageExtension(resolved.extension),
                    })],
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 200, after: 200 },
                })];
            }
            // Image not found
            return [new Paragraph({
                children: [new TextRun({
                    text: `[Image not found: ${node.src}]`,
                    italics: true,
                    color: '999999',
                })],
                spacing: { after: 200 },
            })];
        }

        default:
            return [];
    }
}

// ─── Main Export Function ────────────────────────────────────────

/**
 * Convert an array of MarkdownNodes into a DOCX Blob.
 */
export async function convertToDocx(
    nodes: MarkdownNode[],
    app: App,
    options: ConvertOptions,
): Promise<Blob> {
    // Pre-resolve all images
    const resolvedImages = await preResolveImages(nodes, app, options.sourcePath);

    const ctx: InlineConvertContext = {
        app,
        sourcePath: options.sourcePath,
        imageMaxWidth: options.imageMaxWidth,
        resolvedImages,
    };

    // Convert all nodes to docx elements
    const docElements: (Paragraph | Table)[] = [];
    for (const node of nodes) {
        docElements.push(...convertNode(node, ctx));
    }

    // Build the document
    const doc = new Document({
        creator: options.author,
        title: options.title,
        description: `Exported from Obsidian: ${options.title}`,
        numbering: {
            config: [
                {
                    reference: 'bullet-list',
                    levels: [
                        { level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) } } } },
                        { level: 1, format: LevelFormat.BULLET, text: '\u25E6', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: convertInchesToTwip(1.0), hanging: convertInchesToTwip(0.25) } } } },
                        { level: 2, format: LevelFormat.BULLET, text: '\u25AA', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: convertInchesToTwip(1.5), hanging: convertInchesToTwip(0.25) } } } },
                        { level: 3, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: convertInchesToTwip(2.0), hanging: convertInchesToTwip(0.25) } } } },
                    ],
                },
                {
                    reference: 'ordered-list',
                    levels: [
                        { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) } } } },
                        { level: 1, format: LevelFormat.LOWER_LETTER, text: '%2.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: convertInchesToTwip(1.0), hanging: convertInchesToTwip(0.25) } } } },
                        { level: 2, format: LevelFormat.LOWER_ROMAN, text: '%3.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: convertInchesToTwip(1.5), hanging: convertInchesToTwip(0.25) } } } },
                        { level: 3, format: LevelFormat.DECIMAL, text: '%4.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: convertInchesToTwip(2.0), hanging: convertInchesToTwip(0.25) } } } },
                    ],
                },
            ],
        },
        styles: {
            default: {
                document: {
                    run: {
                        font: 'Calibri',
                        size: 22, // 11pt
                    },
                },
            },
            paragraphStyles: [
                {
                    id: 'Heading1',
                    name: 'Heading 1',
                    basedOn: 'Normal',
                    next: 'Normal',
                    run: { size: 36, bold: true, color: '1E293B', font: 'Calibri' },
                    paragraph: { spacing: { before: 360, after: 160 } },
                },
                {
                    id: 'Heading2',
                    name: 'Heading 2',
                    basedOn: 'Normal',
                    next: 'Normal',
                    run: { size: 30, bold: true, color: '334155', font: 'Calibri' },
                    paragraph: { spacing: { before: 300, after: 140 } },
                },
                {
                    id: 'Heading3',
                    name: 'Heading 3',
                    basedOn: 'Normal',
                    next: 'Normal',
                    run: { size: 26, bold: true, color: '475569', font: 'Calibri' },
                    paragraph: { spacing: { before: 260, after: 120 } },
                },
            ],
        },
        sections: [
            {
                properties: {
                    page: {
                        margin: {
                            top: convertInchesToTwip(1),
                            right: convertInchesToTwip(1),
                            bottom: convertInchesToTwip(1),
                            left: convertInchesToTwip(1),
                        },
                    },
                },
                children: docElements,
            },
        ],
    });

    return await Packer.toBlob(doc);
}
