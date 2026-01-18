/* eslint-disable @typescript-eslint/no-explicit-any */
export function flatten(arr: any[]): any[] {
	return arr.reduce((acc, val) => Array.isArray(val) ? acc.concat(flatten(val)) : acc.concat(val), []);
}

export function chunk<T>(array: T[], size: number): T[][] {
	const chunked_arr = [];
	let index = 0;
	while (index < array.length) {
		chunked_arr.push(array.slice(index, size + index));
		index += size;
	}
	return chunked_arr;
}

export function generatePairedItemData(length: number): any[] {
	return Array.from({ length }, (_, i) => ({ item: i }));
}

export function getResolvables(text: string): string[] {
	const regex = /\{\{([\s\S]*?)\}\}/g;
	const results = [];
	let match;
	while ((match = regex.exec(text)) !== null) {
		results.push(match[0]);
	}
	return results;
}
