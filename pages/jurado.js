import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { db } from "../lib/firebase"; 
import { collection, doc, query, where, getDocs, addDoc, updateDoc, getDoc, arrayRemove, arrayUnion } from "firebase/firestore";

// Definición de los 5 Criterios con sus Ponderaciones Máximas
const CRITERIA = {
    punctuality: { name: "Puntualidad y Presentación", max: 10 },
    exposition: { name: "Exposición del Tema", max: 30 },
    materials: { name: "Materiales/Recursos Didácticos", max: 30 },
    triptych: { name: "Tríptico", max: 20 },
    cleanliness: { name: "Limpieza", max: 10 },
};
const MAX_JURY_SCORE = 100;

// Función de utilidad para dividir un array en lotes (Solución al límite de Firestore)
const chunkArray = (arr, size) => {
    const chunkedArray = [];
    for (let i = 0; i < arr.length; i += size) {
        chunkedArray.push(arr.slice(i, i + size));
    }
    return chunkedArray;
};

// ------------------------------------------------
// DEFINICIONES DE ÍCONOS
// ------------------------------------------------

// Icono de Lápiz (Edit)
const EditIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 ml-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
    </svg>
);

// Icono de Check (Complete)
const CheckIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
    </svg>
);


const JuradoPage = () => {
    const router = useRouter();
    
    // --- NUEVOS ESTADOS PARA EVITAR EL ERROR DE HYDRATION ---
    const [currentUserId, setCurrentUserId] = useState(null);
    const [isSessionChecked, setIsSessionChecked] = useState(false);
    // --------------------------------------------------------
    
    const [userProfile, setUserProfile] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [assignedProjects, setAssignedProjects] = useState([]);
    const [evaluations, setEvaluations] = useState({}); // {projectId: {evaluationData, docId}}
    const [evaluationStatus, setEvaluationStatus] = useState({}); // {projectId: 'pending' | 'complete'}
    const [currentProject, setCurrentProject] = useState(null);
    const [currentScores, setCurrentScores] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [fetchError, setFetchError] = useState(null); 

    // --- EFECTO 1: Comprobar sesión en el cliente (SOLUCIÓN AL ERROR DE HYDRATION) ---
    useEffect(() => {
        const storedUserId = localStorage.getItem('userId');
        if (storedUserId) {
            setCurrentUserId(storedUserId);
        } else {
            // Si no hay sesión, Next.js redirige en el cliente.
            router.push('/login');
        }
        // Indicador crucial: La comprobación de sesión ha finalizado en el cliente.
        setIsSessionChecked(true); 
    }, [router]);

    // FUNCIÓN CRÍTICA CON ALERTAS DE ERROR
    const fetchData = useCallback(async (userId) => {
        setIsLoading(true);
        setFetchError(null); 
        
        let projectIds = [];

        try {
            // 1. Fetch el perfil más reciente del usuario
            const userRef = doc(db, "users", userId); 
            const userSnap = await getDoc(userRef); 

            if (userSnap.exists()) {
                 const latestProfile = { id: userSnap.id, ...userSnap.data() };
                 // FIX CRÍTICO: Aseguramos que assignedProjects es un ARRAY, no un objeto
                 projectIds = Array.isArray(latestProfile.assignedProjects) ? latestProfile.assignedProjects : []; 
                 setUserProfile(latestProfile); 
            } else {
                 console.error("User profile not found in database.");
                 setFetchError("Error: El perfil de usuario no se encontró en la base de datos.");
                 setIsLoading(false);
                 return;
            }
            
            // Chequeo inmediato para evitar el TypeError al iterar un array vacío
            if (projectIds.length === 0) {
                setAssignedProjects([]);
                setEvaluationStatus({});
                setIsLoading(false);
                return;
            }

            // 2. Cargar Proyectos Asignados usando Batching (lotes de 10)
            const projectsRef = collection(db, "projects");
            const projectBatches = chunkArray(projectIds, 10);
            
            const projectPromises = projectBatches.map(batch => {
                const projectsQuery = query(projectsRef, where("__name__", "in", batch));
                return getDocs(projectsQuery);
            });
            
            const projectSnapshots = await Promise.all(projectPromises);
            
            // Aplanar todos los documentos obtenidos de los lotes
            const projectsList = projectSnapshots.flatMap(snapshot =>
                snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }))
            );
            
            // 3. Cargar Evaluaciones Existentes
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
            alert(`¡ERROR CRÍTICO DE LECTURA! Revise la consola (F12). Mensaje: ${error.message}`); 
            
            console.error("Error completo al cargar datos:", error);
            const errorMessage = error.message.includes('index') 
                ? "ERROR DE FIREBASE: Falta un índice. Revise la consola para el link de creación." 
                : "Error de red o permisos. Intente recargar.";
            setFetchError(errorMessage);
            
        } finally {
            setIsLoading(false);
        }
    }, []); // userId ya no es dependencia directa porque se pasa como argumento

    // --- EFECTO 2: Iniciar la carga de datos una vez que la sesión está comprobada ---
    useEffect(() => {
        if (isSessionChecked && currentUserId) {
            fetchData(currentUserId);
        }
    }, [isSessionChecked, currentUserId, fetchData]);


    // Función para calcular el puntaje total
    const calculateTotalScore = (scores) => {
        return Object.keys(CRITERIA).reduce((total, key) => total + (scores[key] || 0), 0);
    };

    // Maneja el cambio de puntaje en un criterio
    const handleScoreChange = (criteriaKey, value) => {
        const numericValue = parseInt(value, 10) || 0;
        const maxScore = CRITERIA[criteriaKey].max;

        setCurrentScores(prev => ({
            ...prev,
            [criteriaKey]: Math.min(Math.max(0, numericValue), maxScore) 
        }));
    };

    // Inicia la edición de un proyecto (o retoma si ya tiene evaluación)
    const startEvaluation = (project) => {
        setCurrentProject(project);
        
        const existingEval = evaluations[project.id];
        
        if (existingEval) {
            // Si ya hay evaluación, carga los scores guardados
            setCurrentScores(existingEval.scores);
        } else {
            // Si no hay evaluación, inicializa a 0
            const initialScores = Object.keys(CRITERIA).reduce((acc, key) => ({ ...acc, [key]: 0 }), {});
            setCurrentScores(initialScores);
        }
    };

    // Maneja el envío de la evaluación
    const handleSubmitEvaluation = async () => {
        if (!currentProject || isSaving || !currentUserId) return;

        setShowConfirm(false);
        setIsSaving(true);
        setFetchError(null);

        const totalScore = calculateTotalScore(currentScores);
        const timestamp = new Date().toISOString();
        
        const evaluationData = {
            judgeId: currentUserId, // Usa currentUserId
            projectId: currentProject.id,
            totalScore,
            scores: currentScores,
            timestamp,
        };
        
        try {
            const existingDocId = evaluations[currentProject.id]?.docId;
            
            if (existingDocId) {
                // Si ya existe, actualiza
                const evalRef = doc(db, "evaluations", existingDocId);
                await updateDoc(evalRef, evaluationData);
                alert(`✅ ¡Evaluación de "${currentProject.name}" actualizada con éxito! Puntaje: ${totalScore}`);
            } else {
                // Si es nueva, crea
                await addDoc(collection(db, "evaluations"), evaluationData);
                alert(`✅ ¡Evaluación de "${currentProject.name}" guardada con éxito! Puntaje: ${totalScore}`);
            }

            // Refrescar datos y estado
            await fetchData(currentUserId); 
            
            setCurrentProject(null); // Volver a la lista
            

        } catch (error) {
            console.error("Error al guardar evaluación:", error);
            alert(`❌ Error al guardar: ${error.message}`);
            setFetchError("Error al guardar la evaluación. Revisa la consola.");
        } finally {
            setIsSaving(false);
        }
    };
    
    // Función para manejar el cierre de sesión
    const handleLogout = () => {
        localStorage.removeItem('userId');
        localStorage.removeItem('role');
        localStorage.removeItem('userData'); // Limpiar todos los datos de sesión
        router.push('/'); // Redirigir a la página principal de login (index.js)
    };

    const totalScore = calculateTotalScore(currentScores);


    // Componente de Confirmación de Envío
    const ConfirmModal = ({ onClose, onConfirm, totalScore, projectName }) => {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-[60] p-4"> {/* Fondo más claro */}
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5 text-center border-t-4 border-blue-500"> {/* Compacto, borde azul */}
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Confirmar Evaluación</h3>
                    <p className="text-sm text-gray-700 mb-3">
                        Estás a punto de guardar la nota del proyecto **{projectName}**.
                    </p>
                    <p className="text-base text-gray-800 mb-4 font-semibold">
                        Puntaje final: <span className="font-extrabold text-2xl text-green-700">{totalScore}</span> / {MAX_JURY_SCORE}.
                    </p>
                    <p className="text-xs text-gray-500 mb-6">
                        ¿Está **seguro** de esta calificación? Este puntaje se utilizará en el cálculo de resultados.
                    </p>
                    <div className="flex justify-center space-x-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition">
                            No, Revisar
                        </button>
                        <button 
                            type="button" 
                            onClick={onConfirm} 
                            className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition"
                        >
                            Sí, Guardar Nota
                        </button>
                    </div>
                </div>
            </div>
        );
    };


    // --- MANEJO DEL RENDERIZADO INICIAL (ANTI-HYDRATION) ---
    // 1. Mostrar un mensaje de carga mientras se verifica el localStorage
    if (!isSessionChecked) {
        return <div className="p-8 text-center text-lg font-medium text-gray-600">Cargando sesión...</div>;
    }
    
    // 2. Si la sesión fue revisada y no se encontró usuario, mostrar mensaje de redirección
    if (!currentUserId) {
        return <div className="p-8 text-center text-lg font-medium text-gray-600">Redirigiendo al login...</div>;
    }
    
    // Si llegamos aquí, currentUserId tiene un valor válido.
    const userId = currentUserId; 
    // --------------------------------------------------------


    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center p-2 sm:p-4">
            
            {showConfirm && <ConfirmModal 
                onClose={() => setShowConfirm(false)} 
                onConfirm={handleSubmitEvaluation} 
                totalScore={totalScore}
                projectName={currentProject.name}
            />}

            {/* --- ENCABEZADO SOLICITADO (Ahora se renderiza solo en el bloque seguro) --- */}
            <header className="w-full max-w-4xl text-center py-4">
                <h1 className="text-2xl font-extrabold text-green-600">EXPOFERIA MULTIDISCIPLINARIA</h1>
                <p className="text-lg font-semibold text-green-700">U. E. JOSÉ BALLIVIÁN - A</p>
            </header>
            
            <div className="w-full max-w-4xl bg-white shadow-xl rounded-2xl p-4 sm:p-8 mt-4">
                
                {/* Header Responsivo */}
                <div className="flex justify-between items-center border-b pb-4 mb-6">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-extrabold text-gray-800">
                            Panel de Evaluación
                        </h1>
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
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4 text-sm" role="alert">
                        <strong className="font-bold">¡Error!</strong>
                        <span className="block sm:inline"> {fetchError}</span>
                    </div>
                )}


                {/* Contenido Principal */}
                {isLoading ? (
                    <div className="text-center py-10">
                        <div className="spinner-border animate-spin inline-block w-8 h-8 border-4 rounded-full border-green-500 border-r-transparent" role="status"></div>
                        <p className="text-lg text-gray-600 mt-3">Cargando proyectos asignados...Si tarda mucho, verifica tu conexión a internet o recarga la página.</p>
                    </div>
                ) : assignedProjects.length === 0 ? (
                    <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                        <p className="text-xl font-semibold text-gray-500">👋 No hay proyectos asignados.</p>
                        <p className="text-sm text-gray-400 mt-2">Espera la asignación del administrador.</p>
                    </div>
                ) : currentProject ? (
                    // Vista de Evaluación
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
                    // Lista de Proyectos
                    <ProjectList 
                        projects={assignedProjects} 
                        evaluationStatus={evaluationStatus}
                        startEvaluation={startEvaluation} 
                        evaluations={evaluations}
                    />
                )}
            </div>

            {/* Estilo para el Spinner */}
            <style jsx global>{`
                .spinner-border {
                    display: inline-block;
                    width: 2rem;
                    height: 2rem;
                    vertical-align: -0.125em;
                    border: 0.25em solid currentColor;
                    border-right-color: transparent;
                    border-radius: 50%;
                    -webkit-animation: .75s linear infinite spinner-border;
                    animation: .75s linear infinite spinner-border;
                }
                @keyframes spinner-border {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};

// Componente para la lista de proyectos
const ProjectList = ({ projects, evaluationStatus, startEvaluation, evaluations }) => {
    return (
        <div>
            <h2 className="text-xl font-bold text-gray-700 mb-4">Proyectos Asignados ({projects.length})</h2>
            <div className="space-y-3">
                {projects.map((project) => {
                    const status = evaluationStatus[project.id] || 'pending';
                    const score = evaluations[project.id]?.totalScore || 0;
                    const statusColor = status === 'complete' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800';
                    const buttonText = status === 'complete' ? 'Ver/Editar' : 'Evaluar';

                    return (
                        <div key={project.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-gray-50 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition duration-200">
                            <div className="flex flex-col mb-2 sm:mb-0">
                                <span className="font-semibold text-gray-800 text-lg">{project.name}</span>
                                {/* MODIFICADO: Muestra el nombre del curso */}
                                <span className="text-sm text-gray-500">Curso: {project.course || 'N/A'}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 w-full sm:w-auto">
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
};

// Componente para el formulario de evaluación
const EvaluationForm = ({ project, currentScores, totalScore, handleScoreChange, handleBack, handleConfirm, isSaving }) => {
    return (
        <div className="space-y-6">
            {/* MODIFICADO: Botón más grande (text-lg) y con ícono más grande (w-5 h-5) */}
            <button 
                onClick={handleBack} 
                className="text-blue-600 hover:text-blue-800 transition flex items-center text-lg font-semibold mb-4"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                Volver a Proyectos
            </button>

            {/* Encabezado de Evaluación (Muestra el Curso) */}
            <div className="bg-green-50 p-4 rounded-xl shadow-inner border border-green-200">
                <h2 className="text-xl font-bold text-green-800">{project.name}</h2>
                <p className="text-sm text-green-600 mt-1">
                    <span className="font-semibold mr-2">Curso: {project.course || 'N/A'}</span>|
                    Puntaje Total Actual: <span className="text-xl font-extrabold">{totalScore} / {MAX_JURY_SCORE}</span>
                </p>
            </div>

            <h3 className='text-lg font-semibold text-gray-700 border-b pb-2'>Criterios de Evaluación</h3>

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
                                value={currentScores[key] || 0}
                                onChange={(e) => handleScoreChange(key, e.target.value)}
                                min="0"
                                max={criteria.max}
                                
                                className="w-full border border-gray-300 rounded-lg shadow-sm focus:border-green-500 focus:ring-green-500 text-center py-2 text-lg font-bold text-black"
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
};

export default JuradoPage;