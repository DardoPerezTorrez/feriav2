import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { db } from "../lib/firebase"; 
// 🚨 IMPORTACIONES ACTUALIZADAS: Incluye getDoc para la lógica de carga y verificación
import { collection, addDoc, getDocs, deleteDoc, doc, query, where, updateDoc, arrayUnion, arrayRemove, getDoc } from "firebase/firestore";

// Definición de íconos
const iconStyle = "w-6 h-6 text-green-600 mr-3"; 
const userIcon = <svg xmlns="http://www.w3.org/2000/svg" className={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/></svg>;
const courseIcon = <svg xmlns="http://www.w3.org/2000/svg" className={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5V15a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4.5"/><path d="M2 12V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v6"/><line x1="10" y1="13" x2="14" y2="13"/></svg>;
const resetIcon = <svg xmlns="http://www.w3.org/2000/svg" className={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6"/><path d="M2.5 22V16h6"/><path d="M22 8.5A10 10 0 1 0 1.9 16.5M1.9 15.5A10 10 0 1 0 22 7.5"/></svg>;
const reportIcon = <svg xmlns="http://www.w3.org/2000/svg" className={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;

// --- LÓGICA DE GESTIÓN DE VISTAS ---
const VIEWS = {
    DASHBOARD: 'DASHBOARD',
    USERS: 'USERS',
    PROJECTS: 'PROJECTS', 
    RESET: 'RESET',
    REPORTS: 'REPORTS', // 🚨 NUEVA VISTA DE REPORTES
};


// ----------------------------------------------------
// COMPONENTE PRINCIPAL ADMIN
// ----------------------------------------------------

const AdminPage = () => {
    const router = useRouter();
    const [userProfile, setUserProfile] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isUserModalOpen, setIsUserModalOpen] = useState(false); 
    const [isProjectModalOpen, setIsProjectModalOpen] = useState(false); 
    const [isProjectEditModalOpen, setIsProjectEditModalOpen] = useState(false); 
    const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false); 
    const [selectedProject, setSelectedProject] = useState(null); 
    const [currentView, setCurrentView] = useState(VIEWS.DASHBOARD); 

    const [users, setUsers] = useState([]);
    const [projects, setProjects] = useState([]);
    const [evaluations, setEvaluations] = useState([]); // Estado para todas las evaluaciones
    const [consolidatedResults, setConsolidatedResults] = useState([]); // Estado para resultados consolidados
    
    // 🚨 LECTURA DE ID CORREGIDA
    const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') : null;

    // Lógica de Cierre de Sesión
    const handleLogout = () => {
        if (confirm("¿Está seguro de que desea cerrar la sesión?")) {
            localStorage.removeItem("userId");
            localStorage.removeItem("role"); 
            router.push('/'); 
        }
    };
    
    // ----------------------------------------------------
    // LÓGICA DE CONSOLIDACIÓN DE DATOS (NOTAS)
    // ----------------------------------------------------
    const consolidateData = useCallback((projectsList, usersList, evaluationsList) => {
        const resultsMap = projectsList.map(project => {
            // Filtrar evaluaciones para este proyecto
            const projectEvaluations = evaluationsList.filter(e => e.projectId === project.id);
            // Sumar los puntajes del jurado
            const totalScoreSum = projectEvaluations.reduce((sum, e) => sum + (e.totalScore || 0), 0);
            
            // Calcular el promedio
            const averageScore = projectEvaluations.length > 0 ? totalScoreSum / projectEvaluations.length : 0;
            
            return {
                projectId: project.id,
                averageScore: averageScore,
                evaluations: projectEvaluations,
                assignedJudges: project.assignedJudges || [],
                projectDetails: project, 
            };
        });
        // Ordenar por puntaje promedio descendente para el ranking
        const sortedResults = resultsMap.sort((a, b) => b.averageScore - a.averageScore);
        setConsolidatedResults(sortedResults);
    }, []);


    // ----------------------------------------------------
    // FUNCIÓN DE CARGA DE DATOS COMPLETA (Y AUTENTICACIÓN)
    // ----------------------------------------------------
    const fetchData = useCallback(async () => {
        if (!userId) {
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        try {
            // 1. Fetch User Profile & Role Verification 🚨 LÓGICA CORREGIDA
            const userRef = doc(db, "users", userId);
            const userSnap = await getDoc(userRef);

            if (!userSnap.exists()) {
                 alert("Usuario no encontrado. Redireccionando.");
                 localStorage.removeItem('userId'); 
                 router.push('/');
                 return;
            }
            const userData = { id: userId, ...userSnap.data() };

            if (userData.role !== 'admin') {
                router.push(`/${userData.role}`);
                return;
            }
            setUserProfile(userData);

            // 2. Fetch All Data for Admin Panel and Reports
            const [projectsSnapshot, usersSnapshot, evaluationsSnapshot] = await Promise.all([
                getDocs(collection(db, "projects")),
                getDocs(collection(db, "users")),
                getDocs(collection(db, "evaluations")),
            ]);

            const projectsList = projectsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const usersList = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const evaluationsList = evaluationsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            setProjects(projectsList);
            setUsers(usersList);
            setEvaluations(evaluationsList);

            // 3. Consolidar para la vista de Reportes
            consolidateData(projectsList, usersList, evaluationsList);

        } catch (error) {
            console.error("Error fetching data:", error);
            // No alertamos en un entorno de producción, pero lo dejamos por si acaso
        } finally {
            setIsLoading(false);
        }
    }, [userId, router, consolidateData]);

    // 🚨 EFECTO DE MONTAJE
    useEffect(() => {
        if (!userId) {
            // Si no hay ID, redirige, que es lo que hacía tu código original
            router.push('/'); 
            return;
        }
        fetchData(); 
    }, [userId, router, fetchData]);
    

    // ----------------------------------------------------
    // LÓGICA CRUD COMPLETA (Debe llamar a fetchData al finalizar)
    // ----------------------------------------------------
    
    // --- Usuarios ---
    const handleCreateUser = async (formData) => {
        try {
            const newUser = {
                username: formData.username,
                password: formData.password, 
                role: formData.role,
                name: formData.name || formData.username,
                assignedProjects: [],
                createdAt: new Date(),
            };
            await addDoc(collection(db, "users"), newUser);
            alert(`Usuario ${formData.username} (${formData.role}) creado exitosamente.`);
            setIsUserModalOpen(false); 
            fetchData();
        } catch (error) { console.error("Error al crear el usuario:", error); alert("Error al crear el usuario."); }
    };
    
    const handleDeleteUser = async (deleteUserId, username) => {
        if (!confirm(`¿Estás seguro de que quieres eliminar al usuario ${username}? Esta acción es irreversible.`)) { return; }
        try {
            // Nota: Aquí faltaría lógica para limpiar las asignaciones de este usuario en los proyectos
            await deleteDoc(doc(db, "users", deleteUserId));
            alert(`Usuario ${username} eliminado exitosamente.`);
            fetchData(); 
        } catch (error) { console.error("Error al eliminar el usuario:", error); alert("Error al eliminar el usuario."); }
    };

    // --- Proyectos ---
    const handleCreateProject = async (formData) => {
        try {
            const newProject = {
                name: formData.name,
                description: formData.description,
                course: formData.course, 
                advisors: formData.advisors || 'N/A', 
                assignedJudges: [], 
                internalGrade: 0, 
                assignedProfessors: [], 
                createdAt: new Date(),
            };
            await addDoc(collection(db, "projects"), newProject);
            alert(`Proyecto "${formData.name}" creado exitosamente.`);
            setIsProjectModalOpen(false);
            fetchData(); 
        } catch (error) { console.error("Error al crear el proyecto:", error); alert("Error al crear el proyecto."); }
    };
    
    const handleUpdateProject = async (projectId, formData) => {
        try {
            const projectRef = doc(db, "projects", projectId);
            const internalGradeValue = parseFloat(formData.internalGrade);

            const updatedData = {
                name: formData.name,
                description: formData.description,
                course: formData.course,
                advisors: formData.advisors || 'N/A',
                internalGrade: !isNaN(internalGradeValue) && internalGradeValue >= 0 && internalGradeValue <= 100 
                               ? internalGradeValue 
                               : formData.internalGrade, 
            };
            
            await updateDoc(projectRef, updatedData);
            alert(`Proyecto "${formData.name}" actualizado exitosamente.`);
            setIsProjectEditModalOpen(false); 
            fetchData();
        } catch (error) { console.error("Error al actualizar el proyecto:", error); alert("Error al actualizar el proyecto."); }
    };
    
    const handleDeleteProject = async (projectId, projectName) => {
        if (!confirm(`¿Estás seguro de que quieres eliminar el proyecto "${projectName}"? Esta acción es irreversible.`)) { return; }
        try {
            // Nota: Aquí faltaría lógica para limpiar las asignaciones de proyectos en los usuarios y las evaluaciones
            await deleteDoc(doc(db, "projects", projectId));
            alert(`Proyecto "${projectName}" eliminado exitosamente.`);
            fetchData();
        } catch (error) { console.error("Error al eliminar el proyecto:", error); alert("Error al eliminar el proyecto."); }
    };

    const handleOpenAssignmentModal = (project) => {
        setSelectedProject(project);
        setIsAssignmentModalOpen(true);
    }
    
    const handleOpenEditProjectModal = (project) => {
        setSelectedProject(project);
        setIsProjectEditModalOpen(true);
    }
    
    // --- Asignación de Jurados ---
    const handleAssignJudges = async (project, selectedJudgeIds) => {
        const projectId = project.id;
        const projectRef = doc(db, "projects", projectId);
        
        const currentJudgeIds = project.assignedJudges || [];
        const newJudgeIds = selectedJudgeIds;

        const judgesToAdd = newJudgeIds.filter(id => !currentJudgeIds.includes(id));
        const judgesToRemove = currentJudgeIds.filter(id => !newJudgeIds.includes(id));
        
        try {
            await updateDoc(projectRef, { assignedJudges: newJudgeIds });

            // Actualizar los jurados (bidireccional)
            for (const judgeId of judgesToAdd) {
                const judgeRef = doc(db, "users", judgeId);
                await updateDoc(judgeRef, { assignedProjects: arrayUnion(projectId) });
            }
            for (const judgeId of judgesToRemove) {
                const judgeRef = doc(db, "users", judgeId);
                await updateDoc(judgeRef, { assignedProjects: arrayRemove(projectId) });
            }

            alert(`Asignación para el proyecto "${project.name}" actualizada exitosamente.`);
            setIsAssignmentModalOpen(false);
            fetchData(); 

        } catch (error) { console.error("Error al asignar jurados:", error); alert("Error al asignar jurados."); }
    }


    if (isLoading || !userProfile) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <h1 className="text-xl font-semibold text-gray-700">Cargando panel de administración...</h1>
            </div>
        );
    }

    // Función para renderizar el contenido de la vista actual
    const renderContent = () => {
        switch (currentView) {
            case VIEWS.USERS:
                return (
                    <UsersManagement 
                        users={users} 
                        onCreateClick={() => setIsUserModalOpen(true)} 
                        onDelete={handleDeleteUser}
                    />
                );
            case VIEWS.PROJECTS:
                return ( 
                    <ProjectsManagement
                        projects={projects}
                        onCreateClick={() => setIsProjectModalOpen(true)}
                        onAssignClick={handleOpenAssignmentModal}
                        onEditClick={handleOpenEditProjectModal} 
                        onDelete={handleDeleteProject} 
                    />
                );
            case VIEWS.RESET:
                // Vista de reinicio - Dejamos el placeholder
                return (
                    <div className="p-4 bg-white rounded-lg shadow-md">
                        <h3 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
                            {resetIcon} Reestablecer Evaluación (En desarrollo)
                        </h3>
                        <p className="text-gray-600">Esta función permitirá borrar todas las evaluaciones y asignaciones para iniciar un nuevo ciclo.</p>
                    </div>
                );
            case VIEWS.REPORTS:
                return (
                    // 🚨 NUEVO COMPONENTE DE REPORTES
                    <ResultsView 
                        consolidatedResults={consolidatedResults}
                        projects={projects} 
                        users={users} 
                    />
                );
            case VIEWS.DASHBOARD:
            default:
                return (
                    <DashboardOverview setCurrentView={setCurrentView} /> 
                );
        }
    };

    return (
        <div className="min-h-screen flex bg-gray-50">
            {/* SIDEBAR */}
            <Sidebar 
                currentView={currentView} 
                setCurrentView={setCurrentView} 
                userProfile={userProfile}
                handleLogout={handleLogout}
            />

            {/* CONTENIDO PRINCIPAL */}
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-green-700 p-3 sm:hidden shadow-lg flex justify-between items-center text-white">
                    <h1 className="text-lg font-bold">Panel Admin</h1>
                    <button onClick={handleLogout} className="text-sm font-semibold bg-red-500 px-3 py-1 rounded-md">Salir</button>
                </header>

                <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-8">
                    {renderContent()}
                </main>
            </div>

            {/* MODALES */}
            {isUserModalOpen && ( <UserModal onClose={() => setIsUserModalOpen(false)} onCreate={handleCreateUser} /> )}
            {isProjectModalOpen && ( <ProjectModal onClose={() => setIsProjectModalOpen(false)} onCreate={handleCreateProject} /> )}
            {isAssignmentModalOpen && selectedProject && (
                <AssignmentModal
                    onClose={() => setIsAssignmentModalOpen(false)}
                    onAssign={handleAssignJudges}
                    project={selectedProject}
                    allUsers={users}
                />
            )}
            {isProjectEditModalOpen && selectedProject && ( 
                <ProjectEditModal
                    onClose={() => setIsProjectEditModalOpen(false)}
                    onUpdate={handleUpdateProject}
                    project={selectedProject}
                />
            )}
        </div>
    );
};

export default AdminPage;


// ----------------------------------------------------
// IMPLEMENTACIÓN DE COMPONENTES AUXILIARES
// ----------------------------------------------------

// 🚨 COMPONENTE: VISTA DE REPORTES (CONSOLIDADOS)
const ResultsView = ({ projects, users, consolidatedResults }) => {
    
    // Mapear IDs de jurados a nombres
    const judgeMap = users.reduce((acc, user) => {
        if (user.role === 'jurado') {
            acc[user.id] = user.name || user.username;
        }
        return acc;
    }, {});

    return (
        <div className="p-4 sm:p-0">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
                {reportIcon} Reporte de Calificaciones Consolidadas
            </h2>
            <p className="text-md text-gray-600 mb-4">
                Ranking de proyectos basado en el promedio de las notas del jurado.
            </p>

            <div className="bg-white shadow-xl rounded-xl overflow-hidden border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Ranking</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Proyecto (Curso)</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Nota Interna (Prof.)</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Jurado(s) Asignado(s)</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider"># Notas Recibidas</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">Puntaje Promedio / 100</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                        {consolidatedResults.map((result, index) => {
                            const project = result.projectDetails;
                            const numEvaluations = result.evaluations.length;
                            const isEvaluated = numEvaluations > 0;
                            
                            const assignedJudgeNames = (result.assignedJudges || [])
                                .map(id => judgeMap[id] || 'Desconocido')
                                .join(', ');

                            return (
                                <tr key={result.projectId} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50 hover:bg-green-50'}>
                                    <td className="px-4 py-4 whitespace-nowrap text-lg font-extrabold text-green-700">
                                        {index + 1}°
                                    </td>
                                    <td className="px-4 py-4 max-w-sm">
                                        <div className="font-semibold text-gray-900">{project.name}</div>
                                        <div className="text-xs text-gray-500">{project.course} | Asesores: {project.advisors || 'N/A'}</div>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-md font-bold text-blue-700">
                                        {project.internalGrade !== undefined ? project.internalGrade : 'N/A'}
                                    </td>
                                    <td className="px-4 py-4 text-sm text-gray-700 truncate max-w-xs" title={assignedJudgeNames}>
                                        {assignedJudgeNames || 'Ninguno'}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-center font-semibold text-gray-700">
                                        {numEvaluations}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-xl font-extrabold text-center">
                                        {isEvaluated ? (
                                            <span className="text-green-600">
                                                {result.averageScore.toFixed(2)}
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
            </div>
            {consolidatedResults.length === 0 && (
                 <p className="mt-8 p-4 text-center text-gray-500 bg-white rounded-lg shadow-md">No hay proyectos o notas registradas.</p>
            )}
        </div>
    );
};


// Componente Sidebar
const Sidebar = ({ currentView, setCurrentView, userProfile, handleLogout }) => {
    const linkStyle = "flex items-center p-3 text-sm font-medium rounded-lg transition duration-150";
    const VIEWS = { DASHBOARD: 'DASHBOARD', USERS: 'USERS', PROJECTS: 'PROJECTS', RESET: 'RESET', REPORTS: 'REPORTS' };

    return (
        <div className={`hidden sm:flex flex-col w-64 bg-white border-r border-gray-200 shadow-xl`}>
            <div className="p-4 border-b border-green-100 bg-green-700">
                <h2 className="text-2xl font-extrabold text-white">Feria Admin</h2>
                <span className="text-xs text-green-200">Bienvenido, {userProfile?.username || userProfile?.name}</span>
            </div>

            <nav className="flex-1 p-4 space-y-2">
                <button onClick={() => setCurrentView(VIEWS.DASHBOARD)} className={`${linkStyle} ${currentView === VIEWS.DASHBOARD ? 'bg-green-100 text-green-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-green-600 mr-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                    Dashboard
                </button>
                <button onClick={() => setCurrentView(VIEWS.USERS)} className={`${linkStyle} ${currentView === VIEWS.USERS ? 'bg-green-100 text-green-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                    {userIcon} Usuarios
                </button>
                <button onClick={() => setCurrentView(VIEWS.PROJECTS)} className={`${linkStyle} ${currentView === VIEWS.PROJECTS ? 'bg-green-100 text-green-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                    {courseIcon} Proyectos
                </button>
                <button onClick={() => setCurrentView(VIEWS.RESET)} className={`${linkStyle} ${currentView === VIEWS.RESET ? 'bg-red-100 text-red-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                    {resetIcon} Reestablecer
                </button>
                <button onClick={() => setCurrentView(VIEWS.REPORTS)} className={`${linkStyle} ${currentView === VIEWS.REPORTS ? 'bg-green-100 text-green-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                    {reportIcon} **Reportes**
                </button>
            </nav>
            
            <div className="p-4 border-t border-gray-200">
                <button onClick={handleLogout} className="w-full flex items-center justify-center p-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    Cerrar Sesión
                </button>
            </div>
        </div>
    );
};


// Componente de Vista Inicial (Dashboard)
const DashboardOverview = ({ setCurrentView }) => {
    const VIEWS = { USERS: 'USERS', PROJECTS: 'PROJECTS', REPORTS: 'REPORTS' };

    return (
        <>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Resumen General</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                
                <div className="bg-white p-5 rounded-lg shadow-md border-l-4 border-green-500 cursor-pointer hover:shadow-lg transition" onClick={() => setCurrentView(VIEWS.USERS)}>
                    <h3 className="text-lg font-semibold text-gray-900">Usuarios Activos</h3>
                    <p className="text-3xl font-bold text-gray-900 mt-1">...</p>
                    <p className="text-sm text-gray-500">Administrar cuentas</p>
                </div>

                <div className="bg-white p-5 rounded-lg shadow-md border-l-4 border-green-500 cursor-pointer hover:shadow-lg transition" onClick={() => setCurrentView(VIEWS.PROJECTS)}>
                    <h3 className="text-lg font-semibold text-gray-900">Proyectos / Cursos</h3>
                    <p className="text-3xl font-bold text-gray-900 mt-1">...</p>
                    <p className="text-sm text-gray-500">Crear y asignar proyectos</p>
                </div>
                
                <div className="bg-white p-5 rounded-lg shadow-md border-l-4 border-green-500 cursor-pointer hover:shadow-lg transition" onClick={() => setCurrentView(VIEWS.REPORTS)}>
                    <h3 className="text-lg font-semibold text-gray-900">Ver Reportes</h3>
                    <p className="text-3xl font-bold text-gray-900 mt-1">...</p>
                    <p className="text-sm text-gray-500">Calificaciones y estadísticas</p>
                </div>
                
            </div>
        </>
    );
};


// Componente de Gestión de Usuarios
const UsersManagement = ({ users, onCreateClick, onDelete }) => {
    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Gestión de Usuarios</h2>
                <button
                    onClick={onCreateClick}
                    className="px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition text-sm flex items-center shadow-md"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Crear Nuevo
                </button>
            </div>

            <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuario</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rol</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {users.map((user) => (
                            <tr key={user.id} className="hover:bg-green-50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.name || 'N/A'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{user.username}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.role === 'admin' ? 'bg-indigo-100 text-indigo-800' : user.role === 'profesor' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                                        {user.role}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <button 
                                        onClick={() => onDelete(user.id, user.username)}
                                        className="text-red-600 hover:text-red-900 ml-4 p-1 rounded-md hover:bg-red-50"
                                        title="Eliminar usuario"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {users.length === 0 && <p className="mt-4 text-center text-gray-500">No hay usuarios registrados.</p>}
        </div>
    );
};


// Componente de Gestión de Proyectos
const ProjectsManagement = ({ projects, onCreateClick, onAssignClick, onEditClick, onDelete }) => {
    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Gestión de Proyectos (Cursos)</h2>
                <button
                    onClick={onCreateClick}
                    className="px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition text-sm flex items-center shadow-md"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Crear Proyecto
                </button>
            </div>

            <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre del Proyecto</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Asesores</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nota Prof.</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Jurados Asignados</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {projects.map((project) => (
                            <tr key={project.id} className="hover:bg-green-50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{project.name}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{project.advisors || 'N/A'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-blue-700">{project.internalGrade !== undefined ? project.internalGrade : 'N/A'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                    <span className="font-semibold">{project.assignedJudges?.length || 0}</span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <button 
                                        onClick={() => onAssignClick(project)} 
                                        className="text-blue-600 hover:text-blue-900 p-1 rounded-md hover:bg-blue-50 ml-2" 
                                        title="Asignar Jurado"
                                    >
                                        Asignar
                                    </button>
                                    <button 
                                        onClick={() => onEditClick(project)} 
                                        className="text-yellow-600 hover:text-yellow-900 p-1 rounded-md hover:bg-yellow-50 ml-2" 
                                        title="Editar Proyecto y Nota Interna"
                                    >
                                        Editar/Nota
                                    </button>
                                    <button 
                                        onClick={() => onDelete(project.id, project.name)} 
                                        className="text-red-600 hover:text-red-900 p-1 rounded-md hover:bg-red-50 ml-2" 
                                        title="Eliminar Proyecto"
                                    >
                                        Eliminar
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {projects.length === 0 && <p className="mt-4 text-center text-gray-500">No hay proyectos registrados. Crea uno.</p>}
        </div>
    );
};


// Componente Modal de Usuario
const UserModal = ({ onClose, onCreate }) => {
    const [formData, setFormData] = useState({ username: '', password: '', role: 'profesor', name: '' });
    const [isSaving, setIsSaving] = useState(false);
    const handleChange = (e) => { setFormData({ ...formData, [e.target.name]: e.target.value }); };
    const handleSubmit = async (e) => { e.preventDefault(); setIsSaving(true); await onCreate(formData); setIsSaving(false); };

    return (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4 bg-gray-900 bg-opacity-50"> 
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-xs md:max-w-md border border-green-300">
                <div className="p-4 md:p-6">
                    <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-4 border-b pb-2">Crear Nuevo Usuario</h3>
                    <form onSubmit={handleSubmit}>
                        <div className="mb-3">
                            <label className="block text-xs font-medium text-gray-700">Nombre Completo (Opcional)</label>
                            <input type="text" name="name" value={formData.name} onChange={handleChange} className="mt-1 w-full p-2 text-sm border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500" />
                        </div>
                        <div className="mb-3">
                            <label className="block text-xs font-medium text-gray-700">Nombre de Usuario</label>
                            <input type="text" name="username" value={formData.username} onChange={handleChange} required className="mt-1 w-full p-2 text-sm border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500" />
                        </div>
                        <div className="mb-3">
                            <label className="block text-xs font-medium text-gray-700">Contraseña</label>
                            <input type="password" name="password" value={formData.password} onChange={handleChange} required className="mt-1 w-full p-2 text-sm border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500" />
                        </div>
                        <div className="mb-4">
                            <label className="block text-xs font-medium text-gray-700">Rol</label>
                            <select name="role" value={formData.role} onChange={handleChange} className="mt-1 w-full p-2 text-sm border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500" required>
                                <option value="profesor">Profesor</option>
                                <option value="jurado">Jurado</option>
                                <option value="admin">Administrador</option>
                            </select>
                        </div>
                        <div className="flex justify-end space-x-3">
                            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 transition" disabled={isSaving}>Cancelar</button>
                            <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition disabled:bg-gray-400" disabled={isSaving}>
                                {isSaving ? 'Guardando...' : 'Crear Usuario'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

// Componente Modal de Creación de Proyecto (Curso)
const ProjectModal = ({ onClose, onCreate }) => {
    const [formData, setFormData] = useState({ name: '', description: '', course: '', advisors: '' });
    const [isSaving, setIsSaving] = useState(false);
    const handleChange = (e) => { setFormData({ ...formData, [e.target.name]: e.target.value }); };
    const handleSubmit = async (e) => { e.preventDefault(); setIsSaving(true); await onCreate(formData); setIsSaving(false); };

    return (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4 bg-gray-900 bg-opacity-50"> 
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-xs md:max-w-md border border-green-300">
                <div className="p-4 md:p-6">
                    <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-4 border-b pb-2">Crear Nuevo Proyecto/Curso</h3>
                    <form onSubmit={handleSubmit}>
                        <div className="mb-3">
                            <label className="block text-xs font-medium text-gray-700">Nombre del Proyecto</label>
                            <input type="text" name="name" value={formData.name} onChange={handleChange} required className="mt-1 w-full p-2 text-sm border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500" />
                        </div>
                        <div className="mb-3">
                            <label className="block text-xs font-medium text-gray-700">Asesores / Profesor Guía</label>
                            <input type="text" name="advisors" value={formData.advisors} onChange={handleChange} className="mt-1 w-full p-2 text-sm border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500" />
                        </div>
                        <div className="mb-3">
                            <label className="block text-xs font-medium text-gray-700">Categoría/Curso</label>
                            <input type="text" name="course" value={formData.course} onChange={handleChange} required className="mt-1 w-full p-2 text-sm border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500" />
                        </div>
                        <div className="mb-4">
                            <label className="block text-xs font-medium text-gray-700">Descripción (Opcional)</label>
                            <textarea name="description" value={formData.description} onChange={handleChange} rows="3" className="mt-1 w-full p-2 text-sm border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500" />
                        </div>
                        <div className="flex justify-end space-x-3">
                            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 transition" disabled={isSaving}>Cancelar</button>
                            <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition disabled:bg-gray-400" disabled={isSaving}>
                                {isSaving ? 'Guardando...' : 'Crear Proyecto'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

// Componente: Modal de Edición de Proyecto (Incluye Nota Interna)
const ProjectEditModal = ({ onClose, onUpdate, project }) => {
    const [formData, setFormData] = useState({ 
        name: project.name || '', description: project.description || '', course: project.course || '',
        advisors: project.advisors || '', internalGrade: project.internalGrade !== undefined ? project.internalGrade : '', 
    });
    const [isSaving, setIsSaving] = useState(false);
    const handleChange = (e) => { setFormData({ ...formData, [e.target.name]: e.target.value }); };
    const handleSubmit = async (e) => { e.preventDefault(); setIsSaving(true); await onUpdate(project.id, formData); setIsSaving(false); };

    return (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4 bg-gray-900 bg-opacity-50"> 
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-xs md:max-w-md border border-green-300">
                <div className="p-4 md:p-6">
                    <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-4 border-b pb-2">Editar Proyecto: {project.name}</h3>
                    
                    <form onSubmit={handleSubmit}>
                        
                        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                            <label className="block text-sm font-bold text-gray-800">Nota Interna del Profesor (0-100)</label>
                            <input 
                                type="number" name="internalGrade" value={formData.internalGrade} onChange={handleChange} 
                                min="0" max="100" step="1" required 
                                className="mt-1 w-full p-2 text-xl font-extrabold text-center border-2 border-yellow-500 rounded-md focus:ring-green-500 focus:border-green-500" 
                            />
                        </div>

                        <div className="mb-3">
                            <label className="block text-xs font-medium text-gray-700">Nombre del Proyecto</label>
                            <input type="text" name="name" value={formData.name} onChange={handleChange} required className="mt-1 w-full p-2 text-sm border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500" />
                        </div>
                        
                        <div className="mb-3">
                            <label className="block text-xs font-medium text-gray-700">Asesores / Profesor Guía</label>
                            <input type="text" name="advisors" value={formData.advisors} onChange={handleChange} className="mt-1 w-full p-2 text-sm border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500" />
                        </div>

                        {/* ... otros campos de edición si son necesarios ... */}

                        <div className="flex justify-end space-x-3 mt-4">
                            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 transition" disabled={isSaving}>Cancelar</button>
                            <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition disabled:bg-gray-400" disabled={isSaving}>
                                {isSaving ? 'Actualizando...' : 'Guardar Cambios'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};


// Componente: Modal de Asignación de Jurados
const AssignmentModal = ({ onClose, onAssign, project, allUsers }) => {
    const judges = allUsers.filter(u => u.role === 'jurado'); 
    const [selectedJudges, setSelectedJudges] = useState(project.assignedJudges || []);
    const [isSaving, setIsSaving] = useState(false);

    const handleToggleJudge = (judgeId) => {
        setSelectedJudges(prev => 
            prev.includes(judgeId)
                ? prev.filter(id => id !== judgeId) 
                : [...prev, judgeId] 
        );
    };

    const handleAssignment = async () => {
        setIsSaving(true);
        await onAssign(project, selectedJudges);
        setIsSaving(false);
    };

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-4"> 
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-green-300">
                <div className="p-4 md:p-6">
                    <h3 className="text-xl font-bold text-gray-900 mb-2 border-b pb-2">Asignar Jurados</h3>
                    <p className="text-sm text-gray-600 mb-4">Proyecto: <span className="font-semibold text-green-700">{project.name}</span></p>
                    
                    <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-3">
                        {judges.length === 0 ? (
                            <p className="text-gray-500 text-sm">No hay usuarios con el rol jurado registrados.</p>
                        ) : (
                            <ul className="space-y-2">
                                {judges.map(judge => (
                                    <li 
                                        key={judge.id} 
                                        className="flex items-center justify-between p-2 bg-gray-50 rounded-md hover:bg-green-50 transition cursor-pointer"
                                        onClick={() => handleToggleJudge(judge.id)}
                                    >
                                        <span className="text-sm text-gray-800">{judge.name || judge.username}</span>
                                        <input 
                                            type="checkbox" 
                                            checked={selectedJudges.includes(judge.id)} 
                                            readOnly 
                                            className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500"
                                        />
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    
                    <div className="mt-6 flex justify-end space-x-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 transition" disabled={isSaving}>Cancelar</button>
                        <button
                            type="button"
                            onClick={handleAssignment}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition disabled:bg-gray-400"
                            disabled={isSaving || judges.length === 0}
                        >
                            {isSaving ? 'Asignando...' : `Asignar (${selectedJudges.length})`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};