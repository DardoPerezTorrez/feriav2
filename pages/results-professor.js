import { useState, useEffect, useCallback } from 'react';
import { db } from "../lib/firebase"; 
import { collection, getDocs } from "firebase/firestore";

// --- CONSTANTES DE CÁLCULO Y AGRUPACIÓN ---

// La suma máxima de Nota Profesor (100) + Nota Jurado (100) es 200.
// Ese total de 200 puntos debe equivaler a una Nota Final de 5.0.
const MAX_TOTAL_SCORE = 200;
const MAX_FINAL_GRADE = 5.0;

// Factor de Conversión: 5 / 200 = 0.025
const CONVERSION_FACTOR = MAX_FINAL_GRADE / MAX_TOTAL_SCORE; // 0.025

// Orden de los Cursos Requeridos para la Agrupación
const COURSE_ORDER = ['PRIMEROS', 'SEGUNDOS', 'TERCEROS', 'CUARTOS', 'QUINTOS', 'SEXTOS'];

// Definición de íconos
const formulaIcon = <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-indigo-600 mr-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 19l-7-7 7-7"/><path d="M12 20h8"/><path d="M18 10V4"/></svg>;


// --- LÓGICA DE CONSOLIDACIÓN CON FÓRMULA FINAL (5.0 / 200) ---
const consolidateData = (projectsList, evaluationsList) => {
    const resultsMap = projectsList.map(project => {
        const projectEvaluations = evaluationsList.filter(e => e.projectId === project.id);
        const totalScoreSum = projectEvaluations.reduce((sum, e) => sum + (e.totalScore || 0), 0);
        
        // El promedio del jurado es sobre 100
        const averageJuryScore = projectEvaluations.length > 0 ? totalScoreSum / projectEvaluations.length : 0;
        
        // La nota interna del profesor es sobre 100 (se asume 0 si es undefined/null)
        const internalGrade = project.internalGrade !== undefined ? parseFloat(project.internalGrade) : 0;
        
        // Suma total de puntos (Max 200)
        const totalPoints = internalGrade + averageJuryScore;

        // CÁLCULO DE LA NOTA FINAL (Escala 5.0 / 200)
        let finalGrade = 0;
        const hasInternalGrade = internalGrade > 0;
        const isJuryEvaluated = projectEvaluations.length > 0;
        
        // Se requiere ambas notas para el cálculo, si no, se deja en 0 (N/A)
        if (hasInternalGrade && isJuryEvaluated) {
             finalGrade = totalPoints * CONVERSION_FACTOR;
             // Aseguramos que no exceda 5.0 debido a posibles redondeos de jurados
             if (finalGrade > MAX_FINAL_GRADE) finalGrade = MAX_FINAL_GRADE; 
        }

        return {
            projectId: project.id,
            internalGrade: internalGrade,
            averageJuryScore: averageJuryScore,
            numEvaluations: projectEvaluations.length,
            totalPoints: totalPoints, // Total de puntos (Max 200)
            finalGrade: finalGrade, // Nota final (Max 5.0)
            projectDetails: project,
        };
    });
    
    // --- AGRUPAMIENTO POR CURSO Y ORDEN ESPECÍFICO ---
    const groupedResults = resultsMap.reduce((acc, result) => {
        const course = result.projectDetails.course?.toUpperCase() || 'OTROS';
        if (!acc[course]) {
            acc[course] = [];
        }
        acc[course].push(result);
        return acc;
    }, {});
    
    // Ordenar los proyectos dentro de cada grupo por Nota Final descendente
    Object.keys(groupedResults).forEach(course => {
        groupedResults[course].sort((a, b) => b.finalGrade - a.finalGrade);
    });

    // Crear el orden final de grupos
    const orderedGroups = COURSE_ORDER.reduce((arr, courseName) => {
        if (groupedResults[courseName]) {
            arr.push({ course: courseName, results: groupedResults[courseName] });
            delete groupedResults[courseName];
        }
        return arr;
    }, []);

    // Agregar cualquier grupo 'OTROS' al final
    if (Object.keys(groupedResults).length > 0) {
        Object.keys(groupedResults).forEach(course => {
            orderedGroups.push({ course: course, results: groupedResults[course] });
        });
    }

    return orderedGroups;
};


