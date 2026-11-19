export const API_BASE = 'https://mmlovenn.com';

export interface RegionInfo {
  name: string;
  lat: number;
  lon: number;
  isGps?: boolean;
}

export const TAIWAN_REGIONS: RegionInfo[] = [
  { name: '基隆市', lat: 25.1276, lon: 121.7392 },
  { name: '台北市', lat: 25.0330, lon: 121.5654 },
  { name: '新北市', lat: 25.0120, lon: 121.4657 },
  { name: '新北市 林口區', lat: 25.0774, lon: 121.3772 },
  { name: '桃園市', lat: 24.9936, lon: 121.3010 },
  { name: '新竹市', lat: 24.8138, lon: 120.9675 },
  { name: '新竹縣', lat: 24.8387, lon: 121.0177 },
  { name: '苗栗縣', lat: 24.5602, lon: 120.8214 },
  { name: '台中市', lat: 24.1477, lon: 120.6736 },
  { name: '彰化縣', lat: 24.0518, lon: 120.5161 },
  { name: '南投縣', lat: 23.9609, lon: 120.9719 },
  { name: '雲林縣', lat: 23.7092, lon: 120.4313 },
  { name: '嘉義市', lat: 23.4801, lon: 120.4491 },
  { name: '嘉義縣', lat: 23.4518, lon: 120.2555 },
  { name: '台南市', lat: 22.9997, lon: 120.2270 },
  { name: '高雄市', lat: 22.6273, lon: 120.3014 },
  { name: '屏東縣', lat: 22.6690, lon: 120.4861 },
  { name: '宜蘭縣', lat: 24.7570, lon: 121.7530 },
  { name: '花蓮縣', lat: 23.9872, lon: 121.6015 },
  { name: '台東縣', lat: 22.7583, lon: 121.1444 },
  { name: '澎湖縣', lat: 23.5711, lon: 119.5793 },
  { name: '金門縣', lat: 24.4493, lon: 118.3767 },
  { name: '連江縣', lat: 26.1505, lon: 119.9499 },
];

export interface CarTypeOption {
  apiValue: string;
  label: string;
  shortTag: string;
  plateBg: string;
  plateText: string;
  plateBorder: string;
}

export const PLATE_CAR_TYPES: CarTypeOption[] = [
  { apiValue: '普通重型機車', label: '普通重型機車 (白牌)', shortTag: '白牌', plateBg: '#FFFFFF', plateText: '#111827', plateBorder: '#374151' },
  { apiValue: '550cc以下重機', label: '大型重機 250~550cc (黃牌)', shortTag: '黃牌', plateBg: '#FACC15', plateText: '#111827', plateBorder: '#CA8A04' },
  { apiValue: '550cc以上重機', label: '大型重機 550cc+ (紅牌)', shortTag: '紅牌', plateBg: '#DC2626', plateText: '#FFFFFF', plateBorder: '#991B1B' },
  { apiValue: '自用小客貨車', label: '自用小客貨車 (汽車)', shortTag: '汽車', plateBg: '#FFFFFF', plateText: '#111827', plateBorder: '#1E293B' },
  { apiValue: '電動普通重型機車', label: '電動普通重機 (白牌電動)', shortTag: '電動白', plateBg: '#FFFFFF', plateText: '#111827', plateBorder: '#10B981' },
  { apiValue: '電動普通輕型機車', label: '電動輕型機車 (綠牌電動)', shortTag: '綠牌', plateBg: '#16A34A', plateText: '#FFFFFF', plateBorder: '#15803D' },
  { apiValue: '電動自小客', label: '電動自小客車', shortTag: '電動車', plateBg: '#FFFFFF', plateText: '#111827', plateBorder: '#10B981' },
  { apiValue: '微型電動二輪車', label: '微型電動二輪車', shortTag: '微電', plateBg: '#FFFFFF', plateText: '#16A34A', plateBorder: '#16A34A' },
  { apiValue: '租賃小客貨車', label: '租賃小客貨車', shortTag: '租賃', plateBg: '#FFFFFF', plateText: '#111827', plateBorder: '#374151' },
  { apiValue: '營業小客車', label: '營業小客車 (計程車)', shortTag: '營業', plateBg: '#FFFFFF', plateText: '#DC2626', plateBorder: '#DC2626' },
  { apiValue: '營業小貨車', label: '營業小貨車', shortTag: '營業貨', plateBg: '#16A34A', plateText: '#FFFFFF', plateBorder: '#15803D' },
  { apiValue: '電動租賃車', label: '電動租賃車', shortTag: '電動租', plateBg: '#FFFFFF', plateText: '#111827', plateBorder: '#10B981' },
  { apiValue: '自用大貨車', label: '自用大貨車', shortTag: '大貨', plateBg: '#FFFFFF', plateText: '#16A34A', plateBorder: '#16A34A' },
  { apiValue: '營業大貨車', label: '營業大貨車', shortTag: '營大貨', plateBg: '#16A34A', plateText: '#FFFFFF', plateBorder: '#15803D' },
];

