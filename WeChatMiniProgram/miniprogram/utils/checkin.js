const STORAGE_KEY = 'checkin_records';

function getRecords() {
  try {
    return wx.getStorageSync(STORAGE_KEY) || [];
  } catch (e) {
    return [];
  }
}

function saveRecords(records) {
  wx.setStorageSync(STORAGE_KEY, records);
}

function isChecked(stationId) {
  return getRecords().some(r => r.stationId === stationId);
}

function addRecord(stationId, stationName, line) {
  const records = getRecords();
  if (records.some(r => r.stationId === stationId)) return;
  records.push({
    stationId,
    stationName,
    line,
    checkInTime: Date.now()
  });
  saveRecords(records);
}

function removeRecord(stationId) {
  saveRecords(getRecords().filter(r => r.stationId !== stationId));
}

module.exports = { getRecords, isChecked, addRecord, removeRecord };
