// ===== 時間割データ（2年まつぐみ） =====
const TIMETABLE = {
  periods: [
    { num: 1, time: '8:40-9:25', endTime: '9:25' },
    { num: 2, time: '9:30-10:15', endTime: '10:15' },
    { num: 3, time: '10:35-11:20', endTime: '11:20' },
    { num: 4, time: '11:25-12:10', endTime: '12:10' },
    { num: 5, time: '13:15-14:00', endTime: '14:00' },
    { num: 6, time: '14:05-14:50', endTime: '14:50' },
  ],
  subjects: [
    ['ずこう', '生かつ', 'しからば', 'さんすう', 'たいいく'],
    ['ずこう', '生かつ', 'どうとく', 'たいいく', 'かんじ'],
    ['こくご', 'さんすう', 'さんすう', '音がく', '生かつ'],
    ['さんすう', '音がく', 'こくご', 'どくしょ', 'さんすう'],
    ['こくご', 'こくご', 'たいいく', 'こくご', 'こくご'],
    ['', '', 'えいご', '', ''],
  ],
  dismissal: ['15:00', '14:30', '15:30', '14:30', '15:00'],
  dayNames: ['月', '火', '水', '木', '金'],
};

// 時間目数 → 学校出発時刻のマッピング
// 3時間: 11:20終了 + HR20分 = 11:40
// 4時間: 12:10終了 + 昼食(12:40) + 掃除(12:55) + HR20分 = 13:15
// 5時間: 14:00終了 + HR20分 = 14:20
// 6時間: 14:50終了 + HR20分 = 15:10
const DEPARTURE_BY_PERIODS = {
  3: '11:40',
  4: '13:15',
  5: '14:20',
  6: '15:10',
};

// ===== 状態管理 =====
let currentFamilyCode = null;
let overridesCache = {};       // Firebaseから同期されるオーバーライドデータ
let firebaseListener = null;   // リスナー解除用

// ===== 家族コード管理 =====
function joinFamily() {
  const input = document.getElementById('family-code-input');
  const code = input.value.trim().toLowerCase();
  if (!code) {
    showJoinError('コードを入力してください');
    return;
  }
  if (code.length < 3) {
    showJoinError('3文字以上で入力してください');
    return;
  }
  if (!/^[a-z0-9_-]+$/.test(code)) {
    showJoinError('英数字・ハイフン・アンダースコアのみ使えます');
    return;
  }
  connectToFamily(code);
}

function createFamily() {
  const code = 'family-' + Math.random().toString(36).substring(2, 8);
  document.getElementById('family-code-input').value = code;
  connectToFamily(code);
}

function connectToFamily(code) {
  currentFamilyCode = code;
  localStorage.setItem('school_family_code', code);

  // 画面切り替え
  document.getElementById('join-screen').style.display = 'none';
  document.getElementById('main-app').style.display = 'block';
  document.getElementById('family-code-display').textContent = '👨‍👩‍👧 ' + code;

  // Firebase リアルタイム同期開始
  startFirebaseSync();
  applySettingsToUI();
  updateAll();
}

function leaveFamily() {
  if (!confirm('家族コードから退出しますか？')) return;
  stopFirebaseSync();
  currentFamilyCode = null;
  overridesCache = {};
  localStorage.removeItem('school_family_code');
  document.getElementById('join-screen').style.display = 'flex';
  document.getElementById('main-app').style.display = 'none';
}

function showJoinError(msg) {
  const el = document.getElementById('join-error');
  el.textContent = msg;
  setTimeout(() => { el.textContent = ''; }, 3000);
}

// ===== Firebase同期 =====
function getOverridesRef() {
  return db.ref('families/' + currentFamilyCode + '/overrides');
}

function startFirebaseSync() {
  if (firebaseListener) stopFirebaseSync();

  const ref = getOverridesRef();
  firebaseListener = ref.on('value', (snapshot) => {
    overridesCache = snapshot.val() || {};
    cleanOldOverrides();
    updateSyncStatus('✅ 同期済み');
    updateAll();
    renderOverrideList();
  }, (error) => {
    console.error('Firebase sync error:', error);
    updateSyncStatus('⚠️ 同期エラー');
    // フォールバック: localStorageから読む
    overridesCache = loadLocalOverrides();
  });
}

