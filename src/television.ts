/*!
 * Copyright (c) The Free MRE Foundation. All rights reserved.
 * Licensed under the GPLv3 License.
 */

import { AssetContainer, Context, User } from "@microsoft/mixed-reality-extension-sdk";
import { Button, Checkbox, Grid, Menu, NumberInput, Pager, PaginatedGrid, Slider, Text, TextInput, ViewElement } from "altvr-gui";
import { MongoClient } from "mongodb";
import { App, AppOptions } from "./myapp";
import { DEFAULT_SCREENS, PLAYER_OFFSET, VideoPlayer } from "./player";
import { Async, checkUserRole, formatText, isValidUrl } from "./utils";

import fetch from "node-fetch";
import { SETTINGS_OFFSET } from "./app";
const _ = require('lodash');

const MIN_UPDATE_INTERVAL = 24 * 60 * 60;

const MONGODB_HOST = process.env['MONGODB_HOST'];
const MONGODB_PORT = process.env['MONGODB_PORT'];
const MONGODB_USER = process.env['MONGODB_USER'];
const MONGODB_PASSWORD = process.env['MONGODB_PASSWORD'];
const TV_DATABASE = process.env['TV_DATABASE'];

export class Television extends Async {
	private client: MongoClient;
	private connection: MongoClient;

	public getMyChannels: () => any[];

	constructor() {
		super();
		this.init();
	}

