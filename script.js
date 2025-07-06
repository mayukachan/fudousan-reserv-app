// ==================================================================
// ★★★★★ 全体設定 ★★★★★
// ==================================================================
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxtazDIBMzWSNwgJFVnwE_P7GG6DKJ0WviYxiIqzHxT_7nVnuiS1SBY0saIZN07K1GD/exec';
const LIFF_ID = '2007697725-VE8g1bbG';

// ==================================================================
// 1. メインの処理
// ==================================================================
// script.jsの冒頭にある window.onload = ... の部分を、以下の内容に置き換える

window.onload = async () => {
  try {
    await liff.init({ liffId: LIFF_ID });
    if (liff.isLoggedIn()) {
      const profile = await liff.getProfile();
      document.getElementById('lineUserId').value = profile.userId;
      // 予約済みかどうかのチェック処理を、ここでは呼び出さない
    }
  } catch (err) {
    console.error(err);
    displayGeneralError('LIFFの初期化に失敗しました。画面を再読み込みしてください。');
  }
  initializeDatePickers();
  initializeEventListeners();
};

function handleExistingBooking() {
  const bookingForm = document.getElementById('bookingForm');
  const messageDiv = document.getElementById('bookingMessage');
  bookingForm.querySelectorAll('input, select, button').forEach(field => field.disabled = true);
  messageDiv.className = 'message';
  messageDiv.innerHTML = 'お客様は既に有効なご予約が1件あります。<br>内容の変更・キャンセルは下の「予約変更・キャンセル」タブからお手続きください。';
  showTab('manage');
}

function initializeDatePickers() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('bookingDate').min = today;
  document.getElementById('newBookingDate').min = today;
}

function initializeEventListeners() {
  document.getElementById('bookingForm').addEventListener('submit', handleFormSubmit);
  document.getElementById('manageForm').addEventListener('submit', handleFormSubmit);
  
  const ids = ['type', 'bookingDate', 'newType', 'newBookingDate'];
  ids.forEach(id => document.getElementById(id).addEventListener('change', fetchAvailableSlots));
}

// ==================================================================
// 2. GASとの通信
// ==================================================================
async function callGas(action, params) {
  const response = await fetch(GAS_WEB_APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params }),
    redirect: 'follow'
  });
  const result = await response.json();
  if (result.status === 'error') {
    throw new Error(result.message);
  }
  return result.data;
}

// ==================================================================
// 3. UIの操作
// ==================================================================
async function fetchAvailableSlots(event) {
  const form = event.target.closest('form');
  const isBookingForm = form.id === 'bookingForm';
  const dateInputId = isBookingForm ? 'bookingDate' : 'newBookingDate';
  const typeInputId = isBookingForm ? 'type' : 'newType';
  const slotsContainerId = isBookingForm ? 'availableSlots' : 'newAvailableSlots';
  
  const dateValue = document.getElementById(dateInputId).value;
  const typeValue = document.getElementById(typeInputId).value;
  const slotsContainer = document.getElementById(slotsContainerId);

  if (!dateValue || !typeValue) {
    slotsContainer.innerHTML = '<p>予約種別と希望日を選択してください。</p>';
    return;
  }
  slotsContainer.innerHTML = '<p>空き時間を検索中...</p>';

  try {
    const slots = await callGas('getAvailableSlots', { dateStr: dateValue, reservationType: typeValue });
    displaySlots(slots, slotsContainerId);
  } catch (error) {
    slotsContainer.innerHTML = `<p>空き時間の取得に失敗しました: ${error.message}</p>`;
  }
}

function displaySlots(slots, containerId) {
  const slotsContainer = document.getElementById(containerId);
  slotsContainer.innerHTML = ''; 
  if (slots.length === 0) {
    slotsContainer.innerHTML = '<p>申し訳ありませんが、この日は予約可能な時間枠がありません。</p>';
    return;
  }
  slots.forEach(slot => {
    const slotElement = document.createElement('div');
    slotElement.className = 'slot-item';
    slotElement.innerHTML = `${slot.time}<br><span style="font-size: 0.8em; font-weight: bold;">(残り${slot.availableCount}枠)</span>`;
    slotElement.dataset.startTime = slot.start;
    slotElement.dataset.endTime = slot.end;
    slotElement.onclick = function() {
      slotsContainer.querySelectorAll('.slot-item').forEach(s => s.classList.remove('selected'));
      this.classList.add('selected');
      const startId = (containerId === 'availableSlots') ? 'selectedSlotStart' : 'newSelectedSlotStart';
      const endId = (containerId === 'availableSlots') ? 'selectedSlotEnd' : 'newSelectedSlotEnd';
      document.getElementById(startId).value = this.dataset.startTime;
      document.getElementById(endId).value = this.dataset.endTime;
    };
    slotsContainer.appendChild(slotElement);
  });
}

async function handleFormSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const btn = form.querySelector('button[type="submit"]');
  const msgDivId = (form.id === 'bookingForm') ? 'bookingMessage' : 'manageMessage';
  const msgDiv = document.getElementById(msgDivId);
  
  btn.disabled = true;
  btn.textContent = '処理中...';
  msgDiv.className = 'message';
  msgDiv.textContent = '';
  
  let action, formData;
  if (form.id === 'bookingForm') {
    action = 'createReservation';
    formData = { name: form.name.value, email: form.email.value, phone: form.phone.value, type: form.type.value, selectedSlotStart: form.selectedSlotStart.value, selectedSlotEnd: form.selectedSlotEnd.value, lineUserId: form.lineUserId.value };
  } else {
    action = 'manageReservation';
    formData = { reservationId: form.reservationId.value, actionType: form.actionType.value, newSlotStart: form.newSelectedSlotStart.value, newSlotEnd: form.newSelectedSlotEnd.value, newType: form.newType.value };
  }
  
  try {
    const res = await callGas(action, { formData });
    msgDiv.className = 'message success';
    msgDiv.textContent = res.message + (res.reservationId ? ` (予約ID: ${res.reservationId})` : '');
    form.reset();
    btn.textContent = '処理完了！';
    setTimeout(() => { if (liff.isInClient()) liff.closeWindow(); }, 3000);
  } catch (error) {
    msgDiv.className = 'message error';
    msgDiv.textContent = 'エラー: ' + error.message;
    btn.disabled = false;
    btn.textContent = (form.id === 'bookingForm') ? '予約を確定する' : '実行';
  }
}

function showTab(tabName) {
  document.getElementById('book-tab').classList.add('hidden');
  document.getElementById('manage-tab').classList.add('hidden');
  document.querySelector('.tab-button.active').classList.remove('active');
  document.querySelector(`.tab-button[onclick="showTab('${tabName}')"]`).classList.add('active');
  document.getElementById(tabName + '-tab').classList.remove('hidden');
}

function toggleChangeFields() {
  const actionType = document.getElementById('actionType').value;
  document.getElementById('changeFields').classList.toggle('hidden', actionType !== 'change');
}

function displayGeneralError(message) {
    const msgDiv = document.getElementById('bookingMessage');
    msgDiv.className = 'message error';
    msgDiv.textContent = message;
}