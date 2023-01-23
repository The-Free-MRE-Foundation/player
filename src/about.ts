/*!
 * Copyright (c) The Free MRE Foundation. All rights reserved.
 * Licensed under the GPLv3 License.
 */

import { AssetContainer, Context, User } from "@microsoft/mixed-reality-extension-sdk";
import { Button, Menu, Text } from "altvr-gui";
import { App, AppOptions } from "./myapp";

export interface AboutAppOptions extends AppOptions {
}

export class AboutApp extends App {
	// menu
	private mainMenu: Menu;

	public onAction: (action: string, user: User, params: any) => void;

	constructor(context: Context, assets: AssetContainer, private options: AboutAppOptions) {
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
			url: `about/main.xml`,
			assets: this.options.uiassets,
			// animate: true,
			baseUrl: this.options.baseUrl,
			roles: ['moderator'],
			scale,
		}, null);

		await this.mainMenu.created();

		// back button
		const backButton = this.mainMenu.view.root.find('#back')[0] as Button;
		backButton.addUIEventHandler('click', (params: {user: User, id: string})=>{
			this.onAction('back', params.user, {});
		});
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