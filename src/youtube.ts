/*!
 * Copyright (c) The Free MRE Foundation. All rights reserved.
 * Licensed under the GPLv3 License.
 */

const { exec, spawn, execSync } = require('child_process');
const readline = require('readline');
import { Duration } from "luxon";
import { block, checkUserRole, formatText, intToString } from "./utils";
import fs from 'fs-extra';
import { Button, Checkbox, Grid, Menu, NumberInput, PaginatedGrid, Slider, Text, TextInput, ViewElement } from "altvr-gui";
import { AssetContainer, Context, User } from "@microsoft/mixed-reality-extension-sdk";
import { DEFAULT_SCREENS, PLAYER_OFFSET, Ratio, RatioToNumber, VideoPlayer } from "./player";
import { App, AppOptions } from "./myapp";
import { SETTINGS_OFFSET } from "./app";

const STREAM_BASEURL = process.env['STREAM_BASEURL'];
const RTMP_BASEURL = process.env['RTMP_BASEURL'];
const HLS_BASEDIR = process.env['HLS_BASEDIR'];

export const YOUTUBE_BASEURL = 'https://www.youtube.com/watch?v=';
export const YOUTUBE_VIDEO_PROPERTIES = ['id', 'title', 'duration', 'uploader', 'upload_date', 'view_count', 'thumbnail'];

export class Youtube {
	public onSearchResult: (res: any, keyword: string) => void;
	public onGetUrl: (item: any) => void;

	public search(keyword: string) {
		// const cmd = `yt-dlp ytsearch12:"${keyword.replace(/[&\/\\#,+()$~%.'":*?<>{}]/g, '')}" --print "%(id)s;%(title)s;%(duration)s;%(uploader)s;%(upload_date)s;%(view_count)s;%(thumbnails.36.url)s"`;
		const process = spawn(`yt-dlp`, [`ytsearch12:"${keyword.replace(/[&\/\\#,+()$~%.'":*?<>{}]/g, '')}"`, `--print`, `"%(id)s;%(title)s;%(duration)s;%(uploader)s;%(upload_date)s;%(view_count)s;%(thumbnails.36.url)s"`]);
		const rl = readline.createInterface({ input: process.stdout });
		rl.on('line', (l: string) => {
			const ll = l.slice(1, l.length - 1).split(';');
			const d: any = {};
			YOUTUBE_VIDEO_PROPERTIES.forEach((f, i) => {
				d[f] = ll[i];
			});
			this.onSearchResult(d, keyword);
		});
	}

	public getUrl(item: any) {
		const cmd = `yt-dlp -J https://www.youtube.com/watch?v=${item.vid} | jq -r '.formats[] | select(.format_id == "18" or .format_id == "22").url'`;
		console.log(cmd);
		exec(cmd, async (error: string, stdout: string, stderr: string) => {
			if (error) return;
			let l = stdout.split('\n').filter(x => x);
			const url = l[l.length - 1];

			this.onGetUrl({ ...item, url });
		});
	}

	public async forcePlay(item: any) {
		const cmd = `yt-dlp -o - https://www.youtube.com/watch?v=${item.vid} | ffmpeg -re -i - -acodec copy -vcodec copy -f flv ${RTMP_BASEURL}/${item.vid}`;
		const streams = fs.readdirSync(`${HLS_BASEDIR}`).filter(fn => fn.endsWith('.m3u8'));
		if (streams.length > 5) {
			return { queue: streams.length };
		}
		console.log(streams.length, 'streams');
		console.log(cmd);
		const process = spawn('sh', ['-c', cmd]);
		const url = `${STREAM_BASEURL}/${item.vid}.m3u8`;
		await block(() => fs.existsSync(`${HLS_BASEDIR}/${item.vid}-3.ts`), 60 * 1000);
		return { process, url, item };
	}

