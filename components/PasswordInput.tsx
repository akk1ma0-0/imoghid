"use client";

import { useState } from "react";

// Поле пароля с иконкой-«глазик» (показать/скрыть). Пробрасывает все стандартные
// пропсы input (value/onChange/placeholder/autoComplete/id/className/required и т.д.).
export function PasswordInput({
  style,
  ...inputProps
}: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative", display: "block", ...style }}>
      <input
        {...inputProps}
        type={show ? "text" : "password"}
        style={{ width: "100%", paddingRight: 40 }}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Ascunde parola" : "Arată parola"}
        title={show ? "Ascunde parola" : "Arată parola"}
        tabIndex={-1}
        style={{
          position: "absolute",
          right: 6,
          top: 0,
          bottom: 0,
          margin: "auto 0",
          height: 30,
          width: 30,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "none",
          border: 0,
          padding: 0,
          cursor: "pointer",
          color: "#6b7280",
        }}
      >
        {show ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
