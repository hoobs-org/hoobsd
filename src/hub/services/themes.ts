/**************************************************************************************************
 * hoobsd                                                                                         *
 * Copyright (C) 2020 HOOBS                                                                       *
 *                                                                                                *
 * This program is free software: you can redistribute it and/or modify                           *
 * it under the terms of the GNU General Public License as published by                           *
 * the Free Software Foundation, either version 3 of the License, or                              *
 * (at your option) any later version.                                                            *
 *                                                                                                *
 * This program is distributed in the hope that it will be useful,                                *
 * but WITHOUT ANY WARRANTY; without even the implied warranty of                                 *
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the                                  *
 * GNU General Public License for more details.                                                   *
 *                                                                                                *
 * You should have received a copy of the GNU General Public License                              *
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.                          *
 **************************************************************************************************/

import { join } from "path";

import {
    existsSync,
    writeFileSync,
    renameSync,
    ensureDirSync,
} from "fs-extra";

import Paths from "../../services/paths";
import { sanitize, loadJson, formatJson } from "../../services/formatters";

export interface InputTheme {
    background: string;
    accent: string;
}

export interface TextTheme {
    default: string;
    highlight?: string;
    active?: string;
    input?: string;
    error?: string;
}

export interface ApplicationTheme {
    text: TextTheme;
    background: string;
    highlight: string;
    accent: string,
    dark: string;
    drawer: string;
    input: InputTheme;
    border: string;
}

export interface ButtonTheme {
    background: string;
    text: string;
    border: string;
    primary?: ButtonTheme;
    light?: ButtonTheme;
}

export interface ModalTheme {
    text: TextTheme;
    background: string;
    dark: string;
    form: string;
    mask: string;
    highlight: string;
    input: string;
    accent: string;
    border: string;
}

export interface WidgetTheme {
    text: TextTheme;
    background: string;
    highlight: string;
    border: string;
}

export interface MenuTheme {
    text: TextTheme;
    background: string;
    highlight: string;
    border: string;
}

export interface NavigationTheme {
    text: TextTheme;
    background: string;
    highlight: string;
    border: string;
}

export interface ElevationTheme {
    default: string;
    button: string;
}

export interface Theme {
    name: string;
    display: string;
    auto?: boolean;
    mode: string;
    transparency: string;
    application: ApplicationTheme;
    button: ButtonTheme;
    modal: ModalTheme;
    widget: WidgetTheme;
    menu: MenuTheme;
    navigation: NavigationTheme;
    backdrop: string;
    elevation: ElevationTheme;
}

export const DarkTheme: Theme = {
    name: "dark",
    display: "Dark",
    auto: false,
    mode: "dark",
    transparency: "blur(6px)",
    application: {
        text: {
            default: "#999",
            highlight: "#fff",
            input: "#fff",
            error: "#e30505",
        },
        background: "#141414",
        highlight: "#feb400",
        accent: "#f5ff66",
        dark: "#252525",
        drawer: "#111111d2",
        input: {
            background: "#262626",
            accent: "#444",
        },
        border: "#252525",
    },
    button: {
        background: "#252525",
        text: "#fff",
        border: "#1a1a1a",
        primary: {
            background: "#feb400",
            text: "#fff",
            border: "#feb400",
        },
        light: {
            background: "#fff",
            text: "#777",
            border: "#e5e5e5",
        },
    },
    modal: {
        text: {
            default: "#999",
            input: "#fff",
            error: "#e30505",
        },
        background: "#111111d2",
        dark: "#000",
        form: "#11111100",
        mask: "#14141400",
        highlight: "#feb400",
        input: "#262626",
        accent: "#303030",
        border: "#252525",
    },
    widget: {
        text: {
            default: "#999",
        },
        background: "#181818d2",
        highlight: "#feb400",
        border: "#252525",
    },
    menu: {
        text: {
            default: "#b4b4b4",
            highlight: "#fff",
        },
        background: "#1111119d",
        highlight: "#1d1d1d9d",
        border: "#1d1d1d",
    },
    navigation: {
        text: {
            default: "#999",
            highlight: "#fff",
            active: "#feb400",
        },
        background: "#141414",
        highlight: "#feb400",
        border: "#4b4b4b",
    },
    backdrop: "url('/defaults/backdrops/default.jpg')",
    elevation: {
        default: "0 1px 1px 1px rgba(0, 0, 0, 0.44), 0 -3px 1px -1px rgba(0, 0, 0, 0.42), 0 1px 3px 1px rgba(0, 0, 0, 0.5)",
        button: "0 1px 1px 0 rgba(0, 0, 0, 0.44), 0 2px 1px -1px rgba(0, 0, 0, 0.42), 0 1px 3px 1px rgba(0, 0, 0, 0.5)",
    },
};