	public async visualize(item: any) {
		const streams = fs.readdirSync(`${HLS_BASEDIR}`).filter(fn => fn.endsWith('.m3u8'));
		if (streams.length > 5) {
			return { queue: streams.length };
		}
		// const cmd = `yt-dlp --downloader ffmpeg --external-downloader-args "-vcodec libx264 -acodec aac -filter_complex '[0:a]showcqt=s=720x720[vfun],[0:v]scale=1280:720[v];[v][vfun]hstack[vo]' -map '[vo]' -map 0:a " -o - https://www.youtube.com/watch?v=${item.vid} | ffmpeg -re -i - -acodec copy -vcodec copy -f flv ${RTMP_BASEURL}/${item.vid}`;
		const cmd = `yt-dlp -o - https://www.youtube.com/watch?v=${item.vid} | ffmpeg -re -i - -vcodec libx264 -acodec aac -filter_complex '[0:a]showcqt=s=360x360[vfun],[0:v]scale=640:360[v];[v][vfun]hstack[vo]' -map '[vo]' -map 0:a -f flv ${RTMP_BASEURL}/${item.vid}`;
		console.log(streams.length, 'streams');
		console.log(cmd);
		const process = spawn('sh', ['-c', cmd]);
		const url = `${STREAM_BASEURL}/${item.vid}.m3u8`;
		await block(() => fs.existsSync(`${HLS_BASEDIR}/${item.vid}-3.ts`), 60 * 1000);
		return { process, url, item };
	}