export interface LiveWeather {
  temp: number;
  high: number;
  low: number;
  rainProb: number;
  humidity: number;
  windSpeed: number;
  desc: string;
  icon: string;
  updatedAt: string;
}

export interface LiveAqi {
  usAqi: number;
  pm25: number;
  label: string;
  color: string;
}

export interface LiveOilPrices {
  price92: string;
  price95: string;
  price98: string;
  priceDiesel: string;
  updateDate: string;
}

export interface UserProfile {
  email: string;
  name: string;
  picture?: string;
  avatar?: string;
  role: string;
  task_quota?: number;
  is_admin?: boolean;
}

export interface PlateResult {
  plate_number: string;
  motor_vehicles_office: string;
  window_name?: string;
  first_seen_at?: string;
  car_type?: string;
}

export interface ExamSlot {
  date: string;
  raw_date: string;
  session_name: string;
  exam_time: string;
  quota: number;
  station_name: string;
  div_name: string;
  candidate_type_name?: string;
  notes?: string;
  is_full?: boolean;
}

export interface MapPOI {
  id: string;
  name: string;
  brand: string;
  brandColor: string;
  lat: number;
  lon: number;
  distanceKm: number;
  address?: string;
  category: 'gas' | 'parking' | 'dmv';
}

const TAIWAN_DMV_STATIONS = [
  { name: '臺北市區監理所', lat: 25.0507, lon: 121.5528, address: '臺北市松山區八德路四段21號' },
  { name: '士林監理站', lat: 25.0865, lon: 121.5221, address: '臺北市士林區承德路五段80號' },
  { name: '臺北區監理所 (樹林)', lat: 25.0029, lon: 121.4253, address: '新北市樹林區中正路248巷7號' },
  { name: '板橋監理站', lat: 25.0056, lon: 121.4832, address: '新北市中和區中山路三段116號' },
  { name: '蘆洲監理站', lat: 25.0846, lon: 121.4648, address: '新北市蘆洲區中山二路163號' },
  { name: '基隆監理站', lat: 25.0933, lon: 121.7145, address: '基隆市七堵區實踐路296號' },
  { name: '桃園監理站', lat: 24.9803, lon: 121.3189, address: '桃園市桃園區介壽路416號' },
  { name: '中壢監理站', lat: 24.9562, lon: 121.2279, address: '桃園市中壢區延平路394號' },
  { name: '新竹市監理站', lat: 24.8058, lon: 120.9805, address: '新竹市東區自由路10號' },
  { name: '臺中區監理所', lat: 24.1604, lon: 120.5782, address: '臺中市大肚區遊園路一段2號' },
  { name: '臺中市監理站', lat: 24.1645, lon: 120.6923, address: '臺中市北屯區北屯路77號' },
  { name: '彰化監理站', lat: 24.0221, lon: 120.5488, address: '彰化縣花壇鄉中山路二段457號' },
  { name: '臺南監理站', lat: 22.9765, lon: 120.2219, address: '臺南市東區崇德路1號' },
  { name: '高雄市區監理所', lat: 22.7232, lon: 120.3054, address: '高雄市楠梓區德民路71號' },
  { name: '高雄區監理所 (鳳山)', lat: 22.6251, lon: 120.3471, address: '高雄市鳳山區武營路361號' },
  { name: '宜蘭監理站', lat: 24.6951, lon: 121.7662, address: '宜蘭縣五結鄉中正路二段9號' },
  { name: '花蓮監理站', lat: 23.9708, lon: 121.5841, address: '花蓮縣吉安鄉中正路二段152號' },
  { name: '臺東監理站', lat: 22.7538, lon: 121.1391, address: '臺東縣臺東市正氣北路441號' },
];

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return Number((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
}

function classifyGasBrand(name: string, brandTag: string): { brand: string; color: string } {
  const combined = `${name} ${brandTag}`.toLowerCase();
  if (combined.includes('中油') || combined.includes('cpc')) {
    return { brand: '台灣中油', color: '#2563EB' };
  }
  if (combined.includes('統一') || combined.includes('速邁樂') || combined.includes('smile')) {
    return { brand: '統一速邁樂', color: '#F97316' };
  }
  if (combined.includes('台塑') || combined.includes('formosa') || combined.includes('福懋')) {
    return { brand: '台塑石油', color: '#DC2626' };
  }
  if (combined.includes('台亞')) {
    return { brand: '台亞石油', color: '#7C3AED' };
  }
  if (combined.includes('全國')) {
    return { brand: '全國加油站', color: '#16A34A' };
  }
  if (combined.includes('山隆')) {
    return { brand: '山隆加油站', color: '#0D9488' };
  }
  return { brand: '其他加油站', color: '#6B7280' };
}

export async function fetchNearbyPOIs(
  lat: number,
  lon: number,
  category: 'gas' | 'parking' | 'dmv'
): Promise<MapPOI[]> {
  if (category === 'dmv') {
    return TAIWAN_DMV_STATIONS.map((s, idx) => ({
      id: `dmv-${idx}`,
      name: s.name,
      brand: '公路局監理站',
      brandColor: '#DB2777',
      lat: s.lat,
      lon: s.lon,
      distanceKm: haversineKm(lat, lon, s.lat, s.lon),
      address: s.address,
      category: 'dmv' as const,
    })).sort((a, b) => a.distanceKm - b.distanceKm);
  }

  const radius = category === 'gas' ? 5000 : 2500;
  const amenity = category === 'gas' ? 'fuel' : 'parking';
  const query = `[out:json][timeout:12];(node["amenity"="${amenity}"](around:${radius},${lat},${lon});way["amenity"="${amenity}"](around:${radius},${lat},${lon}););out center 40;`;
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('Overpass API error');
  const data = await res.json();
  const elements: any[] = Array.isArray(data.elements) ? data.elements : [];

  const pois: MapPOI[] = [];
  for (const el of elements) {
    const pLat = el.lat ?? el.center?.lat;
    const pLon = el.lon ?? el.center?.lon;
    if (!pLat || !pLon) continue;
    const tags = el.tags || {};
    const rawName = tags.name || tags['name:zh'] || (category === 'gas' ? '加油站' : '停車場');
    const brandTag = tags.brand || tags.operator || '';
    const addr = [tags['addr:city'], tags['addr:district'], tags['addr:street'], tags['addr:housenumber']]
      .filter(Boolean)
      .join('');

    if (category === 'gas') {
      const cls = classifyGasBrand(rawName, brandTag);
      pois.push({
        id: `gas-${el.id}`,
        name: rawName,
        brand: cls.brand,
        brandColor: cls.color,
        lat: pLat,
        lon: pLon,
        distanceKm: haversineKm(lat, lon, pLat, pLon),
        address: addr || undefined,
        category: 'gas',
      });
    } else {
      pois.push({
        id: `park-${el.id}`,
        name: rawName,
        brand: tags.fee === 'no' ? '免費停車' : '收費停車場',
        brandColor: '#2563EB',
        lat: pLat,
        lon: pLon,
        distanceKm: haversineKm(lat, lon, pLat, pLon),
        address: addr || undefined,
        category: 'parking',
      });
    }
  }

  return pois.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 35);
}

