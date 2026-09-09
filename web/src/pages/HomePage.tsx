import { Navigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";

export function HomePage() {
  const { user, isAuthenticated, logout } = useAuth();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <main className="home-page">
      <section className="home-card">
        <h1>Welcome, {user.full_name}</h1>
        <p>You are signed in to Detroit Axle Quality Assurance.</p>
        <button type="button" onClick={logout}>
          Sign out
        </button>
      </section>
    </main>
  );
}
