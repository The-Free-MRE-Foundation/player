/*!
 * Copyright (c) The Free MRE Foundation. All rights reserved.
 * Licensed under the GPLv3 License.
 */

import { Actor, AlphaMode, AssetContainer, ButtonBehavior, ColliderType, CollisionLayer, Color3, Color4, Context, ParameterSet, User } from "@microsoft/mixed-reality-extension-sdk";
import { AssetData } from "altvr-gui";
import { AboutApp } from "./about";
import { HomeApp } from "./home";
import { MovieApp } from "./movie";
import { App } from "./myapp";
import { ShowApp } from "./show";
import { TelevisionApp } from "./television";
import { TwitchApp } from "./twitch";
import { fetchJSON } from "./utils";
import { YoutubeApp } from "./youtube";

export const SETTINGS_OFFSET = 3.8;
export const DEFAULT_SCALE = 0.5;

export interface VideoPlayerAppOptions {
        scale: number,
}

/**
 * The main class of this app. All the logic goes here.
 */
export default class VideoPlayerApp {
        private assets: AssetContainer;
        private uiassets: { [name: string]: AssetData } = {};

        // extras
        private url: string;
        private twitch: string;
        private channels: any[];
        private locked: boolean = false;

        // options
        private options: VideoPlayerAppOptions;

        // apps
        private apps: { [name: string]: App } = {};

        // app
        private _app: string = null;
        private opened: App;
        get app() { return this._app; }
        set app(s: string) {
                if (this._app == s) { return; }
                this._app = s;

                if (this.opened) {
                        this.opened.close();
                }

                const a = this.apps[this.app];
                if (a) {
                        this.opened = a;
                        a.open();
                }
        }

        constructor(private context: Context, params: ParameterSet, private baseUrl: string) {
                this.url = params['url'] as string;
                this.twitch = params['twitch'] as string;
                this.assets = new AssetContainer(context);
                this.assets.createMaterial('invis', { color: Color4.FromColor3(Color3.Red(), 0.0), alphaMode: AlphaMode.Blend });
                this.assets.createMaterial('highlight', { color: Color4.FromColor3(Color3.Red(), 0.0), alphaMode: AlphaMode.Blend });
                this.assets.createMaterial('debug', { color: Color4.FromColor3(Color3.Red(), 0.2), alphaMode: AlphaMode.Blend });
                this.context.onStarted(() => this.started());
                this.context.onStopped(() => this.stopped());
                this.context.onUserJoined((u: User) => this.userjoined(u));
                this.context.onUserLeft((u: User) => this.userleft(u));
        }

        /**
         * Once the context is "started", initialize the app.
         */
        private async started() {
                const uiassets = await fetchJSON(`${this.baseUrl}/icon_pack_1.json`);
                uiassets.forEach((a: any) => {
                        this.uiassets[a.name] = a;
                });
                if (this.url){
                        this.channels = await fetchJSON(this.url);
                }
                this.options = {
                        scale: DEFAULT_SCALE
                };
                this.init();
        }

        private async init() {
                this.preload();
                await this.installHomeApp();
                await this.installYoutubeApp();
                await this.installTwitchApp();
                await this.installTelevisionApp();
                await this.installMovieApp();
                await this.installShowApp();
                await this.installAboutApp();
                if (this.twitch){
                        this.app = 'twitch';
                        (this.opened as TwitchApp).playUrl(this.twitch);
                } else {
                        this.app = 'youtube';
                        // (this.opened as YoutubeApp).playUrl('https://www.youtube.com/watch?v=UUbVZusDaXA');
                }
                // this.app = 'movie';
                // this.debug();
        }

        private debug() {
                const debug = Actor.Create(this.context, {
                        actor: {
                                appearance: {
                                        meshId: this.assets.createBoxMesh('debug_mesh', 0.05, 0.05, 0.05).id,
                                        materialId: this.assets.materials.find(m => m.name == 'debug').id,
                                },
                                collider: {
                                        geometry: { shape: ColliderType.Box },
                                        layer: CollisionLayer.Hologram,
                                },
                        }
                });

                debug.setBehavior(ButtonBehavior).onClick(async (user, _) => {
                        this.app = '';
                        await this.installShowApp();
                        this.app = 'show';
                });
        }

        private preload() {
                [...Object.keys(this.uiassets)].forEach(k => {
                        const a = this.uiassets[k];
                        Actor.CreateFromLibrary(this.context, {
                                resourceId: a.resourceId,
                                actor: {
                                        appearance: {
                                                enabled: false,
                                        }
                                }
                        });
                });
        }

        private async installHomeApp() {
                const homeApp = new HomeApp(this.context, this.assets, {
                        uiassets: this.uiassets,
                        baseUrl: this.baseUrl,
                        scale: this.options.scale,
                });

                await homeApp.created();

                homeApp.onAction = (action: string, user: User, params: any) => {
                        if (!Object.keys(this.apps).includes(action)) return;
                        this.app = action;
                }

                this.apps['home'] = homeApp;
        }

        private async installYoutubeApp() {
                const youtubeApp = new YoutubeApp(this.context, this.assets, {
                        uiassets: this.uiassets,
                        baseUrl: this.baseUrl,
                        scale: this.options.scale,
                });

                await youtubeApp.created();

                youtubeApp.onAction = (action: string, user: User, params: any) => {
                        if (action == 'shutdown') {
                                this.app = 'home';
                        }
                }

                this.apps['youtube'] = youtubeApp;
        }

        private async installTwitchApp() {
                const twitchApp = new TwitchApp(this.context, this.assets, {
                        uiassets: this.uiassets,
                        baseUrl: this.baseUrl,
                        scale: this.options.scale,
                });

                await twitchApp.created();

                twitchApp.onAction = (action: string, user: User, params: any) => {
                        this.app = 'home';
                }

                this.apps['twitch'] = twitchApp;
        }

        private async installTelevisionApp() {
                const televisionApp = new TelevisionApp(this.context, this.assets, {
                        uiassets: this.uiassets,
                        baseUrl: this.baseUrl,
                        scale: this.options.scale,
                });

                await televisionApp.created();

                televisionApp.onAction = (action: string, user: User, params: any) => {
                        this.app = 'home';
                }
                televisionApp.getMyChannels = () => {
                        return this.channels ? this.channels : [];
                }

                this.apps['tv'] = televisionApp;
        }

        private async installMovieApp() {
                const movieApp = new MovieApp(this.context, this.assets, {
                        uiassets: this.uiassets,
                        baseUrl: this.baseUrl,
                        scale: this.options.scale,
                });

                await movieApp.created();

                movieApp.onAction = (action: string, user: User, params: any) => {
                        this.app = 'home';
                }

                this.apps['movie'] = movieApp;
        }

        private async installShowApp() {
                const showApp = new ShowApp(this.context, this.assets, {
                        uiassets: this.uiassets,
                        baseUrl: this.baseUrl,
                        scale: this.options.scale,
                });

                await showApp.created();

                showApp.onAction = (action: string, user: User, params: any) => {
                        this.app = 'home';
                }

                this.apps['show'] = showApp;
        }

        private async installAboutApp() {
                const aboutApp = new AboutApp(this.context, this.assets, {
                        uiassets: this.uiassets,
                        baseUrl: this.baseUrl,
                        scale: this.options.scale,
                });

                await aboutApp.created();

                aboutApp.onAction = (action: string, user: User, params: any) => {
                        this.app = 'home';
                }

                this.apps['about'] = aboutApp;
        }

        private async userjoined(user: User) {
        }

        private async userleft(user: User) {
        }

        private async stopped() {
                this.assets.unload();
        }
}