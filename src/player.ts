/*!
 * Copyright (c) The Free MRE Foundation. All rights reserved.
 * Licensed under the GPLv3 License.
 */

import { Actor, AssetContainer, ButtonBehavior, Context, MediaInstance, ScaledTransformLike, User } from "@microsoft/mixed-reality-extension-sdk";
import { translate } from "./utils";

export const PLAYER_OFFSET = -0.4;

export const DEFAULT_SCREENS: ScreenOptions[] = [
	// {
	// 	name: 'flat',
	// 	anchor: {
	// 		screen: {
	// 			position: {
	// 				x: 0,
	// 				y: 0,
	// 				z: 0.1
	// 			},
	// 		},
	// 	},
	// 	display: {
	// 		resourceId: 'artifact:2050034828610372018',
	// 		transform: {
	// 			position: {
	// 				x: 0,
	// 				y: PLAYER_OFFSET,
	// 				z: 0.02
	// 			},
	// 			scale: {
	// 				x: 4.8,
	// 				y: 4.8,
	// 				z: 4.8
	// 			}
	// 		}
	// 	},
	// 	screen: {
	// 		transform: {
	// 			position: {
	// 				x: 0,
	// 				y: 0,
	// 				z: 0
	// 			},
	// 			scale: {
	// 				x: 0.001,
	// 				y: 0.001,
	// 				z: 0.001
	// 			}
	// 		}
	// 	},
	// 	camera: {
	// 		resourceId: 'artifact:2050030982223888469',
	// 		transform: {
	// 			position: {
	// 				x: 0,
	// 				y: 0,
	// 				z: 0,
	// 			}
	// 		}
	// 	}
	// },
	{
		name: 'flat',
		anchor: {
			screen: {
				position: {
					x: 0,
					y: 0,
					z: 0
				},
			},
		},
		screen: {
			transform: {
				position: {
					x: 0,
					y: PLAYER_OFFSET,
					z: 0.02
				},
				scale: {
					x: 4.8,
					y: 4.8,
					z: 4.8
				}
			}
		},
	},
	{
		name: 'cqt',
		anchor: {
			screen: {
				position: {
					x: 0,
					y: 0,
					z: 0.4
				},
			},
		},
		display: {
			resourceId: 'artifact:2050034828610372018',
			transform: {
				position: {
					x: 0,
					y: PLAYER_OFFSET,
					z: 0.02
				},
				scale: {
					x: 4.8,
					y: 4.8,
					z: 4.8
				}
			}
		},
		screen: {
			transform: {
				position: {
					x: 0.28125 / 1000,
					y: 0,
					z: 0
				},
				scale: {
					x: (1 + 9 / 16) / 1000,
					y: 1 / 1000,
					z: 1 / 1000
				}
			}
		},
		camera: {
			resourceId: 'artifact:2050030982223888469',
			transform: {
				position: {
					x: -0.01 / 1000,
					y: 0,
					z: 0,
				}
			}
		},
		accessories: [
			{
				name: 'spectrum cam',
				resourceId: 'artifact:2050030982089670740',
				transform: {
					position: {
						x: 0.78125 / 1000,
						y: 0,
						z: 0,
					}
				},
				screen: true,
			},
			{
				name: 'circle',
				resourceId: 'artifact:2050122974350017152',
				transform: {
					position: {
						x: 3.5,
						y: PLAYER_OFFSET,
						z: 0,
					},
					scale: {
						x: 2,
						y: 2,
						z: 2,
					}
				}
			},
			{
				name: 'circle',
				resourceId: 'artifact:2050122974350017152',
				transform: {
					position: {
						x: -3.5,
						y: PLAYER_OFFSET,
						z: 0,
					},
					scale: {
						x: 2,
						y: 2,
						z: 2,
					}
				}
			},
			{
				name: 'bar',
				resourceId: 'artifact:2050510030326727674',
				transform: {
					position: {
						x: 0,
						y: -3,
						z: 0,
					},
					scale: {
						x: 5,
						y: 2,
						z: 2,
					}
				}
			},
		]
	},
	{
		name: 'stereo',
		anchor: {
			screen: {
				position: {
					x: 0,
					y: 0,
					z: 0.4
				},
			},
		},
		display: {
			resourceId: 'artifact:2080579947004428516',
			transform: {
				position: {
					x: 0,
					y: PLAYER_OFFSET,
					z: 0.02
				},
				scale: {
					x: 4.8,
					y: 4.8,
					z: 4.8
				}
			}
		},
		screen: {
			transform: {
				position: {
					x: 0,
					y: 0,
					z: 0
				},
				scale: {
					x: 0.001,
					y: 0.001,
					z: 0.001
				}
			}
		},
		camera: {
			resourceId: 'artifact:2080579947138646245',
			transform: {
				position: {
					x: 0,
					y: 0,
					z: 0,
				}
			}
		},
	},
];

