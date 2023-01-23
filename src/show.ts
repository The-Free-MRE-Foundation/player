/*!
 * Copyright (c) The Free MRE Foundation. All rights reserved.
 * Licensed under the GPLv3 License.
 */

import fetch from "node-fetch";
import { Duration } from "luxon";
import { Async, checkUserRole, formatText } from "./utils";
import { Button, Checkbox, Grid, Menu, NumberInput, Pager, PaginatedGrid, Slider, Text, TextInput, ViewElement } from "altvr-gui";
import { AssetContainer, Context, User } from "@microsoft/mixed-reality-extension-sdk";
import { DEFAULT_SCREENS, PLAYER_OFFSET, Ratio, RatioToNumber, VideoPlayer } from "./player";
import { App, AppOptions } from "./myapp";
import { SETTINGS_OFFSET } from "./app";
import { MongoClient } from 'mongodb';

const MONGODB_HOST = process.env['MONGODB_HOST'];
const MONGODB_PORT = process.env['MONGODB_PORT'];
const MONGODB_USER = process.env['MONGODB_USER'];
const MONGODB_PASSWORD = process.env['MONGODB_PASSWORD'];
const SHOW_DATABASE = process.env['SHOW_DATABASE'];
const SHOW_BASEURL = process.env['SHOW_BASEURL'];

export class Show extends Async {
	private client: MongoClient;
	private connection: MongoClient;

	constructor() {
		super();
		this.init();
	}

	private async init() {
		this.client = await this.createClient();
		this.notifyCreated(true);
	}

	private async createClient() {
		if (this.client) {
			await this.client.close();
		}

		await new Promise(resolve => setTimeout(resolve, 1));
		const host = MONGODB_HOST ? MONGODB_HOST : '127.0.0.1';
		const port = MONGODB_PORT ? MONGODB_PORT : 27017;
		const uri = `mongodb://${MONGODB_USER}:${MONGODB_PASSWORD}@${host}:${port}?writeConcern=majority`;
		return new MongoClient(uri, {
			useNewUrlParser: true,
			useUnifiedTopology: true,
		});
	}

	public static translateShowItem(d: any) {
		const [title, titleHeight] = formatText(d.title, 1.4, 0.15, 0.07);
		const [plot, plotHeight] = formatText(d.plot, 1.4, 0.6, 0.09);
		return {
			...d,
			title,
			titleHeight,
			plot,
			plotHeight,
			genre: d.genre,
			seasons: d.seasons,
			episodes: d.episodes,
			img: {
				url: d.image.replace(/\?.*$/, ''),
				width: 0.8,
				height: 1.2
			}
		}
	}

	public static translateVideoItem(d: any, i?: number) {
		const [title, titleHeight] = formatText(d.title, 1.4, 0.15, 0.07);
		const [plot, plotHeight] = formatText(d.plot, 1.8, 0.3, 0.05);
		const annotation = `${d.contentRating ? d.contentRating : 'Not Rated'} | ${d.runtime} | ${d.genre}`;
		return {
			...d,
			id: i,
			title,
			titleHeight,
			plot,
			plotHeight,
			annotation,
			duration: d.duration,
			duration_text: Duration.fromMillis(d.duration * 1000).toFormat("hh:mm:ss"),
			img: {
				url: d.image.replace(/\?.*$/, ''),
				width: 0.4,
				height: 0.55
			}
		}
	}

	public async getShows(filters: { title?: string }) {
		try {
			if (this.connection === undefined) {
				this.connection = await this.client.connect();
			}
			const db = this.client.db(SHOW_DATABASE);
			const collection = db.collection('shows');
			const query: any = {};
			if (filters.title) {
				query.title = { $regex: filters.title, $options: 'i' };
			}
			const res: any[] = [];
			const cursor = collection.aggregate([
				{
					$match: query,
				},
				{
					$project: {
						id: 1,
						title: 1,
						image: 1,
						genre: 1,
						plot: 1,
						baseurl: 1,
						seasons: { $size: "$seasons" },
						episodes: {
							$reduce: {
								input: "$seasons",
								initialValue: 0,
								in: {
									$add: [
										"$$value",
										{ $size: "$$this.episodes" }
									]
								}
							}
						}
					}
				},
			]);
			await cursor.forEach(d => res.push(d));
			return res;

		} catch (err) {
			console.log(err);
		}
	}

	public async getEpisodes(filters: { id: string, season: string }) {
		try {
			if (this.connection === undefined) {
				this.connection = await this.client.connect();
			}
			const db = this.client.db(SHOW_DATABASE);
			const collection = db.collection('shows');
			const query: any = {};
			query.id = filters.id;
			const cursor = collection.aggregate([
				{
					$match: query
				},
				{
					$unwind: "$seasons"
				},
				{
					$match: {
						"seasons.id": filters.season
					}
				},
				{
					$project: {
						episodes: "$seasons.episodes"
					}
				}
			]);
			const res = await cursor.next();
			return res ? res.episodes : [];
		} catch (err) {
			console.log(err);
		}
	}

