/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const twemojiSvgBase = '/twemoji';
const fluentEmojiPngBase = '/fluent-emoji';
const notoEmojiSvgBase = '/noto-emoji';
const blobmojiSvgBase = '/blobmoji';

export function char2twemojiFilePath(char: string): string {
	let codes = Array.from(char, x => x.codePointAt(0)?.toString(16));
	if (!codes.includes('200d')) codes = codes.filter(x => x !== 'fe0f');
	codes = codes.filter(x => x && x.length);
	const fileName = codes.join('-');
	return `${twemojiSvgBase}/${fileName}.svg`;
}

export function char2fluentEmojiFilePath(char: string): string {
	let codes = Array.from(char, x => x.codePointAt(0)?.toString(16));
	// Fluent Emojiは国旗非対応 https://github.com/microsoft/fluentui-emoji/issues/25
	if (codes[0]?.startsWith('1f1')) return char2twemojiFilePath(char);
	if (!codes.includes('200d')) codes = codes.filter(x => x !== 'fe0f');
	codes = codes.filter(x => x && x.length);
	const fileName = codes.join('-');
	return `${fluentEmojiPngBase}/${fileName}.png`;
}

export function char2notoEmojiFilePath(char: string): string {
	let codes = Array.from(char, x => x.codePointAt(0)?.toString(16));
	if (!codes.includes('200d')) codes = codes.filter(x => x !== 'fe0f');
	codes = codes.filter(x => x && x.length);
	const fileName = codes.join('-');
	return `${notoEmojiSvgBase}/${fileName}.svg`;
}

export function char2blobmojiFilePath(char: string): string {
	let codes = Array.from(char, x => x.codePointAt(0)?.toString(16));
	if (!codes.includes('200d')) codes = codes.filter(x => x !== 'fe0f');
	codes = codes.filter(x => x && x.length);
	const fileName = codes.join('-');
	return `${blobmojiSvgBase}/${fileName}.svg`;
}

export function emojiStyle2char2FilePath(emojiStyle: string): (char: string) => string {
	switch (emojiStyle) {
		case 'fluentEmoji': return char2fluentEmojiFilePath;
		case 'notoEmoji': return char2notoEmojiFilePath;
		case 'blobmoji': return char2blobmojiFilePath;
		default: return char2twemojiFilePath;
	}
}
