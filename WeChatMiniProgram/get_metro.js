const https = require('https');
const fs = require('fs');

console.log('🚄 正在从高德地图抓取上海地铁全线 GCJ-02 坐标...');

// 请求高德地图上海地铁公开接口
const url = 'https://map.amap.com/service/subway?_1707368894338&srhdata=3100_drw_shanghai.json';

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      let fileContent = `// 该文件由脚本自动生成，包含上海全境地铁线路及精准 GCJ-02 坐标\n\n`;
      let exportLines = [];

      json.l.forEach((line, lineIndex) => {
        // 提取线路号数字，例如 "1号线" -> 1。提取不到（如磁悬浮）则分配特殊 ID
        let lineIdMatch = line.kn.match(/\d+/);
        let lineId = lineIdMatch ? lineIdMatch[0] : `Special${lineIndex}`;
        let varName = `line${lineId}Stations`;
        let idPrefix = lineIdMatch ? parseInt(lineId) : 90 + lineIndex;

        let stations = line.st.map((st, stIndex) => {
          let coords = st.sl.split(','); // 高德的格式是 "经度,纬度"
          return {
            id: idPrefix * 100 + (stIndex + 1),
            name: st.n,
            latitude: parseFloat(coords[1]), // 纬度
            longitude: parseFloat(coords[0]), // 经度
            checked: false
          };
        });

        // 按照你截图要求的格式拼接数组
        fileContent += `export const ${varName} = [\n`;
        stations.forEach(s => {
          fileContent += `  { id: ${s.id}, name: "${s.name}", latitude: ${s.latitude}, longitude: ${s.longitude}, checked: false },\n`;
        });
        fileContent += `];\n\n`;

        exportLines.push(`  '${lineId}': ${varName}`);
      });

      // 拼接汇总的 allLines 对象，方便在小程序中统一引入
      fileContent += `export const allLines = {\n${exportLines.join(',\n')}\n};\n`;

      fs.writeFileSync('lines.js', fileContent, 'utf8');
      console.log('✅ 大功告成！当前目录下已生成包含 500+ 站点真实坐标的 lines.js 文件。');
      console.log('👉 请把它移动到 data/ 文件夹下，替换你原本的半成品文件。');

    } catch (e) {
      console.error('❌ 解析数据失败', e);
    }
  });
}).on('error', (err) => {
  console.error('❌ 网络请求失败:', err.message);
});