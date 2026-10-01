import {
    db, ref, get, set, update, serverTimestamp, state, bus, $, on, avatar, photoKey,
    getPref, setPref, showToast, closeModal
} from './core.js';

export const features = ['prefs'];

const me = () => state.currentUser.employeeId;
let pendingImage = null;

// ---------- Photo helper: centre-crop to a small square JPEG ----------
function resizeToSquare(file, size = 112) {
    return new Promise((resolve, reject) => {
        const img = new Image(), url = URL.createObjectURL(file);
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = c.height = size;
            const s = Math.min(img.width, img.height);
            c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
            URL.revokeObjectURL(url);
            resolve(c.toDataURL('image/jpeg', 0.75));
        };
        img.onerror = reject;
        img.src = url;
    });
}

// Publishes the photo where every screen (and the login-page roster) can read it
async function publishPhoto(image) {
    await set(ref(db, `publicAvatars/${photoKey(state.currentUser.name)}`), { eid: me(), image });
    state.photos[photoKey(state.currentUser.name)] = image;
}

// ---------- My profile ----------
async function openProfile() {
    if (!me()) return showToast('Your account has no employee profile', 'info');
    const F = $('profileForm').elements;
    pendingImage = null;
    $('profileForm').reset();
    $('profileAvatarPreview').src = avatar(state.currentUser.name);
    try {
        const p = (await get(ref(db, `userProfiles/${me()}`))).val() || {};
        F.phone.value = p.phone || '';
        F.email.value = p.email || '';
        F.address.value = p.address || '';
    } catch (err) { console.warn('profile read failed', err); }
    $('profileModal').classList.add('active');
}

async function saveProfile() {
    const F = $('profileForm').elements;
    const data = { phone: F.phone.value.trim(), email: F.email.value.trim(), address: F.address.value.trim(), updatedAt: serverTimestamp() };
    if (pendingImage) data.image = pendingImage;
    try {
        await update(ref(db, `userProfiles/${me()}`), data);
        if (pendingImage) {
            await publishPhoto(pendingImage);
            $('headerAvatar').src = pendingImage;
            bus.emit('data:changed');                     // redraw lists with the new photo
        }
        closeModal('profileModal');
        showToast('Profile saved', 'success');
    } catch (err) { showToast('Could not save profile: ' + err.message, 'error'); }
}

// ---------- Background alerts (system notifications while the portal is open in the background) ----------
function setupPush() {
    const box = $('prefPush');
    if (!('Notification' in window)) { box.disabled = true; return; }
    box.checked = getPref('push', false) && Notification.permission === 'granted';
    box.addEventListener('change', async () => {
        if (!box.checked) { setPref('push', false); return; }
        const result = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
        if (result === 'granted') { setPref('push', true); showToast('Alerts turned on', 'success'); }
        else { box.checked = false; setPref('push', false); showToast('Notifications are blocked in your browser settings', 'error'); }
    });

    // New-message / new-notice toasts become system notifications while the page is hidden
    new MutationObserver(muts => {
        if (!document.hidden || !getPref('push', false) || Notification.permission !== 'granted') return;
        muts.forEach(m => m.addedNodes.forEach(n => {
            if (n.classList?.contains('toast') && n.classList.contains('info')) {
                const text = n.textContent.replace('×', '').trim();
                try { new Notification('Duna Portal', { body: text, icon: 'icons/icon-192.png', tag: 'duna-' + text }); } catch (e) { /* ignore */ }
            }
        }));
    }).observe(document.body, { childList: true });
}

// ---------- Install app ----------
function setupInstall() {
    const btn = $('prefInstall');
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const refresh = () => {
        if (standalone) { btn.style.display = 'none'; return; }
        if (window.__installPrompt) { btn.style.display = ''; btn.innerHTML = '<i class="fas fa-download"></i> Install'; }
        else if (ios) { btn.style.display = ''; btn.innerHTML = '<i class="fas fa-circle-info"></i> How to install'; }
    };
    btn.addEventListener('click', async () => {
        if (window.__installPrompt) {
            window.__installPrompt.prompt();
            await window.__installPrompt.userChoice.catch(() => {});
            window.__installPrompt = null;
            refresh();
        } else if (ios) showToast('Tap the Share button, then "Add to Home Screen"', 'info');
    });
    bus.on('install:available', refresh);
    refresh();
}

// ---------- Init (called by main.js) ----------
export async function init() {
    if (!$('prefsModal') || !$('prefsBtn')) return {};

    on('prefsBtn', 'click', () => { $('prefSound').checked = getPref('sound', true); $('prefsModal').classList.add('active'); });
    $('prefSound').addEventListener('change', e => setPref('sound', e.target.checked));
    on('prefPassword', 'click', () => { closeModal('prefsModal'); $('passwordForm').reset(); $('passwordModal').classList.add('active'); });
    on('prefProfile', 'click', () => { closeModal('prefsModal'); openProfile(); });

    setupPush();
    setupInstall();

    on('profileForm', 'submit', e => { e.preventDefault(); saveProfile(); });
    $('profileAvatarFile').addEventListener('change', async e => {
        const file = e.target.files[0];
        if (!file) return;
        try { pendingImage = await resizeToSquare(file); $('profileAvatarPreview').src = pendingImage; }
        catch (err) { showToast('Could not read that image', 'error'); }
    });

    // Header avatar opens the profile
    const av = $('headerAvatar');
    av.style.cursor = 'pointer';
    av.title = 'My profile';
    av.addEventListener('click', openProfile);

    // A photo saved before the shared store existed: publish it once
    if (me() && !state.photos[photoKey(state.currentUser.name)]) {
        try {
            const image = (await get(ref(db, `userProfiles/${me()}/image`))).val();
            if (image) {
                await publishPhoto(image);
                av.src = image;
                bus.emit('data:changed');
            }
        } catch (err) { /* no photo, or the name is already taken by someone else */ }
    }
    return {};
}
