import { isTauri } from './isTauri';
import type { WeatherData, CityInfo } from '../types';

/** 天气码映射 */
const weatherCodeMap: Record<number, { description: string; icon: string }> = {
  0: { description: '晴', icon: '☀️' },
  1: { description: '多云', icon: '🌤️' },
  2: { description: '局部多云', icon: '⛅' },
  3: { description: '阴', icon: '☁️' },
  45: { description: '雾', icon: '🌫️' },
  48: { description: '冻雾', icon: '🌫️' },
  51: { description: '小毛毛雨', icon: '🌦️' },
  53: { description: '毛毛雨', icon: '🌦️' },
  55: { description: '大毛毛雨', icon: '🌧️' },
  61: { description: '小雨', icon: '🌧️' },
  63: { description: '中雨', icon: '🌧️' },
  65: { description: '大雨', icon: '🌧️' },
  71: { description: '小雪', icon: '🌨️' },
  73: { description: '中雪', icon: '🌨️' },
  75: { description: '大雪', icon: '❄️' },
  80: { description: '阵雨', icon: '🌦️' },
  81: { description: '中阵雨', icon: '🌧️' },
  82: { description: '大阵雨', icon: '⛈️' },
  95: { description: '雷暴', icon: '⛈️' },
  96: { description: '雷暴冰雹', icon: '⛈️' },
  99: { description: '强雷暴冰雹', icon: '⛈️' },
};

async function fetchUrl(url: string): Promise<Response> {
  // 直接使用浏览器原生 fetch，WebView2 不受跨域限制
  return fetch(url);
}

/** 搜索城市 */
export async function searchCity(query: string): Promise<CityInfo[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=zh`;
  const res = await fetchUrl(url);
  if (!res.ok) throw new Error(`搜索城市失败: ${res.status}`);
  const data = await res.json();
  return (data.results || []).map((r: Record<string, unknown>) => ({
    name: r.name as string,
    latitude: r.latitude as number,
    longitude: r.longitude as number,
    country: r.country as string,
  }));
}

/** 获取天气数据 */
export async function getWeather(lat: number, lon: number): Promise<WeatherData> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m`;
  const res = await fetchUrl(url);
  if (!res.ok) throw new Error(`获取天气失败: ${res.status}`);
  const data = await res.json();
  const code = data.current?.weather_code ?? 0;
  const wMap = weatherCodeMap[code] || { description: '未知', icon: '❓' };
  return {
    temperature: Math.round(data.current?.temperature_2m ?? 0),
    apparentTemperature: Math.round(data.current?.apparent_temperature ?? 0),
    humidity: data.current?.relative_humidity_2m ?? 0,
    weatherCode: code,
    windSpeed: Math.round(data.current?.wind_speed_10m ?? 0),
    description: wMap.description,
    icon: wMap.icon,
  };
}
