/**
 * Markdown parser for Obsidian notes.
 * Parses Markdown content into a simplified AST for DOCX conversion.
 */

// ─── AST Node Types ──────────────────────────────────────────────

export type MarkdownNode =
	| HeadingNode
	| ParagraphNode
	| ListNode
	| CodeBlockNode
	| BlockquoteNode
	| TableNode
	| HorizontalRuleNode
	| ImageNode
	| CalloutNode;

export interface HeadingNode {
	type: 'heading';
	level: 1 | 2 | 3 | 4 | 5 | 6;
	children: InlineNode[];
}

export interface ParagraphNode {
	type: 'paragraph';
	children: InlineNode[];
}

export interface ListNode {
	type: 'list';
	ordered: boolean;
	items: ListItemNode[];
}

export interface ListItemNode {
	children: InlineNode[];
	checked?: boolean; // For checkboxes: true = checked, false = unchecked, undefined = not a checkbox
	subList?: ListNode;
}

export interface CodeBlockNode {
	type: 'codeblock';
	language: string;
	content: string;
}

export interface BlockquoteNode {
	type: 'blockquote';
	children: InlineNode[];
}

export interface CalloutNode {
	type: 'callout';
	calloutType: string; // NOTE, TIP, WARNING, etc.
	title: string;
	children: InlineNode[];
}

export interface TableNode {
	type: 'table';
	headers: InlineNode[][];
	rows: InlineNode[][][];
}

export interface HorizontalRuleNode {
	type: 'horizontalrule';
}

export interface ImageNode {
	type: 'image';
	src: string;
	alt: string;
	width?: number;
}

// ─── Inline Node Types ───────────────────────────────────────────

export type InlineNode =
	| TextNode
	| BoldNode
	| ItalicNode
	| BoldItalicNode
	| StrikethroughNode
	| InlineCodeNode
	| LinkNode
	| InlineImageNode;

export interface TextNode {
	type: 'text';
	content: string;
}

export interface BoldNode {
	type: 'bold';
	content: string;
}

export interface ItalicNode {
	type: 'italic';
	content: string;
}

export interface BoldItalicNode {
	type: 'bolditalic';
	content: string;
}

export interface StrikethroughNode {
	type: 'strikethrough';
	content: string;
}

export interface InlineCodeNode {
	type: 'inlinecode';
	content: string;
}

export interface LinkNode {
	type: 'link';
	text: string;
	url: string;
}

export interface InlineImageNode {
	type: 'inlineimage';
	src: string;
	alt: string;
	width?: number;
}

// ─── Parser Functions ────────────────────────────────────────────

/**
 * Parse inline Markdown formatting into InlineNode array.
 */
