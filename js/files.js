import { getStorage, ref as sRef, uploadBytesResumable, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { app, auth, db, ref, get, set, push, remove, serverTimestamp, state } from './core.js';

// MODE: 'auto' (Storage first, database if Storage is unavailable), 'storage' or 'database'
export const ATTACH = { MODE: 'auto', MAX_STORAGE_MB: 10, MAX_DB_KB: 1500 };
export const ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip';

const storage = getStorage(app);
let storageBroken = false;

export const humanSize = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;
const safeName = n => String(n).replace(/[^\w.\-]+/g, '_').slice(-80);
const isStorageProblem = err => /storage\/(unauthorized|unauthenticated|unknown|bucket-not-found|project-not-found|quota-exceeded|retry-limit-exceeded|invalid-argument)/.test(String(err && err.code));

const readAsDataURL = file => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file);
});

// Database mode: photos are shrunk so they fit the size limit
async function shrinkImage(file, maxDim = 1600) {
    const url = URL.createObjectURL(file);
    try {
        const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url; });
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        return c.toDataURL('image/jpeg', 0.8);
    } finally { URL.revokeObjectURL(url); }
}

async function toDatabase(taskId, fid, file) {
    let data;
    if (file.type.startsWith('image/') && file.size > 250 * 1024) data = await shrinkImage(file);
    else {
        if (file.size > ATTACH.MAX_DB_KB * 1024) {
            throw new Error(`"${file.name}" is too large (${humanSize(file.size)}). Without Cloud Storage the limit is ${ATTACH.MAX_DB_KB} KB per file.`);
        }
        data = await readAsDataURL(file);
    }
    if (data.length > 2100000) throw new Error(`"${file.name}" is too large even after compression.`);
    await set(ref(db, `taskFileData/${taskId}/${fid}`), data);
    return { storage: 'database' };
}

// Uploads one file and records it under taskFiles/<taskId>. role: 'attachment' | 'deliverable'
export async function uploadTaskFile(taskId, file, role, onProgress) {
    const me = state.currentUser;
    const fid = push(ref(db, `taskFiles/${taskId}`)).key;
    let where = null;

    if (ATTACH.MODE !== 'database' && !storageBroken) {
        if (file.size > ATTACH.MAX_STORAGE_MB * 1048576) throw new Error(`"${file.name}" is larger than ${ATTACH.MAX_STORAGE_MB} MB.`);
        try {
            const path = `taskFiles/${taskId}/${auth.currentUser.uid}/${fid}-${safeName(file.name)}`;
            const task = uploadBytesResumable(sRef(storage, path), file, { contentType: file.type || 'application/octet-stream' });
            await new Promise((resolve, reject) => task.on('state_changed',
                snap => onProgress && onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)), reject, resolve));
            where = { storage: 'storage', path, url: await getDownloadURL(task.snapshot.ref) };
        } catch (err) {
            if (ATTACH.MODE === 'auto' && isStorageProblem(err)) storageBroken = true;   // fall back to the database
            else throw new Error('Upload failed: ' + (err.message || err.code));
        }
    }
    if (!where) where = await toDatabase(taskId, fid, file);

    await set(ref(db, `taskFiles/${taskId}/${fid}`), {
        name: file.name, type: file.type || '', size: file.size, by: me.employeeId, byName: me.name,
        role, ts: serverTimestamp(), seen: role !== 'deliverable', ...where
    });
    return fid;
}

export async function openTaskFile(taskId, fid, meta) {
    if (meta.storage === 'storage') { window.open(meta.url, '_blank', 'noopener'); return; }
    const data = (await get(ref(db, `taskFileData/${taskId}/${fid}`))).val();
    if (!data) throw new Error('The file data is missing.');
    const blob = await (await fetch(data)).blob();
    const url = URL.createObjectURL(blob);
    if (/^(image\/|application\/pdf)/.test(meta.type || blob.type)) window.open(url, '_blank');
    else {
        const a = document.createElement('a');
        a.href = url; a.download = meta.name;
        document.body.appendChild(a); a.click(); a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function deleteTaskFile(taskId, fid, meta) {
    if (meta.storage === 'storage') { try { await deleteObject(sRef(storage, meta.path)); } catch (e) { console.warn('Storage delete', e); } }
    else { try { await remove(ref(db, `taskFileData/${taskId}/${fid}`)); } catch (e) { console.warn('Data delete', e); } }
    await remove(ref(db, `taskFiles/${taskId}/${fid}`));
}
