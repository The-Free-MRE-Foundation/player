import { AssetContainer, Context, User } from "@microsoft/mixed-reality-extension-sdk";
import { Grid, Menu, PaginatedGrid } from "altvr-gui";
import { App, AppOptions } from "./myapp";

export interface HomeAppOptions extends AppOptions {
}

export class HomeApp extends App {
	// menu
	private mainMenu: Menu;
	private appsList: PaginatedGrid;

	public onAction: (action: string, user: User, params: any) => void;

	constructor(context: Context, assets: AssetContainer, private options: HomeAppOptions) {
		super(context, assets, options);
		this.init();
	}

	private async init() {
		await new Promise(resolve => setTimeout(resolve, 1));
		this.notifyCreated(true);
	}

	private async createMainMenu() {
		// menu
		const scale = this.options.scale;
		this.mainMenu = new Menu(this.context, this.assets, {
			url: `home/home.xml`,
			assets: this.options.uiassets,
			baseUrl: this.options.baseUrl,
			// roles: ['moderator'],
			scale,
		}, null);

		await this.mainMenu.created();

		// apps
		const appsGrid = this.mainMenu.view.root.find('#apps_list')[0] as Grid;
		await appsGrid.created();
		let r = appsGrid.dom.options.row;
		let c = appsGrid.dom.options.col;
		this.appsList = new PaginatedGrid({
			list: appsGrid,
			pageSize: r * c,
		});

		appsGrid.addUIEventHandler('selected', (params: { user: User, id: string, selected: string }) => {
			const index = parseInt(params.id);
			const item = this.appsList.page[index];
			this.onAction(item.key, params.user, {});
		});

		this.updateApps();
	}

	private updateApps() {
		this.appsList.items = [
			{ key: 'youtube', asset: 'Youtube', name: 'Youtube' },
			{ key: 'twitch', asset: 'Twitch', name: 'Twitch' },
			{ key: 'tv', asset: 'Tv', name: 'TV' },
			{ key: 'movie', asset: 'Movie', name: 'Movie' },
			{ key: 'show', asset: 'Camera', name: 'Show' },
			{ key: 'user', asset: 'Altspace', name: 'Altspace' },
			{ key: 'about', asset: 'Free', name: 'REHAB' },
		];
		this.appsList.update();
		this.appsList.pageNum = 0;
	}

	public open(): void {
		super.open();
		if (!this.mainMenu) this.createMainMenu();
	}

	public close(): void {
		super.close();
		if (this.mainMenu) { this.mainMenu.remove(); this.mainMenu = undefined; }
	}
}