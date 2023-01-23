/*!
 * Copyright (c) The Free MRE Foundation. All rights reserved.
 * Licensed under the GPLv3 License.
 */

import fs from 'fs-extra';
import path from 'path';
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
const MOVIE_DATABASE = process.env['MOVIE_DATABASE'];
const MOVIE_BASEURL = process.env['MOVIE_BASEURL'];

const MIN_UPDATE_INTERVAL = 30 * 12 * 24 * 60 * 60;

const IMDB_API_BASEURL = 'https://imdb-api.tprojects.workers.dev/title';

export class Movie extends Async {
	private client: MongoClient;
	private connection: MongoClient;

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
			const db = this.client.db(MOVIE_DATABASE);
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
			const db = this.client.db(MOVIE_DATABASE);
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
		const movies = await this.fetchMovies();
		await this.insertMovies(movies);
	}

	public async fetchMovies() {
		const filepath = path.join(__dirname, '../public/movie', 'movies.csv');
		const movies = fs.readFileSync(filepath).toString();
		const ll = movies.split('\n').slice(1);
		return await Promise.all(ll.map(async l => {
			const [id, path] = l.split(';');
			const movie = await this.queryIMDB(id);
			const url = `${MOVIE_BASEURL}/${path}`;
			return { ...movie, url };
		}));
	}

	private async queryIMDB(id: string) {
		const movie = await fetch(`${IMDB_API_BASEURL}/${id}`).then((res: any) => res.json());
		return { ...movie };
	}

	private async insertMovies(movies: any[]) {
		try {
			if (this.connection === undefined) {
				this.connection = await this.client.connect();
			}
			const db = this.client.db(MOVIE_DATABASE);
			const collection = db.collection('movies');
			await collection.bulkWrite(movies.map((m: any) => (
				{
					updateOne: {
						filter: { id: m.id },
						update: {
							$setOnInsert: { ...m },
						},
						upsert: true,
					}
				}
			)));
		} catch (err) {
			console.log(err);
		}
	}

	public static translateVideoItem(d: any, i?: number) {
		const [title, titleHeight] = formatText(d.title, 1.4, 0.15, 0.07);
		const [plot, plotHeight] = formatText(d.plot, 1.8, 0.3, 0.05);
		const annotation = `${d.contentRating ? d.contentRating : 'Not Rated'} | ${d.runtime} | ${d.genre}`;
		let duration = Movie.parseDuration(d.runtime);
		duration = duration === NaN ? 0 : duration;
		return {
			...d,
			id: i,
			title,
			titleHeight,
			plot,
			plotHeight,
			annotation,
			uploader: d.year,
			duration,
			duration_text: Duration.fromMillis(duration * 1000).toFormat("hh:mm:ss"),
			img: {
				url: d.image.replace(/\?.*$/, ''),
				width: 0.4,
				height: 0.55
			}
		}
	}

	// e.g. 1h32m
	private static parseDuration(d: string) {
		const times = d.match(/(\d+)/g);
		const m = times[times.length - 1];
		const h = times[times.length - 2];
		return (m ? parseInt(m) * 60 : 0) + (h ? parseInt(h) * 3600 : 0);
	}

	public async getMovies(filters: { title?: string }) {
		try {
			if (this.connection === undefined) {
				this.connection = await this.client.connect();
			}
			const db = this.client.db(MOVIE_DATABASE);
			const collection = db.collection('movies');
			const query: any = {};
			if (filters.title) {
				query.title = { $regex: filters.title, $options: 'i' };
			}
			const cursor = collection.find(query);
			const res: any[] = [];
			await cursor.forEach(d => res.push(d));
			return res;

		} catch (err) {
			console.log(err);
		}
	}

	public async search(keyword: string) {
		return await this.getMovies({ title: keyword });
	}
}

export interface MovieAppOptions extends AppOptions {
}

export class MovieApp extends App {
	// movie
	private movie: Movie;

	// menu
	private mainMenu: Menu;
	private logo: ViewElement;

	private moviesXML: string;
	private moviesGrid: Grid;
	private moviesList: PaginatedGrid;

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

	constructor(context: Context, assets: AssetContainer, private options: MovieAppOptions) {
		super(context, assets, options);
		this.init();
	}

	private async init() {
		await new Promise(resolve => setTimeout(resolve, 1));
		this.notifyCreated(true);
	}

	private createMovie() {
		this.movie = new Movie();
	}

	private async createMainMenu() {
		// menu
		const scale = this.options.scale;
		this.mainMenu = new Menu(this.context, this.assets, {
			url: `movie/main.xml`,
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

			const items = await this.movie.search(params.text);
			this.moviesList.items = items.map(d => Movie.translateVideoItem(d));
			this.moviesList.pageNum = 0;
			this.moviesList.update();
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

		// default: movies
		this.createMoviesList();
	}

	private async createMoviesList() {
		this.logo.disable();

		if (!this.moviesXML) {
			const url = `${this.options.baseUrl}/movie/movies.xml`;
			this.moviesXML = await fetch(url).then(r => r.text());
		}

		if (this.mainMenu.view.root.find('#movies').length > 0) { return; }
		const mainView = this.mainMenu.view.root.find('#main')[0] as ViewElement;
		mainView.append(this.moviesXML);

		// pager
		const prev = this.mainMenu.view.root.find('#prev')[0] as Button;
		const next = this.mainMenu.view.root.find('#next')[0] as Button;
		const moviesPager = this.mainMenu.view.root.find('#movies_pager')[0] as Pager;
		moviesPager.prev = prev;
		moviesPager.next = next;

		// movies list
		this.moviesGrid = this.mainMenu.view.root.find('#movies_list')[0] as Grid;
		await this.moviesGrid.created();
		let r = this.moviesGrid.dom.options.row;
		let c = this.moviesGrid.dom.options.col;
		this.moviesList = new PaginatedGrid({
			list: this.moviesGrid,
			pageSize: r * c,
			pager: moviesPager,
		});

		this.moviesGrid.addUIEventHandler('selected', async (params: { user: User, id: string, selected: string }) => {
			const index = parseInt(params.id);
			let item = this.moviesList.page[index];
			item = Movie.translateVideoItem(item);
			this.play({ ...item }, 'flat');
		});

		this.updateMoviesList();
	}

	private removeMoviesList() {
		if (this.mainMenu.view.root.find('#movies').length > 0) {
			const mainView = this.mainMenu.view.root.find('#main')[0] as ViewElement;
			mainView.clear();
		}
	}

	private async updateMoviesList() {
		const items = await this.movie.getMovies({});
		this.moviesList.items = items.map(d => Movie.translateVideoItem(d));
		this.moviesList.update();
	}

	private async createMediaMenu() {
		// menu
		const scale = this.options.scale;
		this.mediaMenu = new Menu(this.context, this.assets, {
			url: `movie/media.xml`,
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
				this.moviesList.update();
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
			url: `movie/settings.xml`,
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
			this.moviesList.update();
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
		if (!this.movie) this.createMovie();
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