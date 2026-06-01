/**
 * 单机打卡核心逻辑验证（Node 环境，不读取 lines.js）
 * 运行: node scripts/verify-checkin-core.js
 */

const CHECKIN_RADIUS = 200;

function getDistance(lat1, lng1, lat2, lng2) {
  const radLat1 = lat1 * Math.PI / 180.0;
  const radLat2 = lat2 * Math.PI / 180.0;
  const a = radLat1 - radLat2;
  const b = lng1 * Math.PI / 180.0 - lng2 * Math.PI / 180.0;
  let s = 2 * Math.asin(Math.sqrt(
    Math.pow(Math.sin(a / 2), 2) +
    Math.cos(radLat1) * Math.cos(radLat2) * Math.pow(Math.sin(b / 2), 2)
  ));
  s = s * 6378.137;
  return Math.round(s * 10000) / 10;
}

function findNearestStation(lat, lng, flat) {
  let nearest = null;
  let minDistance = Infinity;
  flat.forEach(station => {
    const distance = getDistance(lat, lng, station.latitude, station.longitude);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = station;
    }
  });
  return nearest ? { station: nearest, distance: minDistance } : null;
}

function canCheckIn(distance, stationId, records) {
  return distance <= CHECKIN_RADIUS && !records.some(r => r.stationId === stationId);
}

// 人民广场、徐家汇（来自 lines 数据格式的样例坐标）
const MOCK_FLAT = [
  { id: 113, name: '人民广场', latitude: 31.232687, longitude: 121.475108, line: '1' },
  { id: 108, name: '徐家汇', latitude: 31.195514, longitude: 121.436603, line: '1' }
];

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  } else {
    console.log('OK:', msg);
  }
}

// 1. 同点距离应接近 0
const d0 = getDistance(31.232687, 121.475108, 31.232687, 121.475108);
assert(d0 < 1, `同坐标距离约 0 米 (实际 ${d0})`);

// 2. 最近站应为人民广场
const atRenmin = findNearestStation(31.232687, 121.475108, MOCK_FLAT);
assert(atRenmin.station.id === 113, '用户位于人民广场时应匹配人民广场');

// 3. 200 米门槛
assert(canCheckIn(atRenmin.distance, 113, []), '200米内未打卡应允许打卡');
assert(!canCheckIn(atRenmin.distance, 113, [{ stationId: 113 }]), '已打卡应禁止再次打卡');

const far = findNearestStation(31.195514, 121.436603, MOCK_FLAT);
const farFromRenmin = getDistance(31.195514, 121.436603, 31.232687, 121.475108);
assert(farFromRenmin > CHECKIN_RADIUS, `徐家汇到人民广场应大于 ${CHECKIN_RADIUS}m (实际 ${Math.round(farFromRenmin)})`);
assert(!canCheckIn(farFromRenmin, 113, []), '远距离不应允许对人民广场打卡');

// 4. 本地存储语义（模拟 checkin.js）
let records = [];
function addRecord(stationId, stationName, line) {
  if (records.some(r => r.stationId === stationId)) return;
  records.push({ stationId, stationName, line, checkInTime: Date.now() });
}
function removeRecord(stationId) {
  records = records.filter(r => r.stationId !== stationId);
}
function isChecked(stationId) {
  return records.some(r => r.stationId === stationId);
}

addRecord(113, '人民广场', '1');
assert(isChecked(113), '打卡后 isChecked 为 true');
assert(records.length === 1 && records[0].stationName === '人民广场', '存储含站名与线路');
removeRecord(113);
assert(!isChecked(113), '撤销后 isChecked 为 false');

if (failed > 0) {
  console.error(`\n${failed} 项未通过`);
  process.exit(1);
}
console.log('\n全部验证通过（距离、最近站、200m 门槛、存储读写语义）');
