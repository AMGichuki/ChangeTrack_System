// Shared frame for Sign in, Forgot password and Reset password:
// dark blue panel on the left, the USIU-Africa logo and the form on the right.
import ThemeToggle from './ThemeToggle'

export default function AuthLayout({ children }) {
  return (
    <div className="signin">
      <section className="signin-left">
        <p className="brand">CHANGETRACK</p>
        <div>
          <p className="signin-kicker">USIU-Africa</p>
          <h1>Grade changes, from request to record.</h1>
          <p>Request. Review. Approve. Record.</p>
          <p className="signin-chain">Lecturer → Chair → Dean → Registrar</p>
        </div>
        <p className="signin-small">Every decision is signed in, dated and kept on record.</p>
      </section>

      <section className="signin-right">
        <ThemeToggle className="theme-toggle-auth" />
        <div className="signin-box">
          <img className="signin-logo" src="/usiu-logo.png" alt="USIU-Africa: United States International University-Africa" />
          {children}
        </div>
      </section>
    </div>
  )
}