function mapWmoCode(code: number): { desc: string; icon: string } {
  if (code === 0) return { desc: '晴朗無雲', icon: 'sunny' };
  if (code === 1 || code === 2) return { desc: '多雲時晴', icon: 'partly-sunny' };
  if (code === 3) return { desc: '陰天多雲', icon: 'cloudy' };
  if (code === 45 || code === 48) return { desc: '有霧', icon: 'cloudy' };
  if ((code >= 51 && code <= 57) || (code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
    return { desc: '短暫陣雨', icon: 'rainy' };
  }
  if (code >= 95) return { desc: '雷陣雨', icon: 'thunderstorm' };
  return { desc: '多雲時晴', icon: 'partly-sunny' };
}

function formatNowHHMM(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export async function fetchLiveWeather(lat: number, lon: number): Promise<LiveWeather> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=Asia%2FTaipei&forecast_days=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Weather API error');
  const data = await res.json();
  const cur = data.current || {};
  const daily = data.daily || {};
  const mapped = mapWmoCode(Number(cur.weather_code ?? 1));
  return {
    temp: Math.round(Number(cur.temperature_2m ?? 24)),
    high: Math.round(Number(daily.temperature_2m_max?.[0] ?? 26)),
    low: Math.round(Number(daily.temperature_2m_min?.[0] ?? 20)),
    rainProb: Math.round(Number(daily.precipitation_probability_max?.[0] ?? 10)),
    humidity: Math.round(Number(cur.relative_humidity_2m ?? 65)),
    windSpeed: Math.round(Number(cur.wind_speed_10m ?? 10)),
    desc: mapped.desc,
    icon: mapped.icon,
    updatedAt: formatNowHHMM(),
  };
}

export async function fetchLiveAqi(lat: number, lon: number): Promise<LiveAqi> {
  const url =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
    `&current=us_aqi,pm2_5&timezone=Asia%2FTaipei`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('AQI API error');
  const data = await res.json();
  const aqi = Math.round(Number(data.current?.us_aqi ?? 35));
  const pm25 = Number(data.current?.pm2_5 ?? 10).toFixed(1);
  let label = '良好';
  let color = '#10B981';
  if (aqi > 150) {
    label = '對所有族群不健康';
    color = '#EF4444';
  } else if (aqi > 100) {
    label = '對敏感族群不健康';
    color = '#F97316';
  } else if (aqi > 50) {
    label = '普通';
    color = '#EAB308';
  }
  return { usAqi: aqi, pm25: Number(pm25), label, color };
}

export async function fetchLiveOilPrices(): Promise<LiveOilPrices> {
  const res = await fetch('https://www.cpc.com.tw/GetOilPriceJson.aspx?type=TodayOilPriceString');
  if (!res.ok) throw new Error('CPC Oil API error');
  const data = await res.json();
  return {
    price92: String(data.sPrice1 || '--'),
    price95: String(data.sPrice2 || '--'),
    price98: String(data.sPrice3 || '--'),
    priceDiesel: String(data.sPrice5 || '--'),
    updateDate: String(data.PriceUpdate || ''),
  };
}

export async function fetchAuthMe(token: string): Promise<UserProfile | null> {
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.logged_in && data.user) {
    return data.user as UserProfile;
  }
  return null;
}

