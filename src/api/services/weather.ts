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

import Request from "axios";
import Instance from "../../services/instance";

export interface Position {
    lat: number;
    lng: number;
}

export default class Weather {
    static async geocode(query: string): Promise<Position> {
        if (!query || query === "") return { lat: 0, lng: 0 };

        const { results } = (await Request.get(`http://open.mapquestapi.com/geocoding/v1/address?key=${Instance.enviornment?.APP_MAPQUEST || ""}&location=${encodeURIComponent(query)}`)).data;

        return results[0].locations[0].latLng;
    }

    static async search(position: Position, count?: number): Promise<{ [key: string]: number | string }[]> {
        const key = `locations/${position.lat}/${position.lng}:${count || 5}`;
        const cached = Instance.cache?.get<{ [key: string]: number | string }[]>(key);

        if (cached) return cached;

        const locations: { [key: string]: any } = (
            await Request.get(`https://api.openweathermap.org/data/2.5/find?lat=${position.lat}&lon=${position.lng}&cnt=${count || 5}&appid=${Instance.enviornment?.APP_OPENWEATHER || ""}`)
        ).data || {};

        const results: { [key: string]: number | string }[] = (locations.list || []).map((item: { [key: string]: any }) => ({
            id: item.id,
            name: item.name,
            country: item.sys.country,
        }));

        Instance.cache?.set(key, results, 60);

        return results;
    }

    static async current(): Promise<{ [key: string]: any }> {
        if (!Instance.api?.config.weather || !Instance.api?.config.weather.id || Instance.api?.config.weather.id <= 0) return {};

        const id = Instance.api?.config.weather.id;
        const units = Instance.api?.config.weather.units || "celsius";
        const key = `weather/${id}/${units}`;
        const cached = Instance.cache?.get<{ [key: string]: any }>(key);

        if (cached) return cached;

        const url = `https://api.openweathermap.org/data/2.5/weather?id=${id}&units=${units === "fahrenheit" ? "imperial" : "metric"}&appid=${Instance.enviornment?.APP_OPENWEATHER || ""}`;
        const weather = (await Request.get(url)).data || {};

        const results = {
            units,
            weather: weather.weather.main,
            description: weather.weather.description,
            icon: weather.weather.icon,
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

        Instance.cache?.set(key, results, 30);

        return results;
    }

    static async forecast(): Promise<{ [key: string]: any }[]> {
        if (!Instance.api?.config.weather || !Instance.api?.config.weather.id || Instance.api?.config.weather.id <= 0) return [];

        const id = Instance.api?.config.weather.id;
        const units = Instance.api?.config.weather.units || "celsius";
        const key = `forecast/${id}/${units}`;
        const cached = Instance.cache?.get<{ [key: string]: any }[]>(key);

        if (cached) return cached;

        const results: { [key: string]: any }[] = [];
        const url = `https://api.openweathermap.org/data/2.5/forecast?id=${id}&units=${units === "fahrenheit" ? "imperial" : "metric"}&appid=${Instance.enviornment?.APP_OPENWEATHER || ""}`;
        const list = ((await Request.get(url)).data || {}).list || [];

        let day = "";
        let index = -1;
        let count = 0;

        let windchill = 0;
        let pressure = 0;
        let humidity = 0;
        let visibility = 0;
        let wind = 0;

        for (let i = 0; i < list.length; i += 1) {
            const { ...item } = list[i];
            const time = new Date(item.dt * 1000);

            if (`${time.getMonth() + 1}/${time.getDate()}/${time.getFullYear()}` !== day) {
                if (count > 0) {
                    results[index].windchill = windchill / count;
                    results[index].pressure = pressure / count;
                    results[index].humidity = (humidity / count) / 100;
                    results[index].visibility = visibility / count;
                    results[index].wind.speed = wind / count;
                }

                day = `${time.getMonth() + 1}/${time.getDate()}/${time.getFullYear()}`;
                index = results.length;
                count = 0;

                results.push({
                    units,
                    date: new Date(day),
                    weather: item.weather.main,
                    description: item.weather.description,
                    icon: item.weather.icon,
                    windchill: item.main.feels_like,
                    pressure: item.main.pressure,
                    humidity: item.main.humidity / 100,
                    visibility: item.visibility,
                    wind: {
                        speed: item.wind.speed,
                        direction: item.wind.deg,
                    },
                });
            }

            if (!item.main.temp_min || item.main.temp_min < results[index].min) results[index].min = item.main.temp_min;
            if (!item.main.temp_max || item.main.temp_max > results[index].max) results[index].min = item.main.temp_max;

            windchill += item.main.feels_like;
            pressure += item.main.pressure;
            humidity += item.main.humidity;
            visibility += item.main.visibility;
            wind += item.main.wind.speed;

            count += 1;
        }

        if (count > 0) {
            results[index].windchill = windchill / count;
            results[index].pressure = pressure / count;
            results[index].humidity = (humidity / count) / 100;
            results[index].visibility = visibility / count;
            results[index].wind.speed = wind / count;
        }

        Instance.cache?.set(key, results, 60);

        return results;
    }
}
