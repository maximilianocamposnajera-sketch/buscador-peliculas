import { useState, useEffect } from "react";
import "./App.css";

// Firebase
import { auth, db } from "./firebase";
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "firebase/auth";

import { 
  doc, setDoc, getDoc, updateDoc,
  collection, getDocs, query, orderBy, limit,
  deleteDoc
} from "firebase/firestore";

export default function App() {

  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [sinResultados, setSinResultados] = useState(false);

  const [user, setUser] = useState(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [miCalificacion, setMiCalificacion] = useState("");
  const [calificacionGuardada, setCalificacionGuardada] = useState(null);
  const [cargandoCalificacion, setCargandoCalificacion] = useState(false);

  const [topPeliculas, setTopPeliculas] = useState([]);
  const [misPeliculas, setMisPeliculas] = useState([]);

  useEffect(() => {
    onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) obtenerMisCalificaciones(u.uid);
    });

    obtenerTopPeliculas();
  }, []);

  async function registrar() {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      alert("Usuario registrado");
    } catch (error) {
      alert(error.message);
    }
  }

  async function iniciarSesion() {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      alert("Bienvenido");
    } catch (error) {
      alert(error.message);
    }
  }

  function cerrarSesion() {
    signOut(auth);
    setMisPeliculas([]);
  }

  async function buscar() {
    if (texto === "") return alert("Escribe algo");

    setCargando(true);
    setResultados([]);
    setSinResultados(false);

    const res = await fetch("https://www.omdbapi.com/?apikey=c1d61990&s=" + texto);
    const data = await res.json();

    setCargando(false);

    if (data.Response === "False") {
      setSinResultados(true);
      return;
    }

    setResultados(data.Search);
  }

  async function verDetalle(pelicula) {
    const res = await fetch(
      "https://www.omdbapi.com/?apikey=c1d61990&i=" + pelicula.imdbID + "&plot=full"
    );
    const data = await res.json();

    setDetalle(data);

    if (user) {
      const ref = doc(db, "usuarios", user.uid, "calificaciones", pelicula.imdbID);
      setCargandoCalificacion(true);
      const snap = await getDoc(ref);
      setCargandoCalificacion(false);

      if (snap.exists()) {
        setCalificacionGuardada(snap.data().calificacion);
      } else {
        setCalificacionGuardada(null);
      }
    }
  }

  function cerrarModal() {
    setDetalle(null);
    setMiCalificacion("");
    setCalificacionGuardada(null);
  }

  async function guardarCalificacion() {
    if (!user) return alert("Inicia sesión");
    if (!miCalificacion) return alert("Pon calificación");

    const cal = Number(miCalificacion);
    if (cal < 1 || cal > 10) return alert("Debe ser entre 1 y 10");

    try {
      const userRef = doc(db, "usuarios", user.uid, "calificaciones", detalle.imdbID);
      const userSnap = await getDoc(userRef);

      let calAnterior = null;
      if (userSnap.exists()) calAnterior = userSnap.data().calificacion;

      await setDoc(userRef, {
        id: detalle.imdbID,
        titulo: detalle.Title,
        poster: detalle.Poster,
        calificacion: cal,
        fecha: new Date()
      });

      const peliRef = doc(db, "peliculas", detalle.imdbID);
      const peliSnap = await getDoc(peliRef);

      if (peliSnap.exists()) {
        const data = peliSnap.data();

        if (calAnterior !== null) {
          const nuevaSuma = data.sumaCalificaciones + (cal - calAnterior);
          const promedio = nuevaSuma / data.totalCalificaciones;

          await updateDoc(peliRef, {
            sumaCalificaciones: nuevaSuma,
            promedio
          });

        } else {
          const nuevaSuma = data.sumaCalificaciones + cal;
          const nuevoTotal = data.totalCalificaciones + 1;
          const promedio = nuevaSuma / nuevoTotal;

          await updateDoc(peliRef, {
            sumaCalificaciones: nuevaSuma,
            totalCalificaciones: nuevoTotal,
            promedio
          });
        }

      } else {
        await setDoc(peliRef, {
          titulo: detalle.Title,
          totalCalificaciones: 1,
          sumaCalificaciones: cal,
          promedio: cal
        });
      }

      alert("Guardado");

      obtenerTopPeliculas();
      obtenerMisCalificaciones(user.uid);

    } catch (e) {
      console.error(e);
      alert("Error");
    }
  }

  async function eliminarCalificacion(peliId) {
    try {
      const userRef = doc(db, "usuarios", user.uid, "calificaciones", peliId);
      const peliRef = doc(db, "peliculas", peliId);

      const peliSnap = await getDoc(peliRef);
      const userSnap = await getDoc(userRef);

      if (!peliSnap.exists() || !userSnap.exists()) return;

      const data = peliSnap.data();
      const cal = userSnap.data().calificacion;

      const nuevaSuma = data.sumaCalificaciones - cal;
      const nuevoTotal = data.totalCalificaciones - 1;

      if (nuevoTotal <= 0) {
        await updateDoc(peliRef, {
          sumaCalificaciones: 0,
          totalCalificaciones: 0,
          promedio: 0
        });
      } else {
        await updateDoc(peliRef, {
          sumaCalificaciones: nuevaSuma,
          totalCalificaciones: nuevoTotal,
          promedio: nuevaSuma / nuevoTotal
        });
      }

      await deleteDoc(userRef);

      obtenerTopPeliculas();
      obtenerMisCalificaciones(user.uid);

      alert("Eliminado");

    } catch (e) {
      console.error(e);
      alert("Error al eliminar");
    }
  }

  async function obtenerTopPeliculas() {
    const q = query(
      collection(db, "peliculas"),
      orderBy("promedio", "desc"),
      limit(10)
    );

    const snapshot = await getDocs(q);

    const lista = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        titulo: data.titulo,
        promedio: data.promedio || 0
      };
    });

    setTopPeliculas(lista);
  }

  async function obtenerMisCalificaciones(uid) {
    const ref = collection(db, "usuarios", uid, "calificaciones");
    const snapshot = await getDocs(ref);

    const lista = snapshot.docs.map(doc => ({
      id: doc.id, 
      ...doc.data()
    }));

    setMisPeliculas(lista);
  }

  if (!user) {
    return (
      <div className="login">
        <h1>🎬 Buscador de Películas</h1>

        <input type="email" placeholder="Correo" value={email} onChange={e => setEmail(e.target.value)} />
        <input type="password" placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} />

        <button onClick={iniciarSesion}>Iniciar sesión</button>
        <button onClick={registrar}>Registrarse</button>
      </div>
    );
  }

  return (
    <div>

      <h1>🎬 Buscador de Películas</h1>
      <button onClick={cerrarSesion}>Cerrar sesión</button>

      <h2>Top 10 Películas</h2>
      <div className="top">
        {topPeliculas.map((peli, i) => (
          <p key={peli.id}>
            {i + 1}. {peli.titulo} ⭐ {peli.promedio.toFixed(1)}
          </p>
        ))}
      </div>

      <h2>🎯 Mis calificaciones</h2>
      <div className="resultados">
        {misPeliculas.map((peli, i) => (
          <div key={i} className="tarjeta">
            <img src={peli.poster} alt={peli.titulo} />
            <h3>{peli.titulo}</h3>
            <p>⭐ {peli.calificacion}</p>

            <button onClick={() => {
              setMiCalificacion(peli.calificacion);
              setDetalle({
                imdbID: peli.id,
                Title: peli.titulo,
                Poster: peli.poster
              });
            }}>
              Editar
            </button>

            <button onClick={() => eliminarCalificacion(peli.id)}>
              Eliminar
            </button>
          </div>
        ))}
      </div>

      <div className="buscador">
        <input
          type="text"
          placeholder="Escribe una película"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && buscar()}
        />
        <button onClick={buscar}>Buscar</button>
      </div>

      {cargando && <div className="loader">Buscando...</div>}
      {sinResultados && <p>No se encontraron resultados</p>}

      <div className="resultados">
        {resultados.map((p) => (
          <div key={p.imdbID} className="tarjeta" onClick={() => verDetalle(p)}>
            <h3>{p.Title}</h3>
            <img src={p.Poster !== "N/A" ? p.Poster : "https://via.placeholder.com/200x300"} />
            <p>Año: {p.Year}</p>
          </div>
        ))}
      </div>

      {detalle && (
        <div className="modal" onClick={(e) => e.target === e.currentTarget && cerrarModal()}>
          <div className="modal-contenido">

            <span onClick={cerrarModal}>&times;</span>

            <h2>{detalle.Title}</h2>
            <img src={detalle.Poster} />

            {calificacionGuardada && (
              <p>⭐ Ya calificaste: {calificacionGuardada}</p>
            )}

            <input
              type="number"
              min="1"
              max="10"
              value={miCalificacion}
              onChange={(e) => setMiCalificacion(e.target.value)}
            />

            <button onClick={guardarCalificacion}>
              Guardar calificación
            </button>

          </div>
        </div>
      )}

    </div>
  );
}