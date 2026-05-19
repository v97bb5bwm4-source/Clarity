import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";

function getAuthPage() {
  return window.location.hash === "#signup" ? "signup" : "login";
}

export function AuthGate({ children }) {
  const { configured, loading, session } = useAuth();
  const [authPage, setAuthPage] = useState(getAuthPage);

  useEffect(() => {
    const handleHashChange = () => setAuthPage(getAuthPage());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  if (loading) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <p className="eyebrow">Clarity</p>
          <h1>Loading workspace</h1>
          <p>Checking your session.</p>
        </section>
      </main>
    );
  }

  if (!configured || !session) {
    return authPage === "signup" ? (
      <SignupPage configured={configured} />
    ) : (
      <LoginPage configured={configured} />
    );
  }

  return children;
}

export function LoginPage({ configured }) {
  return (
    <AuthPage
      configured={configured}
      mode="login"
      eyebrow="Welcome back"
      title="Sign in to Clarity"
      copy="Access your protected dashboard, products, expenses, and analytics."
      submitLabel="Log in"
      switchHref="#signup"
      switchLabel="Need an account? Sign up"
      successMessage="Logged in successfully."
    />
  );
}

export function SignupPage({ configured }) {
  return (
    <AuthPage
      configured={configured}
      mode="signup"
      eyebrow="Create account"
      title="Start tracking true profit"
      copy="Create a workspace account before connecting products, expenses, and reports."
      submitLabel="Create account"
      switchHref="#login"
      switchLabel="Already have an account? Log in"
      successMessage="Account created. Check your email if confirmation is enabled in Supabase."
    />
  );
}

function AuthPage({
  mode,
  configured,
  eyebrow,
  title,
  copy,
  submitLabel,
  switchHref,
  switchLabel,
  successMessage,
}) {
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isSignup = mode === "signup";

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");

    if (!configured) {
      setMessage("Add your Supabase URL and anon key in a .env file first.");
      return;
    }

    if (!email || !password) {
      setMessage("Email and password are required.");
      return;
    }

    if (password.length < 6) {
      setMessage("Password must be at least 6 characters.");
      return;
    }

    setSubmitting(true);
    const { error } = isSignup ? await signUp(email, password) : await signIn(email, password);
    setSubmitting(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(successMessage);
  };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">C</span>
          <div>
            <strong>Clarity</strong>
            <span>Profit tracking for TikTok Shop sellers</span>
          </div>
        </div>

        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="auth-copy">{copy}</p>
        </div>

        {!configured && (
          <div className="auth-warning">
            Supabase keys are missing. Add them to clarity/.env before signing in.
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimum 6 characters"
              autoComplete={isSignup ? "new-password" : "current-password"}
              minLength={6}
            />
          </label>

          {message && <p className="auth-message">{message}</p>}

          <button className="primary-action" type="submit" disabled={submitting}>
            {submitting ? "Please wait..." : submitLabel}
          </button>
        </form>

        <a
          className="auth-switch"
          href={switchHref}
          onClick={() => setMessage("")}
        >
          {switchLabel}
        </a>
      </section>
    </main>
  );
}