export const LightTheme: Theme = {
    name: "light",
    display: "Light",
    auto: false,
    mode: "light",
    transparency: "blur(6px)",
    application: {
        text: {
            default: "#727272",
            highlight: "#000",
            input: "#000",
            error: "#a11",
        },
        background: "#f8f8f8",
        highlight: "#feb400",
        accent: "#21005c",
        dark: "#e7e7e7",
        drawer: "#ffffffc2",
        input: {
            background: "#f8f8f8",
            accent: "#f1f1f1",
        },
        border: "#dfdfdf",
    },
    button: {
        background: "#f8f8f8",
        text: "#1a1a1a",
        border: "#dfdfdf",
        primary: {
            background: "#feb400",
            text: "#fff",
            border: "#feb400",
        },
        light: {
            background: "#fff",
            text: "#777",
            border: "#e5e5e5",
        },
    },
    modal: {
        text: {
            default: "#515151",
            input: "#000",
            error: "#a11",
        },
        background: "#ffffffc2",
        dark: "#f1f1f1",
        form: "#ffffff00",
        mask: "#ffffff00",
        highlight: "#feb400",
        input: "#ffffff9f",
        accent: "#f8f8f8",
        border: "#e5e5e5",
    },
    widget: {
        text: {
            default: "#515151",
        },
        background: "#ffffffc2",
        highlight: "#feb400",
        border: "#e5e5e5",
    },
    menu: {
        text: {
            default: "#515151",
            highlight: "#000",
        },
        background: "#ffffffe0",
        highlight: "#f0f0f0",
        border: "#e5e5e5",
    },
    navigation: {
        text: {
            default: "#a1a1a1",
            highlight: "#fff",
            active: "#feb400",
        },
        background: "#262626",
        highlight: "#feb400",
        border: "#5a5a5a",
    },
    backdrop: "url('/defaults/backdrops/default.jpg')",
    elevation: {
        default: "0 2px 4px -1px rgba(0, 0, 0, 0.2), 0 4px 5px 0 rgba(0, 0, 0, 0.14), 0 1px 10px 0 rgba(0, 0, 0, 0.12)",
        button: "0 1px 1px 0 rgba(0, 0, 0, 0.14), 0 2px 1px -1px rgba(0, 0, 0, 0.12), 0 1px 3px 0 rgba(0, 0, 0, 0.2)",
    },
};

