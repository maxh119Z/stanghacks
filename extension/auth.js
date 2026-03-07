// Google Sign-In via chrome.identity.launchWebAuthFlow
// Then exchange Google token for Firebase Auth token via REST API

import { FIREBASE_CONFIG, GOOGLE_CLIENT_ID, AUTH_URL } from "./firebase-config.js";

// ── Google OAuth Flow ─────────────────────────────────────────

export async function googleSignIn() {
  const redirectUrl = chrome.identity.getRedirectURL();

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("response_type", "id_token");
  authUrl.searchParams.set("redirect_uri", redirectUrl);
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("nonce", Math.random().toString(36).slice(2));
  authUrl.searchParams.set("prompt", "select_account");

  // Opens Google sign-in in a popup window
  const responseUrl = await new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl.toString(), interactive: true },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      }
    );
  });

  // Extract id_token from the redirect URL fragment
  const hash = new URL(responseUrl).hash.substring(1);
  const params = new URLSearchParams(hash);
  const idToken = params.get("id_token");

  if (!idToken) throw new Error("No id_token received from Google");

  // Exchange Google id_token for Firebase Auth
  return await exchangeGoogleTokenForFirebase(idToken);
}

// ── Exchange Google Token → Firebase Auth ─────────────────────

async function exchangeGoogleTokenForFirebase(googleIdToken) {
  const res = await fetch(
    `${AUTH_URL}/accounts:signInWithIdp?key=${FIREBASE_CONFIG.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postBody: `id_token=${googleIdToken}&providerId=google.com`,
        requestUri: chrome.identity.getRedirectURL(),
        returnIdpCredential: true,
        returnSecureToken: true,
      }),
    }
  );

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  // data includes: idToken, localId (uid), refreshToken, email, displayName, photoUrl
  return data;
}

// ── Token Management ──────────────────────────────────────────

export async function refreshToken(refreshTokenStr) {
  const res = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_CONFIG.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: refreshTokenStr,
      }),
    }
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return {
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    localId: data.user_id,
  };
}

export async function getValidToken() {
  const stored = await chrome.storage.local.get([
    "idToken",
    "refreshTokenStr",
    "tokenExpiry",
    "uid",
  ]);

  if (!stored.idToken) return null;

  // Refresh if token expires within 5 minutes
  if (stored.tokenExpiry && Date.now() > stored.tokenExpiry - 300000) {
    try {
      const refreshed = await refreshToken(stored.refreshTokenStr);
      await chrome.storage.local.set({
        idToken: refreshed.idToken,
        refreshTokenStr: refreshed.refreshToken,
        tokenExpiry: Date.now() + 3600000,
        uid: refreshed.localId,
      });
      return { idToken: refreshed.idToken, uid: refreshed.localId };
    } catch (e) {
      console.error("[Think] Token refresh failed:", e);
      return null;
    }
  }

  return { idToken: stored.idToken, uid: stored.uid };
}

export async function saveAuthToStorage(authData) {
  await chrome.storage.local.set({
    idToken: authData.idToken,
    refreshTokenStr: authData.refreshToken,
    tokenExpiry: Date.now() + 3600000,
    uid: authData.localId,
    email: authData.email,
    displayName: authData.displayName || "",
    photoUrl: authData.photoUrl || "",
  });
}

export async function signOut() {
  await chrome.storage.local.remove([
    "idToken",
    "refreshTokenStr",
    "tokenExpiry",
    "uid",
    "email",
    "displayName",
    "photoUrl",
  ]);
}