	private async init() {
		this.client = await this.createClient();
		this.notifyCreated(true);

		const lastupdate = await this.getLastUpdate();
		if (!lastupdate || Date.now() - lastupdate.time > MIN_UPDATE_INTERVAL * 1000) {
			await this.setLastUpdate(Date.now());
			this.updateDatabase();
		}
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

	private async getLastUpdate() {
		try {
			if (this.connection === undefined) {
				this.connection = await this.client.connect();
			}
			const db = this.client.db(TV_DATABASE);
			const collection = db.collection('lastupdate');
			return await collection.findOne({});
		} catch (err) {
			console.log(err);
		}
	}

	private async setLastUpdate(now: number) {
		try {
			if (this.connection === undefined) {
				this.connection = await this.client.connect();
			}
			const db = this.client.db(TV_DATABASE);
			const collection = db.collection('lastupdate');
			await collection.updateOne(
				{},
				{
					$set: {
						time: now,
					}
				},
				{ upsert: true }
			);
		} catch (err) {
			console.log(err);
		}
	}

	private async updateDatabase() {
		const [languages, categories, channels] = await this.fetchChannels();
		await this.insertCategories(categories);
		await this.insertLanguages(languages);
		await this.insertChannels(channels);
	}

	private async insertChannels(channels: any[]) {
		try {
			if (this.connection === undefined) {
				this.connection = await this.client.connect();
			}
			const db = this.client.db(TV_DATABASE);
			const collection = db.collection('channels');
			await collection.bulkWrite(channels.map((c: any) => (
				{
					updateOne: {
						filter: { id: c.id },
						update: {
							$set: { ...c },
						},
						upsert: true,
					}
				}
			)));
		} catch (err) {
			console.log(err);
		}
	}

	private async insertLanguages(languages: any[]) {
		try {
			if (this.connection === undefined) {
				this.connection = await this.client.connect();
			}
			const db = this.client.db(TV_DATABASE);
			const collection = db.collection('languages');
			await collection.bulkWrite(languages.map((c: any) => (
				{
					updateOne: {
						filter: { id: c.code },
						update: {
							$set: { ...c },
						},
						upsert: true,
					}
				}
			)));
		} catch (err) {
			console.log(err);
		}
	}

	private async insertCategories(categories: any) {
		try {
			if (this.connection === undefined) {
				this.connection = await this.client.connect();
			}
			const db = this.client.db(TV_DATABASE);
			const collection = db.collection('categories');
			await collection.bulkWrite(categories.map((c: any) => (
				{
					updateOne: {
						filter: { id: c.id },
						update: {
							$set: { ...c },
						},
						upsert: true,
					}
				}
			)));
		} catch (err) {
			console.log(err);
		}
	}

	private async fetchChannels() {
		let _countries = await fetch('https://iptv-org.github.io/api/countries.json')
			.then(r => r.json())
			.then(data => (data.length ? data : []))
			.then(data =>
				data.map((i: any) => {
					i.expanded = false
					return i
				})
			)
			.then(data => _.keyBy(data, 'code'))
			.catch(console.error);

		let languages = await fetch('https://iptv-org.github.io/api/languages.json')
			.then(r => r.json())
			.then(data => (data.length ? data : []))
			.catch(console.error);
		let _languages = _.keyBy(languages, 'code');

		let categories = await fetch('https://iptv-org.github.io/api/categories.json')
			.then(r => r.json())
			.then(data => (data.length ? data : []))
			.catch(console.error);
		let _categories = _.keyBy(categories, 'id');

		let _streams = await fetch('https://iptv-org.github.io/api/streams.json')
			.then(r => r.json())
			.then(data => (data.length ? data : []))
			.then(data => _.groupBy(data, 'channel'))
			.catch(console.error);

		let _channels = await fetch('https://iptv-org.github.io/api/channels.json')
			.then(r => r.json())
			.then(arr =>
				arr.map((c: any) => {
					c._streams = _streams[c.id] || []

					for (let field in c) {
						switch (field) {
							case 'languages':
								c.languages.forEach((code: string) => { const l = languages.find((a: any) => a.code == code); l['count'] = l['count'] ? l['count'] + 1 : 1; });
								c.languages = c.languages.map((code: string) => _languages[code]).filter((i: string) => i)
								break
							case 'country':
								c.country = _countries[c.country]
								break
							case 'categories':
								c.categories = c.categories.map((id: string) => _categories[id]).filter((i: string) => i)
								break
						}
					}

					return c
				})
			)
			.catch(err => {
				console.error(err)
				return []
			});
		return [languages, categories, _channels];
	}

	public async getCategories() {
		try {
			if (this.connection === undefined) {
				this.connection = await this.client.connect();
			}
			const db = this.client.db(TV_DATABASE);
			const collection = db.collection('categories');
			const cursor = collection.find();
			const res: any[] = [];
			if (this.getMyChannels().length > 0) {
				res.push({ id: 'mine', name: 'Mine' });
			}
			await cursor.forEach(d => res.push(d));
			return res;

		} catch (err) {
			console.log(err);
		}
	}

	public async getChannels(filters: { category?: string, languages?: string[] }) {
		if (filters.category == 'mine') {
			return this.getMyChannels();
		}
		try {
			if (this.connection === undefined) {
				this.connection = await this.client.connect();
			}
			const db = this.client.db(TV_DATABASE);
			const collection = db.collection('channels');
			const query: any = { _streams: { $elemMatch: { status: { $in: ['online', 'timeout'] } } } };
			if (filters.category) {
				query.categories = { $elemMatch: { id: filters.category } };
			}
			if (filters.languages) {
				query.languages = { $not: { $elemMatch: { code: { $nin: filters.languages } } } };
			}
			const cursor = collection.find(query);
			const res: any[] = [];
			await cursor.forEach(d => res.push(d));
			return res;

		} catch (err) {
			console.log(err);
		}
	}

	public static translateVideoItem(d: any, i?: number) {
		const [title, height] = formatText(d.name, 1.1, 0.14);
		let duration = parseInt(d.duration);
		duration = duration === NaN ? 0 : duration;
		return {
			...d,
			id: i,
			vid: d.id,
			title,
			height,
			uploader: d.id.slice(0, 72),
			duration,
		}
	}

	public async search(keyword: string) {
	}
}

export interface TelevisionAppOptions extends AppOptions {
}

export class TelevisionApp extends App {
	// television
	private television: Television;

	// menu
	private mainMenu: Menu;
	private logo: ViewElement;

	private categoriesXML: string;
	private categoriesGrid: Grid;
	private categoriesList: PaginatedGrid;

	private channelsXML: string;
	private channelsGrid: Grid;
	private channelsList: PaginatedGrid;
	private categoryText: Text;

