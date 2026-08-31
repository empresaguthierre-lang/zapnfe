"use client";

import { useActionState } from "react";
import { FiLock, FiLogIn, FiMail } from "react-icons/fi";
import { loginAction, type LoginState } from "@/app/login/actions";

const initialState: LoginState = { error: null };

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <form action={action} className="login-form">
      <label>
        <span>E-mail</span>
        <div className="auth-field"><FiMail aria-hidden="true" /><input name="email" type="email" autoComplete="email" maxLength={254} required /></div>
      </label>
      <label>
        <span>Senha</span>
        <div className="auth-field"><FiLock aria-hidden="true" /><input name="password" type="password" autoComplete="current-password" minLength={8} maxLength={128} required /></div>
      </label>
      {state.error ? <p className="auth-error" role="alert">{state.error}</p> : null}
      <button className="primary-button auth-submit" type="submit" disabled={pending}><FiLogIn /> {pending ? "Entrando..." : "Entrar com segurança"}</button>
    </form>
  );
}
