import { useState, useEffect, useCallback } from 'react';
import { db } from "../lib/firebase"; 
import { collection, getDocs } from "firebase/firestore";

// --- CONSTANTES DE CÁLCULO Y ORDEN ---

const MAX_BASE_SCORE = 100; 
const MAX_SCALED_SCORE = 5.0; // Puntuación máxima individual (Profesor O Jurado)
const SCALING_FACTOR = MAX_SCALED_SCORE / MAX_BASE_SCORE; 

// ESTRUCTURA PARA AGRUPAR POR PREFIJO (p.ej., "PRIMERO A" -> "PRIMEROS")
const COURSE_PREFIXES = [
    { prefix: 'PRIMER', group: 'PRIMEROS' },
    { prefix: 'SEGUND', group: 'SEGUNDOS' },
    { prefix: 'TERCER', group: 'TERCEROS' },
    { prefix: 'CUART', group: 'CUARTOS' },
    { prefix: 'QUINT', group: 'QUINTOS' },
    { prefix: 'SEXT', group: 'SEXTOS' },
];

// La lista de orden final basada en los grupos definidos
const COURSE_ORDER = COURSE_PREFIXES.map(c => c.group);


// --- ÍCONOS ---
const xIcon = <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>;
const schoolIcon = <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M12 14l9-5-9-5-9 5 9 5z" /><path d="M12 14l9-5-9-5-9 5 9 5z" /><path d="M12 19l9-5-9-5-9 5 9 5z" /><path d="M12 24l9-5-9-5-9 5 9 5z" /></svg>;
const userIcon = <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>;
const themeIcon = <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
const backIcon = <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>;


/**
 * Función de utilidad para determinar el grupo de curso basado en el prefijo.
 */
const getCourseGroup = (rawCourseName) => {
    if (!rawCourseName) return 'OTROS';

    const normalizedName = rawCourseName.toUpperCase();

    for (const item of COURSE_PREFIXES) {
        if (normalizedName.startsWith(item.prefix)) {
            return item.group;
        }
    }
    return 'OTROS';
};


/**
 * Lógica de Consolidación de Datos
 */
const consolidateData = (projectsList, evaluationsList, juradoMap) => {
    const resultsMap = projectsList.map(project => {
        const projectEvaluations = evaluationsList.filter(e => e.projectId === project.id);
        
        const rawJuryScores = projectEvaluations.map(e => ({
            score: e.totalScore || 0,
            juradoName: juradoMap[e.judgeId] || 'Jurado Desconocido' 
        }));
        
        const totalScoreSum = rawJuryScores.reduce((sum, e) => sum + e.score, 0);
        const rawAverageJuryScore = projectEvaluations.length > 0 ? totalScoreSum / projectEvaluations.length : 0;
        
        const internalGrade = project.internalGrade !== undefined && project.internalGrade !== null 
            ? parseFloat(project.internalGrade) 
            : 0;
        
        let scaledInternalGrade = internalGrade * SCALING_FACTOR;
        let scaledAverageJuryScore = rawAverageJuryScore * SCALING_FACTOR;
        
        return {
            projectId: project.id,
            rawInternalGrade: internalGrade, 
            scaledInternalGrade: scaledInternalGrade, 
            rawAverageJuryScore: rawAverageJuryScore, 
            scaledAverageJuryScore: scaledAverageJuryScore, 
            juradoEvaluations: rawJuryScores, 
            numEvaluations: projectEvaluations.length,
            projectDetails: project,
        };
    });
    
    // --- AGRUPAMIENTO POR PREFIJO ---
    const groupedResults = resultsMap.reduce((acc, result) => {
        const rawCourseName = result.projectDetails.course;
        const course = getCourseGroup(rawCourseName); 
        
        if (!acc[course]) {
            acc[course] = [];
        }
        acc[course].push(result);
        return acc;
    }, {});
    
    // Se impone el orden estricto de la constante COURSE_ORDER
    const orderedGroups = COURSE_ORDER.reduce((arr, courseName) => {
        if (groupedResults[courseName]) {
            arr.push({ course: courseName, results: groupedResults[courseName] });
            delete groupedResults[courseName];
        }
        return arr;
    }, []);

    // Agregar cualquier grupo 'OTROS' al final
    if (groupedResults['OTROS']) {
        orderedGroups.push({ course: 'OTROS', results: groupedResults['OTROS'] });
        delete groupedResults['OTROS']; 
    }

    Object.keys(groupedResults).forEach(course => {
        orderedGroups.push({ course: course, results: groupedResults[course] }); 
    });

    return orderedGroups;
};


