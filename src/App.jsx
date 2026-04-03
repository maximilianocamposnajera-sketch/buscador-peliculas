import { useState, useEffect } from "react";
import "./App.css";

// Firebase
import { auth, db } from "./firebase";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { 
  doc, setDoc, getDoc, updateDoc,
  collection, getDocs, query, orderBy, limit 
} from "firebase/firestore";

export default function App() {

  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [veredicto, setVeredicto] = useState("");
  const [sinResultados, setSinResultados] = useState(false);

  const [user, setUser] = useState(null);
  const [miCalificacion, setMiCalificacion] = useState("");
  const [calificacionGuardada, setCalificacionGuardada] = useState(null);
  const [cargandoCalificacion, setCargandoCalificacion] = useState(false);

  const [topPeliculas, setTopPeliculas] = useState([]);

  useEffect(() => {
    signInAnonymously(auth);

    onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
      }
    });

    obtenerTopPeliculas();
  }, []);

  async function buscar() {
    if (texto === "") {
      alert("Escribe algo");
      return;
    }

    setCargando(true);
    setResultados([]);
    setSinResultados(false);

    const response = await fetch("https://www.omdbapi.com/?apikey=c1d61990&s=" + texto);
    const data = await response.json();

    setCargando(false);

    if (data.Response === "False") {
      setSinResultados(true);
      return;
    }

    setResultados(data.Search);
  }

  async function verDetalle(pelicula) {
    const response = await fetch(
      "https://www.omdbapi.com/?apikey=c1d61990&i=" + pelicula.imdbID + "&plot=full"
    );
    const data = await response.json();
    setDetalle(data);

    try {
      const rv = await fetch("http://localhost:3000/comentario?calificacion=" + data.imdbRating);
      const resultado = await rv.json();
      setVeredicto(resultado.comentario);
    } catch (error) {
      console.log("Error en veredicto:", error);
    }

    const user = auth.currentUser;

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
    setVeredicto("");
    setCalificacionGuardada(null);
    setMiCalificacion("");
  }

  // 🔥 GUARDAR CALIFICACIÓN MEJORADO
  async function guardarCalificacion() {
    if (!user) return alert("No hay usuario");
    if (!miCalificacion) return alert("Pon una calificación");

    const cal = Number(miCalificacion);
    if (cal < 1 || cal > 10) return alert("Debe ser entre 1 y 10");

    try {
      const userRef = doc(db, "usuarios", user.uid, "calificaciones", detalle.imdbID);
      const userSnap = await getDoc(userRef);

      let calAnterior = null;
      if (userSnap.exists()) calAnterior = userSnap.data().calificacion;

      // guardar usuario
      await setDoc(userRef, {
        titulo: detalle.Title,
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
            promedio: promedio
          });

        } else {
          const nuevaSuma = data.sumaCalificaciones + cal;
          const nuevoTotal = data.totalCalificaciones + 1;
          const promedio = nuevaSuma / nuevoTotal;

          await updateDoc(peliRef, {
            sumaCalificaciones: nuevaSuma,
            totalCalificaciones: nuevoTotal,
            promedio: promedio
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

      alert("Calificación guardada 🔥");
      obtenerTopPeliculas();

    } catch (error) {
      console.error(error);
      alert("Error al guardar");
    }
  }

  // 🔥 TOP 10 (ahora usa promedio)
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

  return (
    <div>

      <h1>🎬 Buscador de Películas</h1>

      <h2>🔥 Top 10 Películas</h2>
      <div className="top">
        {topPeliculas.map((peli, index) => (
          <p key={peli.id}>
            {index + 1}. {peli.titulo} ⭐ {peli.promedio.toFixed(1)}
          </p>
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
        {resultados.map((pelicula) => (
          <div
            key={pelicula.imdbID}
            className="tarjeta"
            onClick={() => verDetalle(pelicula)}
          >
            <h3>{pelicula.Title}</h3>
            <img
              src={pelicula.Poster !== "N/A"
                ? pelicula.Poster
                : "https://via.placeholder.com/200x300"}
              alt={pelicula.Title}
            />
            <p>Año: {pelicula.Year}</p>
          </div>
        ))}
      </div>

      {detalle && (
        <div className="modal" onClick={(e) => e.target === e.currentTarget && cerrarModal()}>
          <div className="modal-contenido">
            <span onClick={cerrarModal}>&times;</span>

            <h2>{detalle.Title}</h2>

            <img src={detalle.Poster} alt={detalle.Title} />

            <p><b>Año:</b> {detalle.Year}</p>
            <p><b>Género:</b> {detalle.Genre}</p>
            <p><b>IMDb:</b> {detalle.imdbRating}</p>
            <p><b>Sinopsis:</b> {detalle.Plot}</p>

            {veredicto && <p><b>💬 Veredicto:</b> {veredicto}</p>}
            {cargandoCalificacion && <p>Cargando...</p>}

            {calificacionGuardada && (
              <p><b>⭐ Ya calificaste:</b> {calificacionGuardada}</p>
            )}

            <input
              type="number"
              min="1"
              max="10"
              placeholder="Tu calificación (1-10)"
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