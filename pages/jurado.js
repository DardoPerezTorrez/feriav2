import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { db } from "../lib/firebase";
import {
  collection,
  doc,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  getDoc,
} from "firebase/firestore";

// ------------------------------------------------
// CONFIGURACIÓN DE CRITERIOS
// ------------------------------------------------
const CRITERIA = {
  punctuality: { name: "Puntualidad y Presentación", max: 10 },
  exposition: { name: "Exposición del Tema", max: 30 },
  materials: { name: "Materiales/Recursos Didácticos", max: 30 },
  triptych: { name: "Tríptico", max: 20 },
  cleanliness: { name: "Limpieza", max: 10 },
};

const MAX_JURY_SCORE = 100;

// ------------------------------------------------
// FUNCIÓN AUXILIAR PARA LOTES
// ------------------------------------------------
const chunkArray = (arr, size) => {
  const chunkedArray = [];
  for (let i = 0; i < arr.length; i += size) {
    chunkedArray.push(arr.slice(i, i + size));
  }
  return chunkedArray;
};

// ------------------------------------------------
// ICONOS
// ------------------------------------------------
const EditIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="w-5 h-5 ml-1"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </svg>
);

const CheckIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="w-5 h-5 mr-1"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// ------------------------------------------------
// COMPONENTE PRINCIPAL
// ------------------------------------------------
const JuradoPage = () => {
  const router = useRouter();

  // --- ESTADOS ---
  const [currentUserId, setCurrentUserId] = useState(null);
  const [isSessionChecked, setIsSessionChecked] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [assignedProjects, setAssignedProjects] = useState([]);
  const [evaluations, setEvaluations] = useState({});
  const [evaluationStatus, setEvaluationStatus] = useState({});
  const [currentProject, setCurrentProject] = useState(null);
  const [currentScores, setCurrentScores] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  // ------------------------------------------------
  // EFECTO 1: COMPROBAR SESIÓN (CLIENTE)
  // ------------------------------------------------
  useEffect(() => {
    const storedUserId = localStorage.getItem('userId');
    if (storedUserId) {
      setCurrentUserId(storedUserId);
    } else {
      router.push('/login');
    }
    setIsSessionChecked(true);
  }, [router]);

  // ------------------------------------------------
  // FUNCIÓN FETCH PRINCIPAL
  // ------------------------------------------------
  const fetchData = useCallback(async (userId) => {
    setIsLoading(true);
    setFetchError(null);

    let projectIds = [];

    try {
      const userRef = doc(db, "users", userId);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const latestProfile = { id: userSnap.id, ...userSnap.data() };
        projectIds = latestProfile.assignedProjects || [];
        setUserProfile(latestProfile);
      } else {
        console.error("User profile not found.");
        setFetchError("Error: El perfil de usuario no se encontró en la base de datos.");
        setIsLoading(false);
        return;
      }

      if (projectIds.length === 0) {
        setAssignedProjects([]);
        setEvaluationStatus({});
        setIsLoading(false);
        return;
      }

      const projectsRef = collection(db, "projects");
      const projectBatches = chunkArray(projectIds, 10);
      const projectPromises = projectBatches.map(batch => {
        const projectsQuery = query(projectsRef, where("__name__", "in", batch));
        return getDocs(projectsQuery);
      });

      const projectSnapshots = await Promise.all(projectPromises);
      const projectsList = projectSnapshots.flatMap(snapshot =>
        snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      );

      const evaluationsRef = collection(db, "evaluations");
      const evaluationsQuery = query(evaluationsRef, where("judgeId", "==", userId));
      const evaluationsSnapshot = await getDocs(evaluationsQuery);

      const existingEvaluations = {};
      const statusUpdates = {};

      evaluationsSnapshot.docs.forEach(doc => {
        const evalData = doc.data();
        existingEvaluations[evalData.projectId] = { ...evalData, docId: doc.id };
        statusUpdates[evalData.projectId] = 'complete';
      });

      setAssignedProjects(projectsList);
      setEvaluations(existingEvaluations);
      setEvaluationStatus(statusUpdates);

    } catch (error) {
      alert(`¡ERROR CRÍTICO! ${error.message}`);
      console.error("Error al cargar:", error);
      const msg = error.message.includes('index')
        ? "ERROR DE FIREBASE: Falta un índice. Revisa la consola."
        : "Error de red o permisos.";
      setFetchError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ------------------------------------------------
  // EFECTO 2: CARGAR DATOS TRAS COMPROBAR SESIÓN
  // ------------------------------------------------
  useEffect(() => {
    if (isSessionChecked && currentUserId) {
      fetchData(currentUserId);
    }
  }, [isSessionChecked, currentUserId, fetchData]);

  // ------------------------------------------------
  // FUNCIONES DE LÓGICA
  // ------------------------------------------------
  const calculateTotalScore = (scores) =>
    Object.keys(CRITERIA).reduce((total, key) => total + (scores[key] || 0), 0);

  const handleScoreChange = (criteriaKey, value) => {
    const numericValue = parseInt(value, 10) || 0;
    const maxScore = CRITERIA[criteriaKey].max;
    setCurrentScores(prev => ({
      ...prev,
      [criteriaKey]: Math.min(Math.max(0, numericValue), maxScore),
    }));
  };

  const startEvaluation = (project) => {
    setCurrentProject(project);
    const existingEval = evaluations[project.id];
    if (existingEval) setCurrentScores(existingEval.scores);
    else {
      const initialScores = Object.keys(CRITERIA).reduce(
        (acc, key) => ({ ...acc, [key]: 0 }),
        {}
      );
      setCurrentScores(initialScores);
    }
  };

  const handleSubmitEvaluation = async () => {
    if (!currentProject || isSaving || !currentUserId) return;

    setShowConfirm(false);
    setIsSaving(true);
    setFetchError(null);

    const totalScore = calculateTotalScore(currentScores);
    const timestamp = new Date().toISOString();

    const evaluationData = {
      judgeId: currentUserId,
      projectId: currentProject.id,
      totalScore,
      scores: currentScores,
      timestamp,
    };

    try {
      const existingDocId = evaluations[currentProject.id]?.docId;
      if (existingDocId) {
        const evalRef = doc(db, "evaluations", existingDocId);
        await updateDoc(evalRef, evaluationData);
        alert(`✅ Evaluación actualizada (${totalScore})`);
      } else {
        await addDoc(collection(db, "evaluations"), evaluationData);
        alert(`✅ Evaluación guardada (${totalScore})`);
      }

      await fetchData(currentUserId);
      setCurrentProject(null);
    } catch (error) {
      console.error("Error al guardar:", error);
      alert(`❌ Error al guardar: ${error.message}`);
      setFetchError("Error al guardar la evaluación.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('userId');
    localStorage.removeItem('role');
    localStorage.removeItem('userData');
    router.push('/');
  };

  const totalScore = calculateTotalScore(currentScores);

  // ------------------------------------------------
  // MODAL DE CONFIRMACIÓN (COMPACTO)
  // ------------------------------------------------
  const ConfirmModal = ({ onClose, onConfirm, totalScore, projectName }) => (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-[60] p-3">
      {/* Modal compacto: max-w-xs para tamaño reducido */}
      <div className="bg-white rounded-lg shadow-xl w-full max-w-xs p-4 text-center border-t-2 border-green-500">
        <h3 className="text-lg font-bold text-gray-900 mb-1">Confirmar Evaluación</h3>

        <p className="text-sm text-gray-700 mb-2">
          Guardar nota del proyecto <span className="font-semibold">{projectName}</span>?
        </p>

        <p className="text-base text-gray-800 mb-3 font-semibold">
          <span className="text-xl font-extrabold text-green-700">{totalScore}</span> / {MAX_JURY_SCORE}
        </p>

        <p className="text-xs text-gray-500 mb-3">
          ¿Seguro? Esta calificación se usará en el cálculo final.
        </p>

        <div className="flex justify-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition"
          >
            No, Revisar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition"
          >
            Sí, Guardar
          </button>
        </div>
      </div>
    </div>
  );

  // ------------------------------------------------
  // RENDERIZADO CONDICIONAL (ANTI-HYDRATION)
  // ------------------------------------------------
  if (!isSessionChecked)
    return <div className="p-8 text-center text-lg text-gray-600">Cargando sesión...</div>;

  if (!currentUserId)
    return <div className="p-8 text-center text-lg text-gray-600">Redirigiendo al login...</div>;

  // ------------------------------------------------
  // RETURN PRINCIPAL
  // ------------------------------------------------
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center p-2 sm:p-4">
      {showConfirm && (
        <ConfirmModal
          onClose={() => setShowConfirm(false)}
          onConfirm={handleSubmitEvaluation}
          totalScore={totalScore}
          projectName={currentProject?.name || ''}
        />
      )}

      <header className="w-full max-w-4xl text-center py-4">
        <h1 className="text-2xl font-extrabold text-green-600">EXPOFERIA MULTIDISCIPLINARIA</h1>
        <p className="text-lg font-semibold text-green-700">U. E. JOSÉ BALLIVIÁN - A</p>
      </header>

      <div className="w-full max-w-4xl bg-white shadow-xl rounded-2xl p-4 sm:p-8 mt-4">
        <div className="flex justify-between items-center border-b pb-4 mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-gray-800">Panel de Evaluación</h1>
            {userProfile && (
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Jurado: <span className="font-bold">{userProfile.name || userProfile.username}</span> ({userProfile.role})
              </p>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="px-3 py-1 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition"
          >
            Salir
          </button>
        </div>

        {fetchError && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-sm">
            <strong>¡Error!</strong> {fetchError}
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-10">
            <div className="spinner-border inline-block w-8 h-8 border-4 rounded-full border-green-500 border-r-transparent animate-spin"></div>
            <p className="text-lg text-gray-600 mt-3">
              Cargando proyectos asignados...
            </p>
          </div>
        ) : assignedProjects.length === 0 ? (
          <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-300">
            <p className="text-xl font-semibold text-gray-500">👋 No hay proyectos asignados.</p>
            <p className="text-sm text-gray-400 mt-2">Espera la asignación del administrador.</p>
          </div>
        ) : currentProject ? (
          <EvaluationForm
            project={currentProject}
            currentScores={currentScores}
            totalScore={totalScore}
            handleScoreChange={handleScoreChange}
            handleBack={() => setCurrentProject(null)}
            handleConfirm={() => setShowConfirm(true)}
            isSaving={isSaving}
          />
        ) : (
          <ProjectList
            projects={assignedProjects}
            evaluationStatus={evaluationStatus}
            startEvaluation={startEvaluation}
            evaluations={evaluations}
          />
        )}
      </div>

      <style jsx global>{`
        .spinner-border {
          display: inline-block;
          border: 0.25em solid currentColor;
          border-right-color: transparent;
          border-radius: 50%;
          animation: spin 0.75s linear infinite;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
};

// ------------------------------------------------
// SUBCOMPONENTES
// ------------------------------------------------
const ProjectList = ({ projects, evaluationStatus, startEvaluation, evaluations }) => (
  <div>
    <h2 className="text-xl font-bold text-gray-700 mb-4">
      Proyectos Asignados ({projects.length})
    </h2>
    <div className="space-y-3">
      {projects.map((project) => {
        const status = evaluationStatus[project.id] || 'pending';
        const score = evaluations[project.id]?.totalScore || 0;
        const statusColor =
          status === 'complete'
            ? 'bg-green-100 text-green-800'
            : 'bg-yellow-100 text-yellow-800';
        const buttonText = status === 'complete' ? 'Ver/Editar' : 'Evaluar';

        return (
          <div
            key={project.id}
            className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-gray-50 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition"
          >
            <div className="flex flex-col mb-2 sm:mb-0">
              <span className="font-semibold text-gray-800 text-lg">{project.name}</span>
              <span className="text-sm text-gray-500">Curso: {project.course || 'N/A'}</span>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
              {status === 'complete' && (
                <span className="text-sm font-bold text-green-600 flex items-center">
                  <CheckIcon /> Calificado: {score}/{MAX_JURY_SCORE}
                </span>
              )}
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusColor}`}>
                {status === 'complete' ? 'Completado' : 'Pendiente'}
              </span>
              <button
                onClick={() => startEvaluation(project)}
                className="w-full sm:w-auto px-3 py-1 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition flex items-center justify-center"
              >
                {buttonText} <EditIcon />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

const EvaluationForm = ({
  project,
  currentScores,
  totalScore,
  handleScoreChange,
  handleBack,
  handleConfirm,
  isSaving,
}) => (
  <div className="space-y-6">
    <button
      onClick={handleBack}
      className="text-blue-600 hover:text-blue-800 transition flex items-center text-lg font-semibold mb-4"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="w-5 h-5 mr-1"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="15 18 9 12 15 6" />
      </svg>
      Volver a Proyectos
    </button>

    <div className="bg-green-50 p-4 rounded-xl shadow-inner border border-green-200">
      <h2 className="text-xl font-bold text-green-800">{project.name}</h2>
      <p className="text-sm text-green-600 mt-1">
        <span className="font-semibold mr-2">Curso: {project.course || 'N/A'}</span>|
        Puntaje Total Actual: <span className="text-xl font-extrabold">{totalScore} / {MAX_JURY_SCORE}</span>
      </p>
    </div>

    <h3 className="text-lg font-semibold text-gray-700 border-b pb-2">Criterios de Evaluación</h3>

    <div className="space-y-4">
      {Object.entries(CRITERIA).map(([key, criteria]) => (
        <div key={key} className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-gray-50 p-4 rounded-lg border border-gray-200">
          <div className="flex-1 mr-4 mb-2 sm:mb-0">
            <label className="block text-sm font-medium text-gray-700">
              {criteria.name}
            </label>
            <span className="text-xs text-gray-500">Máx: {criteria.max} puntos.</span>
          </div>
          <div className="w-full sm:w-24">
           <input
                    type="number"
                    value={currentScores[key] === 0 ? '' : currentScores[key] || ''}
                    onChange={(e) => handleScoreChange(key, e.target.value)}
                    onFocus={(e) => e.target.select()} // selecciona el número anterior al enfocar
                    min="0"
                    max={criteria.max}
                    className="w-full border border-gray-300 rounded-lg shadow-sm focus:border-green-500 focus:ring-green-500 text-center py-2 text-lg font-bold text-green-700"
                    disabled={isSaving}
                    />

          </div>
        </div>
      ))}
    </div>

    <button
      onClick={handleConfirm}
      className="w-full py-3 text-lg font-bold text-white bg-green-600 rounded-xl shadow-lg hover:bg-green-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
      disabled={isSaving}
    >
      {isSaving ? 'Guardando Evaluación...' : `Guardar Evaluación Final (${totalScore} / ${MAX_JURY_SCORE})`}
    </button>
  </div>
);

export default JuradoPage;
