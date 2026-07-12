import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

interface NavDropdownItem {
  to: string;
  label: string;
  hint?: string;
}

interface NavDropdownProps {
  label: string;
  paths: string[];
  items: NavDropdownItem[];
}

export function NavDropdown({ label, paths, items }: NavDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const active = paths.some((p) => location.pathname.startsWith(p));

  return (
    <div className={`nav-dropdown${open ? " open" : ""}`} ref={ref}>
      <button
        type="button"
        className={`nav-dropdown-trigger${active ? " active" : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        <span className="nav-dropdown-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="nav-dropdown-menu" role="menu">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className="nav-dropdown-item"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <span>{item.label}</span>
              {item.hint && <small>{item.hint}</small>}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}
