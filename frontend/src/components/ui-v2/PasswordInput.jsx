import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Password field with a show/hide toggle. Drop-in replacement for a
 * <input type="password"> — pass the same className and props. The eye button
 * flips the input between masked (••••) and plain text so users can verify
 * what they typed.
 */
export function PasswordInput({ className = "", wrapperClassName = "", testId = "password-input", ...props }) {
  const [show, setShow] = useState(false);
  return (
    <div className={`relative ${wrapperClassName}`}>
      <input
        {...props}
        type={show ? "text" : "password"}
        data-testid={testId}
        className={`${className} pr-11`}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        data-testid={`${testId}-toggle`}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}
