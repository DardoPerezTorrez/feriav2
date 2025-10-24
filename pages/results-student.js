import { useState, useEffect, useCallback } from 'react';
import { db } from "../lib/firebase"; 
import { collection, getDocs } from "firebase/firestore";

// Definición de íconos
const reportIcon = <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-green-600 mr-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;

// **IMPORTANTE:** Definición del orden de los cursos, basada en el campo 'course'
const COURSE_ORDER = ["Primeros", "Segundos", "Terceros", "Cuartos", "Quintos", "Sextos"];

// --- LÓGICA DE CONSOLIDACIÓN Y AGRUPACIÓN ---
const consolidateData = (projectsList, evaluationsList) => {
    const resultsMap = projectsList.map(project => {
        // Filtrar evaluaciones para este proyecto
        const projectEvaluations = evaluationsList.filter(e => e.projectId === project.id);
        
        // Sumar los puntajes del jurado
        const totalScoreSum = projectEvaluations.reduce((sum, e) => sum + (e.totalScore || 0), 0);
        
        // Calcular el promedio del jurado
        const averageJuryScore = projectEvaluations.length > 0 ? totalScoreSum / projectEvaluations.length : 0;
        
        return {
            projectId: project.id,
            averageJuryScore: averageJuryScore,
            numEvaluations: projectEvaluations.length,
            projectDetails: project, 
        };
    });
    
    // Omitir proyectos sin evaluación
    const evaluatedResults = resultsMap.filter(res => res.numEvaluations > 0);
    
    return evaluatedResults;
};

// Función para agrupar y ordenar los resultados por el campo 'course'
const groupAndSortByCourse = (results) => {
    const grouped = {};
    
    results.forEach(result => {
        // Se usa el campo 'course' de projectDetails, confirmado por el usuario
        const course = result.projectDetails.course || 'Sin Curso'; 
        if (!grouped[course]) {
            grouped[course] = [];
        }
        grouped[course].push(result);
    });
    
    // 1. Ordenar cada grupo por puntaje promedio descendente
    Object.keys(grouped).forEach(course => {
        grouped[course].sort((a, b) => b.averageJuryScore - a.averageJuryScore);
    });
    
    // 2. Convertir el objeto de grupos en un array ordenado por el orden predefinido (COURSE_ORDER)
    const orderedGroups = COURSE_ORDER
        .filter(course => grouped[course]) 
        .map(course => ({
            courseName: course,
            results: grouped[course]
        }));
        
    // 3. Añadir cualquier curso no definido al final
    if (grouped['Sin Curso']) {
        orderedGroups.push({ courseName: 'Sin Curso', results: grouped['Sin Curso'] });
    }

    return orderedGroups;
};