function stopFirebaseSync() {
  if (firebaseListener && currentFamilyCode) {
    getOverridesRef().off('value', firebaseListener);
    firebaseListener = null;
  }
}

function updateSyncStatus(text) {
  document.getElementById('sync-status').textContent = text;
}

// 過去のオーバーライドを削除
function cleanOldOverrides() {
  const today = getTodayDateStr();
  let cleaned = false;
  Object.keys(overridesCache).forEach(d => {
    if (d < today) {
      delete overridesCache[d];
      cleaned = true;
    }
  });
  if (cleaned && currentFamilyCode) {
    getOverridesRef().set(overridesCache);
  }
}

// ===== オーバーライド管理（Firebase対応） =====
function getOverrideForDate(dateStr) {
  return overridesCache[dateStr] || null;
}

function loadLocalOverrides() {
  const saved = localStorage.getItem('school_schedule_overrides');
  return saved ? JSON.parse(saved) : {};
}

let selectedOverridePeriods = null;

function selectPeriod(num) {
  selectedOverridePeriods = num;
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.periods) === num);
  });
  // 時間数を選んだらカスタム時刻をクリア
  document.getElementById('override-custom-time').value = '';
  updateOverridePreview();
}

function onCustomTimeChange() {
  // カスタム時刻を入力したらプレビュー更新
  updateOverridePreview();
}

function clearCustomTime() {
  document.getElementById('override-custom-time').value = '';
  updateOverridePreview();
}

function getOverrideDeparture() {
  const customTime = document.getElementById('override-custom-time').value;
  if (customTime) return customTime;
  if (selectedOverridePeriods) return DEPARTURE_BY_PERIODS[selectedOverridePeriods];
  return null;
}

function updateOverridePreview() {
  const dismissEl = document.getElementById('override-dismiss');
  const arrivalEl = document.getElementById('override-arrival');
  const departure = getOverrideDeparture();
  if (!departure) {
    dismissEl.textContent = '-';
    arrivalEl.textContent = '-';
    return;
  }
  dismissEl.textContent = departure;
  arrivalEl.textContent = addMinutes(departure, getCommuteMinutes());
}

