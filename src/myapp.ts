/*!
 * Copyright (c) The Free MRE Foundation. All rights reserved.
 * Licensed under the GPLv3 License.
 */

import { AssetContainer, Context } from "@microsoft/mixed-reality-extension-sdk";
import { AssetData } from "altvr-gui";
import { Async } from "./utils";

export interface AppOptions {
        uiassets: { [name: string]: AssetData },
        baseUrl: string,
        scale: number,
}

export class App extends Async {
        constructor(protected context: Context, protected assets: AssetContainer, options: AppOptions) {
                super();
        }
        public open() {
        }

        public close() {
        }
}