	public async search(keyword: string) {
		return await this.getShows({ title: keyword });
	}
}

export interface ShowAppOptions extends AppOptions {
}

export class ShowApp extends App {
	// show
	private show: Show;

	// menu
	private mainMenu: Menu;
	private logo: ViewElement;

	private showsXML: string;
	private showsGrid: Grid;
	private showsList: PaginatedGrid;

	private detailsXML: string;
	private seasonsGrid: Grid;
	private seasonsList: PaginatedGrid;
	private episodesGrid: Grid;
	private episodesList: PaginatedGrid;
	private showText: Text;

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
	private seasonsItem: any;
	private showItem: any;
	private episodesItem: any;

	public onAction: (action: string, user: User, params: any) => void;

	constructor(context: Context, assets: AssetContainer, private options: ShowAppOptions) {
		super(context, assets, options);
		this.init();
	}

	private async init() {
		await new Promise(resolve => setTimeout(resolve, 1));
		this.notifyCreated(true);
	}

	private createShow() {
		this.show = new Show();
	}

	private async createMainMenu() {
		// menu
		const scale = this.options.scale;
		this.mainMenu = new Menu(this.context, this.assets, {
			url: `show/main.xml`,
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

			this.logo.disable();

			const items = await this.show.search(params.text);
			this.showsList.items = items.map(d => Show.translateShowItem(d));
			this.showsList.pageNum = 0;
			this.showsList.update();
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

		// default: shows
		this.createShowsList();
	}

	private async createShowsList() {
		this.logo.disable();
		this.removeDetailsList();

		if (!this.showsXML) {
			const url = `${this.options.baseUrl}/show/shows.xml`;
			this.showsXML = await fetch(url).then(r => r.text());
		}

		if (this.mainMenu.view.root.find('#shows').length > 0) { return; }
		const mainView = this.mainMenu.view.root.find('#main')[0] as ViewElement;
		mainView.append(this.showsXML);

		// pager
		const prev = this.mainMenu.view.root.find('#prev')[0] as Button;
		const next = this.mainMenu.view.root.find('#next')[0] as Button;
		const showsPager = this.mainMenu.view.root.find('#shows_pager')[0] as Pager;
		showsPager.prev = prev;
		showsPager.next = next;

		// shows list
		this.showsGrid = this.mainMenu.view.root.find('#shows_list')[0] as Grid;
		await this.showsGrid.created();
		let r = this.showsGrid.dom.options.row;
		let c = this.showsGrid.dom.options.col;
		this.showsList = new PaginatedGrid({
			list: this.showsGrid,
			pageSize: r * c,
			pager: showsPager,
		});

		this.showsGrid.addUIEventHandler('selected', async (params: { user: User, id: string, selected: string }) => {
			const index = parseInt(params.id);
			let item = this.showsList.page[index];
			item = Show.translateShowItem(item);
			this.showItem = item;
			await this.createDetailsList(item);
			this.showText.text(`Show: ${item.title}`);
		});

		this.updateShowsList();
	}

	private removeShowsList() {
		if (this.mainMenu.view.root.find('#shows').length > 0) {
			const mainView = this.mainMenu.view.root.find('#main')[0] as ViewElement;
			mainView.clear();
		}
	}

	private async updateShowsList() {
		const items = await this.show.getShows({});
		this.showsList.items = items.map(d => Show.translateShowItem(d));
		this.showsList.update();
	}

	private async createDetailsList(show: any) {
		this.logo.disable();
		this.removeShowsList();

		if (!this.detailsXML) {
			const url = `${this.options.baseUrl}/show/details.xml`;
			this.detailsXML = await fetch(url).then(r => r.text());
		}

		if (this.mainMenu.view.root.find('#details').length > 0) { return; }
		const mainView = this.mainMenu.view.root.find('#main')[0] as ViewElement;
		mainView.append(this.detailsXML);

		// details
		const imageButton = this.mainMenu.view.root.find('#image')[0] as Button;
		const titleText = this.mainMenu.view.root.find('#title')[0] as Text;
		const dateText = this.mainMenu.view.root.find('#date')[0] as Text;
		const plotText = this.mainMenu.view.root.find('#plot')[0] as Text;

		imageButton.addUIEventHandler('click', (params: { user: User, id: string }) => {
			if (!this.episodesItem) return;
			const item = Show.translateVideoItem(this.episodesItem);
			const url = `${this.showItem.baseurl}/S${this.seasonsItem.name}E${item.name}.mp4`;
			this.play({ ...item, uploader: this.showItem.title, url, live: false }, 'flat');
		});

		// seasons list
		this.seasonsGrid = this.mainMenu.view.root.find('#seasons_list')[0] as Grid;
		await this.seasonsGrid.created();
		let r = this.seasonsGrid.dom.options.row;
		let c = this.seasonsGrid.dom.options.col;
		this.seasonsList = new PaginatedGrid({
			list: this.seasonsGrid,
			pageSize: r * c,
		});

		this.seasonsGrid.addUIEventHandler('selected', async (params: { user: User, id: string, selected: string }) => {
			const index = parseInt(params.id);
			const item = this.seasonsList.page[index];
			this.seasonsItem = item;
			this.updateEpisodesList({ id: show.id, season: item.number });
		});

		this.updateSeasonsList(show.seasons);

		// episodes list
		const prev = this.mainMenu.view.root.find('#prev')[0] as Button;
		const next = this.mainMenu.view.root.find('#next')[0] as Button;
		const episodesPager = this.mainMenu.view.root.find('#episodes_pager')[0] as Pager;
		episodesPager.prev = prev;
		episodesPager.next = next;

		this.episodesGrid = this.mainMenu.view.root.find('#episodes_list')[0] as Grid;
		await this.episodesGrid.created();
		r = this.episodesGrid.dom.options.row;
		c = this.episodesGrid.dom.options.col;
		this.episodesList = new PaginatedGrid({
			list: this.episodesGrid,
			pageSize: r * c,
			pager: episodesPager,
		});

		this.episodesGrid.addUIEventHandler('selected', async (params: { user: User, id: string, selected: string }) => {
			const index = parseInt(params.id);
			const item = this.episodesList.page[index];
			imageButton.img({
				url: item.image_large,
				width: 1.8,
				height: 1.2,
			});
			const [title, titleHeight] = formatText(item.title, 2, 0.15, 0.07);
			const [plot, plotHeight] = formatText(item.plot, 2.8, 0.6, 0.09);
			titleText.text(title as string);
			titleText.textHeight(titleHeight as number);
			plotText.text(plot as string);
			plotText.textHeight(plotHeight as number);
			dateText.text(item.publishedDate);

			this.episodesItem = item;
		});

		// show text
		this.showText = this.mainMenu.view.root.find('#show_text')[0] as Text;

		// back button
		const backButton = this.mainMenu.view.root.find('#back')[0] as Button;
		backButton.addUIEventHandler('click', async (params: { user: User, id: string }) => {
			this.createShowsList();
		});
	}

	private removeDetailsList() {
		if (this.mainMenu.view.root.find('#details').length > 0) {
			const mainView = this.mainMenu.view.root.find('#main')[0] as ViewElement;
			mainView.clear();
		}
	}

	private updateSeasonsList(seasons: number) {
		this.seasonsList.items = [...Array(seasons).keys()].map((s, i) => ({ id: i, number: `${i + 1}`, name: `${i + 1}`.padStart(2, '0') }));
		this.seasonsList.update();
	}

	private async updateEpisodesList(filter: { id: string, season: string }) {
		const episodes = await this.show.getEpisodes(filter);
		this.episodesList.items = episodes.map((e: any, i: number) => ({ ...e, id: i, name: `${e.idx}`.padStart(2, '0') }));
		this.episodesList.pageNum = 0;
		this.episodesList.update();
	}

	private async createMediaMenu() {
		// menu
		const scale = this.options.scale;
		this.mediaMenu = new Menu(this.context, this.assets, {
			url: `show/media.xml`,
			assets: this.options.uiassets,
			// animate: true,
			baseUrl: this.options.baseUrl,
			roles: ['moderator'],
			scale
		}, null);

		await this.mediaMenu.created();
		this.mediaMenu.view.root.anchor.transform.local.copy({
			position: {
				x: 0, y: PLAYER_OFFSET * scale, z: 0.01 * scale
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
				this.showsList.update();
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

		// ratio
		const scales = this.mediaMenu.view.root.find('.scale');
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
			url: `show/settings.xml`,
			assets: this.options.uiassets,
			animate: true,
			baseUrl: this.options.baseUrl,
			roles: ['moderator'],
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
		if (!manual) return;
		if (!this.mediaMenu.closed) {
			this.player.hideDisplay();
			this.mediaMenu.close(false);
		}
		if (this.mainMenu.closed) {
			await this.mainMenu.open();
			this.showsList.update();
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
		if (!this.show) this.createShow();
		if (!this.mainMenu) this.createMainMenu();
		if (!this.player) this.createVideoPlayer();
	}

	public close(): void {
		super.close();
		this.player?.stop();
		if (this.mainMenu) { this.mainMenu.remove(); this.mainMenu = undefined; }
		if (this.mediaMenu) { this.mediaMenu.remove(); this.mediaMenu = undefined; }
		if (this.settingsMenu) { this.settingsMenu.remove(); this.settingsMenu = undefined; }
		if (this.player) { this.player.remove(); this.player = undefined; }
	}
}