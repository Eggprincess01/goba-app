export const API_BASE = 'https://mmlovenn.com';

export interface CityInfo {
  name: string;
  lat: number;
  lon: number;
}

export const TAIWAN_CITIES: CityInfo[] = [
  { name: '新北市 林口', lat: 25.0774, lon: 121.3772 },
  { name: '台北市 信義', lat: 25.0330, lon: 121.5654 },
  { name: '桃園市 中壢', lat: 24.9650, lon: 121.2248 },
  { name: '台中市 西屯', lat: 24.1631, lon: 120.6406 },
  { name: '台南市 東區', lat: 22.9804, lon: 120.2252 },
  { name: '高雄市 左營', lat: 22.6889, lon: 120.2929 },
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
  trendText: string;
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
  const rawHtml = String(data.UpOrDown_Html || '');
  let trendText = '本週油價已同步中油最新牌價';
  if (rawHtml.includes('down')) {
    trendText = '本週中油汽油調降，適合順路加滿！';
  } else if (rawHtml.includes('up')) {
    trendText = '本週中油汽油調漲，可留意自助加油折扣！';
  } else if (rawHtml.includes('same')) {
    trendText = '本週中油汽油價格持平！';
  }
  return {
    price92: String(data.sPrice1 || '31.2'),
    price95: String(data.sPrice2 || '32.7'),
    price98: String(data.sPrice3 || '34.7'),
    priceDiesel: String(data.sPrice5 || '29.9'),
    updateDate: String(data.PriceUpdate || '最新'),
    trendText,
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
