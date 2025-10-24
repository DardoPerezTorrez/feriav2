import { useState } from "react";
import { db } from "../lib/firebase"; 
import { query, collection, where, getDocs } from "firebase/firestore";
import { useRouter } from "next/router";

const Login = () => {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [errorVisible, setErrorVisible] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const router = useRouter();

    // Lógica de Login (CORREGIDA)
    const handleLogin = async (e) => {
        e.preventDefault();
        setError("");
        setErrorVisible(false);
        setIsLoading(true);

        try {
            const userQuery = query(collection(db, "users"), where("username", "==", username));
            const querySnapshot = await getDocs(userQuery);

            if (querySnapshot.empty) {
                setError("Usuario o contraseña incorrectos.");
                setErrorVisible(true);
                setPassword("");
                setIsLoading(false);
                return;
            }

            const userDoc = querySnapshot.docs[0];
            const userData = userDoc.data();

            if (userData.password === password) {
                if (!userData.role) {
                    setError("Rol no asignado.");
                    setErrorVisible(true);
                    setPassword("");
                    setIsLoading(false);
                    return;
                }

                const userProfile = {
                    uid: userDoc.id, 
                    username: userData.username,
                    role: userData.role,
                    name: userData.name || userData.username,
                    assignedProjects: userData.assignedProjects || [],
                };

                localStorage.setItem("userData", JSON.stringify(userProfile));

                // 🚀 SOLUCIÓN CRÍTICA: Guardar el ID y el Rol en las claves esperadas por jurado.js
                localStorage.setItem("userId", userDoc.id); 
                localStorage.setItem("role", userData.role); 


                if (userData.role === "admin") {
                    router.push("/admin");
                } else if (userData.role === "profesor") {
                    router.push("/profesor");
                } else if (userData.role === "jurado") {
                    router.push("/jurado");
                }
            } else {
                setError("Usuario o contraseña incorrectos.");
                setErrorVisible(true);
                setPassword("");
                setIsLoading(false);
            }
        } catch (err) {
            console.error("Error al procesar el login:", err);
            setError("Error interno. Por favor, intente de nuevo.");
            setErrorVisible(true);
            setPassword("");
            setIsLoading(false);
        }
    };

    // --- Estructura de Renderizado ---
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 sm:px-6 py-8 overflow-y-auto">
            <div className="bg-white p-8 rounded-xl shadow-lg max-w-sm w-full border border-gray-200">
                
                {/* ESPACIO PARA LOGO */}
                <div className="text-center mb-6">
                    <div className="text-4xl font-extrabold text-green-600 mb-2">🚀</div>
                    <h1 className="text-xl font-bold text-gray-900">Iniciar Sesión</h1>
                </div>

                <form onSubmit={handleLogin}>
                    
                    {/* Campo de Nombre de usuario */}
                    <div className="mb-4">
                        <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">Nombre de usuario</label>
                        <input 
                            id="username"
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 transition duration-150"
                            required
                        />
                    </div>

                    {/* Campo de Contraseña */}
                    <div className="mb-6 relative">
                        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                        <input 
                            id="password"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 transition duration-150 pr-10"
                            required
                        />
                        
                        {/* Botón de Mostrar Contraseña (SVG) */}
                        <button 
                            type="button" 
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-2 top-8 text-gray-400 hover:text-gray-600 focus:outline-none p-1"
                        >
                            {showPassword ? (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8-10-8-10-8z" /><circle cx="12" cy="12" r="3" /></svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8-10-8-10-8z" /><circle cx="12" cy="12" r="3" /><line x1="2" y1="2" x2="22" y2="22" /></svg>
                            )}
                        </button>
                    </div>

                    {/* Mensaje de Error */}
                    {error && (
                        <div className={`text-red-700 text-sm p-3 mb-4 border border-red-300 bg-red-50 rounded-lg ${errorVisible ? 'opacity-100' : 'opacity-0'} transition-opacity duration-500`}>
                            {error}
                        </div>
                    )}

                    {/* Botón de Submit */}
                    <button 
                        type="submit" 
                        className="w-full p-3 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 transition duration-300 disabled:bg-gray-400"
                        disabled={isLoading}
                    >
                        {isLoading ? "Ingresando..." : "Iniciar Sesión"}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Login;