// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCLdh5NXziqyYJNKU1r3Vgw29fNqPZL69o",
  authDomain: "chord-app-7583a.firebaseapp.com",
  projectId: "chord-app-7583a",
  storageBucket: "chord-app-7583a.firebasestorage.app",
  messagingSenderId: "532964795076",
  appId: "1:532964795076:web:9410faf1084faf544a9f91",
  measurementId: "G-CR55G61ZEF"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);