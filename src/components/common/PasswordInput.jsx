import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/** A password box with a show / hide eye, so people can check what they typed. */
export function PasswordInput({ value, onChange, autoComplete = 'current-password', autoFocus = false, placeholder, id }) {
  const [shown, setShown] = useState(false);
  return (
    <span className="password-field">
      <input
        id={id} type={shown ? 'text' : 'password'} value={value} onChange={onChange}
        autoComplete={autoComplete} autoFocus={autoFocus} placeholder={placeholder}
      />
      <button
        type="button" className="password-toggle" tabIndex={-1}
        onClick={() => setShown(!shown)} aria-label={shown ? 'Hide password' : 'Show password'} title={shown ? 'Hide password' : 'Show password'}
      >
        {shown ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </span>
  );
}
