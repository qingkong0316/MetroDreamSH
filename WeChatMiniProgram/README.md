# 上海地铁打卡（单机版）

不依赖云开发的微信小程序：在地铁站附近 GPS 打卡，记录保存在本机。

## 功能

- 按线路浏览站点列表
- 300 米内定位打卡
- 撤销打卡
- 当前线路进度统计

## 目录结构

```
miniprogram/
├── data/
│   ├── line1.js      # 1 号线站点（name / latitude / longitude / id）
│   ├── line2.js      # 2 号线站点
│   └── lines.js      # 汇总各线路，新增线路在此注册
├── utils/
│   └── checkin.js    # 本地打卡记录（wx.setStorageSync）
└── pages/index/      # 主页面
```

## 新增线路

1. 新建 `miniprogram/data/lineN.js`，导出站点数组
2. 在 `miniprogram/data/lines.js` 中注册：`'N': lineN.lineNStations`
3. 在 `pages/index/index.wxml` 的 Tab 区增加对应按钮

站点 `id` 需全局唯一（建议：线路号 × 100 + 序号，如 3 号线第 5 站 → `305`）。

坐标请使用 GCJ-02（与 `wx.getLocation` 一致），可从[高德坐标拾取](https://lbs.amap.com/tools/picker)获取。

## 本地调试

1. 用微信开发者工具打开项目根目录
2. **工具 → 位置 → 自定义**，选择某站附近坐标后点击「打卡」
3. 调试距离阈值时，可临时修改 `pages/index/index.js` 中的 `300`（米）

## 数据说明

- 打卡记录存储 key：`checkin_records`
- 清除数据：开发者工具 **Storage** 面板删除该 key，或卸载小程序
