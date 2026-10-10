const firebaseConfig = {
  apiKey: "AIzaSyAp4iRTfJ0jWBX5XcTiBAghdN_iCE0Ix4o",
  authDomain: "personal-web-journal.firebaseapp.com",
  projectId: "personal-web-journal",
  storageBucket: "personal-web-journal.firebasestorage.app",
  messagingSenderId: "980592936593",
  appId: "1:980592936593:web:20e8dc2a636a3e8be8e130",
};
export function getFirebase() {
  const sdk = window.firebase;
  if (!sdk)
    throw new Error(
      "Firebase could not load. Check your connection and reload.",
    );
  if (!sdk.apps.length) sdk.initializeApp(firebaseConfig);
  return {
    auth: sdk.auth(),
    db: sdk.firestore(),
    storage: sdk.storage(),
    serverTimestamp: () => sdk.firestore.FieldValue.serverTimestamp(),
  };
}
