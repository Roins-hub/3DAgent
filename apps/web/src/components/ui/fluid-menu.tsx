"use client";

import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

interface MenuProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "left" | "right";
  showChevron?: boolean;
}

export function Menu({
  trigger,
  children,
  align = "left",
  showChevron = true,
}: MenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative inline-block text-left">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex cursor-pointer items-center"
        role="button"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        {trigger}
        {showChevron && (
          <ChevronDown
            className="ml-2 -mr-1 h-4 w-4 text-gray-500 dark:text-gray-400"
            aria-hidden="true"
          />
        )}
      </div>

      {isOpen && (
        <div
          className={`absolute ${
            align === "right" ? "right-0" : "left-0"
          } z-50 mt-2 w-56 rounded-md bg-white shadow-lg ring-1 ring-black/10 focus:outline-none dark:bg-gray-800 dark:ring-gray-700`}
          role="menu"
          aria-orientation="vertical"
        >
          <div className="py-1" role="none">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

interface MenuItemProps {
  children?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  isActive?: boolean;
  title?: string;
}

export function MenuItem({
  children,
  onClick,
  disabled = false,
  icon,
  isActive = false,
  title,
}: MenuItemProps) {
  return (
    <button
      className={`relative block h-12 w-12 text-center transition-colors duration-200 group
        ${disabled ? "cursor-not-allowed text-slate-400" : "text-slate-700 hover:text-slate-950"}
        ${isActive ? "bg-white/20" : ""}
      `}
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
    >
      <span className="flex h-full items-center justify-center">
        {icon && (
          <span className="flex h-6 w-6 items-center justify-center transition-all duration-200 group-hover:[&_svg]:stroke-[2.5]">
            {icon}
          </span>
        )}
        {children}
      </span>
    </button>
  );
}

export function MenuContainer({ children }: { children: React.ReactNode }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const childrenArray = React.Children.toArray(children);

  return (
    <div className="relative h-12 w-12" data-expanded={isExpanded}>
      <div className="relative">
        <div
          className="relative z-50 h-12 w-12 cursor-pointer rounded-full bg-slate-100 shadow-lg shadow-slate-950/15 ring-1 ring-slate-950/10 transition-colors duration-200 hover:bg-white"
          onClick={() => setIsExpanded((current) => !current)}
        >
          {childrenArray[0]}
        </div>

        {childrenArray.slice(1).map((child, index) => (
          <div
            key={index}
            className="absolute left-0 top-0 h-12 w-12 rounded-full bg-slate-100 shadow-lg shadow-slate-950/12 ring-1 ring-slate-950/10 will-change-transform"
            style={{
              transform: `translateY(${isExpanded ? -(index + 1) * 44 : 0}px)`,
              opacity: isExpanded ? 1 : 0,
              zIndex: 40 - index,
              clipPath: "circle(50% at 50% 50%)",
              transition: `transform 300ms cubic-bezier(0.4, 0, 0.2, 1), opacity ${
                isExpanded ? "220ms" : "300ms"
              }`,
              backfaceVisibility: "hidden",
              perspective: 1000,
              WebkitFontSmoothing: "antialiased",
            }}
          >
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}
