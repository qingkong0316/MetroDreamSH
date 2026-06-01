const { allLines } = require('../../data/lines.js');
const { metroAchievements } = require('../../data/achievements.js');
const checkin = require('../../utils/checkin.js');

const CHECKIN_RADIUS = 100;
const CHECKIN_STORAGE_KEY = 'checkin_records';
const ACHIEVEMENT_STORAGE_KEY = 'achievement_unlocked';
const ACHIEVEMENT_TOTAL = 50;
const MEMO_MAX_LEN = 30;
const ACHIEVEMENT_CATEGORIES = [
  { id: 'landmark', title: '🌆 魔都地标篇', minId: 1, maxId: 10 },
  { id: 'fun', title: '🧩 趣味联动篇', minId: 11, maxId: 20 },
  { id: 'campus', title: '🎓 高校青葱篇', minId: 21, maxId: 30 },
  { id: 'commute', title: '💼 狂暴通勤篇', minId: 31, maxId: 40 },
  { id: 'milestone', title: '🏅 探索里程碑', minId: 41, maxId: 50 }
];
const ACHIEVEMENT_PANEL_CLOSE_MS = 400;
const DEVELOPER_MODAL_CLOSE_MS = 300;

function formatCheckTime(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getRecordMap() {
  const map = {};
  checkin.getRecords().forEach(r => {
    map[r.stationId] = r;
  });
  return map;
}

function saveMemo(stationId, memo) {
  try {
    const records = wx.getStorageSync(CHECKIN_STORAGE_KEY) || [];
    const idx = records.findIndex(r => r.stationId === stationId);
    if (idx < 0) return;
    records[idx].memo = memo.slice(0, MEMO_MAX_LEN);
    wx.setStorageSync(CHECKIN_STORAGE_KEY, records);
  } catch (e) {
    // ignore storage errors
  }
}

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

function sortLineKeys(keys) {
  return keys.sort((a, b) => {
    const aNum = parseInt(a, 10);
    const bNum = parseInt(b, 10);
    const aIsNum = !isNaN(aNum);
    const bIsNum = !isNaN(bNum);
    if (aIsNum && bIsNum) return aNum - bNum;
    if (aIsNum) return -1;
    if (bIsNum) return 1;
    return a.localeCompare(b);
  });
}

function getUniqueStationNames(allLines) {
  const names = new Set();
  Object.values(allLines).forEach(list => list.forEach(s => names.add(s.name)));
  return names;
}

function computeGlobalProgress(allLines) {
  const allNames = getUniqueStationNames(allLines);
  const checkedNames = new Set(checkin.getRecords().map(r => r.stationName));
  const globalTotalCount = allNames.size;
  const globalCheckedCount = checkedNames.size;
  const globalProgress = globalTotalCount > 0
    ? Math.round((globalCheckedCount / globalTotalCount) * 100)
    : 0;
  return { globalCheckedCount, globalTotalCount, globalProgress };
}

function buildAchievementContext(records, global) {
  return {
    records,
    count: new Set(records.map(r => r.stationName)).size,
    globalProgress: global.globalProgress,
    has: name => records.some(r => r.stationName.includes(name)),
    hasAny: list => list.some(name => records.some(r => r.stationName.includes(name))),
    hasAll: list => list.every(name => records.some(r => r.stationName.includes(name)))
  };
}

function hasLateCheckIn(records, stationNames, hour) {
  return records.some(r =>
    stationNames.some(name => r.stationName.includes(name)) &&
    new Date(r.checkInTime).getHours() >= hour &&
    (r.memo || '').trim().length > 0
  );
}

function getStoredUnlockedIds() {
  try {
    const stored = wx.getStorageSync(ACHIEVEMENT_STORAGE_KEY);
    return (stored && stored.unlockedIds) || [];
  } catch (e) {
    return [];
  }
}

function buildAchievementList(unlockedIds) {
  const set = new Set(unlockedIds);
  return metroAchievements.map(a => ({
    id: a.id,
    emoji: a.emoji,
    unlocked: set.has(a.id),
    name: set.has(a.id) ? a.name : `成就 ${a.id}`,
    desc: set.has(a.id) ? a.desc : '???'
  }));
}

function buildAchievementCategories(achievementList, expandedCategoryId) {
  return ACHIEVEMENT_CATEGORIES.map(cat => {
    const items = achievementList.filter(
      a => a.id >= cat.minId && a.id <= cat.maxId
    );
    return {
      ...cat,
      expanded: expandedCategoryId === cat.id,
      items,
      unlockedInSection: items.filter(a => a.unlocked).length
    };
  });
}

function showAchievementModalQueue(newIds) {
  const queue = [...newIds];
  const showNext = () => {
    if (!queue.length) return;
    const id = queue.shift();
    const ach = metroAchievements.find(a => a.id === id);
    const name = ach ? ach.name : `成就 ${id}`;
    wx.showModal({
      title: '成就解锁',
      content: `🎉 恭喜解锁成就：【${name}】！`,
      showCancel: false,
      success: () => showNext()
    });
  };
  showNext();
}

const ACHIEVEMENT_RULES = {
  1: ctx => ctx.has('人民广场'),
  2: ctx => ctx.has('陆家嘴'),
  3: ctx => ctx.hasAny(['南京东路', '豫园']),
  4: ctx => ctx.hasAny(['衡山路', '常熟路']),
  5: ctx => ctx.has('徐家汇'),
  6: ctx => ctx.hasAny(['龙华中路', '云锦路']),
  7: ctx => ctx.has('静安寺'),
  8: ctx => ctx.hasAny(['中潭路', '江宁路']),
  9: ctx => ctx.hasAny(['一大会址·新天地', '一大会址·黄陂南路']),
  10: ctx => ctx.hasAny(['淮海中路', '陕西南路']),
  11: ctx => ctx.has('迪士尼'),
  12: ctx => ctx.hasAny(['松江大学城', '美兰湖']),
  13: ctx => ctx.hasAll(['人民广场', '徐家汇']),
  14: ctx => ctx.hasAll(['上海火车站', '上海南站', '虹桥火车站']),
  15: ctx => ctx.hasAll(['虹桥2号航站楼', '浦东1号2号航站楼']),
  16: ctx => ctx.has('花桥'),
  17: ctx => ctx.hasAll(['花桥', '滴水湖']),
  18: ctx => ctx.hasAll(['中华艺术宫', '西藏南路']),
  19: ctx => ctx.hasAll(['七宝', '朱家角']),
  20: ctx => ctx.hasAll(['世博会博物馆', '世博大道', '耀华路']),
  21: ctx => ctx.hasAny(['金沙江路', '紫竹高新区']),
  22: ctx => ctx.hasAny(['东川路', '紫竹高新区']),
  23: ctx => ctx.hasAny(['五角场', '江湾体育场']),
  24: ctx => ctx.has('松江大学城'),
  25: ctx => ctx.has('同济大学'),
  26: ctx => ctx.has('上海大学'),
  27: ctx => ctx.has('临港大道'),
  28: ctx => ctx.has('曹路'),
  29: ctx => ctx.has('中科路'),
  30: ctx => ctx.hasAny(['金沙江路', '紫竹高新区']) &&
    ctx.hasAll(['东川路', '同济大学', '五角场']),
  31: ctx => ctx.hasAny(['张江高科', '金科路']),
  32: ctx => ctx.has('漕河泾开发区'),
  33: ctx => ctx.has('世纪大道'),
  34: ctx => ctx.hasAny(['商城路', '浦东南路', '浦东南路(原东昌路)']),
  35: ctx => ctx.hasAll(['龙阳路', '世纪大道', '汉中路']),
  36: ctx => ctx.hasAll(['广兰路', '唐镇']),
  37: ctx => ctx.has('虹桥火车站'),
  38: ctx => ctx.has('真如'),
  39: ctx => ctx.has('东方体育中心'),
  40: ctx => hasLateCheckIn(ctx.records, ['张江高科', '漕河泾开发区'], 22),
  41: ctx => ctx.count >= 1,
  42: ctx => ctx.count >= 20,
  43: ctx => ctx.count >= 50,
  44: ctx => ctx.count >= 100,
  45: ctx => ctx.count >= 300,
  46: ctx => ctx.globalProgress >= 100,
  47: ctx => ctx.hasAny(['龙阳路', '浦东1号2号航站楼']),
  48: ctx => ctx.has('滴水湖'),
  49: ctx => ctx.has('富锦路'),
  50: ctx => ctx.has('闵行开发区')
};

Page({
  data: {
    stations: [],
    currentLine: '1',
    lineKeys: [],
    checkedCount: 0,
    totalCount: 0,
    progress: 0,
    globalCheckedCount: 0,
    globalTotalCount: 0,
    globalProgress: 0,
    nearestStation: null,
    nearestDistance: null,
    nearestStations: [],
    canCheckIn: false,
    locating: false,
    achievementList: [],
    unlockedCount: 0,
    achievementTotal: ACHIEVEMENT_TOTAL,
    showAchievementPage: false,
    achievementOverlayVisible: false,
    expandedCategoryId: '',
    achievementCategories: [],
    showDeveloperModal: false,
    developerOverlayVisible: false,
    developerPrefaceTitle: '开发者序言',
    developerPrefaceContent: `一切想法的开端，不过是地铁站里一张普通的线路图。

和朋友驻足其间，对着星罗棋布的站点，细数我们走过的轨迹。那些站台串联起无数日常，故事的细节渐渐漫漶，可踏足此地的感受，却始终清晰。

「不如在毕业前，集齐上海所有地铁站吧？」朋友的一句玩笑，轻轻落在心底。

我不知道答案会是什么，只知道这是一份值得奔赴的期许。

「如果有一天，我们现在所经历的也会消失在回忆里，我希望它能以别的方式被记住。」

Qingkong
2026.5.31
在华东师范大学图书馆`
  },

  onLoad() {
    this.allLines = allLines;
    this._flatStations = null;
    this._skipNextOnShowRefresh = true;
    this.setData({ lineKeys: sortLineKeys(Object.keys(allLines)) });
    checkin.getRecords();
    this.loadLineData('1');
    this.refreshNearestStation();
    this.checkAchievements(true);
  },

  onShow() {
    if (this._skipNextOnShowRefresh) {
      this._skipNextOnShowRefresh = false;
      return;
    }
    if (this.allLines) {
      this.refreshNearestStation();
    }
  },

  getLocation() {
    return new Promise((resolve, reject) => {
      wx.getLocation({
        type: 'gcj02',
        success: resolve,
        fail: reject
      });
    });
  },

  flattenAllStations() {
    if (this._flatStations) return this._flatStations;
    const flat = [];
    Object.keys(this.allLines).forEach(line => {
      this.allLines[line].forEach(station => {
        flat.push({ ...station, line });
      });
    });
    this._flatStations = flat;
    return flat;
  },

  findNearestStations(lat, lng, limit = 3) {
    const withDistance = this.flattenAllStations().map(station => ({
      station,
      distance: getDistance(lat, lng, station.latitude, station.longitude),
      line: station.line
    }));
    withDistance.sort((a, b) => a.distance - b.distance);

    const seenNames = new Set();
    const result = [];
    for (const { station, distance, line } of withDistance) {
      if (seenNames.has(station.name)) continue;
      seenNames.add(station.name);
      result.push({
        id: station.id,
        name: station.name,
        latitude: station.latitude,
        longitude: station.longitude,
        line,
        distance: Math.round(distance)
      });
      if (result.length >= limit) break;
    }
    return result;
  },

  updateNearestFromCoords(lat, lng) {
    const nearestStations = this.findNearestStations(lat, lng, 3);
    if (!nearestStations.length) {
      this.setData({
        nearestStations: [],
        nearestStation: null,
        nearestDistance: null,
        canCheckIn: false,
        locating: false
      });
      return;
    }

    const first = nearestStations[0];
    const canCheckIn = nearestStations.some(
      s => s.distance <= CHECKIN_RADIUS && !checkin.isChecked(s.id)
    );

    this.setData({
      nearestStations,
      nearestStation: {
        id: first.id,
        name: first.name,
        latitude: first.latitude,
        longitude: first.longitude,
        line: first.line
      },
      nearestDistance: first.distance,
      canCheckIn,
      locating: false
    });
  },

  refreshNearestStation() {
    this.setData({ locating: true });
    this.getLocation()
      .then(res => {
        this._lastLocation = { latitude: res.latitude, longitude: res.longitude };
        this.updateNearestFromCoords(res.latitude, res.longitude);
      })
      .catch(() => {
        this.setData({ locating: false });
        wx.showToast({ title: '请开启定位权限', icon: 'none' });
      });
  },

  switchLine(event) {
    const lineNum = event.currentTarget.dataset.line;
    if (lineNum === this.data.currentLine) return;
    this.loadLineData(lineNum);
  },

  loadLineData(lineNum) {
    const global = computeGlobalProgress(this.allLines);
    const source = this.allLines[lineNum];
    if (!source || source.length === 0) {
      this.setData({
        stations: [],
        currentLine: lineNum,
        checkedCount: 0,
        totalCount: 0,
        progress: 0,
        ...global
      });
      return;
    }

    const recordMap = getRecordMap();
    const stations = source.map(s => {
      const rec = recordMap[s.id];
      const checked = !!rec;
      return {
        id: s.id,
        name: s.name,
        latitude: s.latitude,
        longitude: s.longitude,
        checked,
        checkTimeText: checked ? formatCheckTime(rec.checkInTime) : '',
        memo: checked ? (rec.memo || '') : ''
      };
    });
    stations.sort((a, b) => {
      if (a.checked === b.checked) return 0;
      return a.checked ? 1 : -1;
    });
    const checkedCount = stations.filter(s => s.checked).length;
    const totalCount = stations.length;
    const progress = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

    this.setData({
      stations,
      currentLine: lineNum,
      checkedCount,
      totalCount,
      progress,
      ...global
    });
  },

  checkAchievements(silent = false) {
    const prevIds = getStoredUnlockedIds();
    const records = checkin.getRecords();
    const global = computeGlobalProgress(this.allLines);
    const ctx = buildAchievementContext(records, global);

    const unlockedIds = Object.keys(ACHIEVEMENT_RULES)
      .map(Number)
      .filter(id => ACHIEVEMENT_RULES[id](ctx))
      .sort((a, b) => a - b);

    const newlyUnlocked = unlockedIds.filter(id => !prevIds.includes(id));

    try {
      wx.setStorageSync(ACHIEVEMENT_STORAGE_KEY, { unlockedIds });
    } catch (e) {
      // ignore storage errors
    }

    this.setData({
      achievementList: buildAchievementList(unlockedIds),
      unlockedCount: unlockedIds.length
    });
    this.refreshAchievementCategories();

    if (!silent && newlyUnlocked.length) {
      showAchievementModalQueue(newlyUnlocked);
    }

    return unlockedIds;
  },

  refreshAchievementCategories() {
    const { achievementList, expandedCategoryId } = this.data;
    this.setData({
      achievementCategories: buildAchievementCategories(
        achievementList,
        expandedCategoryId
      )
    });
  },

  toggleAchievementPage() {
    if (this.data.showAchievementPage) {
      this._closeAchievementPanel();
      return;
    }
    if (this._achievementCloseTimer) {
      clearTimeout(this._achievementCloseTimer);
      this._achievementCloseTimer = null;
    }
    this.setData({
      achievementOverlayVisible: true,
      showAchievementPage: false,
      expandedCategoryId: ''
    }, () => {
      this.refreshAchievementCategories();
      wx.nextTick(() => {
        this.setData({ showAchievementPage: true });
      });
    });
  },

  _closeAchievementPanel() {
    this.setData({ showAchievementPage: false });
    if (this._achievementCloseTimer) {
      clearTimeout(this._achievementCloseTimer);
    }
    this._achievementCloseTimer = setTimeout(() => {
      this.setData({ achievementOverlayVisible: false });
      this._achievementCloseTimer = null;
    }, ACHIEVEMENT_PANEL_CLOSE_MS);
  },

  closeAchievementPage() {
    if (!this.data.showAchievementPage) return;
    this._closeAchievementPanel();
  },

  toggleCategory(event) {
    const id = event.currentTarget.dataset.id;
    const nextId = this.data.expandedCategoryId === id ? '' : id;
    this.setData({ expandedCategoryId: nextId }, () => {
      this.refreshAchievementCategories();
    });
  },

  noop() {},

  tapDeveloperModal() {
    this.toggleDeveloperModal();
  },

  toggleDeveloperModal() {
    if (this.data.showDeveloperModal) {
      this._closeDeveloperModal();
      return;
    }
    if (this._developerCloseTimer) {
      clearTimeout(this._developerCloseTimer);
      this._developerCloseTimer = null;
    }
    this.setData({ developerOverlayVisible: true, showDeveloperModal: false }, () => {
      wx.nextTick(() => this.setData({ showDeveloperModal: true }));
    });
  },

  _closeDeveloperModal() {
    this.setData({ showDeveloperModal: false });
    if (this._developerCloseTimer) clearTimeout(this._developerCloseTimer);
    this._developerCloseTimer = setTimeout(() => {
      this.setData({ developerOverlayVisible: false });
      this._developerCloseTimer = null;
    }, DEVELOPER_MODAL_CLOSE_MS);
  },

  closeDeveloperModal() {
    if (!this.data.showDeveloperModal) return;
    this._closeDeveloperModal();
  },

  handleCheckIn() {
    const { nearestStation, nearestStations, canCheckIn } = this.data;
    if (!nearestStation || !nearestStations.length) {
      wx.showToast({ title: '正在定位，请稍候', icon: 'none' });
      return;
    }

    const target = nearestStations.find(
      s => s.distance <= CHECKIN_RADIUS && !checkin.isChecked(s.id)
    );

    if (!target) {
      const hint = nearestStations.find(s => !checkin.isChecked(s.id)) || nearestStation;
      if (checkin.isChecked(hint.id)) {
        wx.showToast({ title: '该站已打卡', icon: 'none' });
        return;
      }
      if (!canCheckIn) {
        wx.showModal({
          title: '无法打卡',
          content: `你距离${hint.name}约${hint.distance}米，请靠近至${CHECKIN_RADIUS}米内再试。`,
          showCancel: false
        });
      }
      return;
    }

    checkin.addRecord(target.id, target.name, target.line);
    this.checkAchievements();
    wx.showToast({ title: '打卡成功！' });
    this.loadLineData(target.line);
    if (this._lastLocation) {
      this.updateNearestFromCoords(this._lastLocation.latitude, this._lastLocation.longitude);
    } else {
      this.refreshNearestStation();
    }
  },

  onCheckedCardTap(event) {
    const stationId = Number(event.currentTarget.dataset.id);
    const station = this.data.stations.find(s => s.id === stationId);
    if (!station || !station.memo) return;

    wx.showModal({
      title: `${station.name} 备注`,
      content: station.memo,
      showCancel: false
    });
  },

  handleMemo(event) {
    const stationId = Number(event.currentTarget.dataset.id);
    const station = this.data.stations.find(s => s.id === stationId);
    if (!station) return;

    if (station.memo) {
      wx.showModal({
        title: `${station.name} 备注`,
        content: station.memo,
        showCancel: false
      });
      return;
    }

    wx.showModal({
      title: '添加备注',
      editable: true,
      placeholderText: '最多30字',
      success: (res) => {
        if (!res.confirm) return;
        const memo = (res.content || '').trim().slice(0, MEMO_MAX_LEN);
        if (!memo) return;
        saveMemo(stationId, memo);
        this.loadLineData(this.data.currentLine);
      }
    });
  },

  confirmDelete(event) {
    const stationId = Number(event.currentTarget.dataset.id);
    const station = this.data.stations.find(s => s.id === stationId);
    if (!station) return;

    wx.showModal({
      title: '取消打卡',
      content: `确定要删除 ${station.name} 的打卡记录吗？`,
      success: (res) => {
        if (res.confirm) {
          checkin.removeRecord(stationId);
          this.checkAchievements();
          wx.showToast({ title: '撤销成功' });
          this.loadLineData(this.data.currentLine);
          if (this._lastLocation) {
            this.updateNearestFromCoords(this._lastLocation.latitude, this._lastLocation.longitude);
          }
        }
      }
    });
  }
});