// -----------------------------------------------------
// COMPONENTE: TARJETA DE PROYECTO INDIVIDUAL
// -----------------------------------------------------

/**
 * Muestra los detalles de un solo proyecto con sus notas.
 */
const ProjectDetailsCard = ({ result }) => {
    const project = result.projectDetails;

    return (
        <div className={`bg-white p-3 border-l-4 border-gray-300 rounded-lg shadow-md`}>
            
            <div className='flex justify-center items-center pb-2 border-b'>
                <span className='text-sm font-black text-green-700 text-center'>
                    EXPOFERIA MULTI DISCIPLINARIA 2025
                </span>
            </div>

            <div className="pt-2 pb-2 mb-3">
                <div className="text-xs font-semibold uppercase text-gray-500">TEMA</div>
                <div className="text-base font-bold text-gray-800 line-clamp-2 flex items-start mb-1">
                    {themeIcon}
                    {project.name}
                </div>
                <div className="text-xs font-semibold uppercase text-gray-500 mb-1">ASESOR(ES)</div>
                <div className="text-sm text-gray-700 flex items-center">
                    {userIcon}
                    {project.advisors || 'No asignado'}
                </div>
            </div>

            {/* Notas Ponderadas Separadas (Redondeadas a Entero) */}
            <div className='grid grid-cols-2 gap-3 mb-4 border-t pt-3'>
                
                {/* Nota Profesor */}
                <div className="p-2 bg-blue-50 border border-blue-200 rounded-lg text-center shadow-inner">
                    <div className="text-xs font-semibold uppercase text-blue-700 mb-1">Nota Asesor (Decidir)</div>
                    {result.rawInternalGrade > 0 ? (
                        <>
                            <div className="text-3xl font-black text-blue-900">
                                {/* MODIFICACIÓN: Usar toFixed(0) para asegurar formato entero */}
                                {result.scaledInternalGrade.toFixed(0)} 
                            </div>
                        </>
                    ) : (
                        <div className="text-sm font-bold text-gray-400 py-1">Pendiente</div>
                    )}
                </div>

                {/* Nota Jurado */}
                <div className="p-2 bg-green-50 border border-green-200 rounded-lg text-center shadow-inner">
                    <div className="text-xs font-semibold uppercase text-green-700 mb-1">Nota Jurado </div>
                    {result.numEvaluations > 0 ? (
                        <>
                            <div className="text-3xl font-black text-green-900">
                                {/* MODIFICACIÓN: Usar toFixed(0) para asegurar formato entero */}
                                {result.scaledAverageJuryScore.toFixed(0)}
                            </div>
                        </>
                    ) : (
                        <div className="text-sm font-bold text-gray-400 py-1">Sin Jurado</div>
                    )}
                </div>
            </div>
            
            {/* LISTA DE JURADOS INDIVIDUALES */}
            <div className='pt-3 border-t border-gray-100'>
                <h5 className="font-black text-gray-800 mb-2 text-sm flex items-center">
                    Detalle de Notas Individuales del Jurado ({result.juradoEvaluations.length})
                </h5>
                {result.juradoEvaluations.length > 0 ? (
                    <ul className="space-y-1">
                        {result.juradoEvaluations.map((evaluacion, idx) => (
                            <li key={idx} className="flex justify-between items-center text-xs p-2 bg-gray-100 rounded-md">
                                <span className="font-medium text-gray-800 flex items-center">
                                    {userIcon} <span className='font-bold'>{evaluacion.juradoName}</span>
                                </span>
                                <span className="text-sm font-black text-green-700">
                                    {Math.round(evaluacion.score)} / 100
                                </span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-xs text-gray-500 italic p-2 bg-gray-100 rounded-lg">Este proyecto aún no ha sido evaluado.</p>
                )}
            </div>
            
            {/* ALUMNOS NO TRABAJARON (Separar por comas en líneas nuevas) */}
            {project.description && (
                <div className="mt-4 p-2 bg-red-50 border border-red-200 rounded-md">
                    <span className="text-xs font-black text-red-700 block">OBSERVACIONES:</span>
                    <div className="text-sm text-gray-700 mt-1">
                        {/* Divide la cadena por comas, elimina espacios y muestra cada nombre en una línea separada */}
                        {project.description.split(',').map((student, index) => (
                            <span key={index} className="block">
                                {student.trim()}
                            </span>
                        ))}
                    </div>
                </div>
            )}

        </div>
    );
};


// -----------------------------------------------------
// COMPONENTE PRINCIPAL: MODAL
// -----------------------------------------------------

const ProjectModal = ({ isOpen, onClose, courseName, results }) => {
    const [selectedSection, setSelectedSection] = useState(null); 
    
    if (!isOpen) return null;

    // LÓGICA DE SUB-AGRUPAMIENTO POR SECCIÓN (ej. PRIMERO A, PRIMERO B)
    const subGroupedResults = results.reduce((acc, result) => {
        const sectionName = result.projectDetails.course || 'Sin Sección'; 
        if (!acc[sectionName]) {
            acc[sectionName] = [];
        }
        acc[sectionName].push(result);
        return acc;
    }, {});

    const sectionNames = Object.keys(subGroupedResults).sort((a, b) => a.localeCompare(b));
    
    const currentProjects = selectedSection ? subGroupedResults[selectedSection] : null;

    const modalTitle = selectedSection 
        ? `${courseName} - GRADO: ${selectedSection.toUpperCase()}`
        : `${courseName} - SELECCIONAR CURSO`;

    const renderContent = () => {
        // VISTA 2: Lista de Proyectos de una Sección específica
        if (selectedSection && currentProjects) {
            return (
                <div className="p-3 sm:p-4 space-y-4">
                    <button 
                        onClick={() => setSelectedSection(null)} 
                        className="flex items-center text-sm font-semibold text-gray-600 hover:text-green-700 transition mb-3"
                    >
                        {backIcon} Volver a Cursos
                    </button>
                    <div className="space-y-4 sm:space-y-6">
                        {currentProjects.map((result, index) => (
                            <ProjectDetailsCard key={result.projectId} result={result} />
                        ))}
                    </div>
                </div>
            );
        }

        // VISTA 1: Selector de Secciones (Default)
        return (
            <div className="p-3 sm:p-4 space-y-3">
                <h4 className='text-sm font-black text-gray-700 mb-3'>Selecciona un curso para ver los resultados:</h4>
                {sectionNames.length > 0 ? (
                    sectionNames.map(sectionName => (
                        <div 
                            key={sectionName}
                            onClick={() => setSelectedSection(sectionName)}
                            className="bg-gray-50 p-4 border-l-4 border-green-500 rounded-lg shadow-md cursor-pointer transition hover:bg-green-100 hover:border-green-700"
                        >
                            <h4 className="text-lg font-black text-gray-800">
                                {sectionName.toUpperCase()}
                            </h4>
                            <p className="text-sm text-gray-600 mt-1">
                                {subGroupedResults[sectionName].length} Proyecto
                            </p>
                        </div>
                    ))
                ) : (
                    <p className="p-4 text-center text-gray-500 bg-white rounded-lg border">No hay secciones con proyectos registrados.</p>
                )}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 z-50 overflow-y-auto p-2 sm:p-4 flex items-start justify-center">
            
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md my-4 sm:my-8 transform transition-all duration-300 max-h-[90vh] overflow-y-auto"> 
                
                {/* Encabezado del Modal (STICKY top-0) */}
                <div className="p-4 bg-green-700 text-white rounded-t-xl sticky top-0 z-10">
                    <h3 className="text-base font-bold text-green-200 text-center">{modalTitle}</h3>
                    <button onClick={onClose} className="absolute top-3 right-3 text-green-200 hover:text-white transition">
                        {xIcon}
                    </button>
                </div>
                
                {/* Contenido del Modal (Selector o Proyectos) */}
                {renderContent()}

            </div>
        </div>
    );
};


// -----------------------------------------------------
// COMPONENTE: TARJETA DE GRUPO PRINCIPAL
// -----------------------------------------------------

const CourseCard = ({ courseName, results, onCourseClick }) => {
    const totalProjects = results.length;

    return (
        <div 
            onClick={() => onCourseClick(courseName, results)} 
            className="bg-white rounded-xl shadow-lg p-4 border-t-8 border-green-600 cursor-pointer transition transform hover:scale-[1.02] active:scale-[0.98]"
        >
            <div className="flex justify-between items-start">
                <div className='flex items-center'>
                    <div className="bg-green-600 p-2 rounded-full mr-3">{schoolIcon}</div>
                    <h3 className="text-xl font-black text-gray-800">{courseName}</h3>
                </div>
                <span className="text-lg font-extrabold text-green-600 bg-green-100 px-3 py-1 rounded-full">{totalProjects}</span> 
            </div>
            
            <p className="mt-4 text-xs text-green-500 font-semibold text-center uppercase border-t pt-3">Toca para ver los Cursos</p>
        </div>
    );
};


// -----------------------------------------------------
// PÁGINA PRINCIPAL
// -----------------------------------------------------
const ProfessorResultsPage = () => {
    const [orderedGroups, setOrderedGroups] = useState([]); 
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalData, setModalData] = useState({ course: '', results: [] });

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setModalData({ course: '', results: [] });
        if (window.location.hash) {
            // Se usa replaceState para limpiar el hash sin crear una nueva entrada de historial.
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    };

    const handleCourseClick = (courseName, results) => {
        setModalData({ course: courseName, results: results });
        setIsModalOpen(true);
        window.history.pushState({ modalOpen: true }, '', `#${courseName}`);
    };
    
    // *** MODIFICACIÓN APLICADA: MANEJO DEL SCROLL DEL BODY ***
    useEffect(() => {
        if (isModalOpen) {
            // Deshabilita el scroll del cuerpo cuando el modal está abierto
            document.body.style.overflow = 'hidden';
        } else {
            // Restaura el scroll cuando el modal está cerrado
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isModalOpen]);


    // Manejo del botón de retroceso del navegador
    useEffect(() => {
        const handlePopState = () => {
            if (isModalOpen) {
                handleCloseModal();
            }
        };

        window.addEventListener('popstate', handlePopState);
        
        return () => {
            window.removeEventListener('popstate', handlePopState);
        };
    }, [isModalOpen]); 


    // *** DEFINICIÓN DE FETCHDATA ***
    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [projectsSnapshot, evaluationsSnapshot, usersSnapshot] = await Promise.all([
                getDocs(collection(db, "projects")),
                getDocs(collection(db, "evaluations")),
                getDocs(collection(db, "users")), 
            ]);

            const projectsList = projectsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const evaluationsList = evaluationsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            const juradoMap = usersSnapshot.docs.reduce((map, doc) => {
                const data = doc.data();
                const name = data.name || data.username;
                map[doc.id] = name || 'Jurado Sin Nombre'; 
                return map;
            }, {});
            
            const results = consolidateData(projectsList, evaluationsList, juradoMap);
            setOrderedGroups(results);

        } catch (err) {
            console.error("Error fetching data:", err);
            if (err.message && err.message.includes('permission denied')) {
                 setError("Error de permisos. Asegúrese de tener reglas de seguridad correctas en Firestore.");
            } else {
                 setError("Error al cargar los datos. Intente recargar.");
            }
        } finally {
            setIsLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); 

    // *** LLAMADA DE FETCHDATA ***
    useEffect(() => {
        fetchData();
    }, [fetchData]);
    // *****************************
    

    return (
        <div className="min-h-screen bg-gray-100 p-2 max-w-6xl mx-auto"> 
            {/* MODIFICACIÓN: Header ajustado y centrado */}
            <header className="py-4 bg-green-700 shadow-xl mb-4 rounded-lg">
                <div className="max-w-6xl mx-auto text-white text-center">
                    <h2 className="text-sm font-light text-green-200">UNIDAD EDUCATIVA JOSÉ BALLIVIÁN A</h2>
                    <h1 className="text-xl font-black mt-1">RESULTADOS EXPOFERIA MULTIDISCIPLINARIA 2025</h1>
                </div>
            </header>

            <div className="max-w-6xl mx-auto">
                {isLoading && (
                    <div className="text-center p-6 bg-white rounded-lg shadow-md font-semibold text-base">
                        Cargando resultados...
                    </div>
                )}
                
                {error && (
                    <div className="text-center p-3 bg-red-100 border-2 border-red-500 text-red-700 rounded-lg font-bold shadow-md text-sm">
                        {error}
                    </div>
                )}

                {!isLoading && !error && (
                    <>
                        {orderedGroups.length === 0 ? (
                            <p className="mt-4 p-4 text-center text-gray-500 bg-white rounded-lg shadow-md font-medium">
                                No hay proyectos o cursos registrados.
                            </p>
                        ) : (
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                {orderedGroups.map(group => (
                                    <CourseCard
                                        key={group.course}
                                        courseName={group.course}
                                        results={group.results}
                                        onCourseClick={handleCourseClick}
                                    />
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* MODIFICACIÓN: Usar modalData.course como key para forzar reinicio de estado interno */}
            <ProjectModal
                key={modalData.course} 
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                courseName={modalData.course}
                results={modalData.results}
            />
        </div>
    );
};

export default ProfessorResultsPage;