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

import { CancelToken } from "cancel-token";
import Request from "../../request";
import State from "../../state";

const REQUEST_TIMEOUT = 30 * 1000;

export interface Position {
    lat: number;
    lng: number;
}

export default class Weather {
    static async geocode(query: string): Promise<Position> {
        if (!query || query === "") return { lat: 0, lng: 0 };

        const source = CancelToken.source();

        setTimeout(() => source.cancel(), REQUEST_TIMEOUT);

        try {
            const { results } = (await Request({
                method: "get",
                url: `http://open.mapquestapi.com/geocoding/v1/address?key=${State.enviornment?.APP_MAPQUEST || ""}&location=${encodeURIComponent(query)}`,
                timeout: REQUEST_TIMEOUT,
                cancelToken: source.token,
            })).data;

            return results[0].locations[0].latLng;
        } catch (_error) {
            return { lat: 0, lng: 0 };
        }
    }

    static async search(position: Position, count?: number): Promise<{ [key: string]: number | string }[]> {
        const key = `locations/${position.lat}/${position.lng}:${count || 5}`;
        const cached = State.cache?.get<{ [key: string]: number | string }[]>(key);

        if (cached) return cached;

        const source = CancelToken.source();

        setTimeout(() => source.cancel(), REQUEST_TIMEOUT);

        try {
            const locations: { [key: string]: any } = (await Request({
                method: "get",
                url: `https://api.openweathermap.org/data/2.5/find?lat=${position.lat}&lon=${position.lng}&cnt=${count || 5}&appid=${State.enviornment?.APP_OPENWEATHER || ""}`,
                timeout: REQUEST_TIMEOUT,
                cancelToken: source.token,
            })).data || {};

            const results: { [key: string]: number | string }[] = (locations.list || []).map((item: { [key: string]: any }) => ({
                id: item.id,
                name: item.name,
                country: item.sys.country,
            }));

            return State.cache?.set(key, results, 60);
        } catch (_error) {
            return [];
        }
    }

    static async current(): Promise<{ [key: string]: any }> {
        if (!(((State.hub || {}).config || {}).weather || {}).location || (((((State.hub || {}).config || {}).weather || {}).location || {}).id || -1) <= 0) return {};

        const id = State.hub?.config.weather.location.id;
        const units = State.hub?.config.weather.units || "celsius";
        const key = `weather/${id}/${units}`;
        const cached = State.cache?.get<{ [key: string]: any }>(key);

        if (cached) return cached;

        const source = CancelToken.source();

        setTimeout(() => source.cancel(), REQUEST_TIMEOUT);

        try {
            const weather = (await Request({
                method: "get",
                url: `https://api.openweathermap.org/data/2.5/weather?id=${id}&units=${units === "fahrenheit" ? "imperial" : "metric"}&appid=${State.enviornment?.APP_OPENWEATHER || ""}`,
                timeout: REQUEST_TIMEOUT,
                cancelToken: source.token,
            })).data || {};

            const results = {
                units,
                weather: weather.weather[0].main,
                description: weather.weather[0].description.toLowerCase().replace(/ /gi, "_"),
                icon: weather.weather[0].id,
                temp: weather.main.temp,
                min: weather.main.temp_min,
                max: weather.main.temp_max,
                windchill: weather.main.feels_like,
                pressure: weather.main.pressure,
                humidity: weather.main.humidity / 100,
                visibility: weather.visibility,
                wind: {
                    speed: weather.wind.speed,
                    direction: weather.wind.deg,
                },
            };

            return State.cache?.set(key, results, 30);
        } catch (_error) {
            return {};
        }
    }

    static async forecast(): Promise<{ [key: string]: any }[]> {
        if (!(((State.hub || {}).config || {}).weather || {}).location || (((((State.hub || {}).config || {}).weather || {}).location || {}).id || -1) <= 0) return [];

        const id = State.hub?.config.weather.location.id;
        const units = State.hub?.config.weather.units || "celsius";
        const key = `forecast/${id}/${units}`;
        const cached = State.cache?.get<{ [key: string]: any }[]>(key);

        if (cached) return cached;

        const results: { [key: string]: any }[] = [];
        const source = CancelToken.source();

        setTimeout(() => source.cancel(), REQUEST_TIMEOUT);

        try {
            const list = ((await Request({
                method: "get",
                url: `https://api.openweathermap.org/data/2.5/forecast?id=${id}&units=${units === "fahrenheit" ? "imperial" : "metric"}&appid=${State.enviornment?.APP_OPENWEATHER || ""}`,
                timeout: REQUEST_TIMEOUT,
                cancelToken: source.token,
            })).data || {}).list || [];

            let day = "";
            let index = -1;
            let count = 0;

            let windchill = 0;
            let pressure = 0;
            let humidity = 0;
            let visibility = 0;
            let wind = 0;

            for (let i = 0; i < list.length; i += 1) {
                const time = new Date(list[i].dt * 1000);

                if (`${time.getMonth() + 1}/${time.getDate()}/${time.getFullYear()}` !== day) {
                    if (count > 0) {
                        results[index].windchill = parseFloat((windchill / count).toFixed(2));
                        results[index].pressure = parseFloat((pressure / count).toFixed(0));
                        results[index].humidity = parseFloat(((humidity / count) / 100).toFixed(2));
                        results[index].visibility = parseFloat((visibility / count).toFixed(0));
                        results[index].wind.speed = parseFloat((wind / count).toFixed(2));
                    }

                    day = `${time.getMonth() + 1}/${time.getDate()}/${time.getFullYear()}`;
                    index = results.length;
                    count = 0;

                    results.push({
                        units,
                        date: (new Date(day)).getTime(),
                        weather: list[i].weather[0].main,
                        description: list[i].weather[0].description.toLowerCase().replace(/ /gi, "_"),
                        icon: list[i].weather[0].id,
                        windchill: list[i].main.feels_like,
                        pressure: list[i].main.pressure,
                        humidity: list[i].main.humidity / 100,
                        visibility: list[i].visibility,
                        wind: {
                            speed: list[i].wind.speed,
                            direction: list[i].wind.deg,
                        },
                    });
                }

                if (!results[index].min || list[i].main.temp_min < results[index].min) results[index].min = list[i].main.temp_min;
                if (!results[index].max || list[i].main.temp_max > results[index].max) results[index].max = list[i].main.temp_max;

                windchill += list[i].main.feels_like;
                pressure += list[i].main.pressure;
                humidity += list[i].main.humidity;
                visibility += list[i].visibility;
                wind += list[i].wind.speed;

                count += 1;
            }

            if (count > 0) {
                results[index].windchill = parseFloat((windchill / count).toFixed(2));
                results[index].pressure = parseFloat((pressure / count).toFixed(0));
                results[index].humidity = parseFloat(((humidity / count) / 100).toFixed());
                results[index].visibility = parseFloat((visibility / count).toFixed(0));
                results[index].wind.speed = parseFloat((wind / count).toFixed(2));
            }

            return State.cache?.set(key, results, 60);
        } catch (_error) {
            return [];
        }
    }
}
