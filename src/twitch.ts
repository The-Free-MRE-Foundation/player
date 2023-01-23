/*!
 * Copyright (c) The Free MRE Foundation. All rights reserved.
 * Licensed under the GPLv3 License.
 */

import { AssetContainer, Context, User } from "@microsoft/mixed-reality-extension-sdk";
import { Button, Checkbox, Grid, Menu, NumberInput, PaginatedGrid, Slider, Text, TextInput, ViewElement } from "altvr-gui";
import { Duration } from "luxon";
import { SETTINGS_OFFSET } from "./app";
import { App, AppOptions } from "./myapp";
import { DEFAULT_SCREENS, PLAYER_OFFSET, VideoPlayer } from "./player";
import { checkUserRole, formatText, intToString } from "./utils";

const twitch = require("twitch-m3u8");
const fetch = require("node-fetch");

const TWITCH_CLIENT_ID = process.env['TWITCH_CLIENT_ID'];
const TWICH_CLIENT_SECRET = process.env['TWITCH_CLIENT_SECRET'];

const TWITCH_AUTH_URL = 'https://id.twitch.tv/oauth2/token';

export class Twitch {
	private token: string;

	public async init() {
		await this.getToken();
	}

	public async getToken() {
		const data = {
			client_id: TWITCH_CLIENT_ID,
			client_secret: TWICH_CLIENT_SECRET,
			grant_type: 'client_credentials',
		};
		// const ret = await fetch(TWITCH_AUTH_URL, {
		// 	method: 'post',
		// 	body: JSON.stringify(data),
		// 	headers: { "Content-Type": "application/json" }
		// }).then((res: any) => res.json())
		// this.token = ret.access_token;
		this.token = 'tv3blfrx4kqsazdxz1j9ipph76b3op';
	}

