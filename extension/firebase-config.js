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
export const GOOGLE_CLIENT_ID = "226009163705-23vm4em8tjm2988i9fhsc0c9un97eca9.apps.googleusercontent.com";

// Derived URLs
export const AUTH_URL = "https://identitytoolkit.googleapis.com/v1";
export const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;