const StudentResultsPage = () => {
    const [groupedResults, setGroupedResults] = useState([]); 
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            // 1. Fetch All Data (Proyectos y Evaluaciones)
            const [projectsSnapshot, evaluationsSnapshot] = await Promise.all([
                getDocs(collection(db, "projects")),
                getDocs(collection(db, "evaluations")),
            ]);

            const projectsList = projectsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const evaluationsList = evaluationsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // 2. Consolidar, calcular promedio y agrupar por curso
            const consolidated = consolidateData(projectsList, evaluationsList);
            const grouped = groupAndSortByCourse(consolidated);
            
            setGroupedResults(grouped);

        } catch (err) {
            console.error("Error fetching data:", err);
            setError("Error al cargar los datos. Intente más tarde.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);
    

    const renderTable = (results) => (
         <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
                <tr>
                    <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Rank</th> 
                    <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Proyecto / Asesores</th>
                    <th className="px-3 py-2 text-center text-xs font-bold text-gray-600 uppercase tracking-wider"># Jurados</th>
                    <th className="px-3 py-2 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">Promedio / 100</th>
                </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
                {results.map((result, index) => {
                    const project = result.projectDetails;
                    const isEvaluated = result.numEvaluations > 0;
                    
                    return (
                        <tr key={result.projectId} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50 hover:bg-green-50'}>
                            <td className="px-3 py-3 whitespace-nowrap text-md font-bold text-green-700">
                                {index + 1}°
                            </td>
                            <td className="px-3 py-3 max-w-xs">
                                <div className="font-semibold text-gray-900 text-sm">{project.name}</div>
                                <div className="text-xs text-gray-500">Asesores: {project.advisors || 'N/A'}</div>
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap text-sm text-center font-semibold text-gray-700">
                                {result.numEvaluations}
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap text-lg font-extrabold text-center">
                                {isEvaluated ? (
                                    <span className="text-green-600">
                                        {result.averageJuryScore.toFixed(2)}
                                    </span>
                                ) : (
                                    <span className="text-yellow-600">
                                        N/A
                                    </span>
                                )}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
    
    const renderCardView = (results) => (
        <div className="space-y-3">
            {results.map((result, index) => {
                const project = result.projectDetails;
                const isEvaluated = result.numEvaluations > 0;
                
                return (
                    <div 
                        key={result.projectId} 
                        className="p-3 bg-white rounded-lg shadow-md border-l-4 border-green-600"
                    >
                        <div className="flex justify-between items-center mb-1 pb-1 border-b border-gray-100">
                            <span className="text-xl font-extrabold text-green-700">{index + 1}° Puesto</span>
                            <span className="text-sm font-medium text-gray-500">
                                {result.numEvaluations} Jurados
                            </span>
                        </div>
                        <div className="font-bold text-gray-900 text-sm mb-1">{project.name}</div>
                        <div className="text-xs text-gray-500 mb-2">Asesores: {project.advisors || 'N/A'}</div>
                        <div className="text-right">
                            <span className="text-sm font-semibold text-gray-700">Nota Promedio: </span>
                            <span className="text-xl font-extrabold ml-1">
                                {isEvaluated ? (
                                    <span className="text-green-600">{result.averageJuryScore.toFixed(2)}</span>
                                ) : (
                                    <span className="text-yellow-600">N/A</span>
                                )}
                                <span className="text-sm text-gray-500">/100</span>
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );


    return (
        <div className="min-h-screen bg-gray-50 p-2 sm:p-4"> 
            
            {/* --- HEADER COMPACTO --- */}
            <header className="py-4 bg-green-700 shadow-lg mb-4 rounded-xl"> 
                <div className="max-w-4xl mx-auto text-white text-center p-2">
                    <h1 className="text-2xl sm:text-3xl font-extrabold mb-1">Resultados Públicos de la Feria</h1>
                    <p className="text-sm sm:text-lg font-light">Ranking de Proyectos por Puntuación del Jurado</p>
                </div>
            </header>

            <div className="max-w-4xl mx-auto p-2 sm:p-0">
                {isLoading && (
                    <div className="text-center p-10 bg-white rounded-lg shadow-md">
                        Cargando resultados...
                    </div>
                )}
                
                {error && (
                    <div className="text-center p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
                        {error}
                    </div>
                )}

                {!isLoading && !error && (
                    <div className="space-y-8"> {/* Espaciado entre grupos de cursos */}
                        {groupedResults.map((group) => (
                            <div key={group.courseName} className="bg-white shadow-xl rounded-xl overflow-hidden border border-gray-200">
                                <h2 className="text-xl sm:text-2xl font-extrabold text-white bg-blue-600 p-3 sm:p-4 text-center">
                                    {group.courseName}
                                </h2>
                                
                                {/* Vista de Escritorio (Tabla) */}
                                <div className="hidden sm:block p-4">
                                    {renderTable(group.results)}
                                </div>
                                
                                {/* Vista de Celular (Tarjetas) */}
                                <div className="sm:hidden p-3">
                                    {renderCardView(group.results)}
                                </div>
                            </div>
                        ))}

                        {groupedResults.length === 0 && (
                            <p className="mt-8 p-4 text-center text-gray-500 bg-white rounded-lg shadow-md">No hay proyectos con evaluaciones registradas aún.</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default StudentResultsPage;