/*!
 * Copyright (c) The Free MRE Foundation. All rights reserved.
 * Licensed under the GPLv3 License.
 */

import { DegreesToRadians, Quaternion, ScaledTransform, ScaledTransformLike, User } from "@microsoft/mixed-reality-extension-sdk";
import fetch from "node-fetch";
const { execSync } = require('child_process');

const PROXY_URL = process.env['PROXY_URL'];

export function translate(transformLike: Partial<ScaledTransformLike>) {
	const pos = transformLike.position ? transformLike.position : { x: 0, y: 0, z: 0 };
	const rot = transformLike.rotation ? transformLike.rotation : { x: 0, y: 0, z: 0 };
	const scale = transformLike.scale ? transformLike.scale : { x: 1, y: 1, z: 1 };
	const transform = new ScaledTransform();
	transform.copy({
		position: pos,
		rotation: Quaternion.FromEulerAngles(
			rot.x * DegreesToRadians,
			rot.y * DegreesToRadians,
			rot.z * DegreesToRadians
		),
		scale,
	});
	return transform;
}

export async function fetchJSON(url: string) {
	const res = await fetch(url);
	const text = await res.text();
	return JSON.parse(text);
}

export function checkUrlStreamable(url: string) {
	const cmd = `curl --proxy ${PROXY_URL} -o /dev/null -L -s -w "%{http_code}" '${url}'`;
	const status = execSync(cmd).toString();
	return status == '200';
}

export function formatText(text: string, width: number, height: number, MAX_TEXHEIGHT: number = 0.05) {
	const HeightToWidth = 0.8;
	const step = 0.0005;
	const textHeights = [...Array(40).keys()].map(i => {
		return MAX_TEXHEIGHT - step * i;
	});

	// greedy bin packing
	let textHeight = 0;
	let res = '';
	for (let i = 0; i < textHeights.length; i++) {
		textHeight = textHeights[i];

		const rows = [];
		let words = text.split(/\s+/);
		let splits = 0;
		let row: string[] = [];
		for (let j = 0, l = 0; j < words.length;) {
			if (words[j].length >= 16 || words[j].length * textHeight * HeightToWidth > width) {
				const splitPoint = Math.floor(width / textHeight);
				if (words[j].length < 16) { splits++; }
				words = [
					...words.slice(0, j),
					words[j].slice(0, splitPoint) + (words[j].length >= 16 ? '-' : ''),
					words[j].slice(splitPoint),
					...words.slice(j + 1)
				];
			}

			if ((l + words[j].length) * textHeight * HeightToWidth <= width) {
				l += words[j].length;
				row.push(words[j]);
				j++;
			} else {
				if (row.length > 0) { rows.push(row); }
				row = [];
				l = 0;
			}
		}
		if (row.length > 0) { rows.push(row); }

		if (textHeight * rows.length <= height) {
			res = rows.reduce((a, c) => {
				return a + c.join(' ') + '\n';
			}, '');
			if (splits <= 0) { break; }
		}
	}

	return [res, textHeight];
}

export function intToString(value: number) {
	var suffixes = ["", "K", "M", "B", "T"];
	var suffixNum = Math.floor(("" + value).length / 3);
	var shortValue: any = parseFloat((suffixNum != 0 ? (value / Math.pow(1000, suffixNum)) : value).toPrecision(2));
	if (shortValue % 1 != 0) {
		shortValue = shortValue.toFixed(1);
	}
	return shortValue + suffixes[suffixNum];
}

export function checkUserRole(user: User, role: string) {
	return true;
	if (user.properties['altspacevr-roles'] === role ||
		user.properties['altspacevr-roles'].includes(role)) {
		return true;
	}
	return false;
}

export function isASCII(s: string) {
	return s.match(/^[\u0000-\u007f]*$/) !== undefined;
}

export async function delay(t: number) {
	await new Promise(resolve => setTimeout(resolve, t * 1000));
}

export const block = (predicate: () => boolean, giveUp = 5000) => new Promise<void>((resolve, reject) => {
	const timestamp = Date.now();
	setInterval(() => {
		if (predicate()) {
			return resolve();
		} else if (Date.now() - timestamp >= giveUp) {
			return reject(new Error("Took too long and now giving up"))
		}
	}, 1)
});

interface promise {
	resolve: (...args: any[]) => void;
	reject: (reason?: any) => void;
}

export class Async {
	private _created: boolean;
	private createPromises: promise[] = [];

	protected notifyCreated(success: boolean) {
		this.createPromises.forEach(p => {
			if (success) {
				p.resolve();
			} else {
				p.reject();
			}
		});
	}

	public created() {
		if (!this._created) {
			return new Promise<void>((resolve, reject) => this.createPromises.push({ resolve, reject }));
		} else {
			return Promise.resolve();
		}
	}
}

export function isValidUrl(url: string){
	return true || url.match(/[(http(s)?):\/\/(www\.)?a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/) !== null;
}