export enum Ratio {
	_16_9 = '16:9',
	_21_9 = '21:9',
	_4_3 = '4:3',
	_9_16 = '9:16',
}

export const Ratios = [Ratio._16_9, Ratio._21_9, Ratio._4_3, Ratio._9_16];

export function RatioToNumber(r: Ratio) {
	const [w, h] = r.split(':');
	return parseFloat(w) / parseFloat(h);
}

export const DEFAULT_RATIO = Ratio._16_9;

export interface Video {
	name: string,
	url: string,
	duration?: number,
	live?: boolean
}

export interface ScreenOptions {
	name: string,
	anchor: {
		screen?: Partial<ScaledTransformLike>,
		display?: Partial<ScaledTransformLike>,
	},
	screen: {
		transform: Partial<ScaledTransformLike>,
	},
	camera?: {
		resourceId: string,
		transform: Partial<ScaledTransformLike>,
	},
	display?: {
		resourceId: string,
		transform: Partial<ScaledTransformLike>,
	},
	accessories?: {
		name?: string,
		resourceId: string,
		transform: Partial<ScaledTransformLike>,
		screen?: boolean
	}[],
	ratio?: Ratio
}

export interface VideoPlayerOptions {
	screens: ScreenOptions[],
}

export class VideoPlayer {
	private screenAnchor: Actor;
	private screen: Actor;
	private camera: Actor;

	private displayAnchor: Actor;
	private display: Actor;
	private accesories: Actor[] = [];

	private _ratio: Ratio;
	private ri: number = 0;
	get ratio() {
		return this._ratio;
	}
	set ratio(r: Ratio) {
		if (!this.screen) { return; }

		const ratio = this._ratio;
		this._ratio = r;
		const sy = (1 / RatioToNumber(r)) / (1 / RatioToNumber(ratio));

		const options = this.options.screens.find(s => s.name == this.name);
		if (options.camera && this.display) {
			const s = this.display.transform.local.scale;
			this.display.transform.local.scale.copy({ x: s.x, y: s.y * sy, z: s.z });
		} else {
			const s = this.screen.transform.local.scale;
			this.screen.transform.local.scale.copy({ x: s.x, y: s.y * sy, z: s.z });
		}
	}
	public cycleRatio() {
		this.ri++;
		this.ratio = Ratios[this.ri % (Ratios.length)];
	}

	// logic
	public video: Video;
	private videoInstance: MediaInstance;
	private isPlaying: boolean = false;
	private isLoading: boolean = false;

	private _volume: number = 30;
	private _rolloff: number = 1;

	get playing() { return this.isPlaying; }
	get paused() { return this.videoInstance && !this.isPlaying; }
	get volume() { return this._volume; }
	set volume(v: number) {
		this._volume = Math.max(0, Math.min(100, v));
		if (this.videoInstance) {
			this.videoInstance.setState({ volume: this._volume / 100, doppler: 0 });
		}
	}
	get rolloff() { return this._rolloff; }
	set rolloff(r: number) {
		this._rolloff = Math.max(0, Math.min(100, r));
		if (this.videoInstance) {
			this.videoInstance.setState({ rolloffStartDistance: this._rolloff, doppler: 0 });
		}
	}

	private interval: NodeJS.Timeout;
	private _time: number = 0;
	get time() {
		return this._time;
	}

	set time(t: number) {
		this._time = this.video.duration ? Math.min(this.video.duration, t) : t;
		if (this.video.duration) this.onTime(t);
	}

	get name() {
		return this.screen.name;
	}

	public onClick: (user: User) => void;
	public onTime: (t: number) => void;

	constructor(private context: Context, private assets: AssetContainer, private options: VideoPlayerOptions) {
	}