export function parseInline(text: string): InlineNode[] {
	const nodes: InlineNode[] = [];
	// Regex for inline elements - order matters!
	// Matches: inline images, wikilink images, links, wikilinks, bold+italic, bold, italic, strikethrough, inline code
	const inlineRegex = /!\[\[([^\]|]+?)(?:\|(\d+))?\]\]|!\[([^\]]*?)\]\(([^)]+?)\)|(?<!!)\[([^\]]+?)\]\(([^)]+?)\)|\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]|\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|~~(.+?)~~|`([^`]+?)`/g;

	let lastIndex = 0;
	let match;

	while ((match = inlineRegex.exec(text)) !== null) {
		// Add text before the match
		if (match.index > lastIndex) {
			nodes.push({ type: 'text', content: text.slice(lastIndex, match.index) });
		}

		if (match[1] !== undefined) {
			// Wiki-link image: ![[image.png]] or ![[image.png|500]]
			nodes.push({
				type: 'inlineimage',
				src: match[1],
				alt: match[1],
				width: match[2] ? parseInt(match[2]) : undefined,
			});
		} else if (match[3] !== undefined || match[4] !== undefined) {
			// Standard image: ![alt](url)
			nodes.push({
				type: 'inlineimage',
				src: match[4] ?? '',
				alt: match[3] ?? '',
			});
		} else if (match[5] !== undefined) {
			// Standard link: [text](url)
			nodes.push({ type: 'link', text: match[5], url: match[6] ?? '' });
		} else if (match[7] !== undefined) {
			// Wiki-link: [[page]] or [[page|display]]
			nodes.push({
				type: 'link',
				text: match[8] ?? match[7],
				url: match[7],
			});
		} else if (match[9] !== undefined) {
			// Bold + italic: ***text***
			nodes.push({ type: 'bolditalic', content: match[9] });
		} else if (match[10] !== undefined) {
			// Bold: **text**
			nodes.push({ type: 'bold', content: match[10] });
		} else if (match[11] !== undefined) {
			// Italic: *text*
			nodes.push({ type: 'italic', content: match[11] });
		} else if (match[12] !== undefined) {
			// Strikethrough: ~~text~~
			nodes.push({ type: 'strikethrough', content: match[12] });
		} else if (match[13] !== undefined) {
			// Inline code: `code`
			nodes.push({ type: 'inlinecode', content: match[13] });
		}

		lastIndex = match.index + match[0].length;
	}

	// Add remaining text
	if (lastIndex < text.length) {
		nodes.push({ type: 'text', content: text.slice(lastIndex) });
	}

	if (nodes.length === 0) {
		nodes.push({ type: 'text', content: text });
	}

	return nodes;
}

/**
 * Parse a Markdown table from lines starting at the given index.
 * Returns the TableNode and how many lines were consumed.
 */
function parseTable(lines: string[], startIdx: number): { node: TableNode; consumed: number } {
	const headerLine = lines[startIdx]!;
	const headerCells = headerLine.split('|').map(c => c.trim()).filter(c => c.length > 0);
	const headers = headerCells.map(cell => parseInline(cell));

	// Skip separator line (e.g., |---|---|)
	let idx = startIdx + 2;
	const rows: InlineNode[][][] = [];

	while (idx < lines.length) {
		const line = lines[idx]!;
		if (!line.trim().startsWith('|')) break;
		const cells = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
		rows.push(cells.map(cell => parseInline(cell)));
		idx++;
	}

	return {
		node: { type: 'table', headers, rows },
		consumed: idx - startIdx,
	};
}

/**
 * Parse a list block from lines starting at the given index.
 * Returns the ListNode and how many lines were consumed.
 */
function parseList(lines: string[], startIdx: number, baseIndent: number): { node: ListNode; consumed: number } {
	const items: ListItemNode[] = [];
	let idx = startIdx;

	// Detect ordered vs unordered from first line
	const firstLine = lines[startIdx]!;
	const orderedMatch = firstLine.match(/^(\s*)\d+\.\s/);
	const ordered = orderedMatch !== null;

	while (idx < lines.length) {
		const line = lines[idx]!;
		const itemMatch = line.match(/^(\s*)(?:[-*+]|\d+\.)\s(.*)$/);
		if (!itemMatch) break;

		const indent = itemMatch[1]!.length;
		if (indent < baseIndent) break;

		if (indent > baseIndent) {
			// Sub-list: parse recursively
			const subResult = parseList(lines, idx, indent);
			const lastItem = items[items.length - 1];
			if (lastItem) {
				lastItem.subList = subResult.node;
			}
			idx += subResult.consumed;
			continue;
		}

		let content = itemMatch[2]!;
		let checked: boolean | undefined;

		// Check for checkbox
		const checkboxMatch = content.match(/^\[([ xX])\]\s?(.*)/);
		if (checkboxMatch) {
			checked = checkboxMatch[1] !== ' ';
			content = checkboxMatch[2] ?? '';
		}

		items.push({
			children: parseInline(content),
			checked,
		});
		idx++;
	}

	return {
		node: { type: 'list', ordered, items },
		consumed: idx - startIdx,
	};
}

/**
 * Parse Obsidian Markdown content into an array of MarkdownNodes.
 */
export function parseMarkdown(content: string): MarkdownNode[] {
	const nodes: MarkdownNode[] = [];
	const lines = content.split('\n');
	let i = 0;

	// Skip YAML frontmatter
	if (lines[0]?.trim() === '---') {
		i = 1;
		while (i < lines.length && lines[i]?.trim() !== '---') {
			i++;
		}
		i++; // Skip closing ---
	}

	while (i < lines.length) {
		const line = lines[i]!;

		// Empty line — skip
		if (line.trim() === '') {
			i++;
			continue;
		}

		// Heading: # H1, ## H2, etc.
		const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
		if (headingMatch) {
			nodes.push({
				type: 'heading',
				level: headingMatch[1]!.length as HeadingNode['level'],
				children: parseInline(headingMatch[2]!),
			});
			i++;
			continue;
		}

		// Horizontal rule: ---, ***, ___
		if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
			nodes.push({ type: 'horizontalrule' });
			i++;
			continue;
		}

		// Code block: ```lang
		const codeBlockMatch = line.match(/^```(\w*)/);
		if (codeBlockMatch) {
			const lang = codeBlockMatch[1] ?? '';
			const codeLines: string[] = [];
			i++;
			while (i < lines.length && !lines[i]!.startsWith('```')) {
				codeLines.push(lines[i]!);
				i++;
			}
			i++; // Skip closing ```
			nodes.push({
				type: 'codeblock',
				language: lang,
				content: codeLines.join('\n'),
			});
			continue;
		}

		// Table: line starting with | and next line is separator
		if (line.trim().startsWith('|') && i + 1 < lines.length) {
			const nextLine = lines[i + 1]!;
			if (/^\|?\s*[-:]+[-| :]*$/.test(nextLine)) {
				const result = parseTable(lines, i);
				nodes.push(result.node);
				i += result.consumed;
				continue;
			}
		}

		// Callout (Obsidian style): > [!TYPE] Title
		const calloutMatch = line.match(/^>\s*\[!(\w+)\]\s*(.*)?$/);
		if (calloutMatch) {
			const calloutType = calloutMatch[1]!.toUpperCase();
			const title = calloutMatch[2] ?? calloutType;
			const bodyParts: string[] = [];
			i++;
			while (i < lines.length && lines[i]!.startsWith('>')) {
				bodyParts.push(lines[i]!.replace(/^>\s?/, ''));
				i++;
			}
			nodes.push({
				type: 'callout',
				calloutType,
				title,
				children: parseInline(bodyParts.join(' ')),
			});
			continue;
		}

		// Blockquote: > text
		if (line.startsWith('>')) {
			const quoteLines: string[] = [];
			while (i < lines.length && lines[i]!.startsWith('>')) {
				quoteLines.push(lines[i]!.replace(/^>\s?/, ''));
				i++;
			}
			nodes.push({
				type: 'blockquote',
				children: parseInline(quoteLines.join(' ')),
			});
			continue;
		}

		// List: unordered (-, *, +) or ordered (1.)
		const listMatch = line.match(/^(\s*)(?:[-*+]|\d+\.)\s/);
		if (listMatch) {
			const result = parseList(lines, i, listMatch[1]!.length);
			nodes.push(result.node);
			i += result.consumed;
			continue;
		}

		// Standalone image line: ![[image]] or ![alt](url)
		const imageWikiMatch = line.match(/^!\[\[([^\]|]+?)(?:\|(\d+))?\]\]\s*$/);
		if (imageWikiMatch) {
			nodes.push({
				type: 'image',
				src: imageWikiMatch[1]!,
				alt: imageWikiMatch[1]!,
				width: imageWikiMatch[2] ? parseInt(imageWikiMatch[2]) : undefined,
			});
			i++;
			continue;
		}

		const imageStdMatch = line.match(/^!\[([^\]]*?)\]\(([^)]+?)\)\s*$/);
		if (imageStdMatch) {
			nodes.push({
				type: 'image',
				src: imageStdMatch[2]!,
				alt: imageStdMatch[1]!,
			});
			i++;
			continue;
		}

		// Default: paragraph
		nodes.push({
			type: 'paragraph',
			children: parseInline(line),
		});
		i++;
	}

	return nodes;
}
