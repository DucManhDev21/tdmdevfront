import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { CONFIG, backendUrl } from './config.js';

const firebaseConfig = Object.freeze({
  apiKey: 'AIzaSyDPaGLv7R3PrNbi_3OsT_1dcCnqLPPrLq0',
  authDomain: 'tdmdev-1ea99.firebaseapp.com',
  projectId: 'tdmdev-1ea99',
  storageBucket: 'tdmdev-1ea99.firebasestorage.app',
  messagingSenderId: '50010081443',
  appId: '1:50010081443:web:a538f9b9ef258967985716',
  measurementId: 'G-H1MCY1SFSC'
});

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({ prompt: 'select_account' });

function translateAuthError(code) {
  const map = {
    'auth/invalid-email': 'Email không hợp lệ.',
    'auth/missing-password': 'Vui lòng nhập mật khẩu.',
    'auth/weak-password': 'Mật khẩu chưa đủ mạnh.',
    'auth/email-already-in-use': 'Email này đã được đăng ký.',
    'auth/invalid-credential': 'Email hoặc mật khẩu không chính xác.',
    'auth/popup-closed-by-user': 'Cửa sổ Google đã được đóng.',
    'auth/popup-blocked': 'Trình duyệt đã chặn cửa sổ Google.',
    'auth/account-exists-with-different-credential': 'Email này đã liên kết với phương thức đăng nhập khác.',
    'auth/too-many-requests': 'Có quá nhiều yêu cầu. Hãy thử lại sau.',
    'auth/network-request-failed': 'Không thể kết nối tới Firebase.',
    'auth/operation-not-allowed': 'Phương thức đăng nhập này chưa được bật trong Firebase.'
  };
  return map[code] || 'Xác thực thất bại. Vui lòng thử lại.';
}

async function signInGoogle() {
  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (error) {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(error.code)) {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw error;
  }
}

async function getIdToken(forceRefresh = false) {
  const user = auth.currentUser;
  return user ? user.getIdToken(forceRefresh) : null;
}

async function verifyCurrentUserWithBackend() {
  const token = await getIdToken();
  if (!token) return null;
  const response = await fetch(backendUrl('/api/auth/verify'), {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) return null;
  return response.json();
}

function friendlyUser(user) {
  return user ? {
    uid: user.uid,
    displayName: user.displayName || user.email?.split('@')[0] || 'TDM User',
    email: user.email || '',
    photoURL: user.photoURL || ''
  } : null;
}

export const TDMAuth = {
  auth,
  onAuthStateChanged,
  getCurrentUser: () => auth.currentUser,
  createWithEmailPassword: async ({ name, email, password }) => {
    const credentials = await createUserWithEmailAndPassword(auth, email.trim(), password);
    if (name?.trim()) await updateProfile(credentials.user, { displayName: name.trim() });
    return credentials.user;
  },
  signInWithEmailPassword: ({ email, password }) => signInWithEmailAndPassword(auth, email.trim(), password),
  signInWithGoogle,
  signOut: () => signOut(auth),
  getIdToken,
  verifyCurrentUserWithBackend,
  friendlyUser,
  translateAuthError
};

getRedirectResult(auth).catch(() => {});

window.TDMAuth = TDMAuth;
window.TDMFirebaseConfig = firebaseConfig;