export default class Themes {
    static generate(name: string, base: Theme) {
        let style = "";

        style += `[theme="${sanitize(name)}"] {\n`;
        style += `    --transparency: ${base.transparency};\n`;

        style += `    --application-text: ${base.application.text.default};\n`;
        style += `    --application-highlight-text: ${base.application.text.highlight};\n`;
        style += `    --application-input-text: ${base.application.text.input};\n`;
        style += `    --application-error-text: ${base.application.text.error};\n`;
        style += `    --application-background: ${base.application.background};\n`;
        style += `    --application-highlight: ${base.application.highlight};\n`;
        style += `    --application-accent: ${base.application.accent};\n`;
        style += `    --application-dark: ${base.application.dark};\n`;
        style += `    --application-drawer: ${base.application.drawer};\n`;
        style += `    --application-input: ${base.application.input.background};\n`;
        style += `    --application-input-accent: ${base.application.input.accent};\n`;
        style += `    --application-border: ${base.application.border};\n`;

        style += `    --button: ${base.button.background};\n`;
        style += `    --button-text: ${base.button.text};\n`;
        style += `    --button-border: ${base.button.border};\n`;
        style += `    --button-primary: ${base.button.primary?.background};\n`;
        style += `    --button-primary-text: ${base.button.primary?.text};\n`;
        style += `    --button-primary-border: ${base.button.primary?.border};\n`;
        style += `    --button-light: ${base.button.light?.background};\n`;
        style += `    --button-light-text: ${base.button.light?.text};\n`;
        style += `    --button-light-border: ${base.button.light?.border};\n`;

        style += `    --modal-text: ${base.modal.text.default};\n`;
        style += `    --modal-input-text: ${base.modal.text.input};\n`;
        style += `    --modal-error-text: ${base.modal.text.error};\n`;
        style += `    --modal-background: ${base.modal.background};\n`;
        style += `    --modal-dark: ${base.modal.dark};\n`;
        style += `    --modal-form: ${base.modal.form};\n`;
        style += `    --modal-mask: ${base.modal.mask};\n`;
        style += `    --modal-highlight: ${base.modal.highlight};\n`;
        style += `    --modal-input: ${base.modal.input};\n`;
        style += `    --modal-input-accent: ${base.modal.accent};\n`;
        style += `    --modal-border: ${base.modal.border};\n`;

        style += `    --widget-text: ${base.widget.text.default};\n`;
        style += `    --widget-background: ${base.widget.background};\n`;
        style += `    --widget-highlight: ${base.widget.highlight};\n`;
        style += `    --widget-border: ${base.widget.border};\n`;

        style += `    --menu-text: ${base.menu.text.default};\n`;
        style += `    --menu-highlight-text: ${base.menu.text.highlight};\n`;
        style += `    --menu-background: ${base.menu.background};\n`;
        style += `    --menu-highlight: ${base.menu.highlight};\n`;
        style += `    --menu-border: ${base.menu.border};\n`;

        style += `    --navigation-text: ${base.navigation.text.default};\n`;
        style += `    --navigation-highlight-text: ${base.navigation.text.highlight};\n`;
        style += `    --navigation-active-text: ${base.navigation.text.active};\n`;
        style += `    --navigation-background: ${base.navigation.background};\n`;
        style += `    --navigation-highlight: ${base.navigation.highlight};\n`;
        style += `    --navigation-border: ${base.navigation.border};\n`;

        style += `    --backdrop: ${base.backdrop};\n`;

        style += `    --elevation: ${base.elevation.button};\n`;
        style += `    --elevation-button: ${base.elevation.button};\n`;
        style += "}\n";

        return style;
    }

    static save(name: string, theme: Theme) {
        if (name.toLowerCase() === "dark" || name.toLowerCase() === "light") name = "Custom";

        theme.name = sanitize(name);
        theme.display = name;

        ensureDirSync(join(Paths.themes, theme.name));

        writeFileSync(join(Paths.themes, theme.name, "theme.js"), formatJson(theme));
        writeFileSync(join(Paths.themes, theme.name, "theme.css"), Themes.generate(theme.name, theme));
    }

    static backdrop(file: string, type: string): string {
        const filename = `backdrop_${(new Date()).getTime()}`;

        switch (type) {
            case "image/png":
                renameSync(file, join(Paths.themes, `${filename}.png`));

                return `${filename}.png`;

            case "image/gif":
                renameSync(file, join(Paths.themes, `${filename}.gif`));

                return `${filename}.gif`;

            case "image/bmp":
                renameSync(file, join(Paths.themes, `${filename}.bmp`));

                return `${filename}.bmp`;

            case "image/svg+xml":
                renameSync(file, join(Paths.themes, `${filename}.svg`));

                return `${filename}.svg`;

            case "image/webp":
                renameSync(file, join(Paths.themes, `${filename}.webp`));

                return `${filename}.webp`;

            default:
                renameSync(file, join(Paths.themes, `${filename}.jpg`));

                return `${filename}.jpg`;
        }
    }

    static get(name: string) {
        switch (sanitize(name)) {
            case "dark":
                return DarkTheme;

            case "light":
                return LightTheme;

            default:
                if (existsSync(join(Paths.themes, sanitize(name), "theme.js"))) {
                    return loadJson<Theme>(join(Paths.themes, sanitize(name), "theme.js"), DarkTheme);
                }

                return DarkTheme;
        }
    }
}
