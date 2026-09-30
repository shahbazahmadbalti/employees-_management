import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword,
    EmailAuthProvider, reauthenticateWithCredential, updatePassword
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { auth, db, firebaseConfig, ref, get, state, $, on, isAdmin, showToast, closeModal, emailFor } from './core.js';

let started = false;

async function rejectSession(key) {
    sessionStorage.setItem('duna_login_notice', key);
    try { await signOut(auth); } catch (e) { /* ignore */ }
    window.location.href = 'login.html';
}

// Calls onReady(user) once, after the user's profile is verified.
export function initAuth(onReady) {
    onAuthStateChanged(auth, async user => {
        if (!user) { window.location.href = 'login.html'; return; }
        if (started) return;
        try {
            const snap = await get(ref(db, `users/${user.uid}`));
            const profile = snap.val();
            if (!profile) { await rejectSession('errNoProfile'); return; }
            if (profile.status && profile.status !== 'active') { await rejectSession('errInactive'); return; }
            started = true;
            state.currentUser = {
                uid: user.uid,
                name: profile.name || user.email,
                role: String(profile.role).toUpperCase() === 'ADMIN' ? 'admin' : 'employee',
                employeeId: profile.employeeId || null,
                employeeKey: profile.employeeKey || null,
                logType: profile.logType || 'Logs'
            };
            onReady(user);
        } catch (err) {
            console.error('Could not load user profile:', err);
            await rejectSession('errFailed');
        }
    });
}

export function applyRole() {
    document.body.className = `role-${state.currentUser.role}`;
    document.querySelectorAll('.admin-only').forEach(el => { el.style.display = isAdmin() ? '' : 'none'; });
}

// Creates a login for an employee without signing the admin out (uses a second app instance)
let secondaryAuth = null;
export async function createLogin(employeeId, password) {
    if (!secondaryAuth) secondaryAuth = getAuth(initializeApp(firebaseConfig, 'secondary'));
    const cred = await createUserWithEmailAndPassword(secondaryAuth, emailFor(employeeId), password);
    await signOut(secondaryAuth);
    return cred.user.uid;
}

export function authErrorMessage(err) {
    const map = {
        'auth/email-already-in-use': 'A login for this Employee ID already exists. Delete it in Firebase Console > Authentication, or use another Employee ID.',
        'auth/weak-password': 'Password is too weak (minimum 6 characters).',
        'auth/operation-not-allowed': 'Enable Email/Password sign-in in Firebase Authentication.',
        'auth/invalid-credential': 'Current password is incorrect.',
        'auth/wrong-password': 'Current password is incorrect.',
        'auth/too-many-requests': 'Too many attempts. Try again later.',
        'auth/requires-recent-login': 'Please sign out and sign in again, then retry.',
        'auth/network-request-failed': 'Network error. Check your connection.'
    };
    return map[err && err.code] || (err && err.message) || 'Unknown error';
}

async function savePassword() {
    const F = $('passwordForm').elements;
    const current = F.currentPassword.value, next = F.newPassword.value, confirmPw = F.confirmPassword.value;
    if (next.length < 6) return showToast('New password must be at least 6 characters', 'error');
    if (next !== confirmPw) return showToast('New passwords do not match', 'error');
    if (next === current) return showToast('New password must be different', 'error');
    const user = auth.currentUser;
    if (!user) return showToast('Please sign in again', 'error');
    try {
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
        await updatePassword(user, next);
        closeModal('passwordModal');
        showToast('Password updated successfully!', 'success');
    } catch (err) {
        showToast(authErrorMessage(err), 'error');
    }
}

// Logout button + change-password modal
export function initAuthUI() {
    on('logoutBtn', 'click', async () => {
        try { await signOut(auth); } catch (e) { /* ignore */ }
        window.location.href = 'login.html';
    });
    on('changePasswordBtn', 'click', () => { $('passwordForm').reset(); $('passwordModal').classList.add('active'); });
    on('passwordForm', 'submit', e => { e.preventDefault(); savePassword(); });
}
