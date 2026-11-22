# GOBA Maps｜Valhalla 台灣導航後端部署與維運文件

## 1. 架構總覽
- **前端 App（iOS）**：僅與 GOBA 官方後端 `https://mmlovenn.com/api/maps/*` 通訊，不直接暴露底層 Valhalla 主機位址。
- **GOBA 後端代理（`app.py`）**：
  - `GET /api/maps/health`：檢查 Valhalla 引擎狀態、延遲與快取健康度。
  - `GET /api/maps/geocode`：三引擎並行台灣地址與地標搜尋（Nominatim + ArcGIS Taiwan + Photon），附滑動視窗速率限制（60 次/分/IP）。
  - `GET /api/maps/reverse`：點擊地圖反向地理編碼。
  - `POST /api/maps/route`：Valhalla 路線計算與台灣繁體中文轉彎指令轉換，附速率限制（30 次/分/IP）、逾時保護（12 秒）與隱私安全錯誤紀錄（不記錄使用者精確座標至錯誤日誌）。

---

## 2. 自架 Valhalla 伺服器部署步驟

### 硬體需求
- **CPU**：2 vCPU 以上
- **記憶體**：4 GB RAM（建置台灣 `taiwan-latest.osm.pbf` 圖磚約需 2.2 GB RAM）
- **磁碟**：20 GB SSD

### 啟動步驟
```bash
mkdir -p /opt/goba-valhalla && cd /opt/goba-valhalla
# 複製 infra/docker-compose.valhalla.yml 至此目錄
docker compose -f docker-compose.valhalla.yml up -d
```
首次啟動會自動從 Geofabrik 下載 `taiwan-latest.osm.pbf`（約 150 MB）並建置路由圖磚，約需 3～5 分鐘。

### 驗證健康狀態
```bash
curl -s http://127.0.0.1:8002/status | jq .
```

### 串接 GOBA 主站後端
於 `mmlovenn.com` 的 `/etc/systemd/system/plate-monitor.service` 設定環境變數：
```ini
Environment="VALHALLA_BASE_URL=http://<VALHALLA_INTERNAL_IP>:8002/route"
Environment="VALHALLA_STATUS_URL=http://<VALHALLA_INTERNAL_IP>:8002/status"
```
接著執行：
```bash
systemctl daemon-reload && systemctl restart plate-monitor.service
curl -s https://mmlovenn.com/api/maps/health
```

---

## 3. 地圖資料來源授權（ODbL）與每週更新流程
- **授權合規**：
  - 道路圖資與向量圖磚均源自 **OpenStreetMap Contributors**（採 ODbL 1.0 授權）。
  - App 地圖畫面左下角已保留 MapLibre / OpenStreetMap 來源標示（Attribution）。
- **每週自動更新台灣圖資（Cron Job）**：
  於 Valhalla 主機設定每週三凌晨 03:30 自動更新圖磚：
  ```bash
  30 3 * * 3 cd /opt/goba-valhalla && docker exec goba-valhalla-taiwan bash -c "rm -rf /custom_files/valhalla_tiles.tar &&supervisorctl restart valhalla" >> /var/log/valhalla-update.log 2>&1
  ```