	// twitch resources
	public async getUserId(name: string) {
		const user = await fetch(`https://api.twitch.tv/helix/users?login=${name}`, {
			method: 'get',
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${this.token}`,
				"Client-Id": TWITCH_CLIENT_ID
			}
		}).then((res: any) => res.json());
		if (user.data.length < 1) return;
		return user.data[0].id;
	}

	public async getUserVideos(name: string) {
		const uid = await this.getUserId(name);
		if (!uid) return;
		const videos = await fetch(`https://api.twitch.tv/helix/videos?user_id=${uid}`, {
			method: 'get',
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${this.token}`,
				"Client-Id": TWITCH_CLIENT_ID
			}
		}).then((res: any) => res.json());
		return videos.data;
	}

	public async getVod(vid: string) {
		const ret = await fetch(`https://api.twitch.tv/helix/videos?id=${vid}`, {
			method: 'get',
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${this.token}`,
				"Client-Id": TWITCH_CLIENT_ID
			}
		}).then((res: any) => res.json());
		return ret.data[0];
	}

	public async getStream(name: string) {
		const ret = await fetch(`https://api.twitch.tv/helix/streams?user_login=${name}`, {
			method: 'get',
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${this.token}`,
				"Client-Id": TWITCH_CLIENT_ID
			}
		}).then((res: any) => res.json());
		return ret.data[0];
	}

	// parse url
	public parseUrl(url: string, item?: any) {
		const vid = url.match(/^(?:https?:\/\/)?(?:www\.|go\.)?twitch\.tv\/videos\/([a-z0-9_]+)($|\?)/);
		const channel = url.match(/^(?:https?:\/\/)?(?:www\.|go\.)?twitch\.tv\/([a-z0-9_]+)($|\?)/);
		if (vid) {
			return this.parseVodUrl(vid[1], item);
		} else if (channel) {
			return this.parseStreamUrl(channel[1], item);
		}
	}

	public async parseVodUrl(vid: string, item?: any) {
		const vl: any = await new Promise((resolve, reject) => {
			twitch.getVod(vid)
				.then((data: any) => resolve(data))
				.catch((err: any) => reject(err));
		});
		let v = vl.find((v: any) => v.quality.includes('480p'));
		v = v ? v : vl[0];
		if (!item) {
			item = await this.getVod(vid);
		}
		item = Twitch.translateVodItem(item);
		return { ...item, url: v.url, live: false };
	}

	public async parseStreamUrl(channel: string, item?: any) {
		const vl: any = await new Promise((resolve, reject) => {
			twitch.getStream(channel)
				.then((data: any) => resolve(data))
				.catch((err: any) => reject(err));
		});
		let v = vl.find((v: any) => v.quality.includes('480p'));
		v = v ? v : vl[0];
		if (!item) {
			item = await this.getStream(channel);
		}
		item = this.translateStreamItem(item);
		return { ...item, url: v.url, live: true };
	}

	public async search(keyword: string) {
		const channels = await fetch(`https://api.twitch.tv/helix/search/channels?query=${keyword}&live_only=true`, {
			method: 'get',
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${this.token}`,
				"Client-Id": TWITCH_CLIENT_ID
			}
		}).then((res: any) => res.json());
		if (channels.data.length < 1) return [];
		return await Promise.all(channels.data.slice(0, 12).map(async (c: any, i: any) => {
			let s = await this.getStream(c.broadcaster_login);
			s = await this.parseStreamUrl(c.broadcaster_login, s);
			return this.translateStreamItem(s, i);
		}));
	}

	// e.g. 1h32m16s
	private static parseDuration(d: string) {
		const times = d.match(/(\d+)/g);
		const s = times[times.length - 1];
		const m = times[times.length - 2];
		const h = times[times.length - 3];
		return (s ? parseInt(s) : 0) + (m ? parseInt(m) * 60 : 0) + (h ? parseInt(h) * 3600 : 0);
	}

	public static translateVodItem(d: any, i?: number) {
		const [title, height] = formatText(d.title, 1.1, 0.14);
		let duration = Twitch.parseDuration(d.duration);
		duration = duration === NaN ? 0 : duration;
		return {
			...d,
			id: i,
			vid: d.id,
			title,
			height,
			uploader: d.user_name ? d.user_name.slice(0, 72) : d.display_name.slice(0, 72),
			duration,
			duration_text: Duration.fromMillis(duration * 1000).toFormat("hh:mm:ss"),
			view_count: intToString(parseInt(d.view_count)),
			img: {
				url: d.thumbnail_url.replace(/%{width}/, '1280').replace(/%{height}/, '720'),
				width: 0.95,
				height: 0.57
			}
		}
	}

	public translateStreamItem(d: any, i?: number) {
		const [title, height] = formatText(d.title, 1.1, 0.14);
		return {
			...d,
			id: i,
			vid: d.id,
			title,
			height,
			uploader: d.user_name.slice(0, 72),
			duration: 0,
			duration_text: '',
			language: d.language,
			view_count: intToString(parseInt(d.viewer_count)),
			img: {
				url: d.thumbnail_url.replace(/{width}/, '1280').replace(/{height}/, '720'),
				width: 0.95,
				height: 0.57
			}
		}
	}
}

export interface TwitchAppOptions extends AppOptions {
}

export class TwitchApp extends App {
	// twitch
	private twitch: Twitch;

	// menu
	private mainMenu: Menu;
	private videosGrid: Grid;
	private videosList: PaginatedGrid;
	private logo: ViewElement;

	// media menu
	private mediaMenu: Menu;
	private titleText: Text;
	private uploaderText: Text;
	private timeText: Text;
	private timeSlider: Slider;
	private rolloffNumberInput: NumberInput;
	private volumeSlider: Slider;
	private volumeButton: Button;
	private previousVolume: number;

	// settings menu
	private settingsMenu: Menu;
	private modOnly: boolean = false;

	// video player
	private player: VideoPlayer;
	private item: any;
	private process: any;

	public onAction: (action: string, user: User, params: any) => void;

	constructor(context: Context, assets: AssetContainer, private options: TwitchAppOptions) {
		super(context, assets, options);
		this.init();
	}

	private async init() {
		this.createTwitch();
		await this.twitch.init();
		this.notifyCreated(true);
	}

	private createTwitch() {
		this.twitch = new Twitch();
	}

	private async createMainMenu() {
		// menu
		const scale = this.options.scale;
		this.mainMenu = new Menu(this.context, this.assets, {
			url: `twitch/main.xml`,
			assets: this.options.uiassets,
			// animate: true,
			baseUrl: this.options.baseUrl,
			roles: ['moderator'],
			scale,
		}, null);

		await this.mainMenu.created();

		// search button
		const searchTextInput = this.mainMenu.view.root.find('#search_text')[0] as TextInput;
		searchTextInput.addUIEventHandler('submitted', async (params: { user: User, id: string, text: string }) => {
			const [text, height] = formatText(params.text, 4, 0.28, 0.15);
			searchTextInput.text(text as string);
			searchTextInput.textHeight(height as number);
			this.videosList.items = [];
			this.videosList.update();

			this.logo.disable();

			this.videosList.items = await this.twitch.search(params.text);
			this.videosList.update();
		});

		// list button
		const listButton = this.mainMenu.view.root.find('#list')[0] as Button;
		listButton.addUIEventHandler('click', (params: { user: User, id: string, text: string }) => {
			if (!this.mediaMenu) return;
			if (this.mediaMenu.closed) {
				this.mediaMenu.open(false);
			}
			if (!this.mainMenu.closed) {
				this.mainMenu.close();
			}
			if (this.settingsMenu) {
				this.settingsMenu.remove();
				this.settingsMenu = undefined;
			}
		});

		// video button
		const videoButton = this.mainMenu.view.root.find('#video')[0] as Button;
		videoButton.addUIEventHandler('click', (params: { user: User, id: string, text: string }) => {
			params.user.prompt("Twitch video url:", true).then(async (dialog) => {
				if (dialog.submitted) {
					const item = await this.twitch.parseUrl(dialog.text);
					if (item) {
						this.play({ ...item }, 'flat');
					} else {
						params.user.prompt('Invalid url');
					}
				}
			});
		});

		// videos list
		this.videosGrid = this.mainMenu.view.root.find('#videos_list')[0] as Grid;
		await this.videosGrid.created();
		let r = this.videosGrid.dom.options.row;
		let c = this.videosGrid.dom.options.col;
		this.videosList = new PaginatedGrid({
			list: this.videosGrid,
			pageSize: r * c,
		});

		this.videosGrid.addUIEventHandler('selected', (params: { user: User, id: string, selected: string }) => {
			const index = parseInt(params.id);
			const item = this.videosList.page[index];
			this.play(item, 'flat');
		});

		// logo
		this.logo = this.mainMenu.view.root.find('#logo')[0] as ViewElement;

		// settings
		const settingsButton = this.mainMenu.view.root.find('#settings')[0] as Button;
		settingsButton.addUIEventHandler('click', async (params: { user: User, id: string }) => {
			// this.onAction('back', params.user, {});
			if (!this.settingsMenu) {
				this.createSettingsMenu();
			} else {
				this.settingsMenu.remove();
				this.settingsMenu = undefined;
			}
		});
	}

	private async createMediaMenu() {
		// menu
		const scale = this.options.scale;
		this.mediaMenu = new Menu(this.context, this.assets, {
			url: `twitch/media.xml`,
			assets: this.options.uiassets,
			// animate: true,
			baseUrl: this.options.baseUrl,
			roles: ['moderator'],
			scale
		}, null);

		await this.mediaMenu.created();
		this.mediaMenu.view.root.anchor.transform.local.copy({
			position: {
				x: 0, y: PLAYER_OFFSET * scale, z: 0.01
			}
		});

		// texts
		this.uploaderText = this.mediaMenu.view.root.find('#uploader')[0] as Text;
		this.titleText = this.mediaMenu.view.root.find('#title')[0] as Text;
		this.timeText = this.mediaMenu.view.root.find('#time')[0] as Text;

		// fullscreen
		const fullscreenButton = this.mediaMenu.view.root.find('#fullscreen')[0] as Button;
		fullscreenButton.addUIEventHandler('click', async (params: { user: User, id: string }) => {
			if (!this.mediaMenu.closed) {
				this.mediaMenu.close(false);
			}
			if (this.mainMenu.closed) {
				await this.mainMenu.open();
				this.videosList.update();
			}
		});

		// play / pause
		const playButton = this.mediaMenu.view.root.find('#play')[0] as Button;
		playButton.addUIEventHandler('click', (params: { user: User, id: string }) => {
			if (this.player.video.live) return;
			if (this.player.paused) {
				this.player.resume();
				playButton.dom.style.asset = 'Pause';
			} else if (this.player.playing) {
				this.player.pause();
				playButton.dom.style.asset = 'Play';
			}
			playButton.refreshStyle();
		});

		// stop
		const stopButton = this.mediaMenu.view.root.find('#stop')[0] as Button;
		stopButton.addUIEventHandler('click', (params: { user: User, id: string }) => {
			this.stop();
		});

		// slider
		this.timeSlider = this.mediaMenu.view.root.find('#time_slider')[0] as Slider;

		// rolloff
		this.rolloffNumberInput = this.mediaMenu.view.root.find('#rolloff_number')[0] as NumberInput;
		this.rolloffNumberInput.addUIEventHandler('set', (params: { user: User, action: string }) => {
			this.player.rolloff = parseInt(this.rolloffNumberInput.val());
		});
		this.rolloffNumberInput.val(`${this.player.rolloff}`);

		// volume
		this.volumeButton = this.mediaMenu.view.root.find('#volume_button')[0] as Button;
		this.volumeButton.addUIEventHandler('click', (params: { user: User, id: string }) => {
			if (this.player.volume > 0) {
				this.previousVolume = this.player.volume;
				this.player.volume = 0;
				this.volumeSlider.val('0');
			} else {
				this.player.volume = this.previousVolume;
				this.volumeSlider.val(`${this.player.volume / 100}`);
			}
		});
		this.volumeSlider = this.mediaMenu.view.root.find('#volume_slider')[0] as Slider;
		this.volumeSlider.addUIEventHandler('click', (params: { user: User, id: string, percent: number }) => {
			this.player.volume = 100 * params.percent;
		});
		this.volumeSlider.val(`${this.player.volume / 100}`);

		// replay
		const replayButton = this.mediaMenu.view.root.find('#replay')[0] as Button;
		replayButton.addUIEventHandler('click', async (params: { user: User, id: string }) => {
			if (!this.player.video) return;
			this.play(this.item);
		});
	}

	private async createSettingsMenu() {
		// menu
		const scale = this.options.scale;
		this.settingsMenu = new Menu(this.context, this.assets, {
			url: `twitch/settings.xml`,
			assets: this.options.uiassets,
			animate: true,
			baseUrl: this.options.baseUrl,
			roles: ['moderator'],
			scale
		}, null);

		await this.settingsMenu.created();
		this.settingsMenu.view.root.anchor.transform.local.copy({
			position: {
				x: SETTINGS_OFFSET * scale, y: 0 * scale, z: 0.01 * scale
			}
		});

		const lockCheckbox = this.settingsMenu.view.root.find('#lock')[0] as Checkbox;
		lockCheckbox.checked = this.modOnly;

		const shutdownButton = this.settingsMenu.view.root.find('#shutdown')[0] as Button;
		shutdownButton.addUIEventHandler('click', (params: { user: User, id: string }) => {
			this.onAction('shutdown', params.user, {});
		});

		const backButton = this.settingsMenu.view.root.find('#back')[0] as Button;
		backButton.addUIEventHandler('click', (params: { user: User, id: string }) => {
			this.settingsMenu.remove();
			this.settingsMenu = undefined;
		});
	}

	private createVideoPlayer() {
		const scale = this.options.scale;
		const screens = [...DEFAULT_SCREENS];
		screens.forEach(s => {
			if (!s.anchor.display) {
				s.anchor.display = {};
			}
			s.anchor.display.scale = {
				x: scale, y: scale, z: scale
			};
			if (s.camera) return;
			if (!s.anchor.screen) {
				s.anchor.screen = {};
			}
			s.anchor.screen.scale = {
				x: scale, y: scale, z: scale
			};
		});
		this.player = new VideoPlayer(this.context, this.assets, {
			screens,
		});

		this.player.onClick = (user: User) => {
			if (!checkUserRole(user, 'moderator')) return;
			if (!this.mediaMenu) return;
			if (!this.mainMenu.closed) return;
			if (this.mediaMenu.closed) {
				this.mediaMenu.open(false);
				this.updatePlayerTime(true, this.player.video.live);
			} else {
				this.mediaMenu.close(false);
			}
		}

		this.player.onTime = () => {
			this.updatePlayerTime();
		}

		this.player.createScreen('flat');
	}

	private async play(item: any, screen?: string) {
		if (this.player.video) {
			this.player.stop();
			this.process?.kill();
		}
		if (screen && this.player.name != screen) {
			this.player.createScreen(screen);
		}
		this.player.play({
			name: item.name,
			url: item.url,
			duration: item.duration,
			live: item.live,
		});
		this.item = item;
		this.mainMenu.close();
		this.settingsMenu?.remove();
		this.settingsMenu = undefined;
		if (!this.mediaMenu) {
			await this.createMediaMenu();
		}
		this.updateMediaInfo(item);
		this.player.showDisplay();
		this.mediaMenu.open();
	}

	private async stop(manual: boolean = true) {
		this.player.stop();
		this.process?.kill();
		if (!manual) return;
		if (!this.mediaMenu.closed) {
			this.player.hideDisplay();
			this.mediaMenu.close(false);
		}
		if (this.mainMenu.closed) {
			await this.mainMenu.open();
			this.videosList.update();
		}
	}

	private updatePlayerTime(manual: boolean = false, live: boolean = false) {
		if (!manual && this.mediaMenu.closed) { return; }
		if (live) {
			this.timeText.text('LIVE');
			this.timeSlider.val('1');
			return;
		}
		const time = Duration.fromMillis(this.player.time * 1000).toFormat("hh:mm:ss");
		const duration = Duration.fromMillis(this.player.video.duration * 1000).toFormat("hh:mm:ss");
		this.timeText.text(`${time} / ${duration}`);
		this.timeSlider.val(`${this.player.time / this.player.video.duration}`);
	}

	private updateMediaInfo(item: any) {
		const [title, height] = formatText(item.title, 4, 0.3, 0.12);
		this.titleText.text(title as string);
		this.titleText.textHeight(height as number);
		this.uploaderText.text(item.uploader);
		this.updatePlayerTime(false, item.live);
	}

	public open(): void {
		super.open();
		if (!this.mainMenu) this.createMainMenu();
		if (!this.player) this.createVideoPlayer();
	}

	public close(): void {
		super.close();
		this.player?.stop();
		this.process?.kill();
		if (this.mainMenu) { this.mainMenu.remove(); this.mainMenu = undefined; }
		if (this.mediaMenu) { this.mediaMenu.remove(); this.mediaMenu = undefined; }
		if (this.settingsMenu) { this.settingsMenu.remove(); this.settingsMenu = undefined; }
		if (this.player) { this.player.remove(); this.player = undefined; }
	}

	public async playUrl(url: string){
		const item = await this.twitch.parseUrl(url);
		if (item) {
			this.play({ ...item }, 'flat');
		} else {
			console.log('Invalid url');
		}
	}
}