function saveOverride() {
  const dateStr = document.getElementById('override-date').value;
  if (!dateStr) { alert('日付を選択してください'); return; }
  if (getDayIndexForDate(dateStr) === -1) { alert('土日は登録できません'); return; }

  const customTime = document.getElementById('override-custom-time').value;
  const departure = getOverrideDeparture();

  if (!departure) { alert('時間数を選択するか、出発時刻を入力してください'); return; }

  overridesCache[dateStr] = {
    periods: selectedOverridePeriods || null,
    dismissal: departure,
    customTime: customTime || null,
  };

  if (currentFamilyCode) {
    getOverridesRef().set(overridesCache);
    updateSyncStatus('🔄 保存中...');
  }

  // リセット
  selectedOverridePeriods = null;
  document.querySelectorAll('.period-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById('override-dismiss').textContent = '-';
  document.getElementById('override-arrival').textContent = '-';
  document.getElementById('override-custom-time').value = '';
}

function deleteOverride(dateStr) {
  delete overridesCache[dateStr];
  if (currentFamilyCode) {
    getOverridesRef().set(overridesCache);
  }
}

function renderOverrideList() {
  const container = document.getElementById('override-list');
  const dates = Object.keys(overridesCache).sort();

  if (dates.length === 0) {
    container.innerHTML = '<div class="no-overrides">変更予定なし</div>';
    return;
  }

  let html = '';
  dates.forEach(dateStr => {
    const ov = overridesCache[dateStr];
    const d = new Date(dateStr + 'T00:00:00');
    const dayName = TIMETABLE.dayNames[getDayIndexForDate(dateStr)];
    const displayDate = `${d.getMonth() + 1}/${d.getDate()}（${dayName}）`;
    const arrival = addMinutes(ov.dismissal, getCommuteMinutes());
    const detail = ov.customTime
      ? `出発 ${ov.customTime}`
      : ov.periods ? `${ov.periods}時間授業` : `出発 ${ov.dismissal}`;
    const customLabel = ov.customTime ? ' <span class="override-item-custom">✏️手動</span>' : '';
    html += `
      <div class="override-item">
        <div class="override-item-info">
          <span class="override-item-date">${displayDate}</span>
          <span class="override-item-detail">${detail}${customLabel}</span>
          <span class="override-item-arrival">→ 帰宅 ${arrival}</span>
        </div>
        <button class="override-delete-btn" onclick="deleteOverride('${dateStr}')" aria-label="削除">✕</button>
      </div>`;
  });
  container.innerHTML = html;
}

// ===== 設定管理（ローカルのみ — 通学時間は端末ごと） =====
const DEFAULT_SETTINGS = {
  walkTime: 15, trainTime: 20, transferTime: 5, notifyBefore: 15,
};

function loadSettings() {
  const saved = localStorage.getItem('school_schedule_settings');
  return saved ? JSON.parse(saved) : { ...DEFAULT_SETTINGS };
}

function saveSettings() {
  const settings = {
    walkTime: parseInt(document.getElementById('walk-time').value) || 15,
    trainTime: parseInt(document.getElementById('train-time').value) || 20,
    transferTime: parseInt(document.getElementById('transfer-time').value) || 5,
    notifyBefore: parseInt(document.getElementById('notify-before').value) || 15,
  };
  localStorage.setItem('school_schedule_settings', JSON.stringify(settings));
  updateAll();
  const btn = document.querySelector('.settings-section .save-btn');
  btn.textContent = '✅ 保存しました';
  setTimeout(() => { btn.textContent = '設定を保存'; }, 2000);
}

function applySettingsToUI() {
  const s = loadSettings();
  document.getElementById('walk-time').value = s.walkTime;
  document.getElementById('train-time').value = s.trainTime;
  document.getElementById('transfer-time').value = s.transferTime;
  document.getElementById('notify-before').value = s.notifyBefore;
}

// ===== 時間計算 =====
function getCommuteMinutes() {
  const s = loadSettings();
  return s.walkTime + s.trainTime + s.transferTime;
}

function addMinutes(timeStr, minutes) {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function getArrivalTime(dayIndex, dateStr) {
  return addMinutes(getDismissalTime(dayIndex, dateStr), getCommuteMinutes());
}

function getTodayDayIndex() {
  const jsDay = new Date().getDay();
  return (jsDay === 0 || jsDay === 6) ? -1 : jsDay - 1;
}

function getTodayDateStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
}

function getDayIndexForDate(dateStr) {
  const jsDay = new Date(dateStr + 'T00:00:00').getDay();
  return (jsDay === 0 || jsDay === 6) ? -1 : jsDay - 1;
}

function getLastPeriod(dayIndex) {
  for (let p = 5; p >= 0; p--) {
    if (TIMETABLE.subjects[p][dayIndex]) return p + 1;
  }
  return 0;
}

function getDismissalTime(dayIndex, dateStr) {
  if (dateStr) {
    const ov = getOverrideForDate(dateStr);
    if (ov) return ov.dismissal;
  }
  // 通常: 最終授業の時間数から出発時刻を算出
  const lastPeriod = getLastPeriod(dayIndex);
  return DEPARTURE_BY_PERIODS[lastPeriod] || TIMETABLE.dismissal[dayIndex];
}

function getEffectiveLastPeriod(dayIndex, dateStr) {
  if (dateStr) {
    const ov = getOverrideForDate(dateStr);
    if (ov) return ov.periods;
  }
  return getLastPeriod(dayIndex);
}

function getWeekDateStr(dayIndex) {
  const now = new Date();
  const currentDayIndex = now.getDay() === 0 ? -1 : now.getDay() - 1;
  const diff = dayIndex - currentDayIndex;
  const target = new Date(now);
  target.setDate(now.getDate() + diff);
  return `${target.getFullYear()}-${String(target.getMonth()+1).padStart(2,'0')}-${String(target.getDate()).padStart(2,'0')}`;
}

// ===== 今日のカード =====
function updateTodayCard() {
  const now = new Date();
  const dayIndex = getTodayDayIndex();
  const todayStr = getTodayDateStr();

  document.getElementById('today-date').textContent =
    `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日`;

  const dateInput = document.getElementById('override-date');
  if (!dateInput.value) dateInput.value = todayStr;

  if (dayIndex === -1) {
    document.getElementById('today-day').textContent = '休日';
    document.getElementById('weekend-msg').style.display = 'block';
    document.querySelectorAll('.today-body .info-row').forEach(el => el.style.display = 'none');
    document.getElementById('notify-btn').style.display = 'none';
    return;
  }

  // 平日表示を復元
  document.getElementById('weekend-msg').style.display = 'none';
  document.querySelectorAll('.today-body .info-row').forEach(el => el.style.display = '');
  document.getElementById('notify-btn').style.display = '';

  const dayName = TIMETABLE.dayNames[dayIndex];
  const override = getOverrideForDate(todayStr);
  document.getElementById('today-day').innerHTML = override
    ? `${dayName}曜日 <span class="override-badge">変更あり</span>`
    : `${dayName}曜日`;

  document.getElementById('today-last-period').textContent =
    `${getEffectiveLastPeriod(dayIndex, todayStr)}時間目まで`;
  document.getElementById('today-dismiss').textContent =
    getDismissalTime(dayIndex, todayStr);

  const arrival = getArrivalTime(dayIndex, todayStr);
  document.getElementById('today-arrival').textContent = arrival;
  updateCountdown(arrival);
}

function updateCountdown(arrivalTimeStr) {
  const now = new Date();
  const [h, m] = arrivalTimeStr.split(':').map(Number);
  const arrivalDate = new Date(now);
  arrivalDate.setHours(h, m, 0, 0);
  const diff = arrivalDate - now;
  const el = document.getElementById('today-countdown');

  if (diff <= 0) {
    el.textContent = 'もう帰宅済み 🏠';
    el.style.color = '#27ae60';
  } else {
    const hrs = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    el.style.color = '';
    el.textContent = hrs > 0 ? `${hrs}時間${mins}分${secs}秒` : `${mins}分${secs}秒`;
  }
}

// ===== 時間割テーブル =====
function renderTimetable() {
  const tbody = document.getElementById('timetable-body');
  const todayIndex = getTodayDayIndex();
  let html = '';

  for (let p = 0; p < 2; p++) html += renderPeriodRow(p, todayIndex);
  html += `<tr class="break-row"><td colspan="6">☕ 中休み 10:15-10:30</td></tr>`;
  for (let p = 2; p < 4; p++) html += renderPeriodRow(p, todayIndex);
  html += `<tr class="break-row"><td colspan="6">🍱 おべんとう 12:10-12:40 / 🧹 そうじ / 🌿 ひる休み</td></tr>`;
  for (let p = 4; p < 6; p++) html += renderPeriodRow(p, todayIndex);

  html += '<tr class="dismiss-row"><td class="period-num">下校</td>';
  for (let d = 0; d < 5; d++) {
    const cls = d === todayIndex ? ' today-col' : '';
    const weekDate = getWeekDateStr(d);
    const dismiss = getDismissalTime(d, weekDate);
    const badge = getOverrideForDate(weekDate) ? ' ✏️' : '';
    html += `<td class="${cls}">${dismiss}${badge}</td>`;
  }
  html += '</tr>';
  tbody.innerHTML = html;
}

function renderPeriodRow(periodIndex, todayIndex) {
  const period = TIMETABLE.periods[periodIndex];
  let html = '<tr>';
  html += `<td class="period-num">${period.num}<br><small>${period.time}</small></td>`;
  for (let d = 0; d < 5; d++) {
    const subj = TIMETABLE.subjects[periodIndex][d];
    const cls = d === todayIndex ? ' today-col' : '';
    if (subj) {
      html += `<td class="${cls}"><span class="subject ${getSubjectClass(subj)}">${subj}</span></td>`;
    } else {
      html += `<td class="${cls}">-</td>`;
    }
  }
  return html + '</tr>';
}

function getSubjectClass(subject) {
  const map = {
    'こくご': 'subject-こくご', 'さんすう': 'subject-さんすう',
    '生かつ': 'subject-せいかつ', '音がく': 'subject-おんがく',
    'ずこう': 'subject-ずこう', 'たいいく': 'subject-たいいく',
    'どうとく': 'subject-どうとく', 'えいご': 'subject-えいご',
    'かんじ': 'subject-かんじ', 'しからば': 'subject-しからば',
    'どくしょ': 'subject-どくしょ',
  };
  return map[subject] || '';
}

// ===== 週間サマリー =====
function renderWeeklySummary() {
  const container = document.getElementById('weekly-cards');
  const todayIndex = getTodayDayIndex();
  let html = '';
  for (let d = 0; d < 5; d++) {
    const weekDate = getWeekDateStr(d);
    const dismiss = getDismissalTime(d, weekDate);
    const arrival = getArrivalTime(d, weekDate);
    const ov = getOverrideForDate(weekDate);
    const badge = ov ? `<span class="override-badge">${ov.periods}h</span>` : '';
    html += `
      <div class="summary-card${d === todayIndex ? ' is-today' : ''}">
        <div class="day-label">${TIMETABLE.dayNames[d]}${badge}</div>
        <div class="dismiss-time">${dismiss}</div>
        <div class="arrival-time">${arrival}</div>
      </div>`;
  }
  container.innerHTML = html;
}

// ===== 通知 =====
let notificationTimer = null;

function requestNotification() {
  if (!('Notification' in window)) {
    document.getElementById('notify-status').textContent = 'このブラウザは通知に対応していません';
    return;
  }
  Notification.requestPermission().then(perm => {
    if (perm === 'granted') scheduleNotification();
    else document.getElementById('notify-status').textContent = '通知が許可されませんでした';
  });
}

function scheduleNotification() {
  const dayIndex = getTodayDayIndex();
  if (dayIndex === -1) return;
  const settings = loadSettings();
  const arrival = getArrivalTime(dayIndex, getTodayDateStr());
  const [h, m] = arrival.split(':').map(Number);
  const now = new Date();
  const notifyTime = new Date(now);
  notifyTime.setHours(h, m - settings.notifyBefore, 0, 0);
  const diff = notifyTime - now;
  if (diff <= 0) {
    document.getElementById('notify-status').textContent = '通知時刻はすでに過ぎています';
    return;
  }
  if (notificationTimer) clearTimeout(notificationTimer);
  notificationTimer = setTimeout(() => {
    new Notification('🏠 もうすぐ帰宅します', {
      body: `あと約${settings.notifyBefore}分で帰宅予定（${arrival}）`,
    });
  }, diff);
  document.getElementById('notify-status').textContent =
    `✅ ${addMinutes(arrival, -settings.notifyBefore)} に通知します`;
  document.getElementById('notify-btn').disabled = true;
  document.getElementById('notify-btn').textContent = '🔔 通知セット済み';
}

// ===== 初期化 =====
function updateAll() {
  updateTodayCard();
  renderTimetable();
  renderWeeklySummary();
}

// 起動: 保存済みの家族コードがあれば自動接続
(function init() {
  const savedCode = localStorage.getItem('school_family_code');
  if (savedCode) {
    document.getElementById('family-code-input').value = savedCode;
    connectToFamily(savedCode);
  }
})();

// カウントダウン更新
setInterval(() => {
  const dayIndex = getTodayDayIndex();
  if (dayIndex >= 0 && currentFamilyCode) {
    updateCountdown(getArrivalTime(dayIndex, getTodayDateStr()));
  }
}, 1000);
