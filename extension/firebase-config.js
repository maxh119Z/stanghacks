// ═══════════════════════════════════════════════════════════════
// FIREBASE + GOOGLE OAUTH CONFIG
// ═══════════════════════════════════════════════════════════════

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBYomS5XmPZYEYYFbZPoe1-x6KvncliwS0",
  authDomain: "stanghacks.firebaseapp.com",
  projectId: "stanghacks",
  storageBucket: "stanghacks.firebasestorage.app",
  messagingSenderId: "1057477643029",
  appId: "1:1057477643029:web:eecee0d8a2432d924df71c",
};

// ═══════════════════════════════════════════════════════════════
// GOOGLE OAUTH CLIENT ID
// Get this from: Firebase Console → Authentication → Sign-in method
//   → Google → expand "Web SDK configuration" → Web client ID
// ═══════════════════════════════════════════════════════════════
export const GOOGLE_CLIENT_ID = "1057477643029-82ta08tkqri5pfe64sffi9ifgv4vkmsa.apps.googleusercontent.com";

// Derived URLs
export const AUTH_URL = "https://identitytoolkit.googleapis.com/v1";
export const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;