	public createScreen(name: string) {
		const options = this.options.screens.find(s => s.name == name);
		if (this.screen && this.screen.name == options.name) { return; }
		console.log('create screen', name);

		this._ratio = options.ratio !== undefined ? options.ratio : DEFAULT_RATIO;

		this.removeScreen();
		let local = translate(options.anchor.screen ? options.anchor.screen : {}).toJSON();
		this.screenAnchor = Actor.Create(this.context, {
			actor: {
				transform: {
					local
				},
			}
		});

		if (options.camera) {
			let local = translate(options.screen.transform).toJSON();
			this.screen = Actor.Create(this.context, {
				actor: {
					name: options.name,
					parentId: this.screenAnchor.id,
					transform: {
						local
					},
					// appearance: {
					// 	meshId: this.assets.createBoxMesh('debug_mesh', 0.25, 0.25, 0.25).id,
					// 	materialId: this.assets.materials.find(m => m.name == 'debug').id,
					// },
				}
			});

			local = translate(options.camera.transform).toJSON();
			this.camera = Actor.CreateFromLibrary(this.context, {
				resourceId: options.camera.resourceId,
				actor: {
					parentId: this.screenAnchor.id,
					transform: {
						local
					},
				}
			});

			local = translate(options.anchor.display).toJSON();
			this.displayAnchor = Actor.Create(this.context, {
				actor: {
					transform: {
						local
					},
				}
			});

			local = translate(options.display.transform).toJSON();
			this.display = Actor.CreateFromLibrary(this.context, {
				resourceId: options.display.resourceId,
				actor: {
					parentId: this.displayAnchor.id,
					appearance: {
						enabled: false,
					},
					transform: {
						local
					},
				}
			});
			if (options.accessories) {
				this.accesories = options.accessories.map(a => {
					const local = translate(a.transform).toJSON();
					return Actor.CreateFromLibrary(this.context, {
						resourceId: a.resourceId,
						actor: {
							parentId: a.screen ? this.screenAnchor.id : this.displayAnchor.id,
							appearance: {
								enabled: false,
							},
							transform: {
								local
							},
						}
					});
				});
			}
		} else {
			let local = translate(options.screen ? options.screen.transform : {}).toJSON();
			this.screen = Actor.Create(this.context, {
				actor: {
					name: options.name,
					transform: {
						local
					},
					parentId: this.screenAnchor.id,
				}
			});
		}

		this.setButtonBehavior();
	}

	private setButtonBehavior() {
		if (this.display) {
			this.display.setBehavior(ButtonBehavior).onClick((user, _) => {
				this.onClick(user);
			});
		} else {
			this.screen.setBehavior(ButtonBehavior).onClick((user, _) => {
				this.onClick(user);
			});
		}
	}

	public async play(video: Video) {
		if (this.isLoading) { return; }
		if (this.isPlaying) { return; }
		this.video = video;
		this.isLoading = true;

		const url = video.url;
		console.log(url);
		let stream = this.assets.assets.find(a => a.name == url);
		if (!stream) {
			stream = this.assets.createVideoStream(url, {
				uri: url
			});
		}
		// await stream.created;
		this.isLoading = false;

		this.isPlaying = true;
		this.videoInstance = this.screen.startVideoStream(stream.id, {
			volume: this.volume / 100,
			spread: 0.7,
			rolloffStartDistance: this.rolloff
		});
		this.videoInstance.setState({ volume: this.volume / 100, spread: 0.7, rolloffStartDistance: this.rolloff });
		this.interval = setInterval(() => {
			if (this.videoInstance && !this.video.live && this.playing) {
				this.time++;
			}
		}, 1 * 1000);
	}

	public resume() {
		if (this.videoInstance && !this.isPlaying) {
			this.isPlaying = true;
			this.videoInstance.resume();
		}
	}

	public pause() {
		if (this.videoInstance) {
			if (this.isPlaying) {
				this.isPlaying = false;
				this.videoInstance.pause();
			}
		}
	}

	public forward() {
		if (this.video.live) return;
		if (this.videoInstance) {
			this.time = Math.min(this.video.duration, this.time + 15);
			this.videoInstance?.setState({ time: this.time });
		}
	}

	public backward() {
		if (this.video.live) return;
		if (this.videoInstance) {
			this.time = Math.max(0, this.time - 15);
			this.videoInstance?.setState({ time: this.time });
		}
	}

	public seek(percent: number) {
		if (this.video.live) return;
		if (this.videoInstance) {
			this.time = this.video.duration * percent;
			this.videoInstance?.setState({ time: this.time });
		}
	}

	public stop() {
		if (!this.paused && !this.isPlaying) { return; }
		if (this.videoInstance) {
			this.isPlaying = false;
			this.videoInstance.stop();
			this.videoInstance = undefined;
		}
		if (this.interval) {
			clearInterval(this.interval);
			this.interval = undefined;
		}
		this.time = 0;
	}

	public remove() {
		this.videoInstance?.stop();
		this.removeScreen();
	}

	public reattach() {
		this.setButtonBehavior();
	}

	private removeScreen() {
		this.screen?.destroy();
		this.screenAnchor?.destroy();
		this.camera?.destroy();
		this.display?.destroy();
		this.accesories?.forEach(a => a.destroy());
		this.displayAnchor?.destroy();

		this.screen = undefined;
		this.screenAnchor = undefined;
		this.camera = undefined;
		this.display = undefined;
		this.accesories = [];
		this.displayAnchor = undefined;
	}

	public showDisplay() {
		if (this.display) {
			this.display.appearance.enabled = true;
		}
		this.accesories.forEach(a => {
			a.appearance.enabled = true;
		});
	}

	public hideDisplay() {
		if (this.display) {
			this.display.appearance.enabled = false;
		}
		this.accesories.forEach(a => {
			a.appearance.enabled = false;
		});
	}
}