const ProfessorResultsPage = () => {
    const [orderedGroups, setOrderedGroups] = useState([]); 
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [projectsSnapshot, evaluationsSnapshot] = await Promise.all([
                getDocs(collection(db, "projects")),
                getDocs(collection(db, "evaluations")),
            ]);

            const projectsList = projectsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const evaluationsList = evaluationsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            const results = consolidateData(projectsList, evaluationsList);
            setOrderedGroups(results);

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
    

    // Componente para renderizar la tabla de resultados de un curso específico
    const CourseResultsTable = ({ courseName, results }) => (
        <div className="mb-10">
            <h3 className="text-xl font-extrabold text-gray-800 mb-4 p-3 bg-indigo-50 border-b-4 border-indigo-300 rounded-t-lg">
                {courseName} ({results.length} proyectos)
            </h3>
            <div className="bg-white shadow-xl rounded-b-xl overflow-hidden border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Proyecto / Asesores</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">Nota Prof. (Max 100)</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">Prom. Jurado (Max 100)</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">Total Puntos (Max 200)</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">Nota Final (Max 5.0)</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">Estado</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                        {results.map((result) => {
                            const project = result.projectDetails;
                            const hasInternalGrade = result.internalGrade > 0;
                            const isJuryEvaluated = result.numEvaluations > 0;
                            const finalGradeCalculated = result.finalGrade > 0;
                            
                            let status = "Cálculo pendiente";
                            let statusClass = "text-yellow-600 bg-yellow-100";
                            
                            if (finalGradeCalculated) {
                                status = "Finalizada";
                                statusClass = "text-green-600 bg-green-100";
                            } else if (hasInternalGrade && !isJuryEvaluated) {
                                status = "Falta Jurado";
                                statusClass = "text-orange-600 bg-orange-100";
                            } else if (!hasInternalGrade && isJuryEvaluated) {
                                status = "Falta Nota Prof.";
                                statusClass = "text-red-600 bg-red-100";
                            }

                            return (
                                <tr key={result.projectId} className="hover:bg-gray-50">
                                    <td className="px-4 py-4 max-w-sm">
                                        <div className="font-semibold text-gray-900">{project.name}</div>
                                        <div className="text-xs text-gray-500">Asesores: {project.advisors || 'N/A'}</div>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-md font-bold text-center">
                                        <span className={hasInternalGrade ? 'text-blue-700' : 'text-gray-400'}>
                                            {result.internalGrade.toFixed(2)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-md font-bold text-center">
                                        <span className={isJuryEvaluated ? 'text-green-700' : 'text-gray-400'}>
                                            {result.averageJuryScore.toFixed(2)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-md font-bold text-center">
                                         {finalGradeCalculated || hasInternalGrade || isJuryEvaluated ? (
                                            <span className="text-gray-900">
                                                {result.totalPoints.toFixed(2)}
                                            </span>
                                        ) : (
                                            <span className="text-gray-400">N/A</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-2xl font-extrabold text-center">
                                        {finalGradeCalculated ? (
                                            <span className="text-indigo-600">
                                                {result.finalGrade.toFixed(2)}
                                            </span>
                                        ) : (
                                            <span className="text-gray-400">
                                                N/A
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-center">
                                        <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}`}>
                                            {status}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );


    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
            <header className="py-8 bg-indigo-700 shadow-lg mb-6 rounded-xl">
                <div className="max-w-6xl mx-auto text-white text-center">
                    <h1 className="text-3xl font-extrabold mb-1">Cálculo de Notas Finales (Profesores)</h1>
                    <p className="text-lg font-light flex items-center justify-center">
                        <span className="font-extrabold text-2xl mr-2">=</span> 
                        (Nota Prof. + Prom. Jurado) / 200 * 5.0
                    </p>
                </div>
            </header>

            <div className="max-w-6xl mx-auto">
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
                    <>
                        {orderedGroups.length === 0 ? (
                            <p className="mt-8 p-4 text-center text-gray-500 bg-white rounded-lg shadow-md">
                                No hay proyectos o evaluaciones registradas.
                            </p>
                        ) : (
                            orderedGroups.map(group => (
                                <CourseResultsTable 
                                    key={group.course}
                                    courseName={group.course}
                                    results={group.results}
                                />
                            ))
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default ProfessorResultsPage;