	// media menu
	private mediaMenu: Menu;
	private titleText: Text;
	private uploaderText: Text;
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
	public getMyChannels: () => any[];

	constructor(context: Context, assets: AssetContainer, private options: TelevisionAppOptions) {
		super(context, assets, options);
		this.init();
	}

	private async init() {
		await this.createTelevision();
		this.notifyCreated(true);
	}

	private async createTelevision() {
		this.television = new Television();
		this.television.getMyChannels = () => this.getMyChannels();
		await this.television.created();
	}

	private async createMainMenu() {
		// menu
		const scale = this.options.scale;
		this.mainMenu = new Menu(this.context, this.assets, {
			url: `television/main.xml`,
			assets: this.options.uiassets,
			// animate: true,
			baseUrl: this.options.baseUrl,
			roles: ['moderator'],
			scale,
		}, null);

		await this.mainMenu.created();

		// search button
		const searchTextInput = this.mainMenu.view.root.find('#search_text')[0] as TextInput;
		searchTextInput.addUIEventHandler('submitted', (params: { user: User, id: string, text: string }) => {
			const [text, height] = formatText(params.text, 4, 0.28, 0.15);
			searchTextInput.text(text as string);
			searchTextInput.textHeight(height as number);
			this.categoriesList.items = [];
			this.categoriesList.update();

			this.logo.disable();

			this.television.search(params.text);
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
			params.user.prompt("Television video url:", true).then(async (dialog) => {
				if (dialog.submitted) {
					if (!isValidUrl(dialog.text)) {
						params.user.prompt("Invalid Url");
						return;
					}
					this.play({
						name: '',
						title: '',
						url: dialog.text
					}, 'flat');
				}
			});
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

		// default: categories
		this.createCategoriesList();
	}

	private async createCategoriesList() {
		this.logo.enable();
		this.removeChannelsList();

		if (!this.categoriesXML) {
			const url = `${this.options.baseUrl}/television/categories.xml`;
			this.categoriesXML = await fetch(url).then(r => r.text());
		}

		if (this.mainMenu.view.root.find('#categories').length > 0) { return; }
		const mainView = this.mainMenu.view.root.find('#main')[0] as ViewElement;
		mainView.append(this.categoriesXML);

		// pager
		const prev = this.mainMenu.view.root.find('#prev')[0] as Button;
		const next = this.mainMenu.view.root.find('#next')[0] as Button;
		const categoriesPager = this.mainMenu.view.root.find('#categories_pager')[0] as Pager;
		categoriesPager.prev = prev;
		categoriesPager.next = next;

		// categories list
		this.categoriesGrid = this.mainMenu.view.root.find('#categories_list')[0] as Grid;
		await this.categoriesGrid.created();
		let r = this.categoriesGrid.dom.options.row;
		let c = this.categoriesGrid.dom.options.col;
		this.categoriesList = new PaginatedGrid({
			list: this.categoriesGrid,
			pageSize: r * c,
			pager: categoriesPager,
		});

		this.categoriesGrid.addUIEventHandler('selected', async (params: { user: User, id: string, selected: string }) => {
			const index = parseInt(params.id);
			const item = this.categoriesList.page[index];
			const channels = await this.television.getChannels({ category: item.id });
			console.log(channels.length);
			await this.createChannelsList();
			this.categoryText.text(`Category: ${item.name}`);
			this.updateChannelsList(channels);
		});

		this.updateCategoriesList();
	}

	private removeCategoriesList() {
		if (this.mainMenu.view.root.find('#categories').length > 0) {
			const mainView = this.mainMenu.view.root.find('#main')[0] as ViewElement;
			mainView.clear();
		}
	}

	private async updateCategoriesList() {
		const items = await this.television.getCategories();
		this.categoriesList.items = items;
		this.categoriesList.update();
	}

	private async createChannelsList() {
		this.logo.disable();
		this.removeCategoriesList();

		if (!this.channelsXML) {
			const url = `${this.options.baseUrl}/television/channels.xml`;
			this.channelsXML = await fetch(url).then(r => r.text());
		}

		if (this.mainMenu.view.root.find('#channels').length > 0) { return; }
		const mainView = this.mainMenu.view.root.find('#main')[0] as ViewElement;
		mainView.append(this.channelsXML);

		// pager
		const channelsPager = this.mainMenu.view.root.find('#channels_pager')[0] as Pager;

		// channels list
		this.channelsGrid = this.mainMenu.view.root.find('#channels_list')[0] as Grid;
		await this.channelsGrid.created();
		let r = this.channelsGrid.dom.options.row;
		let c = this.channelsGrid.dom.options.col;
		this.channelsList = new PaginatedGrid({
			list: this.channelsGrid,
			pageSize: r * c,
			pager: channelsPager,
		});

		this.channelsGrid.addUIEventHandler('selected', async (params: { user: User, id: string, selected: string }) => {
			const index = parseInt(params.id);
			let item = this.channelsList.page[index];
			item = Television.translateVideoItem(item);
			this.play({ ...item, url: item._streams[0].url, live: true }, 'flat');
		});

		this.channelsGrid.addUIEventHandler('button', async (params: { user: User, id: string, index: string }) => {
			if (params.id == 'play') {
				const index = parseInt(params.index);
				let item = this.channelsList.page[index];
				item = Television.translateVideoItem(item);
				this.play({ ...item, url: item._streams[0].url, live: true }, 'flat');
			}
		});

		// category text
		this.categoryText = this.mainMenu.view.root.find('#category_text')[0] as Text;

		// back button
		const backButton = this.mainMenu.view.root.find('#back')[0] as Button;
		backButton.addUIEventHandler('click', async (params: { user: User, id: string }) => {
			this.createCategoriesList();
		});
	}

	private removeChannelsList() {
		if (this.mainMenu.view.root.find('#channels').length > 0) {
			const mainView = this.mainMenu.view.root.find('#main')[0] as ViewElement;
			mainView.clear();
		}
	}

	private async updateChannelsList(channels: any[]) {
		const r = this.channelsGrid.dom.options.row;
		const c = this.channelsGrid.dom.options.col;
		const pageSize = r * c;

		channels = channels.map((c, i) => ({
			...c,
			index: this.channelsList.pageNum * pageSize + i + 1,
			country: c.country ? c.country.name : '',
			language: c.languages ? (c.languages[0] ? c.languages[0].name : 'UN') : '',
			img: {
				url: c.logo,
				width: 0.30,
				height: 0.30,
			}
		}));
		this.channelsList.items = channels;
		this.channelsList.update();
	}

	private async createMediaMenu() {
		// menu
		const scale = this.options.scale;
		this.mediaMenu = new Menu(this.context, this.assets, {
			url: `television/media.xml`,
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
		this.titleText = this.mediaMenu.view.root.find('#title')[0] as Text;
		this.uploaderText = this.mediaMenu.view.root.find('#uploader')[0] as Text;

		// fullscreen
		const fullscreenButton = this.mediaMenu.view.root.find('#fullscreen')[0] as Button;
		fullscreenButton.addUIEventHandler('click', async (params: { user: User, id: string }) => {
			if (!this.mediaMenu.closed) {
				this.mediaMenu.close(false);
			}
			if (this.mainMenu.closed) {
				await this.mainMenu.open();
				this.categoriesList.update();
			}
		});

		// stop
		const stopButton = this.mediaMenu.view.root.find('#stop')[0] as Button;
		stopButton.addUIEventHandler('click', (params: { user: User, id: string }) => {
			this.stop();
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
	}

	private async createSettingsMenu() {
		// menu
		const scale = this.options.scale;
		this.settingsMenu = new Menu(this.context, this.assets, {
			url: `television/settings.xml`,
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
			} else {
				this.mediaMenu.close(false);
			}
		}

		this.player.onTime = () => { }

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
			this.categoriesList.update();
		}
	}

	private updateMediaInfo(item: any) {
		const [title, height] = formatText(item.title, 4, 0.3, 0.12);
		this.titleText.text(title as string);
		this.titleText.textHeight(height as number);
		this.uploaderText.text(item.uploader);
	}

	public open(): void {
		super.open();
		if (!this.television) this.createTelevision();
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
}