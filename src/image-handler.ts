/**
 * Image handler for resolving and reading images from the Obsidian vault.
 */

import { App, TFile, Vault } from 'obsidian';

export interface ResolvedImage {
    buffer: ArrayBuffer;
    width: number;
    height: number;
    extension: string;
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'];

/**
 * Check if a file path points to an image based on its extension.
 */
export function isImageFile(path: string): boolean {
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    return IMAGE_EXTENSIONS.includes(ext);
}

/**
 * Resolve an image source string to a TFile in the vault.
 * Handles both relative paths and wiki-link style references.
 */
export function resolveImageFile(app: App, src: string, sourcePath: string): TFile | null {
    // Try to find by exact path first
    const exactFile = app.vault.getAbstractFileByPath(src);
    if (exactFile instanceof TFile) {
        return exactFile;
    }

    // Try resolving as a link (handles wiki-links and relative paths)
    const resolved = app.metadataCache.getFirstLinkpathDest(src, sourcePath);
    if (resolved instanceof TFile) {
        return resolved;
    }

    // Try searching through vault files by basename
    const basename = src.split('/').pop() ?? src;
    const allFiles = app.vault.getFiles();
    for (const file of allFiles) {
        if (file.name === basename && isImageFile(file.path)) {
            return file;
        }
    }

    return null;
}

/**
 * Read an image from the vault and return its binary content.
 */
export async function readImageFromVault(vault: Vault, file: TFile): Promise<ArrayBuffer> {
    return await vault.readBinary(file);
}

/**
 * Get image dimensions from binary data.
 * Supports PNG, JPEG, GIF, BMP formats.
 */
export function getImageDimensions(buffer: ArrayBuffer, extension: string): { width: number; height: number } {
    const view = new DataView(buffer);

    try {
        switch (extension.toLowerCase()) {
            case 'png': {
                // PNG: width at byte 16, height at byte 20 (4 bytes each, big-endian)
                if (buffer.byteLength >= 24) {
                    return {
                        width: view.getUint32(16, false),
                        height: view.getUint32(20, false),
                    };
                }
                break;
            }
            case 'jpg':
            case 'jpeg': {
                // JPEG: search for SOF0 marker (0xFF 0xC0) or SOF2 (0xFF 0xC2)
                let offset = 2;
                while (offset < buffer.byteLength - 8) {
                    if (view.getUint8(offset) === 0xFF) {
                        const marker = view.getUint8(offset + 1);
                        if (marker === 0xC0 || marker === 0xC2) {
                            return {
                                height: view.getUint16(offset + 5, false),
                                width: view.getUint16(offset + 7, false),
                            };
                        }
                        const segLen = view.getUint16(offset + 2, false);
                        offset += 2 + segLen;
                    } else {
                        offset++;
                    }
                }
                break;
            }
            case 'gif': {
                // GIF: width at byte 6, height at byte 8 (2 bytes each, little-endian)
                if (buffer.byteLength >= 10) {
                    return {
                        width: view.getUint16(6, true),
                        height: view.getUint16(8, true),
                    };
                }
                break;
            }
            case 'bmp': {
                // BMP: width at byte 18, height at byte 22 (4 bytes each, little-endian)
                if (buffer.byteLength >= 26) {
                    return {
                        width: Math.abs(view.getInt32(18, true)),
                        height: Math.abs(view.getInt32(22, true)),
                    };
                }
                break;
            }
        }
    } catch {
        // Fall through to default
    }

    // Default fallback dimensions
    return { width: 600, height: 400 };
}

/**
 * Fully resolve an image: find it in vault, read binary data, and get dimensions.
 */
export async function resolveImage(
    app: App,
    src: string,
    sourcePath: string,
): Promise<ResolvedImage | null> {
    const file = resolveImageFile(app, src, sourcePath);
    if (!file) {
        return null;
    }

    const extension = file.extension.toLowerCase();
    if (!isImageFile(file.path)) {
        return null;
    }

    const buffer = await readImageFromVault(app.vault, file);
    const dimensions = getImageDimensions(buffer, extension);

    return {
        buffer,
        width: dimensions.width,
        height: dimensions.height,
        extension,
    };
}
