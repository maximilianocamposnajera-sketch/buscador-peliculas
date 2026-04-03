import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBB-3LeUspSmnvQlpn7mwIz0jknsfxLVZg",
  authDomain: "buscador-peliculas-2104c.firebaseapp.com",
  projectId: "buscador-peliculas-2104c",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);