export async function logoutAuth(token: string): Promise<void> {
  await fetch(`${API_BASE}/api/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
}

export async function searchLivePlates(
  plateNumber: string,
  carType: string = '普通重型機車',
  token?: string | null
): Promise<{ total: number; plates: PlateResult[]; updated_time: string }> {
  const qs =
    `car_type=${encodeURIComponent(carType)}` +
    `&plate_number=${encodeURIComponent(plateNumber.trim().toUpperCase())}` +
    `&page=1`;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/api/plates/live-search?${qs}`, { headers });
  if (!res.ok) throw new Error('Plate search failed');
  const data = await res.json();
  return {
    total: Number(data.total || 0),
    plates: Array.isArray(data.plates) ? data.plates : [],
    updated_time: String(data.updated_time || ''),
  };
}

export async function fetchExamSlots(licenseType: string = '3'): Promise<{
  total_slots: number;
  available_slots: number;
  last_updated: string;
  slots: ExamSlot[];
}> {
  const res = await fetch(`${API_BASE}/api/exam/slots?license_type=${encodeURIComponent(licenseType)}`);
  if (!res.ok) throw new Error('Exam slots failed');
  const data = await res.json();
  const slots: ExamSlot[] = Array.isArray(data.slots) ? data.slots : [];
  return {
    total_slots: Number(data.total_slots || slots.length),
    available_slots: Number(data.available_slots || 0),
    last_updated: String(data.last_updated || ''),
    slots,
  };
}

export async function fetchUserTasks(token: string): Promise<any[]> {
  const res = await fetch(`${API_BASE}/api/tasks`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.tasks) ? data.tasks : Array.isArray(data) ? data : [];
}

export async function fetchUserFavorites(token: string): Promise<any[]> {
  const res = await fetch(`${API_BASE}/api/favorites`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.favorites) ? data.favorites : Array.isArray(data) ? data : [];
}

export async function addUserFavorite(
  token: string,
  plateNumber: string,
  carType: string,
  office: string
): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/favorites`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      plate_number: plateNumber,
      car_type: carType,
      motor_vehicles_office: office,
    }),
  });
  return res.ok;
}