	public static async parseUrl(url: string) {
		const vid = url.match(/(youtu\.be\/|youtube\.com\/(watch\?(.*&)?v=|(embed|v)\/))([^\?&"'>]+)/)[5];
		if (!vid) return;
		const cmd = `yt-dlp https://www.youtube.com/watch?v=${vid} --print "%(id)s;%(title)s;%(duration)s;%(uploader)s;%(upload_date)s;%(view_count)s;%(thumbnails.36.url)s"`;
		const l = await execSync(cmd).toString();
		const ll = l.split(';');
		const d: any = {};
		YOUTUBE_VIDEO_PROPERTIES.forEach((f, i) => {
			d[f] = ll[i];
		});
		return d;
	}

	public static translateVideoItem(d: any, i?: number) {
		const [title, height] = formatText(d.title, 1.1, 0.14);
		let duration = parseInt(d.duration);
		duration = isNaN(duration) ? 0 : duration;
		return {
			...d,
			id: i,
			vid: d.id,
			title,
			height,
			uploader: d.uploader.slice(0, 72),
			duration,
			duration_text: Duration.fromMillis(duration * 1000).toFormat("hh:mm:ss"),
			view_count: intToString(parseInt(d.view_count)),
			img: {
				url: d.thumbnail.replace(/\?.*$/, ''),
				width: 0.95,
				height: 0.57
			}
		}
	}
}

export interface YoutubeAppOptions extends AppOptions {
}

export class YoutubeApp extends App {
	private _closed: boolean = false;

	// youtube
	private youtube: Youtube;
	private gettingUrl: boolean = false;

	// menu
	private mainMenu: Menu;
	private videosGrid: Grid;
	private videosList: PaginatedGrid;
	private logo: ViewElement;
	private menuLoading: ViewElement;
	private index: number = 0;

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
	private mediaLoading: ViewElement;

	// settings menu
	private settingsMenu: Menu;
	private modOnly: boolean = false;

	// video player
	private player: VideoPlayer;
	private item: any;
	private process: any;

	public onAction: (action: string, user: User, params: any) => void;

	constructor(context: Context, assets: AssetContainer, private options: YoutubeAppOptions) {
		super(context, assets, options);
		this.init();
	}

	private async init() {
		await new Promise(resolve => setTimeout(resolve, 1));
		this.notifyCreated(true);
	}

	private createYoutube() {
		this.youtube = new Youtube();

		this.youtube.onSearchResult = (res, keyword) => {
			// if (this._closed) return;
			this.videosList.append(Youtube.translateVideoItem(res, this.index++));
		}

		this.youtube.onGetUrl = async (item) => {
			this.gettingUrl = false;
			this.menuLoading.disable();
			this.play(item, 'flat');
		}
	}

	private async createMainMenu() {
		// menu
		const scale = this.options.scale;
		this.mainMenu = new Menu(this.context, this.assets, {
			url: `youtube/main.xml`,
			assets: this.options.uiassets,
			// animate: true,
			baseUrl: this.options.baseUrl,
			roles: this.modOnly ? ['moderator'] : null,
			scale,
		}, null);

		await this.mainMenu.created();

		this.menuLoading = this.mainMenu.view.root.find('#loading')[0] as ViewElement;

		// search button
		const searchTextInput = this.mainMenu.view.root.find('#search_text')[0] as TextInput;
		searchTextInput.addUIEventHandler('submitted', (params: { user: User, id: string, text: string }) => {
			const [text, height] = formatText(params.text, 4, 0.28, 0.15);
			searchTextInput.text(text as string);
			searchTextInput.textHeight(height as number);
			this.videosList.items = [];
			this.videosList.update();
			this.index = 0;

			this.logo.disable();

			this.youtube.search(params.text);
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
			params.user.prompt("Youtube video url:", true).then(async (dialog) => {
				if (dialog.submitted) {
					const item = await Youtube.parseUrl(dialog.text);
					if (item) {
						this.menuLoading.enable();
						this.gettingUrl = true;
						this.youtube.getUrl(Youtube.translateVideoItem(item));
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
			if (this.gettingUrl) return;
			this.menuLoading.enable();
			this.gettingUrl = true;
			this.youtube.getUrl(item);
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
			url: `youtube/media.xml`,
			assets: this.options.uiassets,
			// animate: true,
			baseUrl: this.options.baseUrl,
			roles: this.modOnly ? ['moderator'] : null,
			scale
		}, null);

		await this.mediaMenu.created();
		this.mediaMenu.view.root.anchor.transform.local.copy({
			position: {
				x: 0, y: PLAYER_OFFSET * scale, z: 0.01 * scale
			}
		});

		// loading
		this.mediaLoading = this.mediaMenu.view.root.find('#loading')[0] as ViewElement;

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

		// forward
		const forwardButton = this.mediaMenu.view.root.find('#forward')[0] as Button;
		forwardButton.addUIEventHandler('click', (params: { user: User, id: string }) => {
			this.player.forward();
		});

		// backward
		const backwardButton = this.mediaMenu.view.root.find('#backward')[0] as Button;
		backwardButton.addUIEventHandler('click', (params: { user: User, id: string }) => {
			this.player.backward();
		});

		// slider
		this.timeSlider = this.mediaMenu.view.root.find('#time_slider')[0] as Slider;
		this.timeSlider.addUIEventHandler('click', (params: { user: User, id: string, percent: number }) => {
			this.player.seek(params.percent);
		});

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

		// force play
		const forceplayButton = this.mediaMenu.view.root.find('#forceplay')[0] as Button;
		forceplayButton.addUIEventHandler('click', async (params: { user: User, id: string }) => {
			if (!this.player.video) return;
			this.stop(false);
			this.mediaLoading.enable();
			const ret = await this.youtube.forcePlay(this.item);
			this.mediaLoading.disable();
			if (ret && ret.queue) {
				console.log(`Too many users streaming. Current queue length: ${ret.queue}`);
			}
			this.process = ret.process;
			this.play({ ...ret.item, url: ret.url, live: true }, 'flat');
		});

		// visualize
		const visualizeButton = this.mediaMenu.view.root.find('#visualize')[0] as Button;
		visualizeButton.addUIEventHandler('click', async (params: { user: User, id: string }) => {
			if (!this.player.video) return;
			this.stop(false);
			this.mediaLoading.enable();
			const ret = await this.youtube.visualize(this.item);
			this.mediaLoading.disable();
			if (ret && ret.queue) {
				console.log(`Too many users streaming. Current queue length: ${ret.queue}`);
			}
			this.process = ret.process;
			this.play({ ...ret.item, url: ret.url, live: true }, 'cqt');
		});

		// replay
		const replayButton = this.mediaMenu.view.root.find('#replay')[0] as Button;
		replayButton.addUIEventHandler('click', async (params: { user: User, id: string }) => {
			if (!this.player.video) return;
			this.play(this.item);
		});

		// ratio
		const ratioButton = this.mediaMenu.view.root.find('#ratio')[0] as Button;
		ratioButton.addUIEventHandler('click', async (params: { user: User, id: string }) => {
			const prev = this.player.ratio;
			this.player.cycleRatio();
			const cur = this.player.ratio;
			this.updateMediaMenu(prev, cur);
		});

		if (this.player) {
			this.updateMediaMenu(Ratio._16_9, this.player.ratio);
		}

		// 3d
		const _3DButton = this.mediaMenu.view.root.find('#3d')[0] as Button;
		_3DButton.addUIEventHandler('click', async (params: { user: User, id: string }) => {
			if (!this.player.video) return;
			this.play(this.item, 'stereo');
		});
	}

	private updateMediaMenu(prev: Ratio, cur: Ratio) {
		if (!this.mediaMenu) return;
		const scales = this.mediaMenu.view.root.find('.scale');
		const sy = (1 / RatioToNumber(cur)) / (1 / RatioToNumber(prev));
		scales.forEach(s => {
			const h = s.dom.height as number;
			s.dom.height = h * sy;
			s.dom.node.setHeight(h * sy);
		});
		this.mediaMenu.view.dom.calc();
		this.mediaMenu.view.render();
		const ratioButton = this.mediaMenu.view.root.find('#ratio')[0] as Button;
		ratioButton.text(this.player.ratio);
	}

	private async createSettingsMenu() {
		// menu
		const scale = this.options.scale;
		this.settingsMenu = new Menu(this.context, this.assets, {
			url: `youtube/settings.xml`,
			assets: this.options.uiassets,
			animate: true,
			baseUrl: this.options.baseUrl,
			roles: this.modOnly ? ['moderator'] : null,
			scale
		}, null);

		await this.settingsMenu.created();
		this.settingsMenu.view.root.anchor.transform.local.copy({
			position: {
				x: SETTINGS_OFFSET * scale, y: 0 * scale, z: 0.01
			}
		});

		const lockCheckbox = this.settingsMenu.view.root.find('#lock')[0] as Checkbox;
		lockCheckbox.checked = this.modOnly;
		lockCheckbox.addUIEventHandler('checked', (params: { user: User, id: string, checked: boolean }) => {
			this.modOnly = params.checked;
			if (!this.modOnly) {
				if (this.mediaMenu) this.mediaMenu.roles = null;
				if (this.mainMenu) this.mainMenu.roles = null;
			} else {
				if (this.mediaMenu) this.mediaMenu.roles = ['moderator'];
				if (this.mainMenu) this.mainMenu.roles = ['moderator'];
			}
		});

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
			if (this.modOnly && !checkUserRole(user, 'moderator')) return;
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
		if (!this.youtube) this.createYoutube();
		if (!this.mainMenu) this.createMainMenu();
		if (!this.player) this.createVideoPlayer();
	}

	public close(): void {
		super.close();
		this._closed = true;
		this.player?.stop();
		this.process?.kill();
		if (this.mainMenu) { this.mainMenu.remove(); this.mainMenu = undefined; }
		if (this.mediaMenu) { this.mediaMenu.remove(); this.mediaMenu = undefined; }
		if (this.settingsMenu) { this.settingsMenu.remove(); this.settingsMenu = undefined; }
		if (this.player) { this.player.remove(); this.player = undefined; }
	}

	public async playUrl(url: string) {
		const item = await Youtube.parseUrl(url);
		if (item) {
			this.gettingUrl = true;
			this.youtube.getUrl(Youtube.translateVideoItem(item));
		}
	}
}