'use strict';

const DB_NAME = 'belegsammler-db';
const STORE = 'receipts';
const DB_VERSION = 1;
let db;
let objectUrls = [];

const $ = selector => document.querySelector(selector);
const cameraInput = $('#cameraInput');
const fileInput = $('#fileInput');
const receiptList = $('#receiptList');
const receiptTemplate = $('#receiptTemplate');
const exportButton = $('#exportButton');
const deleteAllButton = $('#deleteAllButton');

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function store(mode = 'readonly') { return db.transaction(STORE, mode).objectStore(STORE); }
async function getAll() { return requestToPromise(store().getAll()); }

async function addReceipt(file) {
  const record = { createdAt: new Date().toISOString(), note: '', type: file.type || 'image/jpeg', originalName: file.name || 'beleg.jpg', image: file };
  await requestToPromise(store('readwrite').add(record));
}

async function updateNote(id, note) {
  const txStore = store('readwrite');
  const record = await requestToPromise(txStore.get(id));
  if (record) { record.note = note; await requestToPromise(txStore.put(record)); }
}

async function deleteReceipt(id) { await requestToPromise(store('readwrite').delete(id)); }
async function clearReceipts() { await requestToPromise(store('readwrite').clear()); }

function padId(id) { return String(id).padStart(4, '0'); }
function formatDate(iso) { return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)); }
function extension(record) {
  const byType = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' };
  return byType[record.type] || record.originalName.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
}

function toast(message) {
  const el = $('#toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2400);
}

async function render() {
  objectUrls.forEach(URL.revokeObjectURL); objectUrls = [];
  const receipts = (await getAll()).sort((a, b) => b.id - a.id);
  receiptList.replaceChildren();
  $('#countBadge').textContent = receipts.length;
  $('#status').textContent = receipts.length === 1 ? '1 Beleg lokal gespeichert' : `${receipts.length} Belege lokal gespeichert`;
  $('#emptyState').hidden = receipts.length > 0;
  exportButton.disabled = deleteAllButton.disabled = receipts.length === 0;

  for (const receipt of receipts) {
    const node = receiptTemplate.content.cloneNode(true);
    const url = URL.createObjectURL(receipt.image); objectUrls.push(url);
    node.querySelector('img').src = url;
    node.querySelector('h3').textContent = `Beleg ${padId(receipt.id)}`;
    const time = node.querySelector('time'); time.textContent = formatDate(receipt.createdAt); time.dateTime = receipt.createdAt;
    const note = node.querySelector('.note-input'); note.value = receipt.note || '';
    let noteTimer;
    note.addEventListener('input', () => { clearTimeout(noteTimer); noteTimer = setTimeout(() => updateNote(receipt.id, note.value).catch(showError), 400); });
    node.querySelector('.delete-button').addEventListener('click', async () => {
      if (!confirm(`Beleg ${padId(receipt.id)} wirklich löschen?`)) return;
      await deleteReceipt(receipt.id); await render(); toast('Beleg gelöscht');
    });
    receiptList.append(node);
  }
}

async function handleFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('Bitte eine Bilddatei auswählen.'); return; }
  try { await addReceipt(file); await render(); toast('Beleg gespeichert'); }
  catch (error) { showError(error); }
  finally { event.target.value = ''; }
}

function showError(error) { console.error(error); toast('Etwas ist schiefgegangen.'); }
cameraInput.addEventListener('change', handleFile);
fileInput.addEventListener('change', handleFile);

deleteAllButton.addEventListener('click', async () => {
  if (!confirm('Wirklich alle gespeicherten Belege unwiderruflich löschen?')) return;
  await clearReceipts(); await render(); toast('Alle Belege gelöscht');
});

function csvEscape(value) { return `"${String(value ?? '').replaceAll('"', '""')}"`; }
function buildCsv(receipts) {
  const rows = [['ID','Erfasst am','Notiz','Dateiname']];
  for (const r of receipts) rows.push([padId(r.id), r.createdAt, r.note || '', `beleg-${padId(r.id)}.${extension(r)}`]);
  return '\uFEFF' + rows.map(row => row.map(csvEscape).join(';')).join('\r\n');
}

const crcTable = (() => { const t = new Uint32Array(256); for (let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;} return t; })();
function crc32(bytes) { let c=0xffffffff; for (const b of bytes) c=crcTable[(c^b)&255]^(c>>>8); return (c^0xffffffff)>>>0; }
function u16(n){return [n&255,(n>>>8)&255]} function u32(n){return [n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]}
function dosDateTime(date) { const d=new Date(date); return { time:(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1), date:((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate() }; }

async function createZip(entries) {
  const enc = new TextEncoder(), local=[], central=[]; let offset=0;
  for (const entry of entries) {
    const name=enc.encode(entry.name), data=entry.data instanceof Uint8Array?entry.data:new Uint8Array(await entry.data.arrayBuffer());
    const crc=crc32(data), dt=dosDateTime(entry.date || new Date());
    const header=new Uint8Array([...u32(0x04034b50),...u16(20),...u16(0x0800),...u16(0),...u16(dt.time),...u16(dt.date),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...name]);
    local.push(header,data);
    central.push(new Uint8Array([...u32(0x02014b50),...u16(20),...u16(20),...u16(0x0800),...u16(0),...u16(dt.time),...u16(dt.date),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset),...name]));
    offset += header.length + data.length;
  }
  const centralSize=central.reduce((n,a)=>n+a.length,0);
  const end=new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(entries.length),...u16(entries.length),...u32(centralSize),...u32(offset),...u16(0)]);
  return new Blob([...local,...central,end],{type:'application/zip'});
}

exportButton.addEventListener('click', async () => {
  try {
    exportButton.disabled = true; exportButton.textContent = 'Export wird erstellt …';
    const receipts=(await getAll()).sort((a,b)=>a.id-b.id);
    const entries=receipts.map(r=>({name:`beleg-${padId(r.id)}.${extension(r)}`,data:r.image,date:new Date(r.createdAt)}));
    entries.push({name:'belege.csv',data:new Blob([buildCsv(receipts)],{type:'text/csv;charset=utf-8'}),date:new Date()});
    const zip=await createZip(entries), filename=`belege-${new Date().toISOString().slice(0,10)}.zip`, file=new File([zip],filename,{type:'application/zip'});
    if (navigator.share && (!navigator.canShare || navigator.canShare({files:[file]}))) await navigator.share({title:'Belegsammler Export',files:[file]});
    else { const url=URL.createObjectURL(zip), a=document.createElement('a'); a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Export heruntergeladen'); }
  } catch (error) { if (error.name !== 'AbortError') showError(error); }
  finally { exportButton.textContent='ZIP + CSV exportieren'; exportButton.disabled=(await getAll()).length===0; }
});

(async function init(){
  try { db=await openDatabase(); await render(); if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.error); }
  catch(error){ showError(error); $('#status').textContent='Speicher konnte nicht geöffnet werden'; }
})();
